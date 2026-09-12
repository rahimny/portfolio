import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const outDir = await mkdtemp(join(tmpdir(), 'portfolio-characters-'));
const output = 'output/home-characters';
let server, browser;
try {
  await mkdir(output, { recursive: true });
  await build({ build: { outDir, emptyOutDir: true }, logLevel: 'error' });
  server = await preview({
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args:
      process.platform === 'darwin'
        ? ['--use-gl=angle', '--use-angle=metal']
        : [],
  });
  for (const width of process.env.CHARACTER_WIDTH
    ? [Number(process.env.CHARACTER_WIDTH)]
    : [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: width === 390 ? 3 : 1,
    });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    const drone = page.locator('.masthead-drone');
    await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
    await drone.waitFor({ state: 'visible' });
    if (!process.env.VISITOR_ONLY) {
      await page.waitForFunction(
        () =>
          document.querySelector('.masthead-drone')?.dataset.mood ===
          'inspecting',
        null,
        { timeout: 120000 }
      );
      await page.screenshot({ path: `${output}/${width}-inspection.png` });
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector('.masthead-drone')?.dataset.encounters
          ) > 0
      );
      await page.waitForFunction(
        () =>
          document.querySelector('.masthead-drone')?.dataset.mood === 'roaming'
      );
    }
    await drone.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('.masthead-drone')?.dataset.held === 'true'
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    assert.equal(await drone.getAttribute('data-mood'), 'roaming');
    console.log(
      `PASS ${width}: ${process.env.VISITOR_ONLY ? 'user interaction' : 'natural inspection, departure and user interruption'}`
    );

    // Locate the visible Nereid pose, then carry the drone there using its public
    // keyboard interaction. Keep the simulation alive while moving between hosts.
    await page.locator('.home-nereid').scrollIntoViewIfNeeded();
    const nereid = page.locator('.home-nereid canvas[data-ready="true"]');
    await nereid.waitFor();
    await page.evaluate(() => {
      const host = document.querySelector('.home-nereid');
      const stage = document.querySelector('.home-nereid-stage');
      window.scrollTo(
        0,
        host.offsetTop + (host.offsetHeight - stage.clientHeight) * 0.45
      );
    });
    await page.waitForTimeout(2000);
    const anchor = await nereid.evaluate((node) => ({
      x: Number(node.dataset.visitorX),
      y: Number(node.dataset.visitorY),
      scroll: scrollY,
    }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await drone.evaluate((node) => node.focus({ preventScroll: true }));
    if ((await drone.getAttribute('data-held')) !== 'true')
      await page.keyboard.press('Enter');
    const current = await drone.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        x: box.left + box.width / 2 + scrollX,
        y: box.top + box.height / 2 + scrollY,
      };
    });
    for (let i = 0; i < Math.round(Math.abs(anchor.x - current.x) / 24); i++)
      await page.keyboard.press(
        anchor.x > current.x ? 'ArrowRight' : 'ArrowLeft'
      );
    for (let i = 0; i < Math.round(Math.abs(anchor.y - current.y) / 24); i++)
      await page.keyboard.press(anchor.y > current.y ? 'ArrowDown' : 'ArrowUp');
    await page.waitForTimeout(3000);
    await page.evaluate((scroll) => window.scrollTo(0, scroll), anchor.scroll);
    await page.screenshot({ path: `${output}/${width}-visitor-arrival.png` });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-nereid canvas')?.dataset.greeting
        ) > 0.2
    );
    await page.screenshot({ path: `${output}/${width}-nereid-visitor.png` });
    await drone.evaluate((node) => node.focus({ preventScroll: true }));
    if ((await drone.getAttribute('data-held')) !== 'true')
      await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('.masthead-drone')?.dataset.held === 'true'
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.home-nereid canvas')?.dataset.settled ===
        'true'
    );
    await page.waitForTimeout(250);
    const settled = await nereid.getAttribute('data-frames');
    await page.waitForTimeout(600);
    assert.equal(
      await nereid.getAttribute('data-frames'),
      settled,
      'Nereid settles with a stationary visitor'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.home-nereid[data-static="true"]').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}: Nereid acknowledgement, settled rendering and reduced motion`
    );
    await page.close();
  }
} finally {
  await browser?.close();
  await server?.httpServer.close();
  await rm(outDir, { recursive: true, force: true });
}
