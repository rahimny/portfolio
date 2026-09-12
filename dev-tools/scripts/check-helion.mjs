import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
const errors = [];
try {
  await server.listen();
  await server.watcher.close();
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('helion');
  const url = `http://127.0.0.1:${server.httpServer.address().port}/experiments/${study.slug}`;
  browser = await chromium.launch({
    args:
      process.env.HELION_GPU === 'native'
        ? []
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  await mkdir('output/helion', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.error(m.text());
    }
  });
  await page.goto(url);
  await page.locator('canvas[data-ready="true"]').waitFor();
  const canvas = page.locator('.helion-stage canvas');
  // Capture the fixed stage bounds directly; an animated canvas needs no
  // element-actionability wait before its pixels can be inspected.
  const captureStage = async (path) => {
    const clip = await page.locator('.helion-stage').boundingBox();
    assert.ok(clip);
    await page.screenshot({ path, clip });
  };
  const time = () => canvas.getAttribute('data-time');
  const impacts = async () => Number(await canvas.getAttribute('data-impacts'));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozen = await time();
  await page.waitForTimeout(250);
  assert.equal(await time(), frozen);
  await captureStage('output/helion/rest.png');
  await page.locator('.helion-render-settings summary').click();
  const styles = [];
  for (const name of ['Ink', 'Arcade', 'Cel']) {
    await page.getByRole('button', { name, exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    styles.push(await canvas.screenshot());
    await captureStage(`output/helion/style-${name.toLowerCase()}.png`);
    assert.equal(
      await time(),
      frozen,
      'Rendering controls must not restart the simulation'
    );
  }
  assert.notEqual(
    Buffer.compare(styles[0], styles[1]),
    0,
    'Ink and Arcade must render differently'
  );
  await page
    .getByRole('slider', { name: 'Ink weight', exact: true })
    .press('Home');
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('canvas').dataset.renderStyle).ink === 0
  );
  await page.getByRole('button', { name: 'Cel', exact: true }).click();
  await page.locator('.helion-render-settings summary').click();
  await canvas.scrollIntoViewIfNeeded();
  console.log(
    'PASS rendering presets and keyboard adjustments preserve paused simulation'
  );
  const before = await impacts();
  await page.getByRole('button', { name: 'Discharge', exact: true }).click();
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    before
  );
  assert.equal(
    await time(),
    frozen,
    'Paused discharge updates geometry without advancing time'
  );
  await captureStage('output/helion/impact.png');
  const inspection = await canvas.screenshot();
  const inspectionCount = await impacts();
  await page.getByRole('button', { name: 'Discharge', exact: true }).click();
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    inspectionCount
  );
  assert.equal(
    Buffer.compare(inspection, await canvas.screenshot()),
    0,
    'Repeated frozen strikes must not accumulate emission'
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const box = await canvas.boundingBox();
  const orbitRadius = Math.min(box.width, box.height) * 0.28;
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    await page.mouse.move(
      box.x + box.width * 0.5 + Math.cos(angle) * orbitRadius,
      box.y + box.height * 0.5 + Math.sin(angle) * orbitRadius
    );
  }
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.mood === 'Gathering'
  );
  await captureStage('output/helion/swarm.png');
  console.log('PASS circular input gathers the coordinated swarm');
  await page.mouse.move(box.x + box.width * 0.51, box.y + box.height * 0.49);
  await page.mouse.down();
  await page.waitForFunction(() =>
    document
      .querySelector('.helion-instruction')
      .textContent.includes('Charging')
  );
  const held = await impacts();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    held
  );
  assert.match(
    await page.locator('.helion-instruction').innerText(),
    /Brush the shell/
  );
  console.log('PASS pause, frozen inspection and pointer charge/release');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.hoverTile !== '-1'
  );
  const dragBefore = await impacts();
  await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.57, box.y + box.height * 0.54, {
    steps: 18,
  });
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.dragging === 'true'
  );
  await page.waitForTimeout(120);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.38, {
    steps: 12,
  });
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    dragBefore
  );
  await captureStage('output/helion/drag.png');
  await page.mouse.up();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.recoil) > 0.001
  );
  console.log('PASS hover selection, surface raking and camera recoil');

  await canvas.focus();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => {
    const charge = document
      .querySelector('.helion-instruction')
      .textContent.match(/Charging (\d+)/);
    return charge && Number(charge[1]) >= 75;
  });
  const keyBefore = await impacts();
  await page.keyboard.up('Space');
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    keyBefore
  );
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.burst === 'true'
  );
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.mood === 'Frenzy' &&
      document.querySelector('canvas').dataset.coins === 'true'
  );
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.pixelation) > 0.05
  );
  await page.keyboard.press('p');
  await captureStage('output/helion/charged-burst.png');
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  const keyboardFrozen = await time();
  await page.waitForTimeout(200);
  assert.equal(await time(), keyboardFrozen);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still', exact: true }).click();
  await (await download).saveAs('output/helion/still.png');
  const png = await readFile('output/helion/still.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 10000);
  console.log(
    'PASS charged frenzy, coin pops, raster breakup, keyboard pause and PNG export'
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByText('Still / Reduced motion', { exact: true }).waitFor();
  const reduced = await time();
  await page.waitForTimeout(250);
  assert.equal(await time(), reduced);
  assert.equal(Number(await canvas.getAttribute('data-recoil')), 0);
  assert.equal(Number(await canvas.getAttribute('data-pixelation')), 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'Resume', exact: true })
      .isDisabled(),
    true
  );
  const reducedBefore = await impacts();
  await page.getByRole('button', { name: 'Discharge', exact: true }).click();
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    reducedBefore
  );
  assert.equal(await time(), reduced);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await page.screenshot({ path: 'output/helion/mobile.png', fullPage: true });
  console.log('PASS reduced-motion inspection and mobile layout');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const autoBefore = await impacts();
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.impacts) > n,
    autoBefore,
    { timeout: 60000 }
  );
  await page.getByText('Inside the field', { exact: true }).click();
  console.log(
    'Renderer telemetry:',
    await page.locator('.helion-notes details p.font-meta').innerText()
  );
  console.log('PASS automatic comet impacts');
  if (process.env.HELION_POSTER === '1') {
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.addStyleTag({
      content:
        '.helion-stage [data-poster-hide] { visibility: hidden !important; }',
    });
    await canvas.screenshot({
      path: `public${study.poster}`,
      type: 'jpeg',
      quality: 90,
    });
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: 'output/helion/desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  await page.close();
  await browser.close();
  browser = await chromium.launch({ args: ['--disable-webgl'] });
  const unavailable = await browser.newPage();
  await unavailable.goto(url);
  await unavailable
    .getByRole('alert')
    .filter({ hasText: 'Helion needs WebGL 2' })
    .waitFor();
  console.log('PASS unavailable-WebGL fallback');
} finally {
  await browser?.close();
  await server.close();
}
