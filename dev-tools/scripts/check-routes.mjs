#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
let failures = 0;

try {
  await server.listen();
  await server.watcher.close();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Vite did not expose a local HTTP port');
  const base = `http://127.0.0.1:${address.port}`;
  const { studies } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const { shaderDefinitions } = await server.ssrLoadModule(
    '/src/vanilla-three/experiences/shaders/gallery/index.ts'
  );
  const shaderIds = shaderDefinitions.map((shader) => shader.id);
  const variants = studies.find(
    (study) => study.slug === 'shader-gallery'
  ).variants;
  assert.equal(
    new Set(shaderIds).size,
    shaderIds.length,
    'Shader implementation IDs must be unique'
  );
  assert.deepEqual(
    [...shaderIds].sort(),
    variants.map((variant) => variant.slug).sort(),
    'Registry variants must match shader implementations'
  );

  const routes = [
    { path: '/' },
    { path: '/about' },
    { path: '/experiments' },
    { path: '/style-guide' },
    { path: '/this-route-does-not-exist', expect404: true },
    { path: '/experiments/this-study-does-not-exist', expect404: true },
  ];
  for (const study of studies) {
    const path = `/experiments/${study.slug}`;
    routes.push({
      path,
      renderer: study.renderer,
      checkReady: !study.variants?.length && study.renderer !== 'svg',
    });
    for (const variant of study.variants ?? [])
      routes.push({
        path: `${path}/${variant.slug}`,
        renderer: study.renderer,
        checkReady: true,
      });
  }
  const selected = routes.filter(
    (route) =>
      !process.env.ROUTE_FILTER || route.path.includes(process.env.ROUTE_FILTER)
  );
  assert.ok(selected.length, 'ROUTE_FILTER did not select any routes');

  browser = await chromium.launch({
    args:
      process.env.ROUTE_GPU === 'native'
        ? [
            ...(process.platform === 'darwin'
              ? ['--use-gl=angle', '--use-angle=metal']
              : []),
            '--enable-unsafe-webgpu',
          ]
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });

  function collectErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' ||
        (message.type() === 'warning' &&
          /GL_INVALID_|GL_OUT_OF_MEMORY|THREE\.WebGLProgram/.test(
            message.text()
          ))
      )
        errors.push(message.text());
    });
    return errors;
  }

  async function ready(page, route) {
    if (!route.checkReady) return;
    await page
      .locator('canvas[data-ready="true"], canvas[data-unavailable="webgpu"]')
      .first()
      .waitFor({ state: 'attached', timeout: 30_000 });
    if (await page.locator('canvas[data-unavailable="webgpu"]').count()) {
      assert.equal(
        route.renderer,
        'webgpu',
        'Only WebGPU studies may use the WebGPU fallback'
      );
      const supported = await page.evaluate(
        async () => !!(await navigator.gpu?.requestAdapter())
      );
      assert.equal(
        supported,
        false,
        'A WebGPU-capable browser unexpectedly received the fallback'
      );
      await page
        .getByRole('alert')
        .filter({ hasText: 'requires WebGPU' })
        .waitFor();
    }
  }

  async function enter(page, route) {
    const parent = route.path.slice(0, route.path.lastIndexOf('/'));
    if (parent !== '/experiments')
      await page.locator(`a[href="${parent}"]:visible`).first().click();
    await page.locator(`a[href="${route.path}"]:visible`).first().click();
    await page.waitForURL(`${base}${route.path}`);
  }

  async function leave(page) {
    await page.locator('a[href="/experiments"]:visible').first().click();
    await page.waitForURL(`${base}/experiments`);
  }

  async function check(label, run) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    });
    // Software GPU cleanup can delay a route commit while shaders are compiling.
    // Use the same budget for navigation and renderer initialisation.
    page.setDefaultTimeout(30_000);
    const errors = collectErrors(page);
    try {
      await run(page);
    } catch (error) {
      errors.push(error.message);
    }
    // Keep listening after the final navigation: late rejections belong to the study that left.
    await page.waitForTimeout(150);
    const unique = [...new Set(errors)];
    if (unique.length) failures++;
    console.log(`${unique.length ? 'FAIL' : 'PASS'}  ${label}`);
    unique.slice(0, 5).forEach((error) => console.error(`  ${error}`));
    await page.close();
  }

  for (const route of selected) {
    await check(route.path, async (page) => {
      const response = await page.goto(`${base}${route.path}`, {
        waitUntil: 'domcontentloaded',
      });
      assert.equal(response.status(), 200);
      await page.locator('main').waitFor();
      if (route.expect404) {
        await page.getByText('Not found', { exact: false }).first().waitFor();
        return;
      }
      await ready(page, route);
      if (route.renderer === 'svg')
        await page.locator('main svg').first().waitFor();
      if (
        route.checkReady &&
        (await page.locator('canvas[data-ready="true"]').count())
      ) {
        const box = await page
          .locator('canvas[data-ready="true"]')
          .first()
          .boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 + 60,
          box.y + box.height / 2 - 40,
          { steps: 8 }
        );
        await page.mouse.up();
      }
    });
  }

  for (const route of selected.filter((route) => route.checkReady)) {
    await check(
      `${route.path} (SPA re-entry and cancellation)`,
      async (page) => {
        await page.goto(`${base}/experiments`, {
          waitUntil: 'domcontentloaded',
        });
        const documentStart = await page.evaluate(() => performance.timeOrigin);
        await enter(page, route);
        await ready(page, route);
        await leave(page);
        await enter(page, route);
        await page.locator('canvas').first().waitFor({ state: 'attached' });
        await leave(page);
        await enter(page, route);
        await ready(page, route);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForTimeout(100);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await leave(page);
        assert.equal(
          await page.evaluate(() => performance.timeOrigin),
          documentStart,
          'Lifecycle check must not reload the document'
        );
      }
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
process.exitCode = failures ? 1 : 0;
