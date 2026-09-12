import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
try {
  await server.listen();
  await server.watcher.close();
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('aftermatter');
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    channel: process.env.AFTERMATTER_GPU === 'native' ? 'chrome' : undefined,
    args:
      process.env.AFTERMATTER_GPU === 'native'
        ? []
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.log('BROWSER ERROR', m.text());
    }
  });
  await mkdir('output/aftermatter', { recursive: true });
  await page.goto(`${base}/experiments/${study.slug}`);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor().catch(async (e) => {
    await page.screenshot({ path: 'output/aftermatter/failure.png' });
    console.log(await page.locator('body').innerText());
    throw e;
  });
  console.log('PASS initial render');
  const contrast = await page.evaluate(() => {
    const rgb = (value) => value.match(/[\d.]+/g)?.map(Number) ?? [];
    const luminance = (c) =>
      c
        .slice(0, 3)
        .map((n) => n / 255)
        .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
        .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ...document.querySelectorAll(
        '.aftermatter-header p, .aftermatter-header p span, .aftermatter-description p span, .aftermatter-stage-bottom, .aftermatter-materials button'
      ),
    ].map((element) => {
      let parent = element,
        background;
      while (parent) {
        const c = rgb(getComputedStyle(parent).backgroundColor);
        if (c.length === 3 || c[3] === 1) {
          background = c;
          break;
        }
        parent = parent.parentElement;
      }
      const a = luminance(rgb(getComputedStyle(element).color)),
        b = luminance(background ?? [255, 255, 255]);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  assert.ok(
    contrast.length > 10 && contrast.every((ratio) => ratio >= 4.5),
    'Chamber text must meet 4.5:1 contrast'
  );

  await canvas.focus();
  await page.keyboard.press('Space');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const tick = await canvas.getAttribute('data-tick');
  await page.waitForTimeout(200);
  assert.equal(await canvas.getAttribute('data-tick'), tick);
  await page.screenshot({
    path: 'output/aftermatter/desktop.png',
    fullPage: true,
  });
  const capture = async (name) => {
    await page.locator('.aftermatter-stage').scrollIntoViewIfNeeded();
    const clip = await page.locator('.aftermatter-stage').boundingBox();
    await page.screenshot({ path: `output/aftermatter/${name}.png`, clip });
  };
  await capture('terrarium');
  await page.getByLabel('World', { exact: true }).selectOption('Empty');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cells === '0'
  );
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.cells) > 0
  );
  const poured = await canvas.getAttribute('data-cells');
  await page.getByRole('button', { name: 'Save chamber', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cells === '0'
  );
  await page.getByRole('button', { name: 'Load chamber', exact: true }).click();
  assert.equal(await canvas.getAttribute('data-cells'), poured);
  await page
    .getByRole('button', { name: 'Step simulation', exact: true })
    .click();
  assert.equal(await canvas.getAttribute('data-tick'), '1');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.48,
    bounds.y + bounds.height * 0.4
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.5,
    { steps: 12 }
  );
  await page.mouse.up();
  assert.ok(Number(await canvas.getAttribute('data-cells')) > Number(poured));
  assert.equal(await canvas.getAttribute('data-drawing'), 'false');
  await page.mouse.down();
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'mouse',
  });
  assert.equal(await canvas.getAttribute('data-drawing'), 'false');
  await page.mouse.up();
  await page
    .getByLabel('World', { exact: true })
    .selectOption('Chain reaction');
  await page.getByRole('button', { name: 'Fire', exact: true }).click();
  // Keyboard cursor reaches the upper powder bed from its current pointer position.
  await canvas.focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.reactions) > 0,
    {},
    { timeout: 60000 }
  );
  await capture('reaction');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  assert.equal((await downloadPromise).suggestedFilename(), 'aftermatter.png');
  await page.getByRole('button', { name: 'Orbit view', exact: true }).click();
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.53,
    { steps: 12 }
  );
  await page.mouse.up();
  await capture('orbit');
  await page.getByLabel('World', { exact: true }).selectOption('Volcanic');
  await capture('volcanic');
  await page.getByLabel('World', { exact: true }).selectOption('Terrarium');
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  if (process.env.AFTERMATTER_POSTER === '1') {
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('canvas').dataset.tick) >= 40
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const posterStyle = await page.addStyleTag({
      content: '[data-poster-hide]{visibility:hidden !important}',
    });
    const clip = await page.locator('.aftermatter-stage').boundingBox();
    await page.screenshot({
      path: `public/posters/${study.slug}.jpg`,
      type: 'jpeg',
      quality: 90,
      clip,
    });
    await posterStyle.evaluate((element) => element.remove());
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'output/aftermatter/mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await canvas.waitFor();
  const still = await canvas.getAttribute('data-tick');
  await page.waitForTimeout(300);
  assert.equal(await canvas.getAttribute('data-tick'), still);
  await page
    .getByRole('button', { name: 'Step simulation', exact: true })
    .click();
  assert.ok(Number(await canvas.getAttribute('data-tick')) > Number(still));
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  await page.goto(`${base}/experiments/${study.slug}`);
  await canvas.waitFor();
  assert.deepEqual(errors, []);
  const unavailable = await browser.newPage();
  await unavailable.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await unavailable.goto(`${base}/experiments/${study.slug}`);
  await unavailable.getByText(/Aftermatter needs WebGL 2/).waitFor();
  console.log(
    'PASS Aftermatter: painting, pause, step, reactions, undo, save/restore, image export, camera, mobile, reduced motion, re-entry and unavailable WebGL.'
  );
} finally {
  await browser?.close();
  await server.close();
}
