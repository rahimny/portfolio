#!/usr/bin/env node
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const python = process.env.FILAMENT_PYTHON || 'python3';
execFileSync(python, ['-c', 'from PIL import Image']);
const server = await createServer({
  plugins: [
    {
      name: 'filament-bake-surface',
      configureServer(server) {
        server.middlewares.use('/__filament-bake', (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><html><body></body></html>');
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const temp = await mkdtemp(join(tmpdir(), 'filament-depth-'));
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
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__filament-bake`
  );
  for (let layer = 1; layer <= 3; layer++) {
    const png = await page.evaluate(async (layer) => {
      const { renderFilamentBake } = await import(
        '/src/vanilla-three/experiences/filament/bake.ts'
      );
      return renderFilamentBake(document.createElement('canvas'), 2400, layer);
    }, layer);
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(
      join(temp, `${layer}.png`),
      Buffer.from(png.split(',')[1], 'base64')
    );
  }
  execFileSync(
    python,
    [
      '-c',
      `from PIL import Image
import sys
layers=[Image.open(sys.argv[1]+'/'+str(i)+'.png').getchannel('R') for i in range(1,4)]
Image.merge('RGB',layers).save('public/filament/depth.webp',lossless=True,method=6)
`,
      temp,
    ],
    { stdio: 'inherit' }
  );
  console.log(
    'Baked front, middle and rear fibre illumination into a packed 2400 px depth field.'
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
