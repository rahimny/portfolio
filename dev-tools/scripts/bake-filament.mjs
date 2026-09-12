#!/usr/bin/env node
// FILAMENT_PYTHON must provide Pillow with WebP support. No reference image is read.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const python = process.env.FILAMENT_PYTHON || 'python3';
execFileSync(python, ['-c', 'from PIL import Image']);
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const temp = await mkdtemp(join(tmpdir(), 'filament-bake-'));
let browser;
try {
  await server.listen();
  await server.watcher.close();
  browser = await chromium.launch({
    args:
      process.platform === 'darwin'
        ? ['--use-gl=angle', '--use-angle=metal']
        : [],
  });
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/filament-bake`
  );
  const png = await page.evaluate(async () => {
    const { renderFilamentBake } = await import(
      '/src/vanilla-three/experiences/filament/bake.ts'
    );
    return renderFilamentBake(document.createElement('canvas'), 2400);
  });
  const file = join(temp, 'specimen.png');
  await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
  execFileSync(
    python,
    [
      '-c',
      `from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('RGB')
im.save('public/filament/specimen.webp',lossless=True,method=6)
im.thumbnail((720,720))
im.save('public/posters/filament.webp',quality=88,method=6)
`,
      file,
    ],
    { stdio: 'inherit' }
  );
  console.log(
    'Baked the seeded procedural model to a 2400 px lossless field and 720 px poster.'
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
