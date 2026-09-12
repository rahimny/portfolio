import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const outDir = await mkdtemp(join(tmpdir(), 'medusa-build-'));
const artifacts = join(tmpdir(), 'medusa-qa');
await mkdir(artifacts, { recursive: true });
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({
  logLevel: 'error',
  build: { outDir },
  preview: { host: '127.0.0.1', port: 0, open: false },
});
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-webgpu'],
});
const errors = [];
const report = { build: outDir, viewport: '1440×1000', dpr: 1.5, checks: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1.5,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const start = Date.now();
  await page.goto(`${base}/experiments/medusa`);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 60000 });
  report.startupMs = Date.now() - start;
  report.backend = await canvas.getAttribute('data-backend');
  assert.ok(Number(await canvas.getAttribute('data-growth')) < 1);
  await page.waitForFunction(
    () => Number(document.querySelector('canvas')?.dataset.growth) > 0.13
  );
  await canvas.screenshot({ path: join(artifacts, 'growth-crown.png') });
  await page
    .locator('label')
    .filter({ has: page.getByLabel('Hold motion', { exact: true }) })
    .click();
  await page.waitForTimeout(120);
  const heldGrowth = await canvas.getAttribute('data-growth');
  await page.waitForTimeout(250);
  assert.equal(await canvas.getAttribute('data-growth'), heldGrowth);
  await page
    .locator('label')
    .filter({ has: page.getByLabel('Hold motion', { exact: true }) })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas')?.dataset.growth) > 0.42
  );
  await canvas.screenshot({ path: join(artifacts, 'growth-bell.png') });
  await page.waitForFunction(
    () => Number(document.querySelector('canvas')?.dataset.growth) > 0.72
  );
  await canvas.screenshot({ path: join(artifacts, 'growth-tendrils.png') });
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.grown === 'true'
  );
  report.checks.push(
    'anatomical growth stages and pause/resume during emergence'
  );

  const time = () => canvas.getAttribute('data-time').then(Number);
  const frames = () => canvas.getAttribute('data-frames').then(Number);
  const before = await time();
  await page.waitForTimeout(1000);
  assert.ok((await time()) > before + 0.1, 'Swimming must advance');
  report.checks.push('swimming advances');
  await page
    .locator('label')
    .filter({ has: page.getByLabel('Hold motion', { exact: true }) })
    .click();
  await page.waitForTimeout(400);
  const stoppedTime = await time();
  const stoppedFrames = await frames();
  await page.waitForTimeout(500);
  assert.equal(await time(), stoppedTime);
  assert.equal(await frames(), stoppedFrames, 'Paused renderer must sleep');
  const still = await canvas.screenshot();
  await page.getByRole('button', { name: 'Step +0.1s', exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(Math.abs((await time()) - stoppedTime - 0.1) < 0.002);
  assert.notDeepEqual(
    await canvas.screenshot(),
    still,
    'Explicit step must draw a changed pose'
  );
  await canvas.focus();
  await canvas.press('ArrowLeft');
  await canvas.press('ArrowUp');
  await page.waitForTimeout(200);
  await canvas.screenshot({ path: join(artifacts, 'rotated.png') });
  assert.notDeepEqual(
    await canvas.screenshot(),
    still,
    'Orbit must change painting'
  );
  report.checks.push('pause sleeps; explicit step and keyboard orbit draw');
  const beforeStir = await canvas.screenshot();
  await canvas.press('Space');
  await page.waitForTimeout(150);
  assert.notDeepEqual(
    await canvas.screenshot(),
    beforeStir,
    'Keyboard stirring draws a response while paused'
  );
  await canvas.dblclick({ position: { x: 80, y: 80 } });
  await page.waitForTimeout(150);
  report.checks.push('keyboard and pointer current gestures');

  await page
    .getByRole('button', { name: 'Pigment & light', exact: true })
    .click();
  await page
    .getByLabel('Palette', { exact: true })
    .selectOption({ label: 'Ochre' });
  await page.waitForTimeout(200);
  await canvas.screenshot({ path: join(artifacts, 'ochre.png') });
  await page
    .getByLabel('Palette', { exact: true })
    .selectOption({ label: 'Rose' });
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save print', exact: false }).click();
  const download = await downloadPromise;
  await download.saveAs(join(artifacts, 'print.png'));
  const png = await readFile(join(artifacts, 'print.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  assert.equal(width, 2400);
  assert.ok(width * height <= 5_000_000);
  report.export = { width, height, bytes: png.length };
  report.checks.push('palette and 2400px PNG export');
  // Compare each actual rendering family at a fixed regenerated pose.
  for (const [value, label] of [
    [0, 'Broken oil'],
    [1, 'Round scumble'],
    [2, 'Pointillist'],
    [3, 'Dry hatch'],
  ]) {
    await page.getByLabel('Brush', { exact: true }).selectOption({ label });
    await page.waitForTimeout(800);
    await canvas.screenshot({ path: join(artifacts, `brush-${value}.png`) });
    await canvas.focus();
    for (let turn = 0; turn < 7; turn++) await canvas.press('ArrowLeft');
    await canvas.press('ArrowUp');
    await page.waitForTimeout(100);
    await canvas.screenshot({
      path: join(artifacts, `brush-${value}-rotated.png`),
    });
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  }
  await page
    .getByLabel('Brush', { exact: true })
    .selectOption({ label: 'Broken oil' });
  await page.waitForTimeout(800);
  report.checks.push('all four brush families captured front-on and rotated');

  await page.locator('[data-poster-hide]').evaluateAll((elements) =>
    elements.forEach((element) => {
      element.style.visibility = 'hidden';
    })
  );
  await canvas.screenshot({
    path: 'public/posters/medusa.jpg',
    type: 'jpeg',
    quality: 92,
  });
  await page.locator('[data-poster-hide]').evaluateAll((elements) =>
    elements.forEach((element) => {
      element.style.visibility = '';
    })
  );
  const seed = await canvas.getAttribute('data-seed');
  await page.getByRole('button', { name: 'New specimen', exact: true }).click();
  await page.waitForFunction(
    (old) => document.querySelector('canvas')?.dataset.seed !== old,
    seed
  );
  await page.waitForTimeout(600);
  await canvas.screenshot({ path: join(artifacts, 'new-specimen.png') });
  report.checks.push('regeneration while paused');
  await page.getByRole('button', { name: 'Anatomy', exact: true }).click();
  const edit = async (label, value) => {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(String(value));
    await input.press('Enter');
    await page.waitForTimeout(700);
  };
  await edit('Tentacle count', 8);
  assert.ok(Number(await canvas.getAttribute('data-marks')) < 30000);
  const oldPaint = await canvas.screenshot();
  await edit('Brush size', 1.7);
  assert.notDeepEqual(await canvas.screenshot(), oldPaint);
  await page
    .getByLabel('Brush', { exact: true })
    .selectOption({ label: 'Dry hatch' });
  await page.waitForTimeout(700);
  const recipeDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export recipe', exact: true })
    .click();
  const recipe = await recipeDownload;
  const recipePath = join(artifacts, 'recipe.json');
  await recipe.saveAs(recipePath);
  const data = JSON.parse(await readFile(recipePath, 'utf8'));
  assert.equal(data.settings.tentacles, 8);
  assert.equal(data.settings.brushSize, 1.7);
  assert.equal(data.settings.brushStyle, 3);
  await page
    .getByRole('button', { name: 'Reset all settings', exact: true })
    .click();
  await page.waitForTimeout(700);
  await page.getByLabel('Import Medusa recipe').setInputFiles(recipePath);
  await page.waitForTimeout(700);
  assert.equal(
    await page.getByLabel('Tentacle count', { exact: true }).inputValue(),
    '8'
  );
  assert.ok(Number(await canvas.getAttribute('data-marks')) < 30000);
  await page.getByLabel('Import Medusa recipe').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":2}'),
  });
  await page.waitForTimeout(150);
  assert.match(
    await page.getByLabel('Status', { exact: true }).inputValue(),
    /version 1/
  );
  report.checks.push(
    'anatomy, brush uniforms, brush styles, recipe round trip and invalid import'
  );

  await page
    .locator('label')
    .filter({ has: page.getByLabel('Hold motion', { exact: true }) })
    .click();
  await canvas.scrollIntoViewIfNeeded();
  await page
    .getByRole('button', { name: 'Send a current', exact: true })
    .click();
  // Measure completed draws rather than calling these GPU time or presented frames.
  report.renderCompletionIntervals = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas');
        const intervals = [];
        let last = performance.now();
        const observer = new MutationObserver((records) => {
          if (!records.some((record) => record.attributeName === 'data-frames'))
            return;
          const now = performance.now();
          intervals.push(now - last);
          last = now;
          if (intervals.length >= 100) {
            observer.disconnect();
            const sorted = intervals.slice(5).sort((a, b) => a - b);
            resolve({
              medianMs: sorted[Math.floor(sorted.length * 0.5)],
              p95Ms: sorted[Math.floor(sorted.length * 0.95)],
              samples: sorted.length,
            });
          }
        });
        observer.observe(canvas, {
          attributes: true,
          attributeFilter: ['data-frames'],
        });
      })
  );
  await page.getByRole('button', { name: 'Emergence', exact: true }).click();
  await page
    .getByRole('button', { name: 'Replay growth', exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.ok(Number(await canvas.getAttribute('data-growth')) < 0.2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(350);
  assert.equal(await canvas.getAttribute('data-grown'), 'true');
  const reducedFrames = await frames();
  await page.waitForTimeout(400);
  assert.equal(await frames(), reducedFrames);
  await page.getByRole('button', { name: 'Step +0.1s' }).click();
  await page.waitForTimeout(100);
  assert.ok((await frames()) > reducedFrames);
  report.checks.push(
    'live reduced-motion preference sleeps; step remains available'
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'test-spacer';
    spacer.style.height = '2200px';
    document.body.append(spacer);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
  const offscreenFrames = await frames();
  await page.waitForTimeout(400);
  assert.equal(await frames(), offscreenFrames);
  await page.evaluate(() => {
    document.querySelector('#test-spacer').remove();
    window.scrollTo(0, 0);
  });
  report.checks.push('fully offscreen sleeps');
  await page.waitForTimeout(200);
  const cover = await context.newPage();
  await cover.goto('about:blank');
  await cover.bringToFront();
  if (await page.evaluate(() => document.hidden)) {
    await page.waitForTimeout(300);
    const hiddenFrames = await frames();
    await page.waitForTimeout(400);
    assert.equal(await frames(), hiddenFrames);
    report.checks.push('hidden tab sleeps');
  } else report.hiddenTab = 'Headless context did not expose a hidden document';
  await cover.close();
  await page.bringToFront();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await canvas.waitFor({ timeout: 60000 });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  assert.equal(await canvas.getAttribute('data-grown'), 'true');
  const mobileFrames = await frames();
  await page.waitForTimeout(300);
  assert.equal(await frames(), mobileFrames);
  await page.screenshot({
    path: join(artifacts, 'mobile.png'),
    fullPage: true,
  });
  const mobileSeed = await canvas.getAttribute('data-seed');
  await page.getByRole('button', { name: 'New specimen', exact: true }).click();
  await page.waitForFunction(
    (old) => document.querySelector('canvas')?.dataset.seed !== old,
    mobileSeed
  );
  const mobileRect = await canvas.boundingBox();
  assert.ok(
    mobileRect.y >= 0 && mobileRect.y < 844,
    'Painting stays visible beside mobile controls'
  );
  report.checks.push('mobile layout and reduced motion at initial load');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/experiments/medusa?backend=webgl`);
  await canvas.waitFor({ timeout: 60000 });
  assert.equal(await canvas.getAttribute('data-backend'), 'WebGL 2');
  await canvas.screenshot({ path: join(artifacts, 'webgl.png') });
  report.checks.push('WebGL 2 fallback draws');
  await page.getByRole('button', { name: 'New specimen', exact: true }).click();
  await page.locator('nav a[href="/experiments"]').first().click();
  await page.waitForURL(`${base}/experiments`);
  await page.waitForTimeout(300);
  report.checks.push('unmount during regeneration');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
