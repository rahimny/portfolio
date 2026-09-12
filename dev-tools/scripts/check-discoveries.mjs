import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
const errors = [];
try {
  await server.listen();
  await server.watcher.close();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const { studies } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const specimen = studies.find((study) => study.renderer === 'svg');
  await mkdir('output/discoveries', { recursive: true });
  browser = await chromium.launch();
  for (const width of [1280, 768, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 768,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator('.artwork-peek').first().waitFor();
    const assertFits = async () =>
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false,
        `${width}px page must not overflow`
      );
    for (const peek of await page.locator('.artwork-peek').all()) {
      if (width < 768) await peek.tap();
      else {
        await peek.focus();
        await peek.press('Escape');
        await peek.press('Enter');
      }
      assert.equal(await peek.getAttribute('aria-expanded'), 'true');
      assert.equal(
        new URL(page.url()).pathname,
        '/',
        'Inspecting a preview must not follow its artwork link'
      );
      await assertFits();
      const panel = page.locator(
        `[id="${await peek.getAttribute('aria-controls')}"]`
      );
      assert.ok(
        await panel
          .locator('img')
          .evaluate((img) => img.getBoundingClientRect().height > 130),
        'The construction stays large enough to inspect'
      );
      await page.screenshot({
        path: `output/discoveries/preview-${width}.png`,
      });
      if (width < 768) await peek.tap();
      else await peek.press('Escape');
      assert.equal(await peek.getAttribute('aria-expanded'), 'false');
    }
    const sky = page.getByRole('button', {
      name: 'A little sky over Cambridge',
    });
    await sky.click();
    const skyBounds = await page.locator('.local-sky-sheet').boundingBox();
    assert.ok(
      skyBounds.x >= 0 && skyBounds.x + skyBounds.width <= width,
      'Clock detail fits the viewport'
    );
    await sky.press('Escape');
    assert.equal(await sky.getAttribute('aria-expanded'), 'false');

    await page.goto(`${base}/about`);
    await page.getByRole('button', { name: 'Turn over' }).click();
    await page.locator('.portrait[data-turned="true"]').waitFor();
    assert.equal(
      await page
        .locator('.portrait-back')
        .evaluate((el) => el.scrollHeight > el.clientHeight),
      false,
      'Portrait backing must not crop its personal details'
    );
    await assertFits();
    await page
      .locator('.portrait')
      .screenshot({ path: `output/discoveries/portrait-${width}.png` });
    await page
      .getByRole('button', { name: 'Portrait', exact: true })
      .press('Escape');
    assert.equal(
      await page.locator('.portrait-back').getAttribute('inert'),
      ''
    );

    await page.goto(`${base}/experiments/${specimen.slug}`);
    await page
      .getByRole('heading', { name: specimen.title, exact: true })
      .waitFor();
    await page.getByRole('link', { name: 'Rahim Neal Yakoob, home' }).click();
    await page.locator('.visit-stamp').first().waitFor();
    await page.reload();
    await page.locator('.visit-stamp').first().waitFor();
    await page.locator('.visit-souvenir summary').click();
    assert.deepEqual(
      await page.locator('.visit-receipt li').allTextContents(),
      [`${String(specimen.edition).padStart(3, '0')}${specimen.title}↗`]
    );
    await page
      .locator('.visit-receipt')
      .screenshot({ path: `output/discoveries/receipt-${width}.png` });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.visit-download').click(),
    ]);
    const file = `output/discoveries/visit-${width}.svg`;
    await download.saveAs(file);
    const svg = await readFile(file, 'utf8');
    assert.ok(svg.includes(specimen.title));
    assert.ok(!svg.includes('var(--'), 'The souvenir carries resolved colours');
    const artifact = await context.newPage();
    await artifact.goto(`${base}/${file}`);
    assert.equal(await artifact.locator('parsererror').count(), 0);
    await artifact.screenshot({
      path: `output/discoveries/export-${width}.png`,
    });
    await artifact.close();
    await page.goto(`${base}/experiments/not-a-study`);
    await page
      .getByRole('heading', { name: 'Not found', exact: true })
      .waitFor();
    await page.getByRole('link', { name: 'Rahim Neal Yakoob, home' }).click();
    await page.locator('.visit-souvenir summary').click();
    assert.equal(
      await page.locator('.visit-receipt li').count(),
      1,
      'Invalid study routes must not create visits'
    );
    await assertFits();
    await context.close();
    console.log(
      `PASS ${width}px preview toggles, keyboard/touch, portrait, clock, session visits and standalone SVG`
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
