import { chromium } from 'playwright';
import { createServer } from 'vite';

const fixture = {
  name: 'nereid-poster-fixture',
  configureServer(server) {
    server.middlewares.use('/__nereid-poster', (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html><body style="margin:0"><div style="width:900px;height:1200px"><canvas style="width:100%;height:100%"></canvas></div><button id="save">Save</button><script type="module">
      import { NereidExperience } from '/src/vanilla-three/experiences/nereid/NereidExperience.ts';
      const canvas = document.querySelector('canvas');
      const experience = new NereidExperience(canvas, () => {});
      await experience.init();
      canvas.dataset.ready = 'true';
      document.querySelector('#save').onclick = () => experience.saveStill();
      addEventListener('pagehide', () => experience.dispose(), {once:true});
    </script></body></html>`);
    });
  },
};
const server = await createServer({
  cacheDir: 'node_modules/.cache/nereid-poster',
  plugins: [fixture],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
try {
  const { getStudy } = await server.ssrLoadModule(
    '/src/features/lab/registry.ts'
  );
  const study = getStudy('nereid');
  await server.listen();
  await server.watcher.close();
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal'],
  });
  const page = await browser.newPage({
    viewport: { width: 900, height: 1250 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__nereid-poster`,
    { waitUntil: 'domcontentloaded', timeout: 90000 }
  );
  await page.locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await (await download).saveAs(`public${study.encounterPoster}`);
  console.log(`Saved clean Nereid specimen to public${study.encounterPoster}`);
} finally {
  await browser?.close();
  await server.close();
}
