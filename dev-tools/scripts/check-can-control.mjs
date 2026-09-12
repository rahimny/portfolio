import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Study-specific interaction and lifecycle gates. No golden-pixel baseline:
// comparisons below use the same paused specimen in the same browser/context.
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('can-control');
  assert(study && study.status === 'wip');
  browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /GL_INVALID_|GL_OUT_OF_MEMORY|THREE.WebGLProgram/.test(message.text())
    ) {
      errors.push(message.text());
      console.error(message.text());
    }
  });
  await page.goto(`${base}/experiments/${study.slug}`);
  const canvas = page.locator('canvas[data-ready="true"]');
  const phase = page.locator('.can-control-caption [role="status"]');
  await canvas.waitFor();
  assert.equal(await phase.textContent(), 'Specimen complete.');
  const snapshot = async () => {
    // Sticky positioning changes the screenshot clip by a fractional CSS pixel.
    // Compare the same canvas at the same page position.
    await page.evaluate(() => window.scrollTo(0, 0));
    return canvas.screenshot({ animations: 'disabled' });
  };
  const still = await snapshot();
  await page.waitForTimeout(200);
  assert(
    still.equals(await snapshot()),
    'Reduced-motion specimen must stay still'
  );
  console.log('PASS reduced-motion static initial specimen');

  await page
    .getByRole('button', { name: 'Give it a path', exact: true })
    .click();
  await page.keyboard.press('Escape');
  assert(
    still.equals(await snapshot()),
    'Cancelling path editing must preserve paint'
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    'Give it a path'
  );
  console.log('PASS editor cancel preserves paint and restores keyboard focus');

  await page.getByRole('slider', { name: 'Distance' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#can-distance').inputValue(), '0.13');
  await page.getByRole('button', { name: 'Thin line', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('.can-control-caption [role=status]')
        .textContent === 'Painting.'
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await snapshot();
  await page.waitForTimeout(200);
  assert(paused.equals(await snapshot()), 'Pause must freeze paint and marker');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Show result', exact: true }).click();
  assert.equal(await phase.textContent(), 'Specimen complete.');
  await page
    .getByRole('button', { name: 'Restore previous', exact: true })
    .click();
  const restoredInitial = await snapshot();
  await writeFile('/tmp/can-control-qa/controls-restore-before.png', still);
  await writeFile(
    '/tmp/can-control-qa/controls-restore-after.png',
    restoredInitial
  );
  assert(
    still.equals(restoredInitial),
    'Previous paint must be exactly recoverable'
  );
  console.log(
    'PASS keyboard choices, explicit playback, pause/resume and restore'
  );

  await page
    .getByRole('button', { name: 'Give it a path', exact: true })
    .click();
  const editor = page.locator('.can-control-editor');
  const box = await page
    .getByLabel('Paintable panel', { exact: true })
    .boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.3, {
    steps: 8,
  });
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
  assert.equal(await editor.locator('polyline').count(), 1);
  assert.equal(await editor.locator('circle').count(), 1);
  await page.getByRole('button', { name: 'Undo stroke' }).click();
  assert.equal(await editor.locator('circle').count(), 0);
  await page.getByRole('button', { name: 'Send path' }).click();
  await page.getByRole('button', { name: 'Show result' }).click();
  assert(!(await snapshot()).equals(still), 'Custom path must change paint');
  console.log(
    'PASS arbitrary path, sharp corner, separate hold, undo and send'
  );

  await page.getByRole('checkbox', { name: 'Instant results' }).check();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page
    .getByRole('button', { name: 'Preview result', exact: true })
    .click();
  assert.equal(await page.locator('#can-flare').inputValue(), '0');
  assert.equal(await page.locator('#can-cap').inputValue(), 'fine');
  assert.equal(
    await page
      .getByRole('button', { name: 'Your path' })
      .getAttribute('aria-pressed'),
    'true'
  );
  const cleanPath = await snapshot();
  await page.getByRole('button', { name: 'Flared', exact: true }).click();
  await page.locator('#can-placement').selectOption('exit');
  await page
    .getByRole('button', { name: 'Preview result', exact: true })
    .click();
  assert(
    !cleanPath.equals(await snapshot()),
    'Can technique must change the retained custom path'
  );
  await page.getByRole('checkbox', { name: 'Instant results' }).uncheck();
  await page.locator('#can-playback').selectOption('8');
  await page.getByRole('button', { name: 'Ribbon knot', exact: true }).click();
  await page
    .getByRole('button', { name: 'HUSH handstyle', exact: true })
    .click();
  assert.equal(
    await page
      .getByRole('button', { name: 'HUSH handstyle', exact: true })
      .getAttribute('aria-pressed'),
    'true'
  );
  assert.notEqual(await phase.textContent(), 'Specimen complete.');
  await page.getByRole('checkbox', { name: 'Instant results' }).check();
  await page.getByRole('button', { name: 'Your path' }).click();
  assert.equal(await phase.textContent(), 'Specimen complete.');
  assert.equal(
    await page
      .getByRole('button', { name: 'Your path' })
      .getAttribute('aria-pressed'),
    'true'
  );
  console.log(
    'PASS immediate interruption, 8× playback, instant selection, technique tuning and saved custom-path replay'
  );

  const custom = await snapshot();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'Portrait must not overflow horizontally'
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(100);
  assert(custom.equals(await snapshot()), 'Resize must preserve the paint');
  console.log('PASS portrait layout and paint-preserving resize');

  const contextExtension = await page.evaluateHandle(() =>
    document
      .querySelector('canvas')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context')
  );
  await contextExtension.evaluate((extension) => extension.loseContext());
  await page.waitForFunction(() =>
    document
      .querySelector('.can-control-caption [role=status]')
      .textContent.includes('interrupted')
  );
  await contextExtension.evaluate((extension) => extension.restoreContext());
  await page.waitForFunction(
    () =>
      document.querySelector('.can-control-caption [role=status]')
        .textContent === 'Specimen complete.'
  );
  const recovered = await snapshot();
  await mkdir('/tmp/can-control-qa', { recursive: true });
  await writeFile('/tmp/can-control-qa/context-before.png', custom);
  await writeFile('/tmp/can-control-qa/context-after.png', recovered);
  assert(
    custom.equals(recovered),
    'Restoring the WebGL context must preserve paint'
  );
  await contextExtension.dispose();
  console.log('PASS WebGL context loss and recovery');

  const yardView = await snapshot();
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  const frontView = await snapshot();
  assert(!frontView.equals(yardView), 'Front view changes the camera');
  await page.getByRole('button', { name: 'Close-up', exact: true }).click();
  assert(
    !frontView.equals(await snapshot()),
    'Close-up exposes a different view'
  );
  await page.getByRole('button', { name: 'Follow drone', exact: true }).click();
  await page.waitForTimeout(150);
  const followView = await snapshot();
  await page.waitForTimeout(150);
  assert(
    followView.equals(await snapshot()),
    'Reduced-motion follow settles to a static view'
  );
  const orbitBox = await canvas.boundingBox();
  await page.mouse.move(
    orbitBox.x + orbitBox.width * 0.4,
    orbitBox.y + orbitBox.height * 0.5
  );
  await page.mouse.down();
  await page.mouse.move(
    orbitBox.x + orbitBox.width * 0.5,
    orbitBox.y + orbitBox.height * 0.52,
    { steps: 8 }
  );
  await page.mouse.up();
  assert.equal(
    await page
      .getByRole('button', { name: 'Follow drone', exact: true })
      .getAttribute('aria-pressed'),
    'false'
  );
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  assert.equal(
    await page
      .getByRole('button', { name: 'Follow drone', exact: true })
      .getAttribute('aria-pressed'),
    'false'
  );
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  assert(
    frontView.equals(await snapshot()),
    'Camera interaction cannot advance paused paint, flight or grass'
  );
  await page
    .getByRole('button', { name: 'Give it a path', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await page.waitForFunction(() => {
    const rect = document
      .querySelector('[aria-label="Paintable panel"]')
      .getBoundingClientRect();
    return rect.width > 200 && rect.height > 100;
  });
  const boundary = await page
    .getByLabel('Paintable panel', { exact: true })
    .boundingBox();
  assert(
    boundary.width > 200 && boundary.height > 100,
    'The editor keeps a usable front panel after resizing'
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(
    frontView.equals(await snapshot()),
    'Editor restores the camera as well as the paint'
  );
  await page.getByRole('button', { name: 'Yard', exact: true }).click();
  assert(
    yardView.equals(await snapshot()),
    'Yard resets to a reproducible view'
  );
  console.log(
    'PASS camera presets, keyboard orbit/pan/zoom, paused state preservation and editor camera restoration'
  );

  const wetInstance = await page.evaluateHandle(async () => {
    const { CanControlExperience } = await import(
      '/src/vanilla-three/experiences/can-control/CanControlExperience.ts'
    );
    const c = document.createElement('canvas');
    c.dataset.wetCheck = 'true';
    c.style.cssText =
      'width:1000px;height:750px;position:fixed;top:0;left:0;z-index:100';
    document.body.append(c);
    const instance = new CanControlExperience(c, () => {});
    await instance.init();
    instance.play('hold', { distance: 0.12, speed: 0.8, cap: 'fine' });
    instance.togglePause();
    let ticks = 0;
    while (!instance.programme.complete && ticks++ < 120 * 120)
      instance.programme.advance(
        1 / 120,
        instance.field.deposit,
        instance.field.step,
        instance.field.isWet
      );
    if (!instance.field.isWet())
      throw new Error('The hold must remain wet after flight ends');
    instance.uploadPaint();
    instance.render();
    return instance;
  });
  const wetCanvas = page.locator('canvas[data-wet-check=true]');
  const wetStill = await wetCanvas.screenshot();
  await writeFile('/tmp/can-control-qa/wet-hold.png', wetStill);
  await page.waitForTimeout(150);
  assert(
    wetStill.equals(await wetCanvas.screenshot()),
    'Pause freezes wet paint after the drone rests'
  );
  const wetExtension = await wetInstance.evaluateHandle((instance) =>
    instance.renderer.getContext().getExtension('WEBGL_lose_context')
  );
  await wetExtension.evaluate((extension) => extension.loseContext());
  await page.waitForFunction((instance) => instance.contextLost, wetInstance);
  await wetExtension.evaluate((extension) => extension.restoreContext());
  await page.waitForFunction((instance) => !instance.contextLost, wetInstance);
  assert(
    wetStill.equals(await wetCanvas.screenshot()),
    'Context recovery preserves wet pigment and sheen'
  );
  await wetExtension.dispose();
  await wetInstance.evaluate((instance) => {
    instance.play('line', { distance: 0.8, speed: 0.8, cap: 'fine' });
    instance.showResult();
    instance.restore();
  });
  assert(
    wetStill.equals(await wetCanvas.screenshot()),
    'Restore includes solvent and mobile pigment'
  );
  const wetProgress = await wetInstance.evaluate(async (instance) => {
    const load = () =>
      instance.field.surface.reduce(
        (sum, value, i) => sum + (i % 4 === 1 ? value : 0),
        0
      );
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    instance.togglePause();
    const phase = instance.phaseLabel();
    await wait(150);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const hidden = load();
    await wait(150);
    const hiddenFrozen = hidden === load();
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    // Resuming needs a zero-delta wake frame followed by a simulation frame.
    // Software rendering can exceed 150 ms; wait for the observable change.
    for (let attempt = 0; attempt < 40 && load() >= hidden; attempt++)
      await wait(50);
    const resumed = load() < hidden;
    instance.canvas.style.top = '-1000px';
    await wait(150);
    const offscreen = load();
    await wait(150);
    const offscreenFrozen = offscreen === load();
    instance.togglePause();
    instance.canvas.style.top = '0';
    const film = instance.field.density.slice();
    const mass = instance.field.mass;
    instance.showResult();
    return {
      phase,
      hiddenFrozen,
      resumed,
      offscreenFrozen,
      dry: !instance.field.isWet(),
      conserved: Math.abs(instance.field.mass - mass) < 1e-8,
      filmUnchanged: film.every(
        (value, i) => value === instance.field.density[i]
      ),
    };
  });
  assert.deepEqual(wetProgress, {
    phase: 'Paint drying. Valve closed.',
    hiddenFrozen: true,
    resumed: true,
    offscreenFrozen: true,
    dry: true,
    conserved: true,
    filmUnchanged: true,
  });
  const dryStill = await wetCanvas.screenshot();
  await writeFile('/tmp/can-control-qa/dry-hold.png', dryStill);
  assert(!wetStill.equals(dryStill), 'Drying visibly changes the loaded mark');
  const layering = await wetInstance.evaluate((instance) => {
    const mass = instance.field.mass;
    instance.play(
      'hold',
      { distance: 0.12, speed: 0.8, cap: 'fine' },
      undefined,
      true
    );
    instance.showResult();
    return instance.field.mass / mass;
  });
  assert(
    Math.abs(layering - 2) < 1e-5,
    'Overpaint retains the first pass and adds the second'
  );
  await wetCanvas.screenshot({ path: '/tmp/can-control-qa/layered-hold.png' });
  assert(
    !dryStill.equals(await wetCanvas.screenshot()),
    'A second pass visibly builds density'
  );
  await wetInstance.evaluate((instance) => {
    instance.dispose();
    instance.canvas.remove();
  });
  await wetInstance.dispose();
  console.log(
    'PASS wet pause/resume, hidden/offscreen drying, wet context recovery, restore, conservation and layered density'
  );

  const lifecycle = await page.evaluate(async () => {
    const { CanControlExperience } = await import(
      '/src/vanilla-three/experiences/can-control/CanControlExperience.ts'
    );
    const { startExperience } = await import(
      '/src/vanilla-three/experienceLifecycle.ts'
    );
    const result = [];
    const originalRAF = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const pending = new Set();
    window.requestAnimationFrame = (callback) => {
      const id = originalRAF((time) => {
        pending.delete(id);
        callback(time);
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      originalCancel(id);
    };
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const listeners = [];
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options
    ) {
      if (
        this === document ||
        this instanceof HTMLCanvasElement ||
        this instanceof MediaQueryList
      )
        listeners.push({ target: this, type, listener });
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options
    ) {
      const index = listeners.findIndex(
        (item) =>
          item.target === this &&
          item.type === type &&
          item.listener === listener
      );
      if (index >= 0) listeners.splice(index, 1);
      return originalRemove.call(this, type, listener, options);
    };
    const originalResize = window.ResizeObserver;
    const originalIntersection = window.IntersectionObserver;
    let observers = 0;
    window.ResizeObserver = class extends originalResize {
      constructor(callback) {
        super(callback);
        observers++;
      }
      disconnect() {
        super.disconnect();
        observers--;
      }
    };
    window.IntersectionObserver = class extends originalIntersection {
      constructor(callback) {
        super(callback);
        observers++;
      }
      disconnect() {
        super.disconnect();
        observers--;
      }
    };
    try {
      for (let i = 0; i < 3; i++) {
        const c = document.createElement('canvas');
        c.style.cssText =
          'width:320px;height:240px;position:fixed;top:60px;left:0';
        document.body.append(c);
        const instance = new CanControlExperience(c, () => {});
        await instance.init();
        instance.play('loop', { distance: 0.12, speed: 0.8, cap: 'fine' });
        await new Promise((resolve) => originalRAF(resolve));
        const renderer = instance.renderer;
        instance.dispose();
        instance.dispose();
        result.push({
          frames: pending.size,
          listeners: listeners.length,
          observers,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        });
        c.remove();
      }
      const c = document.createElement('canvas');
      const instance = new CanControlExperience(c, () => {});
      const cancelled = startExperience(instance, (error) => {
        throw error;
      });
      cancelled.cancel();
      await cancelled.ready;
      result.push({ cancelledBeforeInit: !instance.renderer });
      return result;
    } finally {
      window.requestAnimationFrame = originalRAF;
      window.cancelAnimationFrame = originalCancel;
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
      window.ResizeObserver = originalResize;
      window.IntersectionObserver = originalIntersection;
    }
  });
  for (const entry of lifecycle.slice(0, 3))
    assert.deepEqual(entry, {
      frames: 0,
      listeners: 0,
      observers: 0,
      geometries: 0,
      textures: 0,
    });
  assert(lifecycle[3].cancelledBeforeInit);
  console.log(
    'PASS repeated disposal releases RAFs, listeners, observers, geometries and textures; cancelled init never starts'
  );

  // Visibility is an explicit simulation boundary; emulate it deterministically
  // because headless browsers do not reliably background tabs like desktop UI.
  const visibility = await page.evaluate(async () => {
    const { CanControlExperience } = await import(
      '/src/vanilla-three/experiences/can-control/CanControlExperience.ts'
    );
    const c = document.createElement('canvas');
    c.style.cssText = 'width:320px;height:240px;position:fixed;top:60px;left:0';
    document.body.append(c);
    const instance = new CanControlExperience(c, () => {});
    await instance.init();
    instance.play('loop', { distance: 0.12, speed: 0.8, cap: 'fine' });
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(150);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const hiddenTime = instance.programme.time;
    await wait(150);
    const frozen = instance.programme.time === hiddenTime;
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    await wait(100);
    const advance = instance.programme.time - hiddenTime;
    c.style.top = '-1000px';
    await wait(100);
    const offscreenTime = instance.programme.time;
    await wait(100);
    const offscreenFrozen = instance.programme.time === offscreenTime;
    instance.dispose();
    c.remove();
    return { frozen, resumed: advance > 0 && advance < 0.15, offscreenFrozen };
  });
  assert.deepEqual(visibility, {
    frozen: true,
    resumed: true,
    offscreenFrozen: true,
  });
  console.log('PASS hidden/offscreen freeze and resume without catch-up');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const touchPage = await mobile.newPage();
  touchPage.on('pageerror', (error) => errors.push(error.message));
  await touchPage.goto(`${base}/experiments/${study.slug}`);
  await touchPage.locator('canvas[data-ready=true]').waitFor();
  await touchPage
    .getByRole('button', { name: 'Give it a path', exact: true })
    .click();
  const touchBox = await touchPage
    .getByLabel('Paintable panel', { exact: true })
    .boundingBox();
  const cdp = await mobile.newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: touchBox.x + touchBox.width * 0.3,
        y: touchBox.y + touchBox.height * 0.5,
        id: 1,
      },
    ],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: touchBox.x + touchBox.width * (0.3 + i * 0.04),
          y: touchBox.y + touchBox.height * 0.5,
          id: 1,
        },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  assert.equal(
    await touchPage.locator('.can-control-editor polyline').count(),
    1
  );
  await touchPage.getByRole('button', { name: 'Send path' }).click();
  await touchPage.getByRole('button', { name: 'Show result' }).click();
  assert.equal(
    await touchPage.locator('.can-control-caption [role=status]').textContent(),
    'Specimen complete.'
  );
  await mobile.close();
  console.log('PASS touch path in a portrait mobile viewport');

  const unavailable = await browser.newContext();
  await unavailable.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (
        type === 'webgl2' ||
        type === 'webgl' ||
        type === 'experimental-webgl'
      )
        return null;
      return original.call(this, type, ...args);
    };
  });
  const fallback = await unavailable.newPage();
  await fallback.goto(`${base}/experiments/${study.slug}`);
  await fallback.getByRole('alert').getByText('Study unavailable').waitFor();
  assert(
    await fallback.getByRole('button', { name: 'Replay path' }).isDisabled()
  );
  await unavailable.close();
  console.log('PASS understandable unavailable-WebGL fallback');

  await mkdir('/tmp/can-control-qa', { recursive: true });
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  let previousArtwork = await snapshot();
  for (const [name, file] of [
    ['Ribbon knot', 'ribbon'],
    ['Contour field', 'contours'],
    ['HUSH handstyle', 'hush'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await phase.textContent(), 'Specimen complete.');
    const artwork = await snapshot();
    assert(
      !previousArtwork.equals(artwork),
      `${name} must produce a distinct completed piece`
    );
    await writeFile(`/tmp/can-control-qa/${file}-front.png`, artwork);
    previousArtwork = artwork;
  }
  console.log(
    'PASS HUSH, ribbon and contour presets through the page controls'
  );
  await page.getByRole('button', { name: 'Yard', exact: true }).click();
  await page.screenshot({
    path: '/tmp/can-control-qa/desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '/tmp/can-control-qa/mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `PASS no browser errors (${await browser.version()}, WebGL2 / SwiftShader; visual checks only, not hardware performance)`
  );
} finally {
  await browser?.close();
  await server.close();
}
