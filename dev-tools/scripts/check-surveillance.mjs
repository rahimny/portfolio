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
  const study = getStudy('surveillance');
  const url = `http://127.0.0.1:${server.httpServer.address().port}/experiments/${study.slug}`;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  await page.mouse.move(200, 450);
  await page.waitForTimeout(350);
  const left = Number(await canvas.getAttribute('data-gaze'));
  await page.mouse.move(1200, 450);
  await page.waitForTimeout(350);
  const right = Number(await canvas.getAttribute('data-gaze'));
  assert.ok(right - left > 0.8, 'Lens must respond in both directions');
  let observedStep = false;
  let observedTetrapod = false;
  const firstPosition = JSON.parse(
    await canvas.getAttribute('data-mechanics')
  ).position;
  for (const [x, y] of [
    [90, 650],
    [1340, 220],
    [100, 180],
    [1280, 790],
  ]) {
    await page.mouse.move(x, y);
    for (let sample = 0; sample < 10; sample++) {
      await page.waitForTimeout(140);
      const state = JSON.parse(await canvas.getAttribute('data-mechanics'));
      assert.ok(Math.abs(state.headYaw) <= 0.681, 'Pan hard stop');
      assert.ok(Math.abs(state.headPitch) <= 0.481, 'Tilt hard stop');
      assert.ok(
        state.feet.filter((foot) => foot[1] > 0.036).length <= 4,
        'At least four feet support the body'
      );
      assert.equal(state.feet.length, 8);
      if (state.feet.filter((foot) => foot[1] > 0.036).length === 4)
        observedTetrapod = true;
      if (state.phase === 'stepping') {
        observedStep = true;
        assert.ok(
          state.support > 0.04,
          'Chassis stays over the supporting feet'
        );
      }
    }
  }
  assert.ok(
    observedStep,
    'A large change of bearing must cause a support step'
  );
  assert.ok(observedTetrapod, 'The walk must alternate groups of four');
  const walking = JSON.parse(await canvas.getAttribute('data-mechanics'));
  assert.ok(walking.travel > 1.0, 'The body must travel across the floor');
  assert.ok(
    Math.hypot(
      walking.position[0] - firstPosition[0],
      walking.position[2] - firstPosition[2]
    ) > 0.25,
    'The droid must leave its starting position'
  );
  // A high target must be acquired by repositioning, without riding the tilt stop.
  await page.mouse.move(720, 115);
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      if (!canvas?.dataset.mechanics) return false;
      const state = JSON.parse(canvas.dataset.mechanics);
      return (
        state.target[1] > 6 &&
        state.aimError < 0.04 &&
        Math.abs(state.headPitch) < 0.4 &&
        Math.hypot(
          state.position[0] - state.destination[0],
          state.position[2] - state.destination[2]
        ) < 0.2
      );
    },
    undefined,
    { timeout: 25000 }
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const held = await canvas.getAttribute('data-time');
  const heldMechanism = await canvas.getAttribute('data-mechanics');
  await page.mouse.move(400, 400);
  await page.waitForTimeout(250);
  assert.equal(
    await canvas.getAttribute('data-time'),
    held,
    'Pause must hold simulation time'
  );
  assert.equal(
    await canvas.getAttribute('data-mechanics'),
    heldMechanism,
    'Pause freezes every joint'
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.notEqual(await canvas.getAttribute('data-time'), held);
  await page.keyboard.press('Space');
  assert.equal(await canvas.getAttribute('data-paused'), 'true');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still' }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'surveillance.png');
  assert.equal(await download.failure(), null);
  await mkdir('output/surveillance', { recursive: true });
  await page.locator('h1').click({ force: true });
  await page.screenshot({ path: 'output/surveillance/desktop.png' });
  // Use a neutral still for the index and inspect the small-screen composition.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await canvas.waitFor();
  const time = await canvas.getAttribute('data-time');
  await page.waitForTimeout(200);
  assert.equal(await canvas.getAttribute('data-time'), time);
  await canvas.focus();
  const beforeKey = await canvas.getAttribute('data-gaze');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  assert.notEqual(
    await canvas.getAttribute('data-gaze'),
    beforeKey,
    'Reduced motion retains discrete keyboard inspection'
  );
  assert.equal(await canvas.getAttribute('data-time'), time);
  if (process.env.SURVEILLANCE_POSTER === '1') {
    await page.reload();
    await canvas.waitFor();
    await page.addStyleTag({
      content: '[data-poster-hide] { visibility: hidden !important; }',
    });
    await canvas.screenshot({
      path: `public${study.poster}`,
      type: 'jpeg',
      quality: 93,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await canvas.waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  await page.screenshot({ path: 'output/surveillance/mobile.png' });
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await touch.goto(url);
  await touch.locator('canvas[data-ready="true"]').waitFor();
  await touch.touchscreen.tap(320, 420);
  await touch.waitForTimeout(300);
  assert.ok(
    Number(await touch.locator('canvas').getAttribute('data-gaze')) > 0.4,
    'Touch directs the lens'
  );
  await touch.close();
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  await page.goBack();
  await canvas.waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS Surveillance: eight-leg travel, alternating tetrapods, pointer, keyboard, pause/resume, startle, PNG export, reduced motion, touch, mobile layout and SPA remount.'
  );
} finally {
  await browser?.close();
  await server.close();
}
