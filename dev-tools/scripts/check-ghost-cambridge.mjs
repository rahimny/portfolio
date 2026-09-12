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
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('ghost-cambridge');
  const survey = JSON.parse(
    await readFile('public/ghost-cambridge/survey.json', 'utf8')
  );
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await page.addInitScript(() => {
    const surveyContexts = new WeakSet();
    window.surveyDraws = 0;
    window.surveyReleases = { textures: 0, framebuffers: 0, renderbuffers: 0 };
    for (const method of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (this.canvas.closest?.('.ghost-stage')) {
          surveyContexts.add(this);
          window.surveyDraws++;
        }
        return original.apply(this, args);
      };
    }
    for (const [method, counter] of [
      ['deleteTexture', 'textures'],
      ['deleteFramebuffer', 'framebuffers'],
      ['deleteRenderbuffer', 'renderbuffers'],
    ]) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (surveyContexts.has(this) && args[0])
          window.surveyReleases[counter]++;
        return original.apply(this, args);
      };
    }
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mkdir('/tmp/ghost-cambridge-qa', { recursive: true });
  await page.goto(`${base}/experiments/${study.slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  const canvas = page.locator('.ghost-stage canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 90000 });
  console.log('Cambridge canvas ready');
  const state = async (name, value) =>
    page.waitForFunction(
      ({ name, value }) =>
        document.querySelector('.ghost-stage canvas')?.dataset[name] === value,
      { name, value },
      { timeout: 45000 }
    );
  const shot = async (name) =>
    page.screenshot({
      path: `/tmp/ghost-cambridge-qa/${name}.png`,
      fullPage: true,
    });
  assert.equal(Number(await canvas.getAttribute('data-points')), survey.count);
  assert.equal(await canvas.getAttribute('data-time'), '0.000');
  await shot('atlas');
  if (process.env.GHOST_POSTER === '1')
    await canvas.screenshot({
      path: `public${study.poster}`,
      type: 'jpeg',
      quality: 93,
      style: '[data-poster-hide] { visibility: hidden !important; }',
    });
  await page.getByRole('button', { name: 'All points', exact: true }).click();
  await state('fullTiles', String(survey.tiles.length));
  await state('points', String(survey.cropCount));
  await shot('all-points');
  await page
    .getByRole('button', { name: 'King’s College Chapel', exact: false })
    .filter({ has: page.locator('.font-meta') })
    .click();
  await state('selected', 'kings');
  await state('points', String(survey.cropCount));
  await shot('all-points-kings');
  await page.getByRole('button', { name: 'Map ↓', exact: true }).click();
  await state('view', 'map');
  await state('points', String(survey.cropCount));
  await shot('all-points-map');
  await page.getByRole('button', { name: 'Cloud ↗', exact: true }).click();
  await state('view', 'cloud');
  await page.getByRole('button', { name: 'Adaptive', exact: true }).click();
  await state('fullTiles', '0');
  await state('points', String(survey.count));
  console.log('All 6,561,030 points loaded; adaptive comparison restored');
  const initial = await canvas.screenshot();
  await page.getByLabel('Scan position').fill('0.3');
  await state('scan', '0.300');
  assert.notDeepEqual(await canvas.screenshot(), initial);
  await page
    .getByRole('button', { name: 'King’s College Chapel', exact: false })
    .filter({ has: page.locator('.font-meta') })
    .click();
  await state('selected', 'kings');
  await state('fullTiles', '4');
  assert.ok(Number(await canvas.getAttribute('data-points')) > survey.count);
  assert.ok(
    await page
      .getByText('Full-density detail · 4 patches', { exact: true })
      .isVisible()
  );
  await shot('kings-detail');
  await page.getByText('More ways to inspect', { exact: false }).click();
  await page.getByLabel('Depth shading', { exact: true }).selectOption('0');
  await state('depthShading', '0');
  const finePoints = await canvas.screenshot();
  for (const size of ['1', '1.5', '2']) {
    await page.getByLabel('Point size', { exact: false }).fill(size);
    await state('pointSize', size);
    await canvas.screenshot({
      path: `/tmp/ghost-cambridge-qa/points-${size}.png`,
    });
  }
  await page.getByLabel('Depth shading', { exact: true }).selectOption('1');
  await state('depthShading', '1');
  const shadedPoints = await canvas.screenshot();
  assert.notDeepEqual(
    shadedPoints,
    finePoints,
    'Depth shading must change the drawing'
  );
  await canvas.screenshot({ path: '/tmp/ghost-cambridge-qa/points-depth.png' });
  await page.getByText('More ways to inspect', { exact: false }).click();
  await page.getByLabel('Show', { exact: true }).selectOption('3');
  await state('layer', '3');
  await shot('kings-buildings');
  await page.getByLabel('Show', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Height', exact: true }).click();
  await state('palette', '1');
  await shot('height');
  await page.getByRole('button', { name: 'Map ↓', exact: true }).click();
  await state('view', 'map');
  await state('fullTiles', '0');
  await shot('map');
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.getByRole('button', { name: 'Section ⊥', exact: true }).click();
  await state('view', 'section');
  const section = await canvas.screenshot();
  await page.getByLabel('Move section').fill('0.6');
  await state('slice', '0.600');
  assert.notDeepEqual(await canvas.screenshot(), section);
  await shot('section');
  await page.getByRole('button', { name: 'Cloud ↗', exact: true }).click();
  await state('view', 'cloud');
  await page.getByLabel('Show', { exact: true }).selectOption('2');
  await state('layer', '2');
  await shot('bare-earth');
  await page.getByLabel('Show', { exact: true }).selectOption('0');
  await page.getByLabel('Scan source').selectOption('1');
  await state('replay', '1');
  await page.getByLabel('Acquisition replay').fill('0.7');
  await state('scan', '0.700');
  await shot('acquisition');
  await page.getByLabel('Scan source').selectOption('0');
  await page.getByText('More ways to inspect', { exact: false }).click();
  await page.getByLabel('Hide below').fill('10');
  await state('floor', '10');
  await page.getByLabel('Hide below').fill('0');
  await page.getByLabel('Pulse returns').selectOption('1');
  await state('returnFilter', '1');
  await page.getByLabel('Pulse returns').selectOption('0');
  await page.getByText('More ways to inspect', { exact: false }).click();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await state('scan', '0.720');
  await page.keyboard.press('Enter');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: false }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'ghost-cambridge.png');
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 2400);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Resume scan', exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector('.ghost-stage canvas').dataset.time) > 0.15
  );
  await page.getByRole('button', { name: 'Pause scan', exact: true }).click();
  const time = await canvas.getAttribute('data-time');
  await page.waitForTimeout(250);
  assert.equal(await canvas.getAttribute('data-time'), time);
  const draws = () => page.evaluate(() => window.surveyDraws);
  const assertSleeping = async (label) => {
    await page.waitForTimeout(150);
    const before = await draws();
    await page.waitForTimeout(250);
    assert.equal(
      await draws(),
      before,
      `${label} must stop actual WebGL drawing`
    );
  };
  await assertSleeping('Paused survey');
  await page.getByRole('button', { name: 'Resume scan', exact: true }).click();
  const runningDraws = await draws();
  await page.waitForTimeout(250);
  assert.ok((await draws()) > runningDraws, 'Running survey must draw');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await assertSleeping('Changed reduced-motion preference');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.querySelector('.ghost-stage').style.transform =
      'translateY(300vh)';
  });
  await assertSleeping('Offscreen survey');
  await page.evaluate(() => {
    document.querySelector('.ghost-stage').style.transform = '';
  });
  // Headless tabs stay visible: exercise the visibility event without suspending RAF itself.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await assertSleeping('Simulated hidden survey');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Pause scan', exact: true }).click();
  await page.getByRole('button', { name: 'Ghost', exact: true }).click();
  await state('palette', '2');
  await shot('ghost');
  await page.getByRole('button', { name: 'Reflectance', exact: true }).click();
  await state('palette', '3');
  await shot('reflectance');
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Cloud ↗', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await shot('mobile');
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  const contrast = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.ghost-page'));
    const luminance = (hex) => {
      const rgb = hex
        .trim()
        .slice(1)
        .match(/.{2}/g)
        .map((c) => parseInt(c, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const ground = luminance(style.getPropertyValue('--ghost-ground'));
    return ['--ghost-text', '--ghost-muted', '--ghost-accent'].map(
      (token) =>
        (luminance(style.getPropertyValue(token)) + 0.05) / (ground + 0.05)
    );
  });
  assert.ok(contrast.every((ratio) => ratio >= 4.5));
  for (let i = 0; i < 2; i++) {
    const releases = await page.evaluate(() => ({ ...window.surveyReleases }));
    await page.getByRole('link', { name: 'Experiments', exact: true }).click();
    await page.waitForFunction(
      (before) => window.surveyReleases.framebuffers > before,
      releases.framebuffers,
      { timeout: 5000 }
    );
    const released = await page.evaluate(() => window.surveyReleases);
    assert.ok(
      released.framebuffers > releases.framebuffers,
      'Release depth-shading framebuffers on unmount'
    );
    assert.ok(
      released.textures > releases.textures,
      'Release depth-shading textures on unmount'
    );
    await page.locator(`a[href="/experiments/${study.slug}"]`).first().click();
    await canvas.waitFor({ timeout: 60000 });
    assert.equal(await canvas.getAttribute('data-time'), '0.000');
  }
  await page.goto(`${base}/experiments/${study.slug}?density=all`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await canvas.waitFor({ timeout: 90000 });
  await state('allPoints', 'true');
  await state('points', String(survey.cropCount));
  await shot('all-points-mobile');
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  await page.addInitScript(() => {
    const getExtension = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      return name === 'EXT_color_buffer_float'
        ? null
        : getExtension.call(this, name);
    };
  });
  await page.goto(`${base}/experiments/${study.slug}`);
  await canvas.waitFor({ timeout: 60000 });
  await state('depthShading', '0');
  await page.getByText('More ways to inspect', { exact: false }).click();
  assert.ok(
    await page.getByLabel('Depth shading', { exact: true }).isDisabled()
  );
  assert.ok((await draws()) > 0, 'Plain point fallback must still render');
  await shot('plain-fallback');
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    `Ghost Cambridge: overview, all 6.56M points, density switching, full-density King’s detail, buildings, map, section, bare earth, palettes, recorded replay, return filters, keyboard, PNG, pause, reduced motion, mobile, contrast and remount pass.`
  );
} finally {
  await browser?.close();
  await server.close();
}
