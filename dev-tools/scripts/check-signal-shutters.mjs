import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const output = '/tmp/signal-shutters-check';
const errors = [];
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  await server.watcher.close();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const path = `/experiments/${getStudy('signal-shutters').slug}`;
  browser = await chromium.launch({
    args:
      process.env.SHUTTERS_GPU === 'software'
        ? [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : [
            '--enable-unsafe-webgpu',
            ...(process.platform === 'darwin'
              ? ['--use-gl=angle', '--use-angle=metal']
              : []),
          ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  const collect = (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  };
  collect(page);
  await page.goto(base + path);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const frames = () => canvas.getAttribute('data-frames');
  const asleep = await frames();
  await page.waitForTimeout(300);
  assert.equal(await frames(), asleep, 'A settled sign must sleep');
  await page.screenshot({ path: `${output}/front.png` });
  const front = await canvas.screenshot();
  if (process.env.SHUTTERS_POSTER)
    await canvas.screenshot({
      path: process.env.SHUTTERS_POSTER,
      type: 'jpeg',
      quality: 92,
    });
  await page.getByRole('button', { name: /02 MAKE SOME NOISE/ }).click();
  await page.waitForTimeout(550);
  await page.screenshot({ path: `${output}/wave.png` });
  const wave = await canvas.screenshot();
  assert.notDeepEqual(
    wave,
    front,
    'Transmission must change the rendered geometry'
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  assert.equal(await canvas.getAttribute('data-face'), '1');
  await page.screenshot({ path: `${output}/second.png` });
  const second = await canvas.screenshot();
  assert.notDeepEqual(
    second,
    front,
    'The second physical face must show a different print'
  );
  await page.getByRole('button', { name: /03 CHANGE IS GOOD/ }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(100);
  const held = await frames();
  await page.waitForTimeout(300);
  assert.equal(await frames(), held, 'Pause must stop rendering mid-wave');
  await page.screenshot({ path: `${output}/held.png` });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  await page.screenshot({ path: `${output}/third.png` });
  const beforeTouch = await canvas.screenshot();
  // Count actual simulation progress while input is still arriving. Rendering
  // alone missed a clock-reset bug that froze motors until pointer release.
  await page.evaluate(async () => {
    const { ShutterField } = await import(
      '/src/features/signal-shutters/model.ts'
    );
    const step = ShutterField.prototype.step;
    window.shutterDragSteps = 0;
    window.restoreShutterStep = () => {
      ShutterField.prototype.step = step;
    };
    ShutterField.prototype.step = function (dt) {
      window.shutterDragSteps++;
      return step.call(this, dt);
    };
  });
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, {
    steps: 45,
  });
  const dragSteps = await page.evaluate(() => {
    window.restoreShutterStep();
    return window.shutterDragSteps;
  });
  assert.ok(
    dragSteps > 0,
    'Motors must advance during a held drag, not only after release'
  );
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.notDeepEqual(
    await canvas.screenshot(),
    beforeTouch,
    'A pointer stroke must disturb the actual image'
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.face === '0'
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  await page
    .getByRole('button', { name: 'Inspect depth', exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  await page.screenshot({ path: `${output}/depth.png` });
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save still ↗', exact: true })
    .click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'signal-shutters.png');
  await download.saveAs(`${output}/export.png`);
  const backend = await canvas.getAttribute('data-backend');
  await page.goto(base + '/experiments');
  await page.goto(base + path);
  await canvas.waitFor();
  // Cancellation during initialisation, followed by a fresh renderer.
  await page.goto(base + '/experiments');
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.goto(base + '/experiments');
  await page.goto(base + path);
  await canvas.waitFor();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    isMobile: true,
    hasTouch: true,
  });
  collect(mobile);
  await mobile.goto(base + path);
  const smallCanvas = mobile.locator('canvas[data-ready="true"]');
  await smallCanvas.waitFor();
  await mobile.getByRole('button', { name: /02 MAKE SOME NOISE/ }).tap();
  await mobile.waitForFunction(
    () => document.querySelector('canvas').dataset.face === '1'
  );
  const reduced = await smallCanvas.getAttribute('data-frames');
  await mobile.waitForTimeout(300);
  assert.equal(
    await smallCanvas.getAttribute('data-frames'),
    reduced,
    'Reduced motion must show one discrete result'
  );
  await mobile.getByRole('button', { name: 'Interfere', exact: false }).tap();
  await mobile.waitForFunction(
    (previous) => document.querySelector('canvas').dataset.frames !== previous,
    reduced
  );
  const still = await smallCanvas.getAttribute('data-frames');
  await mobile.waitForTimeout(300);
  assert.equal(await smallCanvas.getAttribute('data-frames'), still);
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'No mobile horizontal overflow'
  );
  await mobile.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    `PASS Signal Shutters: ${backend}, three faces, travelling wave, drag, keyboard, pause/resume, export, remount and reduced-motion mobile. Screenshots: ${output}`
  );
} finally {
  await browser?.close();
  await server.close();
}
