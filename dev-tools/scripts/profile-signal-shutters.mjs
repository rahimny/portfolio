import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
try {
  await server.listen();
  await server.watcher.close();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args: [
      '--enable-unsafe-webgpu',
      ...(process.platform === 'darwin'
        ? ['--use-gl=angle', '--use-angle=metal']
        : []),
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  await page.goto(base + '/experiments');
  await page.evaluate(async () => {
    const { ShutterField } = await import(
      '/src/features/signal-shutters/model.ts'
    );
    const { WebGPURenderer } = await import(
      '/node_modules/.vite/deps/three_webgpu.js'
    );
    const { ExperienceLoop } = await import(
      '/src/vanilla-three/ExperienceLoop.ts'
    );
    const init = WebGPURenderer.prototype.init;
    WebGPURenderer.prototype.init = function (...args) {
      this.backend.trackTimestamp = true;
      return init.apply(this, args);
    };
    window.shutterProfile = {
      active: false,
      frames: [],
      steps: [],
      gpu: [],
      resets: 0,
      simulated: 0,
    };
    const originalStep = ShutterField.prototype.step;
    ShutterField.prototype.step = function (dt) {
      const start = performance.now();
      const result = originalStep.call(this, dt);
      if (window.shutterProfile.active) {
        window.shutterProfile.steps.push(performance.now() - start);
        window.shutterProfile.simulated += dt;
      }
      return result;
    };
    const play = ExperienceLoop.prototype.setPlaying;
    ExperienceLoop.prototype.setPlaying = function (...args) {
      if (window.shutterProfile.active) window.shutterProfile.resets++;
      return play.apply(this, args);
    };
    const render = WebGPURenderer.prototype.render;
    WebGPURenderer.prototype.render = function (...args) {
      const start = performance.now();
      const result = render.apply(this, args);
      if (this.domElement.closest('.shutters-stage')) {
        window.shutterRenderer = this;
        if (window.shutterProfile.active) {
          window.shutterProfile.frames.push({
            time: start,
            cpu: performance.now() - start,
          });
          if (!window.shutterProfile.pending) {
            window.shutterProfile.pending = true;
            this.resolveTimestampsAsync()
              .then(() => {
                if (window.shutterProfile.active)
                  window.shutterProfile.gpu.push(this.info.render.timestamp);
              })
              .finally(() => {
                window.shutterProfile.pending = false;
              });
          }
        }
      }
      return result;
    };
  });
  await page.locator('a[href="/experiments/signal-shutters"]').first().click();
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  // Warm the shaders and let GPU compilation and texture upload finish.
  await page.getByRole('button', { name: /02 MAKE SOME NOISE/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Turning over')
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  const start = () =>
    page.evaluate(() => {
      window.shutterProfile = {
        active: true,
        start: performance.now(),
        frames: [],
        steps: [],
        gpu: [],
        resets: 0,
        simulated: 0,
      };
    });
  const finish = () =>
    page.evaluate(() => {
      const p = window.shutterProfile;
      p.active = false;
      const quantile = (array, q) => {
        const sorted = [...array].sort((a, b) => a - b);
        return sorted.length
          ? sorted[Math.floor((sorted.length - 1) * q)]
          : null;
      };
      const intervals = p.frames
        .slice(1)
        .map((frame, i) => frame.time - p.frames[i].time);
      const canvas = document.querySelector('canvas');
      return {
        wallMs: performance.now() - p.start,
        simulatedMs: p.simulated * 1000,
        frames: p.frames.length,
        playRequests: p.resets,
        intervalMedian: quantile(intervals, 0.5),
        intervalP95: quantile(intervals, 0.95),
        renderCpuMedian: quantile(
          p.frames.map((f) => f.cpu),
          0.5
        ),
        renderCpuP95: quantile(
          p.frames.map((f) => f.cpu),
          0.95
        ),
        stepCpuTotal: p.steps.reduce((a, b) => a + b, 0),
        gpuMedian: quantile(p.gpu, 0.5),
        gpuP95: quantile(p.gpu, 0.95),
        backing: [canvas.width, canvas.height],
        backend: canvas.dataset.backend,
        drawCalls: window.shutterRenderer.info.render.drawCalls,
        adapter: window.shutterRenderer.backend.device?.adapterInfo?.device,
        userAgent: navigator.userAgent,
      };
    });
  await start();
  await page.getByRole('button', { name: /03 CHANGE IS GOOD/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Turning over')
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  const transmission = await finish();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.48);
  await page.mouse.down();
  await start();
  for (let pass = 0; pass < 3; pass++) {
    await page.mouse.move(
      box.x + box.width * (pass % 2 ? 0.2 : 0.8),
      box.y + box.height * 0.48,
      { steps: 100 }
    );
  }
  const drag = await finish();
  await page.mouse.up();
  await page.waitForFunction(() =>
    document
      .querySelector('.shutters-stage-top')
      .textContent.includes('Signal aligned')
  );
  const idleFrames = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(500);
  const idleExtraFrames =
    Number(await canvas.getAttribute('data-frames')) - Number(idleFrames);
  const result = { transmission, drag, idleExtraFrames };
  const output =
    process.env.SHUTTERS_PROFILE ?? '/tmp/signal-shutters-profile.json';
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
