import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/nereid-home-check',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
try {
  if (!process.env.HOME_NEREID_URL) await server.listen();
  await server.watcher.close();
  const base =
    process.env.HOME_NEREID_URL ??
    `http://127.0.0.1:${server.httpServer.address().port}`;
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('nereid');
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('output/home-nereid', { recursive: true });
  const canvas = page.locator('.home-nereid-canvas');
  const activeChapter = page.locator(
    '.home-nereid-chapter[data-active="true"]'
  );
  const seek = async (progress) => {
    await page.locator('.home-nereid').evaluate((host, p) => {
      const stage = host.querySelector('.home-nereid-stage');
      const entry = innerHeight * 0.8;
      const offset = parseFloat(getComputedStyle(stage).top) || 0;
      const travel = host.clientHeight - stage.clientHeight + entry - offset;
      scrollTo({
        top: scrollY + host.getBoundingClientRect().top - entry + p * travel,
        behavior: 'instant',
      });
    }, progress);
    await page
      .waitForFunction(
        (p) => {
          const value = Number(
            document.querySelector('.home-nereid-canvas')?.dataset.progress
          );
          return Math.abs(value - p) < 0.002;
        },
        progress,
        { timeout: 30000 }
      )
      .catch(async (error) => {
        console.error(
          'Scroll seek',
          progress,
          await page.locator('.home-nereid').evaluate((host) => ({
            static: host.dataset.static,
            top: host.getBoundingClientRect().top,
            height: host.clientHeight,
            viewport: innerHeight,
            stage: host.querySelector('.home-nereid-stage').clientHeight,
            canvas: { ...host.querySelector('canvas')?.dataset },
          }))
        );
        throw error;
      });
  };
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.masthead-play summary').waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('.home-nereid-canvas')?.dataset.ready === 'true'
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    'The encounter prepares in the background without scrolling'
  );
  assert.ok(
    requests.some((url) => url.includes('/nereid/home-swim.bin')),
    'The swimming recording loads before approach'
  );
  assert.equal(
    await page.locator('.home-nereid-poster').count(),
    0,
    'The animated encounter never displays a placeholder poster'
  );
  assert.ok(
    !requests.some(
      (url) => new URL(url).pathname === (study.encounterPoster ?? study.poster)
    ),
    'Animated mode does not request the static fallback poster'
  );
  assert.equal(Number(await canvas.getAttribute('data-progress')), 0);
  await page.waitForTimeout(100);
  const preparedFrame = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(250);
  assert.equal(
    await canvas.getAttribute('data-frames'),
    preparedFrame,
    'The prepared scene sleeps below the opening viewport'
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 720],
    [844, 390],
    [390, 844],
    [320, 568],
    [490, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      scrollTo({ top: 0, behavior: 'instant' });
    });
    const opening = await page.evaluate(() => ({
      next: document.querySelector('.home-nereid').getBoundingClientRect().top,
      employmentBottom: document
        .querySelector('.home-employment')
        .getBoundingClientRect().bottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
      nameTop: document
        .querySelector('.home-masthead h1')
        .getBoundingClientRect().top,
      navbarHeight: document.querySelector('nav').getBoundingClientRect()
        .bottom,
      introductionGap:
        document.querySelector('.home-intro').getBoundingClientRect().top -
        document.querySelector('.home-watcher-lane').getBoundingClientRect()
          .bottom,
    }));
    if (width >= 768) {
      assert.ok(
        opening.next >= height,
        `${width} × ${height}: landing owns the first viewport`
      );
    } else {
      assert.ok(
        opening.nameTop - opening.navbarHeight <= 40,
        'Mobile name sits close to the navigation'
      );
      assert.ok(
        opening.introductionGap <= 32,
        'Mobile introduction follows the character area without a large empty gap'
      );
      await page.screenshot({
        path: `output/home-nereid/mobile-layout-${width}.png`,
      });
    }
    assert.ok(
      opening.employmentBottom <= height,
      `${width} × ${height}: professional context is visible`
    );
    assert.equal(opening.overflow, false);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.masthead-play summary').click();
  const options = await page.evaluate(() => ({
    top: document.querySelector('.masthead-play-sheet').getBoundingClientRect()
      .top,
    identityBottom: document
      .querySelector('.home-intro')
      .getBoundingClientRect().bottom,
  }));
  assert.ok(
    options.top >= options.identityBottom,
    'Play options never overlap identity text'
  );
  assert.equal(
    await page.locator('.tp-dfwv').count(),
    0,
    'No floating technical tuner on the homepage'
  );
  await page.locator('.masthead-play summary').press('Escape');
  await seek(0.18);
  await page.waitForFunction(
    () =>
      document.querySelector('.home-nereid-canvas')?.dataset.ready === 'true'
  );
  await page.screenshot({ path: 'output/home-nereid/arrival.png' });
  assert.equal(await activeChapter.getAttribute('data-chapter'), '0');
  await seek(0.27);
  assert.equal(Number(await canvas.getAttribute('data-separation')), 0);
  const assembledYaw = Number(await canvas.getAttribute('data-yaw'));
  await page.screenshot({ path: 'output/home-nereid/assembled.png' });
  await seek(0.36);
  assert.ok(Number(await canvas.getAttribute('data-separation')) > 0);
  assert.equal(await activeChapter.getAttribute('data-chapter'), '1');
  await page.screenshot({ path: 'output/home-nereid/core-approach.png' });
  await seek(0.96);
  assert.equal(await activeChapter.getAttribute('data-chapter'), '2');
  assert.equal(
    requests.filter((url) => url.includes('/nereid/home-swim.bin')).length,
    1,
    'Narrative transitions do not remount or reload the scene'
  );
  assert.ok(Number(await canvas.getAttribute('data-separation')) > 0.71);
  assert.ok(Number(await canvas.getAttribute('data-yaw')) - assembledYaw > 1.4);
  await page.screenshot({ path: 'output/home-nereid/open.png' });
  const budget = await canvas.evaluate((node) => ({
    pixels: node.width * node.height,
    cssPixels: node.clientWidth * node.clientHeight,
    calls: Number(node.dataset.drawCalls),
    triangles: Number(node.dataset.triangles),
  }));
  assert.ok(budget.pixels <= 4_000_000);
  assert.ok(
    budget.pixels >= budget.cssPixels * 3.9,
    'The desktop encounter renders at Retina resolution within its pixel budget'
  );
  assert.ok(budget.calls < 160);
  await page.waitForFunction(
    () =>
      document.querySelector('.home-nereid-canvas')?.dataset.settled === 'true'
  );
  await page.waitForTimeout(100);
  const frame = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(250);
  assert.equal(
    await canvas.getAttribute('data-frames'),
    frame,
    'The renderer must sleep at rest'
  );
  await seek(0.27);
  assert.equal(await activeChapter.getAttribute('data-chapter'), '0');
  assert.equal(Number(await canvas.getAttribute('data-separation')), 0);
  assert.equal(Number(await canvas.getAttribute('data-shell-twist')), 0);
  await seek(0.15);
  await seek(0.9);

  // Native keyboard scroll and the direct collection link both bypass the encounter.
  await page.locator('.home-nereid-footer a').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector('#selected-work').getBoundingClientRect().top
      ) < 100
  );
  await page.screenshot({ path: 'output/home-nereid/collection.png' });
  await page.evaluate(() =>
    scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  );
  await canvas.waitFor({ state: 'detached', timeout: 15000 });
  await seek(0.72);
  await page.locator('.home-nereid-link').click();
  await page.waitForURL(`**/experiments/${study.slug}`);
  await canvas.waitFor({ state: 'detached' });
  await page.getByRole('link', { name: /^index$/i }).click();
  await seek(0.27);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await seek(0.27);
  await page.screenshot({ path: 'output/home-nereid/mobile-assembled.png' });
  await seek(0.96);
  await page.screenshot({ path: 'output/home-nereid/mobile-open.png' });
  await page
    .waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
      undefined,
      {
        timeout: 10000,
      }
    )
    .catch(async (error) => {
      console.error(
        await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('body *')]
            .map((node) => ({
              tag: node.tagName,
              class: node.className,
              right: node.getBoundingClientRect().right,
            }))
            .filter((node) => node.right > innerWidth + 1)
            .slice(0, 12),
        }))
      );
      throw error;
    });

  await page.setViewportSize({ width: 320, height: 568 });
  await seek(0.8);
  const copyBottom = await activeChapter.evaluate(
    (node) => node.getBoundingClientRect().bottom
  );
  const artworkTop = await canvas.evaluate(
    (node) => node.getBoundingClientRect().top
  );
  assert.ok(
    copyBottom <= artworkTop,
    'Short phones give the narrative and artwork separate space'
  );
  await page.screenshot({
    path: 'output/home-nereid/small-mobile-content.png',
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await canvas.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.home-nereid-poster').count(), 1);
  assert.equal(await activeChapter.getAttribute('data-chapter'), '0');
  assert.equal(
    await page
      .locator('.home-nereid-stage')
      .evaluate((node) => getComputedStyle(node).position),
    'relative'
  );
  assert.ok(
    await page
      .locator('.home-nereid')
      .evaluate((node) => node.clientHeight < innerHeight)
  );
  await page.locator('#home-nereid-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/home-nereid/reduced-motion.png' });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.home-nereid[data-static="false"]').waitFor();
  await seek(0.7);
  await canvas.evaluate((node) =>
    node.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  );
  await canvas.waitFor({ state: 'detached' });
  assert.equal(
    await page.locator('.home-nereid').getAttribute('data-static'),
    'true'
  );
  assert.ok(await page.locator('.home-nereid-link').isVisible());

  // Aborted async initialisation must never attach a late canvas on another route.
  let releaseRecording;
  const recordingGate = new Promise((resolve) => {
    releaseRecording = resolve;
  });
  await page.route('**/nereid/home-swim.bin', async (route) => {
    await recordingGate;
    await route.continue().catch(() => {});
  });
  const pendingRecording = page.waitForRequest('**/nereid/home-swim.bin');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.masthead-play summary').waitFor();
  await pendingRecording;
  await page.locator('.home-nereid-heading').scrollIntoViewIfNeeded();
  assert.equal(
    await page.locator('.home-nereid-poster').count(),
    0,
    'Scrolling before background loading finishes cannot flash a poster'
  );
  assert.notEqual(await canvas.getAttribute('data-ready'), 'true');
  await page.getByRole('link', { name: /^about$/i }).click();
  await page.waitForURL('**/about');
  releaseRecording();
  await page.waitForTimeout(100);
  assert.equal(await canvas.count(), 0);
  assert.deepEqual(errors, []);
  const lostWhileLoading = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const loadingErrors = [];
  lostWhileLoading.on('pageerror', (error) =>
    loadingErrors.push(error.message)
  );
  await lostWhileLoading.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const context = getContext.call(this, kind, ...args);
      if (
        kind === 'webgl2' &&
        this.classList.contains('home-nereid-canvas') &&
        context
      )
        setTimeout(
          () => context.getExtension('WEBGL_lose_context')?.loseContext(),
          0
        );
      return context;
    };
  });
  await lostWhileLoading.goto(base);
  await lostWhileLoading.locator('.masthead-play summary').waitFor();
  await lostWhileLoading.locator('.home-nereid[data-static="true"]').waitFor();
  await lostWhileLoading.waitForTimeout(200);
  assert.equal(
    await lostWhileLoading.locator('.home-nereid-canvas').count(),
    0
  );
  assert.deepEqual(loadingErrors, []);
  await lostWhileLoading.close();
  console.log(
    'Nereid homepage: background preload, no poster flash, scroll/reverse/seek, idle, disposal, mobile, reduced motion and fallback passed.',
    budget
  );
} finally {
  await browser?.close();
  await server.close();
}
