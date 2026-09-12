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
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await mkdir('output/umbra', { recursive: true });
  await page.goto(`${base}/experiments/umbra`);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const tick = () => canvas.getAttribute('data-tick');
  assert.equal(await tick(), '24');
  await page.waitForTimeout(300);
  assert.equal(await tick(), '24');
  await page.screenshot({ path: 'output/umbra/desktop.png', fullPage: true });
  await canvas.screenshot({ path: 'output/umbra/formation.png' });
  const hide = await page.addStyleTag({
    content: '[data-poster-hide] { visibility: hidden !important; }',
  });
  await canvas.screenshot({
    path: 'output/umbra/poster.jpg',
    type: 'jpeg',
    quality: 92,
  });
  await hide.evaluate((element) => element.remove());
  await page.getByLabel('Azimuth').fill('90');
  await page.getByRole('button', { name: 'Step growth', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.tick === '25'
  );
  const downloadState = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save state', exact: true }).click();
  await (await downloadState).saveAs('output/umbra/state.json');
  const saved = JSON.parse(await readFile('output/umbra/state.json', 'utf8'));
  assert.equal(saved.tick, 25);
  assert.equal(saved.light.azimuth, 90);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('Restore state', { exact: true })
    .setInputFiles('output/umbra/state.json');
  await page
    .getByRole('status')
    .filter({ hasText: 'State restored' })
    .waitFor();
  assert.equal(await tick(), '25');
  await page.getByRole('button', { name: 'Enter void', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await canvas.getAttribute('data-interior'), 'true');
  await page.screenshot({ path: 'output/umbra/interior.png', fullPage: true });
  const cameraDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save state', exact: true }).click();
  await (await cameraDownload).saveAs('output/umbra/interior-state.json');
  const cameraState = JSON.parse(
    await readFile('output/umbra/interior-state.json', 'utf8')
  );
  assert.deepEqual(cameraState.matter, saved.matter);
  assert.deepEqual(cameraState.resource, saved.resource);
  assert.equal(cameraState.view.fov, 94);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page
    .getByLabel('Restore state', { exact: true })
    .setInputFiles('output/umbra/interior-state.json');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.interior === 'true'
  );
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Reset seed', exact: true }).click();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  assert.equal(await page.getByLabel('Azimuth').inputValue(), '-19');
  const downloadImage = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save impression', exact: true })
    .click();
  await (await downloadImage).saveAs('output/umbra/impression.png');
  const png = await readFile('output/umbra/impression.png');
  assert.equal(png.readUInt32BE(16), 2400);
  assert.equal(png.readUInt32BE(20), 2800);
  assert.ok(png.length > 30000);
  await page.getByLabel('Restore state', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await page
    .getByRole('status')
    .filter({ hasText: 'Unsupported UMBRA state' })
    .waitFor();
  assert.equal(await tick(), '24');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/umbra/mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.tick) > 24
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const held = await tick();
  await page.waitForTimeout(500);
  assert.equal(await tick(), held);
  await page.setViewportSize({ width: 1440, height: 1050 });
  if (process.env.UMBRA_CONTACT_SHEET === '1') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (let seed = 1; seed <= 64; seed++) {
      await page.getByLabel('Seed', { exact: true }).fill(String(seed));
      await page
        .getByRole('button', { name: 'Grow seed', exact: true })
        .click();
      await page.waitForTimeout(60);
      await canvas.screenshot({
        path: `output/umbra/seed-${String(seed).padStart(2, '0')}.png`,
      });
    }
  }
  for (let i = 0; i < 2; i++) {
    await page.goto(`${base}/lab`);
    await page.goto(`${base}/experiments/umbra`);
    await canvas.waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS UMBRA: rendered scene, reduced motion, stepping, keyboard, snapshot/restore, checked views, 2400px export, mobile, pause, remounts.'
  );
} finally {
  await browser?.close();
  await server.close();
}
