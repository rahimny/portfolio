import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
  const study = getStudy('octopus');
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mkdir('output/octopus', { recursive: true });
  await page.goto(`${base}/experiments/${study.slug}`);
  const canvas = page.locator('.octopus-page canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 90000 });
  const initial = await canvas.screenshot();
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  const calls = Number(await canvas.getAttribute('data-draw-calls'));
  assert.ok(triangles > 100000 && triangles < 800000);
  assert.ok(calls < 240);
  assert.equal(await canvas.getAttribute('data-time'), '0.000');
  await page.screenshot({ path: 'output/octopus/desktop.png', fullPage: true });
  if (process.env.OCTOPUS_POSTER === '1')
    await canvas.screenshot({
      path: `public${study.poster}`,
      type: 'jpeg',
      quality: 94,
    });
  await page.getByLabel('Tip curl', { exact: true }).fill('1');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.curl === '1.000'
  );
  assert.notDeepEqual(await canvas.screenshot(), initial);
  await page.getByLabel('Tip curl', { exact: true }).fill('0');
  await page.getByLabel('Arm spread', { exact: true }).fill('1');
  await page.screenshot({
    path: 'output/octopus/extended.png',
    fullPage: true,
  });
  await page.getByLabel('Tip curl', { exact: true }).fill('0.16');
  await page.getByLabel('Arm spread', { exact: true }).fill('0.55');
  await page.getByRole('button', { name: '02 Explode', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.renderedSeparation === '1.000'
  );
  assert.notDeepEqual(await canvas.screenshot(), initial);
  await page.screenshot({ path: 'output/octopus/anatomy.png', fullPage: true });
  await page.getByLabel('ASSEMBLY SEPARATION').fill('0.45');
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.renderedSeparation === '0.450'
  );
  const solid = await canvas.screenshot();
  await page.getByRole('button', { name: 'X-ray shell', exact: true }).click();
  assert.notDeepEqual(await canvas.screenshot(), solid);
  await page.getByRole('button', { name: 'X-ray shell', exact: true }).click();
  await page
    .getByRole('button', { name: '03 Lattice detail', exact: true })
    .click();
  assert.equal(await page.getByLabel('ASSEMBLY SEPARATION').isDisabled(), true);
  await page.screenshot({ path: 'output/octopus/arm.png', fullPage: true });
  assert.ok(
    Number(await canvas.getAttribute('data-triangles')) < triangles / 3
  );
  await canvas.focus();
  const beforeOrbit = await canvas.screenshot();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  assert.notDeepEqual(await canvas.screenshot(), beforeOrbit);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await page
    .getByRole('button', { name: 'Advance 0.1 s', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.time === '0.100'
  );
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save specimen image', exact: true })
    .click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'octopus-arm.png');
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  await page.getByRole('button', { name: '01 Specimen', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.time) > 0.5
  );
  const movingFrame = await canvas.screenshot();
  const movingTime = Number(await canvas.getAttribute('data-time'));
  await page.waitForFunction(
    (before) =>
      Number(document.querySelector('canvas').dataset.time) > before + 1.5,
    movingTime
  );
  assert.notDeepEqual(await canvas.screenshot(), movingFrame);
  await page.getByRole('button', { name: 'Hold motion', exact: true }).click();
  const held = await canvas.getAttribute('data-time');
  await page.waitForTimeout(200);
  assert.equal(await canvas.getAttribute('data-time'), held);
  await page.getByLabel('Tip curl', { exact: true }).fill('0.8');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.curl === '0.800'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/octopus/mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', { name: 'Experiments', exact: true }).click();
    await page.locator(`a[href="/experiments/${study.slug}"]`).first().click();
    await page.waitForURL(`**/experiments/${study.slug}`);
    await canvas.waitFor({ timeout: 90000 });
    assert.equal(await canvas.getAttribute('data-time'), '0.000');
  }
  assert.deepEqual(errors, []);
  console.log(
    `Octopus: inspection, pose changes, pause/step, keyboard, PNG, mobile and remount pass. ${triangles} triangles; ${calls} draw calls.`
  );
} finally {
  await browser?.close();
  await server.close();
}
