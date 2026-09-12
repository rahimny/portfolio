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
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('nereid');
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mkdir('output/nereid', { recursive: true });
  await page.goto(`${base}/experiments/${study.slug}`);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 30000 });

  // Reduced-motion inspection advances the same physical model in explicit steps.
  assert.equal(await canvas.getAttribute('data-swim-steps'), '0');
  const restFrame = await canvas.screenshot();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole('button', { name: 'Advance 0.1 s', exact: true })
      .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.swimSteps === '60'
  );
  assert.ok(Number(await canvas.getAttribute('data-bell')) > 0.5);
  assert.notDeepEqual(await canvas.screenshot(), restFrame);
  await page.screenshot({
    path: 'output/nereid/swim-contraction.png',
    fullPage: true,
  });
  for (let i = 0; i < 13; i++)
    await page
      .getByRole('button', { name: 'Advance 0.1 s', exact: true })
      .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.swimSteps === '216'
  );
  await page.screenshot({
    path: 'output/nereid/swim-recovery.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Current', exact: true }).click();
  assert.equal(
    await page.getByLabel('Cross-current', { exact: true }).inputValue(),
    '0.8'
  );
  for (let i = 0; i < 50; i++)
    await page
      .getByRole('button', { name: 'Advance 0.1 s', exact: true })
      .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.swimSteps === '816'
  );
  await page.screenshot({
    path: 'output/nereid/swim-current.png',
    fullPage: true,
  });
  const flowingTip = Number(await canvas.getAttribute('data-tip-x'));
  await page.getByRole('button', { name: 'Reset motion', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.swimSteps === '0'
  );
  assert.ok(
    Math.abs(flowingTip - Number(await canvas.getAttribute('data-tip-x'))) > 0.2
  );
  await page.getByRole('button', { name: 'Row', exact: true }).click();
  await page.getByRole('button', { name: 'Reset motion', exact: true }).click();
  await page.screenshot({ path: 'output/nereid/desktop.png', fullPage: true });
  const initial = await canvas.screenshot();
  await page.waitForTimeout(180);
  assert.equal(await canvas.getAttribute('data-time'), '0.000');
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  const calls = Number(await canvas.getAttribute('data-draw-calls'));
  assert.ok(triangles > 150000 && triangles < 600000);
  assert.ok(calls < 200);
  for (const [frame, count] of [80, 8, 8, 8].entries()) {
    for (let i = 0; i < count; i++)
      await page
        .getByRole('button', { name: 'Advance 0.1 s', exact: true })
        .click();
    const steps = (80 + frame * 8) * 12;
    await page.waitForFunction(
      (expected) =>
        Number(document.querySelector('canvas').dataset.swimSteps) === expected,
      steps
    );
    assert.equal(await canvas.getAttribute('data-body-y'), '0.0000');
    assert.ok(Math.abs(Number(await canvas.getAttribute('data-body-x'))) > 0.2);
    assert.ok(Math.abs(Number(await canvas.getAttribute('data-body-z'))) > 0.1);
    assert.ok(Number(await canvas.getAttribute('data-travel')) > 4);
    await canvas.screenshot({ path: `output/nereid/rowing-${frame}.png` });
  }
  await page.getByRole('button', { name: 'Reset motion', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.swimSteps === '0'
  );
  if (process.env.NEREID_POSTER === '1')
    await canvas.screenshot({
      path: `public${study.poster}`,
      type: 'jpeg',
      quality: 94,
    });
  await page.getByRole('button', { name: '02 Explode', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.renderedSeparation === '1.000'
  );
  assert.equal(await canvas.getAttribute('data-body-x'), '0.0000');
  assert.equal(await canvas.getAttribute('data-body-z'), '0.0000');
  assert.notDeepEqual(await canvas.screenshot(), initial);
  await page.screenshot({ path: 'output/nereid/exploded.png', fullPage: true });
  await page.getByLabel('ASSEMBLY SEPARATION').fill('0.45');
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.renderedSeparation === '0.450'
  );
  const opaque = await canvas.screenshot();
  await page.getByRole('button', { name: 'X-ray shell', exact: true }).click();
  assert.notDeepEqual(await canvas.screenshot(), opaque);
  await page.getByRole('button', { name: 'X-ray shell', exact: true }).click();
  await page.getByRole('button', { name: '03 Lattice', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.view === 'lattice'
  );
  assert.equal(await page.getByLabel('ASSEMBLY SEPARATION').isDisabled(), true);
  await page.screenshot({ path: 'output/nereid/lattice.png', fullPage: true });
  const closeup = await canvas.screenshot();
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('+');
  assert.notDeepEqual(await canvas.screenshot(), closeup);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save specimen image', exact: true })
    .click();
  await (await download).saveAs('output/nereid/export.png');
  assert.ok((await readFile('output/nereid/export.png')).length > 15000);
  await page.getByRole('button', { name: '01 Specimen', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/nereid/mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.time) > 0.05
  );
  await page.getByRole('button', { name: 'Hold motion', exact: true }).click();
  await page.waitForTimeout(100);
  const frozen = await canvas.getAttribute('data-time');
  await page.waitForTimeout(180);
  assert.equal(await canvas.getAttribute('data-time'), frozen);
  // The paused renderer still responds to assembly inspection.
  await page.getByRole('button', { name: '02 Explode', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('canvas').dataset.renderedSeparation === '1.000'
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', { name: 'Experiments', exact: true }).click();
    await page.goto(`${base}/experiments/${study.slug}`);
    await canvas.waitFor({ timeout: 30000 });
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS Nereid: ${triangles.toLocaleString()} triangles / ${calls} draws. Rowing cycle, forward travel without bobbing, current response, assembled, exploded, X-ray, isolated lattice, keyboard orbit/zoom, PNG export, mobile, reduced motion, pause and repeated lifecycle checks.`
  );
} finally {
  await browser?.close();
  await server.close();
}
