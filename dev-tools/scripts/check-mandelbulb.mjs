import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  const study = getStudy('mandelbulb');
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const route = `${base}/experiments/${study.slug}`;
  await mkdir('output/mandelbulb', { recursive: true });
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /THREE.WebGLProgram|GL_INVALID_/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const get = (key) => canvas.getAttribute(`data-${key}`);
  assert.ok(
    Number(await get('growth')) < 0.2,
    'Fresh load starts growing from a seed'
  );
  const initialGrowth = Number(await get('growth'));
  await page.waitForFunction(
    (n) => Number(document.querySelector('canvas').dataset.growth) > n + 0.03,
    initialGrowth
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(150);
  const heldTime = await get('time');
  const heldGrowth = await get('growth');
  await page.waitForTimeout(250);
  assert.equal(await get('time'), heldTime);
  assert.equal(await get('growth'), heldGrowth);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByRole('slider', { name: 'Growth progress', exact: true })
    .fill('100');
  await page.locator('.mandelbulb-settings').nth(0).locator('summary').click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.mandelbulb-settings').nth(0).locator('summary').click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'output/mandelbulb/desktop.png',
    fullPage: true,
  });
  let hide = await page.addStyleTag({
    content:
      '.mandelbulb-stage [data-poster-hide] { visibility: hidden !important; }',
  });
  await canvas.screenshot({
    path: 'output/mandelbulb/poster.jpg',
    type: 'jpeg',
    quality: 94,
  });
  if (process.env.UPDATE_POSTER === '1')
    await writeFile(
      `public${study.poster}`,
      await readFile('output/mandelbulb/poster.jpg')
    );
  let previous;
  for (const growth of [0, 25, 50, 75, 100]) {
    await page
      .getByRole('slider', { name: 'Growth progress', exact: true })
      .fill(String(growth));
    await page.waitForFunction(
      (g) =>
        Math.abs(
          Number(document.querySelector('canvas').dataset.growth) - g / 100
        ) < 0.001,
      growth
    );
    const frame = await canvas.screenshot({
      path: `output/mandelbulb/growth-${growth}.png`,
    });
    if (previous)
      assert.notDeepEqual(
        frame,
        previous,
        'Growth changes the actual rendered body'
      );
    previous = frame;
  }
  await page.waitForTimeout(150);
  const frameCount = await get('frames');
  await page.waitForTimeout(250);
  assert.equal(await get('frames'), frameCount, 'Reduced motion sleeps');
  await page.locator('.mandelbulb-settings').nth(0).locator('summary').click();
  const modeFrames = [];
  for (const pattern of ['Breathe', 'Tide', 'Unfurl']) {
    await page.getByRole('button', { name: pattern, exact: true }).click();
    await page.waitForTimeout(100);
    modeFrames.push(
      await canvas.screenshot({
        path: `output/mandelbulb/pattern-${pattern.toLowerCase()}.png`,
      })
    );
  }
  assert.notDeepEqual(modeFrames[0], modeFrames[1]);
  assert.notDeepEqual(modeFrames[1], modeFrames[2]);
  for (const power of [3, 10, 8]) {
    await page
      .getByRole('slider', { name: 'Fractal power', exact: true })
      .fill(String(power));
    await page.waitForFunction(
      (p) => Number(document.querySelector('canvas').dataset.power) === p,
      power
    );
  }
  await page
    .getByRole('slider', { name: 'Branch depth', exact: true })
    .fill('3');
  await page.waitForTimeout(100);
  const shallow = await canvas.screenshot();
  await page
    .getByRole('slider', { name: 'Branch depth', exact: true })
    .fill('9');
  await page.waitForTimeout(100);
  assert.notDeepEqual(await canvas.screenshot(), shallow);
  await page
    .getByRole('slider', { name: 'Motion amount', exact: true })
    .fill('1');
  await page
    .getByRole('slider', { name: 'Shape oscillation', exact: true })
    .fill('2');
  await canvas.screenshot({ path: 'output/mandelbulb/motion-limit.png' });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.mandelbulb-settings').nth(1).locator('summary').click();
  await canvas.scrollIntoViewIfNeeded();
  const sliceBox = await canvas.boundingBox();
  const at = async (x, y) => {
    await page.mouse.move(
      sliceBox.x + sliceBox.width * x,
      sliceBox.y + sliceBox.height * y
    );
    await page.waitForTimeout(100);
  };
  await at(0.5, 0.5);
  const centreX = Number(await canvas.getAttribute('data-slice-x'));
  const centreY = Number(await canvas.getAttribute('data-slice-y'));
  assert.ok(Math.abs(centreX - 50) < 0.1 && Math.abs(centreY - 50) < 0.1);
  await canvas.screenshot({ path: 'output/mandelbulb/slice-xy.png' });
  await at(0.55, 0.5);
  assert.ok(
    Math.abs(Number(await canvas.getAttribute('data-slice-x')) - centreX) > 5
  );
  assert.equal(Number(await canvas.getAttribute('data-slice-y')), centreY);
  const movedX = await canvas.getAttribute('data-slice-x');
  await at(0.55, 0.56);
  assert.equal(await canvas.getAttribute('data-slice-x'), movedX);
  assert.ok(
    Math.abs(Number(await canvas.getAttribute('data-slice-y')) - centreY) > 5
  );
  const retained = [
    await canvas.getAttribute('data-slice-x'),
    await canvas.getAttribute('data-slice-y'),
  ];
  await page.mouse.move(4, 4);
  await page.waitForTimeout(100);
  assert.deepEqual(
    [
      await canvas.getAttribute('data-slice-x'),
      await canvas.getAttribute('data-slice-y'),
    ],
    retained
  );
  await page.getByRole('button', { name: 'Slice X', exact: true }).click();
  await page.getByRole('slider', { name: 'X slice', exact: true }).fill('50');
  await canvas.screenshot({ path: 'output/mandelbulb/slice-x.png' });
  await page.getByRole('button', { name: 'Slice Y', exact: true }).click();
  await page.getByRole('slider', { name: 'Y slice', exact: true }).fill('50');
  await canvas.screenshot({ path: 'output/mandelbulb/slice-y.png' });
  await canvas.focus();
  await page.keyboard.press('c');
  await page.waitForTimeout(100);
  assert.equal(await canvas.getAttribute('data-slice-x'), '0.000');
  assert.equal(await canvas.getAttribute('data-slice-y'), '0.000');
  await page.getByRole('button', { name: 'Slicing off', exact: true }).click();
  await page.locator('.mandelbulb-settings').nth(1).locator('summary').click();
  await page
    .getByRole('slider', { name: 'Cursor response', exact: true })
    .fill('1');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.pointer) > 0.9
  );
  const influenced = await canvas.screenshot({
    path: 'output/mandelbulb/cursor.png',
  });
  await page.mouse.move(4, 4);
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.pointer) === 0
  );
  assert.notDeepEqual(influenced, await canvas.screenshot());
  await canvas.focus();
  await page.keyboard.press('e');
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.pulse) === 1
  );
  await canvas.screenshot({ path: 'output/mandelbulb/ripple.png' });
  await page
    .getByRole('slider', { name: 'Cursor response', exact: true })
    .fill('0');
  await page.mouse.move(4, 4);
  await page.waitForTimeout(80);
  const noForce = await canvas.screenshot();
  const freshBox = await canvas.boundingBox();
  await page.mouse.move(
    freshBox.x + freshBox.width / 2,
    freshBox.y + freshBox.height / 2
  );
  await page.waitForTimeout(100);
  assert.deepEqual(
    await canvas.screenshot(),
    noForce,
    'Zero response disables deformation and interaction colour'
  );
  await page.mouse.move(4, 4);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.mandelbulb-settings').nth(1).locator('summary').click();
  const finishes = [];
  for (const finish of ['Cel', 'Ink', 'Arcade']) {
    await page.getByRole('button', { name: finish, exact: true }).click();
    await page.waitForTimeout(120);
    finishes.push(
      await canvas.screenshot({
        path: `output/mandelbulb/finish-${finish.toLowerCase()}.png`,
      })
    );
  }
  assert.notDeepEqual(finishes[0], finishes[1]);
  assert.notDeepEqual(finishes[1], finishes[2]);
  await page
    .getByRole('button', { name: 'Open the core', exact: true })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.section) === 65
  );
  await canvas.screenshot({ path: 'output/mandelbulb/section.png' });
  await page
    .getByRole('slider', { name: 'Section depth', exact: true })
    .fill('100');
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.section) === 100
  );
  await page.getByRole('button', { name: 'Whole', exact: true }).click();
  await page.getByRole('button', { name: 'Fine detail', exact: true }).click();
  await canvas.screenshot({ path: 'output/mandelbulb/fine.png' });
  await page.getByRole('slider', { name: 'X slice', exact: true }).fill('55');
  await page.getByRole('slider', { name: 'Y slice', exact: true }).fill('45');
  await hide.evaluate((el) => el.remove());
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const saved = JSON.parse(
    decodeURIComponent(atob(new URL(shared).searchParams.get('state')))
  );
  assert.equal(saved.version, 2);
  assert.equal(saved.settings.finish, 'arcade');
  assert.equal(saved.settings.sliceX, 55);
  assert.equal(saved.settings.sliceY, 45);
  await page.goto(shared, { waitUntil: 'domcontentloaded' });
  await canvas.waitFor();
  await page.waitForTimeout(150);
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  const restored = JSON.parse(
    decodeURIComponent(
      atob(
        new URL(
          await page.evaluate(() => navigator.clipboard.readText())
        ).searchParams.get('state')
      )
    )
  );
  assert.deepEqual(restored.settings, saved.settings);
  assert.deepEqual(restored.motion, saved.motion);
  restored.camera.forEach((v, i) =>
    assert.ok(Math.abs(v - saved.camera[i]) < 1e-8)
  );
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save still ↗', exact: true })
    .click();
  await (await download).saveAs('output/mandelbulb/still.png');
  const png = await readFile('output/mandelbulb/still.png');
  assert.equal(png.readUInt32BE(16), 2400);
  assert.ok(png.length > 100_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'output/mandelbulb/mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.locator('.mandelbulb-settings').nth(0).locator('summary').click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page
    .getByRole('slider', { name: 'Growth duration', exact: true })
    .fill('3');
  await page
    .getByRole('slider', { name: 'Motion speed', exact: true })
    .fill('2');
  await page
    .getByRole('slider', { name: 'Cursor response', exact: true })
    .fill('0.5');
  await page.screenshot({
    path: 'output/mandelbulb/mobile-controls.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page
    .getByRole('button', { name: '↻ Replay growth', exact: true })
    .click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.growth) === 1
  );
  await page.waitForTimeout(1500);
  await canvas.screenshot({ path: 'output/mandelbulb/living-phase.png' });
  const profile = await page.evaluate(async () => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let previous = performance.now();
    const intervals = [];
    for (let i = 0; i < 90; i++) {
      const now = await new Promise(requestAnimationFrame);
      intervals.push(now - previous);
      previous = now;
    }
    intervals.shift();
    intervals.sort((a, b) => a - b);
    return {
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      buffer: [c.width, c.height],
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      medianFrameMs: intervals[44],
      p95FrameMs: intervals[84],
      samples: intervals.length,
      method:
        'RAF intervals during mature procedural motion; browser pacing, not isolated GPU timing',
    };
  });
  await writeFile(
    'output/mandelbulb/performance.json',
    JSON.stringify(profile, null, 2)
  );
  console.log(profile);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(200);
  const held = await get('time');
  await page.waitForTimeout(250);
  assert.equal(await get('time'), held);
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  const livingLink = await page.evaluate(() => navigator.clipboard.readText());
  const livingState = JSON.parse(
    decodeURIComponent(atob(new URL(livingLink).searchParams.get('state')))
  );
  assert.ok(livingState.motion.time > 1);
  await page.goto(livingLink, { waitUntil: 'domcontentloaded' });
  await canvas.waitFor();
  assert.ok(
    Math.abs(Number(await get('time')) - livingState.motion.time) < 0.001
  );
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  const livingAgain = JSON.parse(
    decodeURIComponent(
      atob(
        new URL(
          await page.evaluate(() => navigator.clipboard.readText())
        ).searchParams.get('state')
      )
    )
  );
  assert.deepEqual(livingAgain.motion, livingState.motion);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 2; i++) {
    await page.locator('a[href="/experiments"]:visible').first().click();
    await page
      .locator(`a[href="/experiments/${study.slug}"]:visible`)
      .first()
      .click();
    await canvas.waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS Mandelbulb: cursor X/Y slicing, independent axes, retained cuts, keyboard clear, automatic growth, staged geometry, natural patterns, cursor response and disable, ripple, settings limits, finishes, exact animated-state restore, PNG export, mobile, pause and SPA remounts.'
  );
} finally {
  await browser?.close();
  await server.close();
}
