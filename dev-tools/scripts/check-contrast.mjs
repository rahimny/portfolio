import { chromium } from 'playwright';
import { createServer } from 'vite';

// [foreground token, background token, label, minimum]
//
// Check each plate ground against the text tokens used on it.
const PAIRS = [
  ['--fg', '--bg', 'body text on paper', 4.5],
  ['--fg', '--surface', 'body text on white', 4.5],
  ['--fg-muted', '--bg', 'muted text on paper', 4.5],
  ['--fg-muted', '--surface', 'muted text on white', 4.5],
  ['--fg-muted', '--surface-2', 'muted text on sunken', 4.5],
  ['--fg-subtle', '--bg', 'subtle text on paper', 4.5],
  ['--fg-subtle', '--surface-2', 'subtle text on sunken', 4.5],
  ['--brand-ink', '--bg', 'orange text on paper', 4.5],
  ['--brand-ink', '--surface', 'orange text on white', 4.5],
  ['--brand-ink', '--surface-2', 'orange text on sunken', 4.5],
  ['--on-brand', '--brand', 'ink on the orange plate', 4.5],
  ['--on-ink', '--ink', 'paper on the ink plate', 4.5],
  ['--on-ink-muted', '--ink', 'muted paper on the ink plate', 4.5],
  ['--on-brand-muted', '--brand', 'muted text on the orange plate', 4.5],
  ['--brand', '--ink', 'orange on the ink plate', 4.5],
  ['--status-live', '--status-live-bg', 'live tag', 4.5],
  ['--status-wip', '--status-wip-bg', 'wip tag', 4.5],
  ['--on-danger', '--danger', 'text on danger', 4.5],
  ['--border-strong', '--bg', 'strong border', 3.0],
];

let vite;
let base = process.env.CONTRAST_BASE;

if (!base) {
  vite = await createServer({
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Vite did not expose a local HTTP port');
  }
  base = `http://127.0.0.1:${address.port}`;
}

const browser = await chromium.launch();
let failures = 0;

const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${base}/style-guide`, {
  waitUntil: 'networkidle',
});

const results = await page.evaluate((pairs) => {
  // Resolve any CSS colour (incl. oklch) to sRGB via the canvas
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx2 = cvs.getContext('2d', { willReadFrequently: true });
  const styles = getComputedStyle(document.documentElement);

  function toRGB(token) {
    const raw = styles.getPropertyValue(token).trim();
    ctx2.clearRect(0, 0, 1, 1);
    ctx2.fillStyle = '#000';
    ctx2.fillStyle = raw;
    ctx2.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx2.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  const lum = ([r, g, b]) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  return pairs.map(([fg, bg, label, min]) => {
    const a = lum(toRGB(fg));
    const b = lum(toRGB(bg));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { fg, bg, label, min, ratio: Math.round(ratio * 100) / 100 };
  });
}, PAIRS);

for (const r of results) {
  const ok = r.ratio >= r.min;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(r.ratio).padStart(6)}:1  (min ${r.min})  ${r.label}   ${r.fg} on ${r.bg}`
  );
}
// Rendered-element spot check, resting and hovered. The token-pair table
// above only proves the *tokens* are compliant — it can't catch a component
// that dims text with `opacity-*` instead of a token, or a hover state that
// swaps to the wrong one. This is exactly the shape of the regression that
// motivated it: StudyCard's technique/renderer row measured ~3.7:1 despite
// every token above passing, because it used `opacity-50` on inherited
// colour rather than one of the tokens.
await page.goto(`${base}/experiments`, { waitUntil: 'networkidle' });
const studyCardMeta = page.getByText('Technique', { exact: true }).first();
await studyCardMeta.waitFor({ state: 'visible' });

async function measureRenderedContrast(label) {
  return page.evaluate((label) => {
    const el = [...document.querySelectorAll('dt')].find(
      (e) => e.textContent.trim() === 'Technique'
    );
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1;
    const ctx2 = cvs.getContext('2d', { willReadFrequently: true });
    const toRGB = (raw) => {
      ctx2.clearRect(0, 0, 1, 1);
      ctx2.fillStyle = '#000';
      ctx2.fillStyle = raw;
      ctx2.fillRect(0, 0, 1, 1);
      return [...ctx2.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // Walk up to the first ancestor with a non-transparent background,
    // since the row itself is transparent and inherits the card's fill.
    let bgEl = el;
    let bg = 'rgb(255, 255, 255)';
    while (bgEl) {
      const c = getComputedStyle(bgEl).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        bg = c;
        break;
      }
      bgEl = bgEl.parentElement;
    }
    const fg = getComputedStyle(el).color;
    const a = lum(toRGB(fg));
    const b = lum(toRGB(bg));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { label, fg, bg, ratio: Math.round(ratio * 100) / 100 };
  }, label);
}

const restingResult = await measureRenderedContrast('StudyCard meta (resting)');
await studyCardMeta.hover();
await page.waitForTimeout(350); // let the colour transition settle
const hoverResult = await measureRenderedContrast('StudyCard meta (hover)');

for (const r of [restingResult, hoverResult]) {
  const ok = r.ratio >= 4.5;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(r.ratio).padStart(6)}:1  (min 4.5)  ${r.label}   ${r.fg} on ${r.bg}`
  );
}

await ctx.close();

await browser.close();
await vite?.close();
console.log(`\n${failures === 0 ? 'All pairs pass.' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
