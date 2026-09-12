import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const output = 'output/home-watcher';
const outDir = await mkdtemp(join(tmpdir(), 'portfolio-watcher-'));
const report = [];
let server, browser;

// Test-only instrumentation. Draw counts belong to the actor WebGL context;
// RAF callback duration covers the whole callback, and is not GPU time.
function instrument() {
  const stats = (window.watcherChecks = {
    frames: 0,
    draws: 0,
    inkDraws: 0,
    samples: [],
    phase: 'startup',
    backend: '',
  });
  for (const name of [
    'clear',
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
  ]) {
    const original = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) {
      if (
        name.startsWith('draw') &&
        this.canvas.closest('.home-masthead') &&
        !this.canvas.dataset.engine
      )
        stats.inkDraws++;
      if (this.canvas.dataset.watcher) {
        if (name === 'clear') stats.frames++;
        else stats.draws++;
        if (!stats.backend) {
          const ext = this.getExtension('WEBGL_debug_renderer_info');
          stats.backend = ext
            ? this.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : this.getParameter(this.RENDERER);
        }
      }
      return original.apply(this, args);
    };
  }
  let previous = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      const before = stats.frames,
        draws = stats.draws;
      const start = performance.now();
      callback(time);
      if (stats.frames > before) {
        if (stats.samples.length < 12000)
          stats.samples.push({
            phase: stats.phase,
            callbackMs: performance.now() - start,
            intervalMs: previous ? time - previous : 0,
            draws: stats.draws - draws,
          });
        previous = time;
      }
    });
}

function summarise(samples) {
  const result = {};
  for (const phase of new Set(samples.map((s) => s.phase))) {
    const rows = samples.filter((s) => s.phase === phase);
    const percentile = (key, p) => {
      const values = rows
        .map((s) => s[key])
        .filter((x) => x > 0)
        .sort((a, b) => a - b);
      return Number(
        (
          values[Math.min(values.length - 1, Math.floor(values.length * p))] ??
          0
        ).toFixed(2)
      );
    };
    result[phase] = {
      samples: rows.length,
      callbackMedianMs: percentile('callbackMs', 0.5),
      callbackP95Ms: percentile('callbackMs', 0.95),
      drawingIntervalMedianMs: percentile('intervalMs', 0.5),
      drawingIntervalP95Ms: percentile('intervalMs', 0.95),
      drawsPerFrame: percentile('draws', 0.5),
    };
  }
  return result;
}

