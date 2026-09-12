import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const server = await createServer({
  cacheDir: 'node_modules/.vite-matter-atelier-check',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
const errors = [];
const recordConsole = (message) => {
  const text = message.text();
  if (
    message.type() === 'error' ||
    /GPUValidationError|GPUInternalError|shader (?:error|compilation failed)|error while parsing WGSL|validation error/i.test(
      text
    )
  ) {
    errors.push(text);
    console.error(text);
  }
};
// Read the presented frame. WebGPU's swap-chain texture is not retained for
// drawImage(canvas) once a frame has been presented.
const samplePresentedFrame = async (canvas, width, height) => {
  const png = (await canvas.screenshot()).toString('base64');
  return canvas.page().evaluate(
    async ({ png, width, height }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = width;
      sample.height = height;
      const context = sample.getContext('2d');
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      let min = 255,
        max = 0,
        shaded = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        min = Math.min(min, value);
        max = Math.max(max, value);
        if (pixels[i] < 220 || pixels[i + 1] < 220 || pixels[i + 2] < 220)
          shaded++;
      }
      return { range: max - min, shaded: shaded / (width * height) };
    },
    { png, width, height }
  );
};
try {
  await server.listen();
  await server.watcher.close();
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('matter-atelier');
  const native = process.env.ATELIER_GPU === 'native';
  const hardwareWebGL = process.env.ATELIER_WEBGL_HARDWARE === '1';
  const url = `http://127.0.0.1:${server.httpServer.address().port}/experiments/${study.slug}${native ? '' : '?renderer=webgl'}`;
  browser = await chromium.launch({
    args:
      native || hardwareWebGL
        ? ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-webgpu']
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  await mkdir('output/matter-atelier', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', recordConsole);
  await page.goto(url);
  await page.locator('canvas[data-ready="true"]').waitFor();
  const canvas = page.locator('.atelier-stage canvas');
  assert.equal(
    await canvas.getAttribute('data-backend'),
    native ? 'webgpu' : 'webgl',
    'The requested backend must initialise; native coverage may not silently use fallback'
  );
  await page
    .getByRole('button', { name: 'Inspect edition', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.factory === 'false'
  );
  const progress = async () =>
    Number(await canvas.getAttribute('data-progress'));
  const seek = async (value) => {
    await page
      .getByRole('slider', { name: 'Print progress' })
      .fill(String(Math.round(value * 1000) / 1000));
    await page.waitForFunction(
      (target) =>
        Math.abs(
          Number(document.querySelector('canvas').dataset.progress) - target
        ) < 0.002,
      value
    );
  };
  await page.getByRole('button', { name: 'Pause print', exact: true }).click();
  const frozen = await progress();
  await page.waitForTimeout(250);
  assert.equal(await progress(), frozen);
  await seek(0.55);
  await page.screenshot({
    path: 'output/matter-atelier/desktop.png',
    fullPage: true,
  });
  const before = await canvas.screenshot();
  await page
    .getByRole('button', { name: 'Generate variation', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      Math.abs(
        Number(document.querySelector('canvas').dataset.progress) - 0.55
      ) > 0.01
  );
  assert.notDeepEqual(await canvas.screenshot(), before);
  for (const form of ['ribbon', 'orbit', 'terrain', 'bloom']) {
    await page.getByLabel('01 / Select a form').selectOption(form);
    await seek(0.7);
  }
  await page.getByRole('button', { name: 'Printer', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/detail.png' });
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'studio', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  assert.deepEqual(errors, [], 'Initial renderer compilation must succeed');
  const printEnd = Number(await canvas.getAttribute('data-print-end'));
  // dataset camelCase serialises to data-print-end.
  await seek(printEnd + (1 - printEnd) * (102 / 288));
  assert.equal(await canvas.getAttribute('data-stage'), 'painting');
  const { range } = await samplePresentedFrame(canvas, 64, 32);
  assert.ok(
    range > 70,
    'The physical pigment treatment must preserve a non-blank rendered scene'
  );

  assert.ok(
    Math.abs(Number(await canvas.getAttribute('data-coating')) - 0.5) < 0.02
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/finishing.png' });
  const paintMass = Number(await canvas.getAttribute('data-paint-mass'));
  assert.ok(paintMass > 0, 'The brush must deposit pigment');
  await page.getByRole('button', { name: 'brush', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/brush.png' });
  const paintDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save painting', exact: true })
    .click();
  await (await paintDownload).saveAs('output/matter-atelier/painting.png');
  await page
    .getByRole('button', { name: '04 Spectral bath', exact: true })
    .click();
  await page.getByRole('button', { name: 'bath', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  for (const treatment of ['prismatic', 'recursive', 'glitch']) {
    await page.getByLabel('Treatment recipe').selectOption(treatment);
    await page.waitForFunction(
      (value) => document.querySelector('canvas').dataset.treatment === value,
      treatment
    );
    await page
      .locator('.atelier-stage')
      .screenshot({ path: `output/matter-atelier/${treatment}.png` });
  }
  assert.equal(await canvas.getAttribute('data-stage'), 'spectral');
  assert.equal(
    await canvas.getAttribute('data-object-position'),
    '4.000,-0.275,-2.400'
  );
  const geometryCount = await canvas.getAttribute('data-geometries');
  await seek(printEnd - 0.01);
  assert.equal(await canvas.getAttribute('data-stage'), 'printing');
  assert.equal(await canvas.getAttribute('data-coating'), '0.000000');
  assert.equal(Number(await canvas.getAttribute('data-paint-mass')), 0);
  await page
    .getByRole('button', { name: 'Watch the brush', exact: true })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.coating) > 0.03
  );
  await page.getByRole('button', { name: 'Pause print', exact: true }).click();
  const coating = await canvas.getAttribute('data-coating');
  await page.waitForTimeout(150);
  assert.equal(await canvas.getAttribute('data-coating'), coating);
  assert.equal(await canvas.getAttribute('data-geometries'), geometryCount);
  await seek(1);
  assert.equal(await canvas.getAttribute('data-stage'), 'complete');
  assert.equal(
    await canvas.getAttribute('data-object-position'),
    '6.300,0.000,3.800'
  );
  await page.getByRole('button', { name: 'studio', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/complete.png' });
  console.log(
    'PASS finishing sweep, reversible coating, pause and retained geometry'
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Resume print', exact: true })
      .isDisabled(),
    true
  );
  assert.equal(await canvas.getAttribute('data-extruding'), 'false');
  await page.waitForTimeout(200);
  assert.equal(await progress(), 1);
  await page
    .getByRole('button', { name: 'Restart print', exact: true })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.progress) === 0
  );
  assert.equal(await progress(), 0);
  await page.getByRole('button', { name: 'Resume print', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.progress) > 0
  );
  await page.getByRole('button', { name: 'Pause print', exact: true }).click();
  console.log(
    'PASS pause, scrub, presets, variation, views, completion and restart'
  );
  const cube = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  const binary = new STLExporter().parse(cube, { binary: true });
  await page.getByLabel('Upload STL', { exact: true }).setInputFiles({
    name: 'test-cube.stl',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(binary.buffer),
  });
  await page.getByRole('status').filter({ hasText: 'STL loaded' }).waitFor();
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.progress) === 0
  );
  await seek(0.5);
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/upload.png' });
  const ascii = new STLExporter().parse(cube);
  await page.getByLabel('Upload STL', { exact: true }).setInputFiles({
    name: 'ascii-cube.stl',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(ascii),
  });
  await page
    .locator('.atelier-caption')
    .filter({ hasText: 'ascii-cube' })
    .waitFor();
  await page.getByLabel('Upload STL', { exact: true }).setInputFiles({
    name: 'bad.stl',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('solid empty\nendsolid empty'),
  });
  await page
    .getByRole('status')
    .filter({ hasText: /no valid triangles|no printable|could not|Invalid/i })
    .waitFor();
  assert.equal(await page.locator('canvas[data-ready="true"]').count(), 1);
  cube.geometry.dispose();
  cube.material.dispose();
  console.log(
    'PASS binary and ASCII STL worker slicing, rejected upload preserves scene'
  );
  await page.getByLabel('01 / Select a form').selectOption('bloom');
  await seek(0.65);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still', exact: true }).click();
  await (await download).saveAs('output/matter-atelier/still.png');
  const png = await readFile('output/matter-atelier/still.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 10000);
  // Guided framing yields immediately to orbit and pigment changes affect the output.
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await page
    .getByRole('button', { name: '03 Wet pigment', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  assert.equal(await canvas.getAttribute('data-director'), 'true');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.55
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.62,
    bounds.y + bounds.height * 0.55
  );
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.director === 'false'
  );
  await page.getByLabel('Brush load', { exact: true }).selectOption('0.6');
  await seek(1);
  const dryMass = Number(await canvas.getAttribute('data-paint-mass'));
  await page.getByLabel('Brush load', { exact: true }).selectOption('1.4');
  await page.waitForFunction(
    (mass) => Number(document.querySelector('canvas').dataset.paintMass) > mass,
    dryMass
  );
  await page.getByRole('button', { name: 'bath', exact: true }).click();
  const currentPrintEnd = Number(await canvas.getAttribute('data-print-end'));
  await seek(
    currentPrintEnd + ((1 - currentPrintEnd) * (156 + 96 * 0.69)) / 288
  );
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/dripping.png' });
  await seek(
    currentPrintEnd + ((1 - currentPrintEnd) * (156 + 96 * 0.85)) / 288
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/ripples.png' });
  let boundedGeometry;
  for (let edition = 0; edition < 4; edition++) {
    await seek(1);
    await page
      .getByRole('button', { name: 'Generate variation', exact: true })
      .click();
    await page.waitForFunction(
      (count) =>
        Number(document.querySelector('canvas').dataset.editions) === count,
      Math.min(3, edition + 1)
    );
    await page.waitForFunction(
      () => Number(document.querySelector('canvas').dataset.progress) < 1
    );
    if (edition === 2)
      boundedGeometry = await canvas.getAttribute('data-geometries');
    if (edition === 3)
      assert.equal(
        await canvas.getAttribute('data-geometries'),
        boundedGeometry,
        'Edition archive must remain bounded'
      );
  }
  await page.getByRole('button', { name: 'studio', exact: true }).click();
  await seek(1);
  await page.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await page
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/archive.png' });
  await seek(0.65);
  console.log(
    'PASS director cancellation, consequential pigment, falling drops and bounded edition archive'
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByRole('button', { name: 'Resume print', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Resume print', exact: true })
      .isDisabled(),
    true
  );
  const reduced = await progress();
  await page.waitForTimeout(200);
  assert.equal(await progress(), reduced);
  await seek(0.35);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'output/matter-atelier/mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await page.getByRole('slider', { name: 'Print progress' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => Number(document.querySelector('canvas').dataset.progress) > 0.35
  );
  console.log(
    'PASS PNG export, reduced-motion manual inspection, mobile and keyboard controls'
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('Inside the process', { exact: true }).click();
  console.log(
    'Telemetry:',
    await page.locator('.atelier-notes p.font-meta').innerText()
  );
  const live = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  live.setDefaultTimeout(60000);
  live.on('pageerror', (e) => errors.push(e.message));
  live.on('console', recordConsole);
  await live.goto(url);
  const liveCanvas = live.locator('canvas[data-ready="true"]');
  await liveCanvas.waitFor();
  assert.equal(await liveCanvas.getAttribute('data-factory'), 'true');
  const { shaded: visibleScene } = await samplePresentedFrame(
    liveCanvas,
    64,
    64
  );
  assert.ok(
    visibleScene > 0.25,
    'The completed render must contain a visible scene, not a blank postprocessing frame'
  );
  assert.notEqual(
    await liveCanvas.getAttribute('data-printing-edition'),
    await liveCanvas.getAttribute('data-finishing-edition')
  );
  await live.getByRole('button', { name: 'Pause print', exact: true }).click();
  await live
    .getByRole('button', { name: 'Resume print', exact: true })
    .waitFor();
  await live.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  const liveTime = await liveCanvas.getAttribute('data-factory-time');
  // Software rendering can take longer than one browser frame to present the
  // final pause invalidation; observe sleep only after that transition settles.
  await live.waitForTimeout(1000);
  assert.equal(await liveCanvas.getAttribute('data-factory-time'), liveTime);
  const pausedRenders = await liveCanvas.evaluate(
    (canvas) =>
      new Promise((resolve) => {
        let renders = 0;
        const observer = new MutationObserver((records) => {
          renders += records.length;
        });
        observer.observe(canvas, {
          attributes: true,
          attributeFilter: ['data-render-ms'],
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(renders);
        }, 750);
      })
  );
  assert.equal(pausedRenders, 0, 'A settled paused scene must stop rendering');
  await live
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/factory.png' });
  const activeRecipe = await liveCanvas.getAttribute('data-recipe');
  assert.ok(
    activeRecipe && activeRecipe !== 'null',
    'A live edition has a committed recipe'
  );
  const identity = {
    printing: await liveCanvas.getAttribute('data-printing-edition'),
    finishing: await liveCanvas.getAttribute('data-finishing-edition'),
    parent: await liveCanvas.getAttribute('data-parent-seed'),
    generation: await liveCanvas.getAttribute('data-generation'),
  };
  assert.ok(
    Number(identity.generation) >= 1,
    'A mature colony contributes to a later generation'
  );
  assert.notEqual(
    identity.parent,
    '',
    'The inherited edition identifies its actual parent'
  );
  assert.notEqual(identity.parent, identity.printing);
  assert.ok(
    Number(await liveCanvas.getAttribute('data-bloom')) > 0,
    'Recovery has opened a nursery colony'
  );
  const assertIdentity = async () => {
    assert.equal(await liveCanvas.getAttribute('data-factory-time'), liveTime);
    assert.equal(await liveCanvas.getAttribute('data-recipe'), activeRecipe);
    assert.deepEqual(
      {
        printing: await liveCanvas.getAttribute('data-printing-edition'),
        finishing: await liveCanvas.getAttribute('data-finishing-edition'),
        parent: await liveCanvas.getAttribute('data-parent-seed'),
        generation: await liveCanvas.getAttribute('data-generation'),
      },
      identity,
      'Presentation changes preserve the living edition and its ancestry'
    );
  };
  const atelierImage = await liveCanvas.screenshot();
  for (const [world, name] of [
    ['bioelectric', 'Bioelectric'],
    ['signal', 'Signal dream'],
    ['atelier', 'Atelier'],
  ]) {
    await live.getByRole('button', { name, exact: true }).click();
    await live.waitForFunction(
      (expected) => document.querySelector('canvas').dataset.world === expected,
      world
    );
    await live
      .getByRole('button', { name, exact: true, pressed: true })
      .waitFor();
    // World palettes ease for one second, even while the process is paused.
    await live.waitForTimeout(1100);
    assert.equal(
      await live
        .getByRole('button', { name, exact: true })
        .getAttribute('aria-pressed'),
      'true'
    );
    await assertIdentity();
    if (world === 'bioelectric')
      assert.notDeepEqual(
        await liveCanvas.screenshot(),
        atelierImage,
        'A world changes the rendered material and light'
      );
    await live
      .locator('.atelier-stage')
      .screenshot({ path: `output/matter-atelier/world-${world}.png` });
  }
  for (const [name, attribute] of [
    ['Nursery', 'flora'],
    ['Signals', 'communication'],
  ]) {
    const toggle = live.getByRole('button', { name, exact: true });
    for (const enabled of [false, true]) {
      await toggle.click();
      await live.waitForFunction(
        ([key, value]) =>
          document.querySelector('canvas').dataset[key] === String(value),
        [attribute, enabled]
      );
      await live
        .getByRole('button', { name, exact: true, pressed: enabled })
        .waitFor();
      assert.equal(await toggle.getAttribute('aria-pressed'), String(enabled));
      await assertIdentity();
    }
  }
  await live
    .getByRole('button', { name: 'Enter immersive view', exact: true })
    .click();
  await live.locator('.atelier-page[data-immersive="true"]').waitFor();
  await live.keyboard.press('Escape');
  await live.locator('.atelier-page[data-immersive="false"]').waitFor();
  await assertIdentity();
  await live.getByText('Shape the next generation', { exact: true }).click();
  await live.getByLabel('Treatment recipe').selectOption('recursive');
  await live.getByLabel('Brush load', { exact: true }).selectOption('1.4');
  for (const [name, value] of [
    ['Inheritance', '0.85'],
    ['Fusion', '0.8'],
    ['Growth', '0.7'],
    ['Expression', '0.9'],
  ])
    await live.getByRole('slider', { name, exact: true }).fill(value);
  await live.waitForFunction(
    () => document.querySelector('canvas').dataset.treatment === 'recursive'
  );
  await assertIdentity();
  console.log(
    'PASS world variants, ecology controls, immersive exit and immutable active recipes'
  );
  await live.getByRole('button', { name: 'bath', exact: true }).click();
  await live.waitForFunction(
    () => document.querySelector('canvas').dataset.cameraMoving === 'false'
  );
  await live
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/factory-bath.png' });
  await live.getByRole('button', { name: 'studio', exact: true }).click();
  await live.getByLabel('Simulation speed', { exact: true }).selectOption('48');
  await live.getByRole('button', { name: 'Resume print', exact: true }).click();
  await live.waitForFunction(
    (start) =>
      Number(document.querySelector('canvas').dataset.factoryTime) > start + 65,
    Number(liveTime),
    // The fixed-step safety cap requires at least 650 rendered frames here.
    // SwiftShader measured roughly 450ms per frame on this workload; allow its
    // slower execution without changing the simulated work or resource bound.
    { timeout: native || hardwareWebGL ? 120000 : 420000 }
  );
  assert.match(
    await liveCanvas.getAttribute('data-artwork'),
    /Dendritic grove|Accretion shell|Recursive rosette/,
    'Seeded editions select a named recursive composition'
  );
  const nextRecipe = JSON.parse(await liveCanvas.getAttribute('data-recipe'));
  assert.notEqual(nextRecipe.seed, JSON.parse(activeRecipe).seed);
  assert.equal(nextRecipe.treatment, 'recursive');
  assert.equal(nextRecipe.richness, 1.4);
  assert.deepEqual(nextRecipe.controls, {
    inheritance: 0.85,
    fusion: 0.8,
    growth: 0.7,
    expression: 0.9,
  });
  assert.ok(nextRecipe.genome.generation > Number(identity.generation));
  const workingSet = Number(await liveCanvas.getAttribute('data-in-flight'));
  assert.ok(workingSet >= 2 && workingSet <= 3);
  assert.ok(Number(await liveCanvas.getAttribute('data-editions')) >= 2);
  assert.ok(
    Number(await liveCanvas.getAttribute('data-geometries')) < 160,
    'Factory resources must stay bounded across editions'
  );
  console.log(
    'Factory telemetry:',
    await liveCanvas.evaluate((canvas) => ({
      backend: canvas.dataset.backend,
      draws: canvas.dataset.drawCalls,
      triangles: canvas.dataset.triangles,
      geometries: canvas.dataset.geometries,
      generation: canvas.dataset.generation,
    }))
  );
  await live.getByRole('button', { name: 'Pause print', exact: true }).click();
  await live
    .locator('.atelier-stage')
    .screenshot({ path: 'output/matter-atelier/factory-later.png' });
  await live.emulateMedia({ reducedMotion: 'reduce' });
  const reducedFactory = await liveCanvas.getAttribute('data-factory-time');
  await live.waitForTimeout(180);
  assert.equal(
    await liveCanvas.getAttribute('data-factory-time'),
    reducedFactory
  );
  await live
    .getByRole('button', { name: 'Inspect edition', exact: true })
    .click();
  await live.waitForFunction(
    () => document.querySelector('canvas').dataset.factory === 'false'
  );
  assert.equal(
    await live.getByRole('slider', { name: 'Print progress' }).isEnabled(),
    true
  );
  const cancelledInit = await live.evaluate(async () => {
    const { MatterAtelierExperience } = await import(
      '/src/vanilla-three/experiences/matter-atelier/MatterAtelierExperience.ts'
    );
    const controller = new AbortController();
    const instance = new MatterAtelierExperience(
      document.createElement('canvas'),
      () => {}
    );
    const pending = instance
      .init(controller.signal)
      .catch((error) => error.name);
    // Inspect the actual backend owner; no application debug API is required.
    const renderer = instance.renderer;
    const originalDispose = renderer.dispose.bind(renderer);
    const releases = [];
    renderer.dispose = () => {
      releases.push(renderer._initialized);
      originalDispose();
    };
    controller.abort();
    instance.dispose();
    instance.dispose();
    const early = releases.length;
    const result = await pending;
    await Promise.resolve();
    await Promise.resolve();
    return {
      early,
      result,
      releases,
      children: instance.scene.children.length,
    };
  });
  assert.deepEqual(
    cancelledInit,
    {
      early: 0,
      result: 'AbortError',
      releases: [true],
      children: 0,
    },
    'Cancelling before renderer initialization must release its eventual backend exactly once'
  );
  await live.close();
  console.log(
    'PASS concurrent production, inherited next recipes, bounded resources and reduced-motion inspection'
  );
  assert.deepEqual(errors, []);
} catch (error) {
  if (errors.length) console.error('Renderer errors:', errors);
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
