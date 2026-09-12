import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
const output = process.env.PRESSURE_OUTPUT ?? '/tmp/pressure-type-check';
const errors = [];
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  await server.watcher.close();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const path = `/experiments/${getStudy('pressure-type').slug}`;
  browser = await chromium.launch({
    args:
      process.env.PRESSURE_GPU === 'software'
        ? [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : process.platform === 'darwin'
          ? ['--use-gl=angle', '--use-angle=metal']
          : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(base + path);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor({ state: 'visible' });
  await page.screenshot({ path: `${output}/flat.png` });
  const count = () => canvas.getAttribute('data-frames');
  await page.waitForTimeout(250);
  const idle = await count();
  await page.waitForTimeout(300);
  assert.equal(await count(), idle, 'Uninflated work must sleep');
  const pump = page.getByRole('button', { name: /Pump air/ });
  await pump.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document.querySelector('#pressure-air').textContent.includes('13')
  );
  const frameTimes = page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let previous;
        function frame(now) {
          if (previous !== undefined) times.push(now - previous);
          previous = now;
          if (times.length < 100) requestAnimationFrame(frame);
          else resolve(times);
        }
        requestAnimationFrame(frame);
      })
  );
  for (let i = 0; i < 7; i++) {
    await pump.click();
    await page.waitForTimeout(90);
  }
  await page.waitForFunction(
    () =>
      Number.parseFloat(
        document.querySelector('.pressure-stage-foot span:last-child')
          .textContent
      ) > 8
  );
  assert.equal(
    await pump.isDisabled(),
    false,
    'Full letters must permit deliberate overfill'
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/inflated.png` });
  await page.getByRole('button', { name: 'Knock a letter' }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.pressure-notes [aria-live]')
      .textContent.startsWith('1 knocks')
  );
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.55);
  await page.waitForFunction(() =>
    document
      .querySelector('.pressure-notes [aria-live]')
      .textContent.startsWith('2 knocks')
  );

  // Held movement must advance the clock, and capture cancellation must release the skin.
  const grabX = box.x + box.width * 0.25,
    grabY = box.y + box.height * 0.55;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  assert.equal(await canvas.getAttribute('data-handling'), 'press');
  const grabTick = Number(await canvas.getAttribute('data-tick'));
  for (let i = 1; i <= 45; i++) {
    await page.mouse.move(grabX + i * 1.7, grabY - i * 0.6);
    await page.waitForTimeout(16);
  }
  assert.ok(
    Number(await canvas.getAttribute('data-tick')) - grabTick > 30,
    'Continuous dragging must advance physics, not restart its clock'
  );
  await page.screenshot({ path: `${output}/grab.png` });
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  assert.equal(await canvas.getAttribute('data-handling'), null);
  await page.mouse.up();
  await page.waitForTimeout(1400);
  assert.match(
    await page.locator('.pressure-notes [aria-live]').textContent(),
    /^2 knocks/,
    'Releasing a drag must not add a click impulse'
  );
  for (const name of ['Porcelain', 'Mercury', 'Ink']) {
    const material = page.getByRole('button', { name, exact: true });
    await material.click();
    assert.equal(await material.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${output}/${name.toLowerCase()}.png` });
  }
  await page
    .getByRole('button', { name: 'Studio controls', exact: true })
    .click();
  const studio = page.locator('.pressure-studio');
  await studio.getByText('Pressure studio', { exact: true }).waitFor();
  const roughness = studio.getByRole('textbox', {
    name: 'Roughness',
    exact: true,
  });
  await roughness.fill('0.22');
  await roughness.press('Enter');
  await page.waitForFunction(() =>
    document
      .querySelector('.pressure-stage-label')
      .textContent.includes('Custom')
  );
  await page.getByRole('button', { name: 'Knock a letter' }).click();
  await page.waitForTimeout(600);
  const renderMetrics = await canvas.evaluate((el) => ({
    drawMs: Number(el.dataset.drawMs),
    gpuMs: Number(el.dataset.gpuMs),
  }));
  assert.ok(renderMetrics.drawMs > 0);
  await page.screenshot({ path: `${output}/studio.png` });
  await studio
    .getByRole('button', { name: 'Save settings on this device' })
    .click();
  const settingsDownloadPromise = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Export settings · JSON' }).click();
  const settingsDownload = await settingsDownloadPromise;
  assert.equal(
    settingsDownload.suggestedFilename(),
    'pressure-type-studio.json'
  );
  await settingsDownload.saveAs(`${output}/settings.json`);
  assert.equal(
    JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(`${output}/settings.json`, 'utf8')
    ).settings.roughness,
    0.22
  );
  await page
    .getByRole('button', { name: 'Close studio controls', exact: true })
    .click();
  assert.equal(await studio.count(), 0);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await page.getByRole('button', { name: 'Sound on', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  await page.getByRole('button', { name: 'Sound off', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Helium', exact: true }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${output}/helium.png` });
  await page.getByRole('button', { name: 'Helium', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(100);
  const held = await count();
  await page.waitForTimeout(300);
  assert.equal(await count(), held, 'Pause must cancel continuous rendering');

  const pausedTick = await canvas.getAttribute('data-tick');
  await page.mouse.move(box.x + 60, box.y + 80);
  await page.mouse.down();
  assert.equal(await canvas.getAttribute('data-handling'), 'orbit');
  await page.mouse.move(box.x + 100, box.y + 95, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.equal(
    await canvas.getAttribute('data-tick'),
    pausedTick,
    'Inspection must preserve paused physics'
  );
  assert.ok(
    Number(await count()) > Number(held),
    'Paused background drag must render a new view'
  );
  await page.getByRole('button', { name: 'Show membrane' }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Show membrane' })
      .getAttribute('aria-pressed'),
    'true'
  );
  await page.getByRole('button', { name: 'Show membrane' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save still/ }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'pressure-type.png');
  await download.saveAs(`${output}/export.png`);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Release air', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('#pressure-air').textContent === '0%',
    undefined,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () =>
      Number.parseFloat(
        document.querySelector('.pressure-stage-foot span:last-child')
          .textContent
      ) < 1.2
  );
  await page.waitForTimeout(2500);
  const settled = await count();
  await page.waitForTimeout(300);
  assert.equal(await count(), settled, 'Deflated work must return to sleep');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.match(await page.locator('.pressure-strokes').innerText(), /00/);
  for (let i = 0; i < 11; i++) await pump.click();
  await page.waitForFunction(() =>
    document
      .querySelector('.pressure-notes [aria-live]')
      .textContent.includes('3 burst letters')
  );
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${output}/burst.png` });
  const burstFrames = await count();
  await page.waitForTimeout(350);
  assert.equal(
    await count(),
    burstFrames,
    'Burst remnants must stop rendering'
  );
  assert.equal(await pump.isDisabled(), true);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await pump.isDisabled(), false);
  assert.equal(
    await page
      .getByRole('button', { name: 'Helium', exact: true })
      .getAttribute('aria-pressed'),
    'false'
  );

  await page.reload();
  await canvas.waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('.pressure-stage-label')
      .textContent.includes('Custom')
  );
  await page
    .getByRole('button', { name: 'Studio controls', exact: true })
    .click();
  await studio.getByText('Pressure studio', { exact: true }).waitFor();
  assert.equal(
    await roughness.inputValue(),
    '0.22',
    'Saved values must survive route lifecycle'
  );
  await studio.getByRole('button', { name: 'Restore studio defaults' }).click();
  await page.waitForFunction(() =>
    document.querySelector('.pressure-stage-label').textContent.includes('Ink')
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('pressure-type:studio:v1')),
    null
  );
  await page
    .getByRole('button', { name: 'Close studio controls', exact: true })
    .click();
  // Re-enter the convention-based route after releasing the previous renderer.
  await page.locator('a[href="/experiments"]').first().click();
  await page.goto(base + path);
  await canvas.waitFor();
  await page.goto(base + '/experiments');
  await page.goto(base + path);
  await canvas.waitFor();
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    isMobile: true,
    hasTouch: true,
  });
  reduced.on('pageerror', (error) => errors.push(error.message));
  await reduced.goto(base + path);
  await reduced.locator('canvas[data-ready="true"]').waitFor();
  await reduced.getByRole('button', { name: /Pump air/ }).tap();
  await reduced.waitForFunction(
    () =>
      Number.parseFloat(
        document.querySelector('.pressure-stage-foot span:last-child')
          .textContent
      ) > 1.7
  );
  const reducedFrames = await reduced
    .locator('canvas')
    .getAttribute('data-frames');
  await reduced.waitForTimeout(350);
  assert.equal(
    await reduced.locator('canvas').getAttribute('data-frames'),
    reducedFrames,
    'Reduced motion must show a discrete result'
  );
  assert.ok(
    await reduced.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'Mobile must not overflow horizontally'
  );
  await reduced.getByRole('button', { name: 'Knock a letter' }).tap();
  await reduced.waitForFunction(() =>
    document
      .querySelector('.pressure-notes [aria-live]')
      .textContent.startsWith('1 knocks')
  );
  await reduced.getByRole('button', { name: 'Helium', exact: true }).tap();
  await reduced.waitForTimeout(2200);
  await reduced.evaluate(() => scrollTo(0, 0));
  await reduced.waitForTimeout(100);
  await reduced.screenshot({ path: `${output}/mobile.png`, fullPage: true });

  await reduced
    .getByRole('button', { name: 'Studio controls', exact: true })
    .tap();
  await reduced
    .getByRole('textbox', { name: 'Roughness', exact: true })
    .waitFor();
  await reduced
    .getByRole('textbox', { name: 'Roughness', exact: true })
    .focus();
  await reduced.keyboard.press('Escape');
  assert.equal(await reduced.locator('.pressure-studio').count(), 0);
  assert.equal(
    await reduced
      .getByRole('button', { name: 'Studio controls', exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await reduced.getByRole('button', { name: 'Release air', exact: true }).tap();
  await reduced.waitForFunction(
    () =>
      Number.parseFloat(
        document.querySelector('.pressure-stage-foot span:last-child')
          .textContent
      ) < 1.2
  );
  await reduced.getByRole('button', { name: 'Reset', exact: true }).tap();
  for (let i = 0; i < 11; i++)
    await reduced.getByRole('button', { name: /Pump air/ }).tap();
  await reduced.waitForFunction(() =>
    document
      .querySelector('.pressure-notes [aria-live]')
      .textContent.includes('3 burst letters')
  );
  const reducedBurstFrames = await reduced
    .locator('canvas')
    .getAttribute('data-frames');
  await reduced.waitForTimeout(350);
  assert.equal(
    await reduced.locator('canvas').getAttribute('data-frames'),
    reducedBurstFrames,
    'Reduced-motion burst must show a still outcome'
  );
  await reduced.close();
  const metrics = await page.evaluate(async () => {
    const { createWord } = await import(
      '/src/vanilla-three/experiences/pressure-type/glyphs.ts'
    );
    const world = createWord();
    for (let i = 0; i < 8; i++) world.pump();
    world.helium = true;
    let contacts = 0;
    const start = performance.now();
    for (let i = 0; i < 1200; i++) {
      world.step();
      contacts += world.contacts;
    }
    const ms = (performance.now() - start) / 1200;
    const gl = document.querySelector('canvas').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      cpuMsPerStep: ms,
      vertices: world.bodies.reduce((n, b) => n + b.positions.length / 3, 0),
      settled: world.settled,
      contacts,
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : 'unknown',
    };
  });
  assert.ok(metrics.settled, 'Actual inflated font meshes must settle');
  assert.ok(
    metrics.contacts > 0,
    'Actual font meshes must exercise letter contacts'
  );
  const times = (await frameTimes).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        ...metrics,
        ...renderMetrics,
        rafMedianMs: times[50],
        rafP95Ms: times[95],
        screenshots: output,
      },
      null,
      2
    )
  );
  assert.deepEqual(errors, []);
  console.log(
    'Pressure Type: pump, sustained drag, capture cancellation, paused orbit, material presets, tuning, persistence, settings export, opt-in audio, impacts, helium, overfill, burst, reset, contact, pause, inspection, export, vent, sleep, route re-entry and reduced-motion touch checks passed.'
  );
} finally {
  await browser?.close();
  await server.close();
}
