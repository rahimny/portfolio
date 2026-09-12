import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  const study = getStudy('core-panic');
  const url = `http://127.0.0.1:${server.httpServer.address().port}/experiments/${study.slug}`;
  browser = await chromium.launch({
    args:
      process.env.CORE_GPU === 'native'
        ? ['--use-gl=angle', '--use-angle=metal']
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  await mkdir('output/core-panic', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    hasTouch: true,
  });
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const ready = () =>
    page.locator('.core-stage canvas[data-ready="true"]').waitFor();
  const canvas = page.locator('.core-stage canvas');
  const value = async (key) => Number(await canvas.getAttribute(`data-${key}`));
  const waitValue = (key, min) =>
    page
      .waitForFunction(
        ({ key, min }) =>
          Number(document.querySelector('.core-stage canvas').dataset[key]) >=
          min,
        { key, min }
      )
      .catch(async (error) => {
        console.error(
          'Core state at failed milestone:',
          await canvas.evaluate((c) => ({ ...c.dataset })),
          errors
        );
        await page.screenshot({ path: 'output/core-panic/failure.png' });
        throw error;
      });
  const start = async () => {
    await page.getByRole('button', { name: 'Enter the core' }).click();
    await page.locator('.core-target[data-active="true"]').first().waitFor();
  };
  await page.goto(url);
  await ready();
  await page.screenshot({ path: 'output/core-panic/desktop-idle.png' });
  if (process.env.CORE_CAPTURE_ONLY === '1') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/core-panic/mobile-idle.png' });
  } else {
    const chargedOpening = () =>
      page.waitForFunction(() => {
        const c = document.querySelector('.core-stage canvas');
        const target = document.querySelector(
          `[data-knot="${c.dataset.selected}"]`
        );
        return (
          Number(c.dataset.charge) >= 0.7 && target?.dataset.open === 'true'
        );
      });
    await page.getByRole('button', { name: 'Enable sound' }).click();
    await start();
    const knot = page.locator('[data-knot="0"]');
    const box = await knot.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await waitValue('charge', 0.4);
    await page.screenshot({ path: 'output/core-panic/gathering.png' });
    await chargedOpening();
    assert.equal(await value('shots'), 0, 'Holding gathers without firing');
    assert.ok((await value('salvo')) >= 4);
    await page.mouse.up();
    await waitValue('shots', 1);
    assert.equal(await value('score'), 0, 'Score waits for impact');
    await page.waitForTimeout(160);
    await page.screenshot({ path: 'output/core-panic/salvo.png' });
    await waitValue('hits', 2);
    assert.ok((await value('score')) >= 400);
    await page.locator('.core-target[data-exposed="true"]').first().waitFor();
    await page.screenshot({ path: 'output/core-panic/implosion.png' });
    await page.getByRole('button', { name: 'Mute sound' }).click();
    await page.getByRole('region', { name: 'Core Panic arcade game' }).focus();
    const shots = await value('shots');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Space');
    await waitValue('charge', 0.3);
    assert.equal(
      await value('shots'),
      shots,
      'Holding Space does not auto-fire'
    );
    await page.keyboard.press('Escape');
    await page.keyboard.up('Space');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForTimeout(80);
    assert.equal(
      await value('shots'),
      shots,
      'Pause cancels held charge without a late release'
    );
    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    await page.waitForTimeout(80);
    const paused = await value('time');
    await page.waitForTimeout(250);
    assert.equal(await value('time'), paused);
    await page.getByRole('button', { name: 'How to play' }).click();
    assert.equal(
      await page
        .getByRole('dialog', { name: 'How to play Core Panic' })
        .isVisible(),
      true
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    console.log(
      'PASS held gathering, orbit release, linked impact, exposed follow-up, keyboard charge cancellation, pause/help/blur'
    );

    await page.reload();
    await ready();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await page.locator('[data-knot="0"]').focus();
    await page.keyboard.press('Enter');
    await chargedOpening();
    await page.keyboard.press('Enter');
    await waitValue('hits', 2);
    assert.equal(await canvas.getAttribute('data-reduced'), 'true');
    await page.waitForFunction(
      () =>
        document.querySelector('.core-stage canvas').dataset.phase === 'over',
      null,
      { timeout: 45000 }
    );
    await page.getByRole('button', { name: 'One more run' }).click();
    await page.waitForFunction(() => {
      const c = document.querySelector('.core-stage canvas');
      return c.dataset.phase === 'playing' && Number(c.dataset.time) < 1;
    });
    assert.equal(await value('score'), 0);
    assert.equal(await value('missiles'), 0);
    console.log(
      'PASS keyboard button activation, reduced-motion shots, rupture/failure and clean restart'
    );

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const [width, height] of [
      [390, 844],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.reload();
      await ready();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      const controls = await page.locator('.core-console').boundingBox();
      assert.ok(
        controls.y + controls.height <= height,
        'HUD fits the viewport'
      );
      await page.screenshot({ path: `output/core-panic/layout-${width}.png` });
      await start();
      const target = await page.locator('[data-knot="0"]').boundingBox();
      assert.ok(
        target.width >= 44 && target.height >= 44,
        'Minimum touch target'
      );
      assert.ok(
        target.x >= 0 &&
          target.y >= 0 &&
          target.x + target.width <= width &&
          target.y + target.height <= height
      );
      const cdp = await page.context().newCDPSession(page);
      const finger = {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2,
        id: 1,
      };
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger],
      });
      await waitValue('charge', 0.4);
      await page.screenshot({ path: `output/core-panic/charged-${width}.png` });
      await chargedOpening();
      assert.equal(await value('shots'), 0);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await waitValue('shots', 1);
      assert.equal(await value('shots'), 1, 'Touch release fires once');
      await waitValue('hits', 2);
      await page.screenshot({ path: `output/core-panic/playing-${width}.png` });
      const stage = await canvas.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          {
            x: stage.x + stage.width / 2,
            y: stage.y + stage.height / 2,
            id: 2,
          },
        ],
      });
      await waitValue('charge', 0.2);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      });
      await cdp.detach();
      await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    }
    console.log(
      'PASS narrow-phone/landscape, touch hold/release, gathered visuals and cancellation'
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await ready();
    await start();
    await page.locator('[data-knot="0"][data-open="false"]').click();
    await waitValue('blocked', 1);
    assert.equal(
      await value('hits'),
      0,
      'Closed membrane does not award a hit'
    );
    assert.ok((await value('pressure')) > 12);
    console.log('PASS visible closed-window rejection');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await ready();
    if (process.env.CORE_POSTER === '1') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await canvas.screenshot({
        path: `public${study.poster}`,
        type: 'jpeg',
        quality: 92,
      });
    }
    console.log(
      'Renderer:',
      await canvas.getAttribute('data-pixels'),
      'pixels;',
      await canvas.getAttribute('data-draw-calls'),
      'draw calls'
    );
    await page.locator('a[href="/experiments"]').first().click();
    await page.locator(`a[href="/experiments/${study.slug}"]`).first().click();
    await ready();
    await page.locator('a[href="/experiments"]').first().click();
    console.log('PASS route re-entry and cleanup');
    assert.deepEqual(errors, []);
    await browser.close();
    browser = await chromium.launch({ args: ['--disable-webgl'] });
    const fallback = await browser.newPage();
    await fallback.goto(url);
    await fallback
      .getByRole('alert')
      .filter({ hasText: 'Core Panic needs WebGL 2' })
      .waitFor();
    console.log('PASS unavailable WebGL fallback');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
