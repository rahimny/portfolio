#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({
  cacheDir: 'node_modules/.vite-filament-check',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
const sameImage = (actual, expected, message = 'Images match') =>
  assert.ok(actual.equals(expected), message);
const differentImage = (actual, expected, message = 'Images differ') =>
  assert.ok(!actual.equals(expected), message);
try {
  await server.listen();
  await server.watcher.close();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args:
      process.platform === 'darwin'
        ? ['--use-gl=angle', '--use-angle=metal']
        : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => requests.push(r.url()));
  const ready = () =>
    page.locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  const clock = () => page.locator('canvas').getAttribute('data-time');
  await page.goto(`${base}/experiments/filament`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await ready();
  await settle();
  await page.getByRole('button', { name: 'Restore reference' }).click();
  await settle();
  const budget = await page.locator('canvas').evaluate((c) => ({
    pixels: c.width * c.height,
    draws: Number(c.dataset.drawCalls),
    triangles: Number(c.dataset.triangles),
  }));
  assert.ok(budget.pixels <= 1500000);
  assert.equal(budget.draws, 1);
  assert.equal(budget.triangles, 2);
  assert.ok(
    !requests.some(
      (r) =>
        r.includes('/features/filament/model') || r.includes('build.worker')
    ),
    'Live page never builds the fibre mesh'
  );
  const frames = await page.locator('canvas').getAttribute('data-frames');
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('canvas').getAttribute('data-frames'),
    frames,
    'Held work stops rendering'
  );
  const initial = await page.locator('canvas').screenshot();
  await page.getByText('Fine controls', { exact: true }).click();
  await page.locator('#filament-depth').fill('0.8');
  await page.getByText('Fine controls', { exact: true }).click();
  await settle();
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.waitForTimeout(250);
  assert.ok(Number(await clock()) > 0);
  assert.equal(
    Number(await page.locator('canvas').getAttribute('data-draw-calls')),
    2
  );
  assert.ok(
    Number(await page.locator('canvas').getAttribute('data-triangles')) < 130000
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const held = await clock();
  await page.waitForTimeout(100);
  assert.equal(await clock(), held);
  for (let i = 0; i < 10; i++)
    await page.getByRole('button', { name: 'Advance 0.5 s' }).click();
  await settle();
  const modes = [];
  for (const mode of ['Still', 'Vortex', 'Liquid', 'Echo']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await settle();
    const image = await page.locator('canvas').screenshot();
    modes.push(image);
    assert.equal(
      await page.locator('canvas').getAttribute('data-network'),
      'true'
    );
    await page.getByRole('button', { name: 'Network on', exact: true }).click();
    await settle();
    differentImage(
      await page.locator('canvas').screenshot(),
      image,
      `${mode} composites network pulses`
    );
    assert.equal(
      Number(await page.locator('canvas').getAttribute('data-draw-calls')),
      1
    );
    await page
      .getByRole('button', { name: 'Network off', exact: true })
      .click();
    await settle();

    if (process.env.FILAMENT_CAPTURE) {
      await mkdir(process.env.FILAMENT_CAPTURE, { recursive: true });
      await page.locator('canvas').screenshot({
        path: `${process.env.FILAMENT_CAPTURE}/${mode.toLowerCase()}.png`,
      });
    }
  }
  differentImage(modes[0], modes[1]);
  differentImage(modes[1], modes[2]);
  differentImage(modes[0], initial);
  await page.getByRole('button', { name: 'Send pulse', exact: true }).click();
  await settle();
  assert.equal(
    Number(await page.locator('canvas').getAttribute('data-emissions')),
    1
  );
  await page.locator('#filament-pulse').fill('1');
  await page.locator('#filament-spectral').fill('0.8');
  await page.locator('#filament-strength').fill('1');
  await settle();
  if (process.env.FILAMENT_CAPTURE)
    await page
      .locator('canvas')
      .screenshot({ path: `${process.env.FILAMENT_CAPTURE}/prism.png` });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still' }).click();
  const download = await downloadPromise;
  const png = await readFile(await download.path());
  assert.equal(png.readUInt32BE(16), 2400);
  assert.equal(png.readUInt32BE(20), 2400);
  assert.ok(
    png.length > 100000,
    'Export contains the detailed image, not an empty cleared buffer'
  );
  await page.getByRole('button', { name: 'Restore reference' }).click();
  await settle();
  sameImage(
    await page.locator('canvas').screenshot(),
    initial,
    'Reset restores the exact cached specimen'
  );
  await page.getByText('Fine controls', { exact: true }).click();
  await page.locator('#filament-depth').fill('1');
  await settle();
  differentImage(
    await page.locator('canvas').screenshot(),
    initial,
    'Depth separates existing fibre layers'
  );
  await page.locator('#filament-depth').fill('0');
  await settle();
  sameImage(
    await page.locator('canvas').screenshot(),
    initial,
    'Zero depth preserves the exact original appearance'
  );
  await page.getByText('Digital distortion', { exact: true }).click();
  for (const effect of ['glitch', 'pixelation', 'stretch']) {
    await page.locator(`#filament-${effect}`).fill('0.7');
    await settle();
    const distorted = await page.locator('canvas').screenshot();
    differentImage(distorted, initial, `${effect} visibly changes the image`);
    if (process.env.FILAMENT_CAPTURE)
      await page
        .locator('canvas')
        .screenshot({ path: `${process.env.FILAMENT_CAPTURE}/${effect}.png` });
    if (effect === 'stretch') {
      await page.getByRole('button', { name: 'Vertical', exact: true }).click();
      await settle();
      differentImage(
        await page.locator('canvas').screenshot(),
        distorted,
        'Stretch direction changes the held pixels'
      );
      await page
        .getByRole('button', { name: 'Horizontal', exact: true })
        .click();
    }
    await page
      .getByRole('button', { name: 'Clear effects', exact: true })
      .click();
    await settle();
    sameImage(
      await page.locator('canvas').screenshot(),
      initial,
      'Clearing distortion restores the same paused composition'
    );
  }
  const burstTime = await clock();
  await page.getByRole('button', { name: 'Glitch now', exact: true }).click();
  await settle();
  const burstImage = await page.locator('canvas').screenshot();
  differentImage(burstImage, initial);
  await page.waitForTimeout(150);
  assert.equal(
    await clock(),
    burstTime,
    'A held glitch does not start animation'
  );
  sameImage(await page.locator('canvas').screenshot(), burstImage);
  await page
    .getByRole('button', { name: 'Clear effects', exact: true })
    .click();
  await page.getByText('Digital distortion', { exact: true }).click();
  await settle();
  await page.locator('#filament-zoom').fill('2.5');
  await page.locator('#filament-tension').fill('1.7');
  await page.locator('#filament-exposure').fill('2');
  await settle();
  differentImage(await page.locator('canvas').screenshot(), initial);
  await page.getByRole('button', { name: 'Restore reference' }).click();
  await settle();
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await page.waitForTimeout(200);
  assert.ok(
    Number(await page.locator('canvas').getAttribute('data-hover')) > 0.5
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.3, {
    steps: 24,
  });
  const heldTime = Number(await clock());
  await page.waitForTimeout(250);
  assert.ok(
    Number(await clock()) > heldTime,
    'Animation continues during a sustained drag'
  );
  assert.ok(
    Number(await page.locator('canvas').getAttribute('data-strain')) > 0.2
  );
  assert.equal(
    await page.locator('canvas').getAttribute('data-dragging'),
    'true'
  );
  differentImage(
    await page.locator('canvas').screenshot(),
    initial,
    'Pulling changes the material'
  );
  const heldEmissions = Number(
    await page.locator('canvas').getAttribute('data-emissions')
  );
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1100);
  assert.ok(
    Number(await page.locator('canvas').getAttribute('data-emissions')) >
      heldEmissions,
    'Release sends a pulse'
  );
  assert.ok(
    Number(await page.locator('canvas').getAttribute('data-strain')) < 0.002
  );
  assert.equal(
    await page.locator('canvas').getAttribute('data-dragging'),
    'false'
  );
  await page.getByRole('button', { name: 'Restore reference' }).click();
  await settle();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle();
  assert.equal(
    await page
      .getByRole('button', { name: 'Animate', exact: true })
      .isDisabled(),
    true
  );
  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await settle();
  assert.equal(Number(await clock()), 0.5);
  const reducedTime = await clock();
  await page.waitForTimeout(100);
  assert.equal(await clock(), reducedTime);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  if (process.env.FILAMENT_CAPTURE)
    await page.screenshot({
      path: `${process.env.FILAMENT_CAPTURE}/mobile.png`,
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle();
  if (process.env.FILAMENT_CAPTURE)
    await page.screenshot({
      path: `${process.env.FILAMENT_CAPTURE}/desktop.png`,
      fullPage: true,
    });
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('link', { name: 'Experiments', exact: true }).click();
    await page.locator('a[href="/experiments/filament"]').first().click();
    await ready();
  }
  assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
  assert.equal(await page.locator('canvas').count(), 1);
  // Cancel an in-flight texture request through SPA navigation.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  await page.route('**/filament/specimen.webp', async (route) => {
    await new Promise((r) => setTimeout(r, 250));
    await route.continue().catch(() => {});
  });
  await page.locator('a[href="/experiments/filament"]').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Experiments', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(new URL(page.url()).pathname, '/experiments');
  assert.equal(await page.locator('.filament-stage canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS Filament: bounded two-pass pulses, no live dense mesh generation, independent network in all four fields, idle/pause, layered depth, digital distortion, prism, pulse injection, 2400 px export, exact reset, controls, reduced motion, mobile, re-entry and cancelled loading.'
  );
} finally {
  await browser?.close();
  await server.close();
}
