import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
let activePage;
const errors = [];
try {
  await server.listen();
  await server.watcher.close();
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('autonomous-hand');
  const url = `http://127.0.0.1:${server.httpServer.address().port}/experiments/${study.slug}`;
  browser = await chromium.launch({
    args:
      process.env.HAND_GPU === 'native'
        ? []
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  await mkdir('output/autonomous-hand', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  activePage = page;
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.locator('canvas[data-ready="true"]').waitFor();
  await page.getByLabel('Mode', { exact: true }).selectOption('manual');
  await page.waitForFunction(() =>
    document.querySelector('.hand-caption').textContent.includes('rest')
  );
  await page
    .getByRole('button', { name: 'Perform gesture', exact: true })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.shots) >= 12,
    {},
    { timeout: 60000 }
  );
  await page
    .locator('.hand-stage')
    .screenshot({ path: 'output/autonomous-hand/barrage.png' });
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.shots) >= 24,
    {},
    { timeout: 60000 }
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.locator('.hand-caption').innerText();
  const pausedTick = Number(
    await page.locator('canvas').getAttribute('data-tick')
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator('.hand-caption').innerText(),
    paused,
    'Pause freezes the simulation clock'
  );
  assert.match(paused, /hit \/ ink/i);
  await page
    .locator('.hand-stage')
    .screenshot({ path: 'output/autonomous-hand/impact.png' });
  await page.getByText('Inspect & record', { exact: true }).click();
  for (const pose of [
    'open',
    'fist',
    'point',
    'gun',
    'pinch',
    'beckon',
    'palm-up',
    'thumbs-up',
  ]) {
    await page.getByLabel('Pose inspection').selectOption(pose);
    await page
      .locator('.hand-stage')
      .screenshot({ path: `output/autonomous-hand/pose-${pose}.png` });
  }
  const downloadRecord = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  const record = await downloadRecord;
  await record.saveAs('output/autonomous-hand/performance.json');
  const tape = JSON.parse(
    await readFile('output/autonomous-hand/performance.json', 'utf8')
  );
  assert.equal(tape.seed, 15926);
  assert.equal(
    tape.ticks,
    pausedTick,
    'Pose inspection and export do not advance the paused simulation'
  );
  assert.equal(tape.version, 5);
  assert.ok(tape.inputs.some((e) => e.input.kind === 'command'));
  const downloadStill = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still', exact: true }).click();
  await (await downloadStill).saveAs('output/autonomous-hand/still.png');
  const png = await readFile('output/autonomous-hand/still.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 10000);
  await page
    .getByRole('button', { name: 'Replay record', exact: true })
    .click();
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector('.hand-caption').textContent.includes('Paused') &&
      document.querySelector('canvas').dataset.replaying === 'false',
    {},
    { timeout: 60000 }
  );
  assert.equal(
    await page.locator('.hand-caption').innerText(),
    paused,
    'Replay ends on the same clock and result'
  );
  await page
    .getByLabel('Load record')
    .setInputFiles('output/autonomous-hand/performance.json');
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector('.hand-caption').textContent.includes('Paused') &&
      document.querySelector('canvas').dataset.replaying === 'false',
    {},
    { timeout: 60000 }
  );
  assert.equal(
    await page.locator('.hand-caption').innerText(),
    paused,
    'A saved record replays identically'
  );
  console.log(
    'PASS 24-round barrage, pause, eight poses, PNG export and JSON replay'
  );
  await mkdir('output/autonomous-hand/expressions', { recursive: true });
  for (const action of ['scold', 'beckon', 'shrug', 'approve']) {
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByLabel('Mode', { exact: true }).selectOption('manual');
    await page.getByLabel('Action', { exact: true }).selectOption(action);
    await page
      .getByRole('button', { name: 'Perform gesture', exact: true })
      .click();
    await page.waitForFunction(
      (action) =>
        document
          .querySelector('.hand-caption')
          .textContent.includes(`act / ${action}`),
      action,
      { timeout: 60000 }
    );
    await page.waitForTimeout(350);
    await page
      .locator('.hand-stage')
      .screenshot({ path: `output/autonomous-hand/expressions/${action}.png` });
    await page.waitForFunction(
      () =>
        document.querySelector('.hand-caption').textContent.includes('rest'),
      {},
      { timeout: 60000 }
    );
    assert.match(
      await page.locator('.hand-caption').innerText(),
      /waiting/i,
      'Expression creates no physical impact'
    );
  }
  console.log('PASS four expressive gestures through manual controls');
  await page.setViewportSize({ width: 960, height: 720 });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const move = page.getByRole('button', { name: 'Move puck', exact: true });
  await move.click();
  await move.press('ArrowLeft');
  await move.press('ArrowUp');
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.corrections) > 0,
    {},
    { timeout: 60000 }
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const marks = Number(
    await page.locator('canvas').getAttribute('data-stamps')
  );
  assert.ok(marks >= 4, 'Visitor placements and hand return produce marks');
  await page
    .locator('.hand-stage')
    .screenshot({ path: 'output/autonomous-hand/encounter.png' });
  const compositionDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save composition · SVG', exact: true })
    .click();
  await (
    await compositionDownload
  ).saveAs('output/autonomous-hand/composition.svg');
  const composition = await readFile(
    'output/autonomous-hand/composition.svg',
    'utf8'
  );
  assert.equal((composition.match(/<path /g) ?? []).length, marks);
  await page
    .getByRole('button', { name: 'Replay record', exact: true })
    .click();
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.replaying === 'false',
    {},
    { timeout: 60000 }
  );
  assert.equal(
    Number(await page.locator('canvas').getAttribute('data-stamps')),
    marks,
    'Encounter replay reproduces all print marks'
  );
  console.log(
    'PASS keyboard interference, autonomous tap, vector print and encounter replay'
  );

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Mode', { exact: true }).selectOption('manual');
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  const width = Math.max(8.3, (4.1 * box.width) / box.height);
  const point = (x, y) => ({
    x: box.x + box.width * (0.5 + x / width),
    y: box.y + box.height / 2 - (y * box.width) / width,
  });
  const origin = point(1.7, -1.15),
    destination = point(-0.5, 0.4);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await page.mouse.up();
  assert.equal(await page.locator('canvas').getAttribute('data-held'), '');
  assert.equal(await page.locator('canvas').getAttribute('data-stamps'), '1');
  await page.mouse.down();
  await page.mouse.move(destination.x + 10, destination.y, { steps: 2 });
  assert.equal(
    await page.locator('canvas').getAttribute('data-held'),
    'visitor'
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).press('Enter');
  await page.mouse.up();
  assert.equal(
    await page.locator('canvas').getAttribute('data-held'),
    '',
    'Pausing releases pointer ownership'
  );
  console.log('PASS direct pointer drag and pause during capture');
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  assert.ok(
    await page
      .locator('.hand-stage')
      .evaluate((e) => e.getBoundingClientRect().bottom < 0),
    'Stage is fully offscreen'
  );
  await page.waitForTimeout(150);
  const hiddenClock = await page.locator('.hand-caption').innerText();
  await page.waitForTimeout(350);
  assert.equal(
    await page.locator('.hand-caption').innerText(),
    hiddenClock,
    'Offscreen work freezes its clock'
  );
  console.log('PASS offscreen scheduling');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.hand-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  assert.match(await page.locator('.hand-caption').innerText(), /0.0 S/);
  assert.equal(
    await page
      .getByRole('button', { name: 'Perform gesture', exact: true })
      .isDisabled(),
    true
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: 'output/autonomous-hand/mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true,
    'No horizontal overflow'
  );
  await page.getByLabel('Pose inspection').focus();
  await page.keyboard.press('o');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Pose inspection').inputValue(), 'open');
  console.log('PASS reduced motion, narrow viewport and keyboard pose control');
  await page.close();
  const fallback = await browser.newPage({ reducedMotion: 'reduce' });
  await fallback.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (
        type === 'webgl' ||
        type === 'webgl2' ||
        type === 'experimental-webgl'
      )
        return null;
      return get.call(this, type, ...args);
    };
  });
  await fallback.goto(url);
  await fallback.getByRole('alert').waitFor();
  assert.equal(
    await fallback
      .getByRole('heading', { name: study.title, exact: true })
      .isVisible(),
    true
  );
  console.log('PASS WebGL failure keeps the semantic page readable');
  await fallback.close();
  assert.deepEqual(errors, [], 'No rendering or runtime errors');
} catch (error) {
  console.error('Autonomous hand check failed:', error, errors);
  if (activePage && !activePage.isClosed()) {
    console.error(await activePage.locator('body').innerText());
    console.error(
      await activePage.evaluate(() => ({
        hidden: document.hidden,
        stage: document
          .querySelector('canvas')
          .getBoundingClientRect()
          .toJSON(),
        tick: document.querySelector('canvas').dataset.tick,
      }))
    );
    await activePage
      .screenshot({
        path: 'output/autonomous-hand/failure.png',
        fullPage: true,
        timeout: 5000,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
