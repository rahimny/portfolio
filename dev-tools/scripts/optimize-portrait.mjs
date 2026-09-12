// Generates responsive AVIF/WebP/PNG sources for the About portrait.
// Source is 2460x2460 at 5.15MB; displayed at a few hundred CSS px, so a
// 1440px-wide ceiling comfortably covers 2x DPR without shipping the original.
// Keep the source outside public/ so it is not copied into the deployed site.
// Usage: node dev-tools/scripts/optimize-portrait.mjs output/portrait-source.png
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = process.argv[2];
if (!SRC) {
  throw new Error(
    'Pass a local source image outside public/ as the first argument.'
  );
}
const OUT_DIR = 'public/images';
const WIDTHS = [480, 960, 1440];

await mkdir(OUT_DIR, { recursive: true });

const base = sharp(SRC).resize({ width: 1440, height: 1800, fit: 'cover' });

for (const width of WIDTHS) {
  const height = Math.round((width * 1800) / 1440);
  const pipeline = () => sharp(SRC).resize({ width, height, fit: 'cover' });

  await pipeline().avif({ quality: 55 }).toFile(`${OUT_DIR}/me-${width}.avif`);
  await pipeline().webp({ quality: 70 }).toFile(`${OUT_DIR}/me-${width}.webp`);
  console.log(`wrote me-${width}.avif / me-${width}.webp`);
}

// PNG fallback for browsers without AVIF/WebP support, capped at the same
// ceiling rather than the original's 2460px.
await base.png({ quality: 80 }).toFile(`${OUT_DIR}/me-1440.png`);
console.log('wrote me-1440.png');