try {
  await mkdir(output, { recursive: true });
  await build({ build: { outDir, emptyOutDir: true }, logLevel: 'warn' });
  server = await preview({
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'warn',
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args:
      process.env.WATCHER_GPU === 'software'
        ? [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : process.platform === 'darwin'
          ? ['--use-gl=angle', '--use-angle=metal']
          : [],
  });
  for (const config of [
    { width: 1440, height: 900, dpr: 1, cpu: 1, cores: 8 },
    { width: 390, height: 844, dpr: 3, cpu: 4, cores: 4 },
  ]) {
    const page = await browser.newPage({
      viewport: config,
      deviceScaleFactor: config.dpr,
      isMobile: config.width < 500,
      hasTouch: config.width < 500,
    });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      (cores) =>
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => cores,
        }),
      config.cores
    );
    await page.addInitScript(instrument);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: config.cpu });
    await page.goto(base);
    const actors = page.locator('.home-masthead canvas[data-watcher]');
    const drone = page.locator('.masthead-drone');
    await actors.waitFor();
    await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
    await drone.waitFor({ state: 'visible' });
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-watcher]');
      const lane = document
        .querySelector('.home-watcher-lane')
        .getBoundingClientRect();
      const intro = document
        .querySelector('.home-intro-copy')
        .getBoundingClientRect();
      return {
        backingPixels: canvas.width * canvas.height,
        bufferHeight: canvas.height,
        cssHeight: parseFloat(canvas.style.height),
        laneBottom: lane.bottom,
        introTop: intro.top,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(geometry.backingPixels <= (config.cores <= 4 ? 900000 : 1500000));
    assert.ok(geometry.cssHeight <= config.height + 200);
    assert.ok(
      geometry.laneBottom <= geometry.introTop,
      'Watcher strip clears the introduction'
    );
    assert.equal(geometry.overflow, false);
    await page.evaluate(() => {
      window.watcherChecks.phase = 'interaction';
    });
    const beforeX = Number(await actors.getAttribute('data-watcher-x'));
    await drone.focus();
    for (let i = 0; i < 25; i++) await drone.press('ArrowLeft');
    await drone.press('Enter');
    await page.waitForFunction(
      (x) =>
        Math.abs(
          Number(
            document.querySelector('canvas[data-watcher]').dataset.watcherX
          ) - x
        ) > 10,
      beforeX
    );
    // Holding the flying drone gives the watcher a truly stationary target.
    await drone.press('Enter');
    // A grab may stop the drone before it reaches the requested position;
    // allow the watcher to complete that actual journey and restore its stance.
    await page.waitForFunction(
      () => {
        const revision = document.querySelector('canvas[data-watcher]').dataset
          .watcherRevision;
        const stats = window.watcherChecks;
        if (stats.lastRevision !== revision) {
          stats.lastRevision = revision;
          stats.restSince = performance.now();
        }
        return performance.now() - stats.restSince > 1500;
      },
      null,
      { timeout: 30000 }
    );
    const revision = await actors.getAttribute('data-watcher-revision');
    await page.evaluate(() => {
      window.watcherChecks.phase = 'settled';
    });
    await page.waitForTimeout(2500);
    assert.equal(
      await actors.getAttribute('data-watcher-revision'),
      revision,
      `Settled watcher does not solve or upload another pose: ${JSON.stringify(await actors.evaluate((node) => ({ ...node.dataset, drone: { ...document.querySelector('.masthead-drone').dataset } })))}`
    );
    await page.screenshot({ path: `${output}/${config.width}-settled.png` });
    await drone.press('Enter');
    await page.locator('.masthead-drone[data-roaming="true"]').waitFor();
    await page.evaluate(() => {
      window.watcherChecks.phase = 'roaming';
    });
    const driftingFrom = await drone.getAttribute('style');
    await page.waitForTimeout(3000);
    assert.notEqual(
      await drone.getAttribute('style'),
      driftingFrom,
      'Unheld drone keeps flying'
    );

    const openGuide = async () => {
      const details = page.locator('.masthead-play details');
      if (!(await details.evaluate((node) => node.open)))
        await details.locator('summary').click();
    };
    await openGuide();
    await page
      .getByRole('button', { name: 'Pause motion', exact: true })
      .click();
    await page.waitForTimeout(200);
    const paused = await page.evaluate(() => window.watcherChecks.frames);
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => window.watcherChecks.frames),
      paused,
      'Paused masthead submits no drawing'
    );
    await page
      .getByRole('button', { name: 'Resume motion', exact: true })
      .click();
    await page.waitForFunction(
      (count) => window.watcherChecks.frames > count,
      paused
    );
    await page.locator('.masthead-play summary').click();

    await page.evaluate(() => window.scrollTo(0, innerHeight * 1.7));
    await page.waitForTimeout(600);
    const offscreen = await page.evaluate(() => window.watcherChecks.frames);
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => window.watcherChecks.frames),
      offscreen,
      'Offscreen masthead submits no drawing'
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      (count) => window.watcherChecks.frames > count,
      offscreen
    );
    await page.locator('.artwork-landing').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const collection = await page.evaluate(() => ({
      ink: window.watcherChecks.inkDraws,
      actors: window.watcherChecks.frames,
    }));
    await page.waitForTimeout(600);
    assert.deepEqual(
      await page.evaluate(() => ({
        ink: window.watcherChecks.inkDraws,
        actors: window.watcherChecks.frames,
      })),
      collection,
      'Visible landing control does not redraw offscreen ink or empty actor frames'
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      (count) => window.watcherChecks.frames > count,
      collection.actors
    );
    // The visibility event exercises the host's hidden-page path without relying
    // on a headless window manager's interpretation of tab focus.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await page.evaluate(() => window.watcherChecks.frames);
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => window.watcherChecks.frames),
      hidden
    );
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(
      (count) => window.watcherChecks.frames > count,
      hidden
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.home-watcher-still').waitFor();
    await page.waitForTimeout(200);
    const reduced = await page.evaluate(() => window.watcherChecks.frames);
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => window.watcherChecks.frames),
      reduced
    );
    await page.screenshot({ path: `${output}/${config.width}-reduced.png` });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(
      (count) => window.watcherChecks.frames > count,
      reduced
    );
    const stats = await page.evaluate(() => window.watcherChecks);
    assert.deepEqual(errors, []);
    report.push({
      ...config,
      ...geometry,
      backend: stats.backend,
      timing: summarise(stats.samples),
      lifecycle:
        'pause, offscreen, hidden event, reduced motion and resume passed',
    });
    await page.close();
  }
  // Initial reduced motion and capability fallback must keep the composition.
  for (const fallback of ['reduced', 'no-webgl']) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 740 },
      reducedMotion: fallback === 'reduced' ? 'reduce' : 'no-preference',
    });
    if (fallback === 'no-webgl')
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          return kind === 'webgl' || kind === 'webgl2'
            ? null
            : getContext.call(this, kind, ...args);
        };
      });
    await page.goto(base);
    await page.locator('.home-watcher-still').waitFor();
    await page.screenshot({ path: `${output}/320-${fallback}.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false
    );
    await page.close();
  }
  for (const actor of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.addInitScript(instrument);
    await page.goto(base);
    await page.locator('canvas[data-watcher]').waitFor();
    await page
      .locator('.home-masthead canvas')
      .evaluateAll((canvases, actor) => {
        const canvas = canvases.find((node) =>
          actor ? node.dataset.watcher : !node.dataset.engine
        );
        canvas
          .getContext('webgl2')
          .getExtension('WEBGL_lose_context')
          .loseContext();
      }, actor);
    await page
      .locator('.home-masthead h1 > span')
      .waitFor({ state: 'visible' });
    await page.locator('.home-watcher-still').waitFor();
    await page.waitForTimeout(100);
    const stopped = await page.evaluate(() => [
      window.watcherChecks.frames,
      window.watcherChecks.inkDraws,
    ]);
    await page.waitForTimeout(500);
    assert.deepEqual(
      await page.evaluate(() => [
        window.watcherChecks.frames,
        window.watcherChecks.inkDraws,
      ]),
      stopped
    );
    assert.equal(
      await page.locator('.home-masthead input').getAttribute('tabindex'),
      '-1'
    );
    await page.getByRole('link', { name: /^about$/i }).click();
    await page.waitForURL('**/about');
    await page.getByRole('link', { name: /^index$/i }).click();
    await page.locator('canvas[data-watcher]').waitFor();
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) =>
    server ? server.httpServer.close(resolve) : resolve()
  );
  await rm(outDir, { recursive: true, force: true });
}
