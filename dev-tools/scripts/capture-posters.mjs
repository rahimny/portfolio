#!/usr/bin/env node
/**
 * Captures a poster still for every study by booting it in a real browser.
 *
 * The index shows the work, not a description of it — text-only cards were the
 * single largest miss on the old site. Generating posters from the running code
 * means they can never drift out of sync with what the study actually looks
 * like; regenerate after changing a shader.
 *
 * Usage:
 *   pnpm dev            # in another shell
 *   pnpm posters        # all studies
 *   pnpm posters meta-shapes cursor-trails
 *
 * A study that never drew is reported as blank rather than written out as a
 * black rectangle — a missing poster is honest, a black one is a lie.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const BASE = process.env.POSTER_BASE ?? 'http://localhost:6180';
const OUT = new URL('../../public/posters/', import.meta.url).pathname;

/** Simulations need different settle times to reach a characteristic frame. */
const SETTLE_TIMES = {
  // Four slabs of marks take a while to compile and settle under SwiftShader.
  impasto: 10000,
  'meta-shapes': 4000,
  'cursor-trails': 3500,
  quasicity: 3000,
  gasket: 8000,
  aurora: 2500,
  mandelbrot: 2000,
  'julia-set': 2000,
  'perlin-waves': 2500,
  kaleidoscope: 2500,
  'lava-lamp': 3000,
  particles: 5000,
  'pixel-flow': 5000,
  'particle-sanctuary': 5000,
};

async function loadStudies() {
  const vite = await createServer({
    appType: 'custom',
    server: { middlewareMode: true },
  });

  try {
    const registry = await vite.ssrLoadModule('/src/features/lab/registry.ts');
    return registry.studies;
  } finally {
    await vite.close();
  }
}

const studies = await loadStudies();
const STUDIES = studies.flatMap((study) => {
  if (study.variants?.length) {
    return study.variants.map((variant) => ({
      id: `${study.slug}/${variant.slug}`,
      name: variant.slug,
      settle: SETTLE_TIMES[variant.slug] ?? 3000,
    }));
  }

  return [
    {
      id: study.slug,
      settle: SETTLE_TIMES[study.slug] ?? 4000,
      // SVG studies render synchronously and expose a `[data-artboard]`
      // frame around the work itself — screenshot that element directly
      // rather than hiding chrome and shooting the viewport, which is the
      // WebGPU/WebGL studies' workaround for a renderer that can report a
      // zero-sized canvas box.
      svg: study.renderer === 'svg',
    },
  ];
});

const only = process.argv.slice(2);
const targets = only.length
  ? STUDIES.filter((s) => only.includes(s.name ?? s.id))
  : STUDIES;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const results = [];

for (const study of targets) {
  const slug = study.name ?? study.id;
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 750 },
    deviceScaleFactor: 1.5,
  });
  // Posters are shot dark — the studies are authored against a dark stage.
  await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'));
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/experiments/${study.id}`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    let buf;

    if (study.svg) {
      const artboard = page.locator('[data-artboard]').first();
      await artboard.waitFor({ state: 'attached', timeout: 15_000 });
      await page.waitForTimeout(study.settle);
      buf = await artboard.screenshot({
        timeout: 20_000,
        type: 'jpeg',
        quality: 90,
      });
    } else {
      await page.waitForSelector('canvas', { timeout: 15_000 });
      await page.waitForTimeout(study.settle);

      // Chrome — nav, breadcrumb, Tweakpane — is not part of the work.
      //
      // .tp-dfwv alone is not enough: it only matches Tweakpane's *default*
      // wrapper. ExperimentLayout passes a container, so the pane mounts as
      // .tp-rotv inside it instead. Match the whole tp- namespace.
      await page.addStyleTag({
        content: `
          nav,
          [data-poster-hide],
          [class^='tp-'],
          [class*=' tp-'] { display: none !important; }
        `,
      });
      await page.waitForTimeout(200);

      // Fail loudly rather than shipping a poster with a control panel in it.
      const chrome = await page.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(el).display !== 'none'
          );
        };
        return [
          ...document.querySelectorAll(
            "nav, [class^='tp-'], [data-poster-hide]"
          ),
        ].filter(visible).length;
      });
      if (chrome > 0) {
        throw new Error(
          `${chrome} chrome element(s) still visible after hiding`
        );
      }

      // Screenshot the viewport, not the canvas element: WebGPU studies can
      // report a zero-sized box and time out on an element screenshot.
      // JPEG, not PNG: these are photographic gradients, and PNG was
      // producing 3 MB files for a card thumbnail.
      buf = await page.screenshot({
        timeout: 20_000,
        type: 'jpeg',
        quality: 82,
      });
    }

    // A study that never drew produces a near-uniform image. Measure the
    // captured PNG rather than the drawing buffer — Three.js runs with
    // preserveDrawingBuffer:false, so readPixels after compositing is empty
    // even when the frame rendered perfectly well.
    const variance = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 60;
      const ctx2 = c.getContext('2d');
      ctx2.drawImage(img, 0, 0, 96, 60);
      const px = ctx2.getImageData(0, 0, 96, 60).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (l < min) min = l;
        if (l > max) max = l;
      }
      return Math.round(max - min);
    }, buf.toString('base64'));

    if (variance < 8) {
      results.push({ slug, status: 'blank', note: 'canvas never drew' });
    } else {
      await writeFile(`${OUT}${slug}.jpg`, buf);
      results.push({
        slug,
        status: 'ok',
        kb: Math.round(buf.length / 1024),
        variance,
      });
    }
  } catch (err) {
    results.push({ slug, status: 'failed', note: err.message.split('\n')[0] });
  }

  await ctx.close();
}

await browser.close();

for (const r of results) {
  const detail =
    r.status === 'ok' ? `${r.kb} kB (variance ${r.variance})` : r.note;
  console.log(`${r.status.padEnd(7)} ${r.slug.padEnd(22)} ${detail}`);
}

const ok = results.filter((r) => r.status === 'ok').length;
console.log(`\n${ok}/${results.length} posters captured -> public/posters/`);
