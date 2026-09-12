import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer } from 'vite';

// Load the shared TypeScript models on every supported Node version.
const server = await createServer({
  configFile: false,
  root: new URL('../..', import.meta.url).pathname,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
});
let studies, pointerWeight;
try {
  ({ studies } = await server.ssrLoadModule('/src/features/lab/registry.ts'));
  ({ pointerWeight } = await server.ssrLoadModule(
    '/src/features/pixel-flow/pointerWeight.ts'
  ));
} finally {
  await server.close();
}

const ink = '#191815',
  paper = '#f7f6f3',
  orange = '#ff3600';
const frame = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="${paper}"/><g fill="none" stroke="${ink}" stroke-opacity=".16"><path d="M100 100H1100V1100H100Z M600 80V1120 M80 600H1120"/></g>${body}<g fill="${ink}" font-family="monospace" font-size="18"><text x="100" y="62">${label}</text><text x="100" y="1154">PREPARED CONSTRUCTION / STATIC STUDY</text></g></svg>`;

function pointerField() {
  const size = 100;
  const vectors = new Float32Array(size * size * 2);
  let previous = { x: 20, y: 76 };
  const trail = [];
  // An isolated demonstration of the production kernel, without the image or idle controller.
  for (let step = 0; step <= 90; step++) {
    const t = step / 90;
    const point = {
      x: 20 + t * 60,
      y: 76 - t * 45 - Math.sin(t * Math.PI * 2) * 17,
    };
    trail.push(`${100 + point.x * 10},${100 + point.y * 10}`);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 2;
        const weight = pointerWeight(
          (x - point.x) ** 2 + (y - point.y) ** 2,
          16
        );
        vectors[i] = vectors[i] * 0.9 + 0.3 * (point.x - previous.x) * weight;
        vectors[i + 1] =
          vectors[i + 1] * 0.9 + 0.3 * (point.y - previous.y) * weight;
      }
    previous = point;
  }
  let drawing = '';
  for (let y = 2; y < size; y += 3)
    for (let x = 2; x < size; x += 3) {
      const i = (y * size + x) * 2,
        dx = vectors[i],
        dy = vectors[i + 1];
      const length = Math.hypot(dx, dy);
      const px = 100 + x * 10,
        py = 100 + y * 10;
      drawing += `<circle cx="${px}" cy="${py}" r="1.5" fill="${ink}" opacity=".22"/>`;
      if (length < 0.04) continue;
      const scale = Math.min(24, length * 6),
        ux = dx / length,
        uy = dy / length;
      const ex = px + ux * scale,
        ey = py + uy * scale;
      drawing += `<path d="M${px} ${py}L${ex.toFixed(2)} ${ey.toFixed(2)}m${(-ux * 4 - uy * 3).toFixed(2)} ${(-uy * 4 + ux * 3).toFixed(2)}L${ex.toFixed(2)} ${ey.toFixed(2)}l${(-ux * 4 + uy * 3).toFixed(2)} ${(-uy * 4 - ux * 3).toFixed(2)}" fill="none" stroke="${ink}" stroke-width="1.8"/>`;
    }
  drawing += `<polyline points="${trail.join(' ')}" fill="none" stroke="${orange}" stroke-width="3" stroke-dasharray="5 8"/><circle cx="900" cy="410" r="160" fill="none" stroke="${orange}" stroke-width="2"/><circle cx="900" cy="410" r="8" fill="${orange}"/>`;
  return frame(drawing, 'DISPLACEMENT / POINTER TRAIL');
}

// CPU reference of bulb() in mandelbulb.frag.glsl: power 8, eight steps,
// no livingCoordinates warp. This is a section of the rule, not a live capture.
function bulbDistance(px, py, pz) {
  let x = px,
    y = py,
    z = pz,
    derivative = 1,
    estimate = 0,
    trap = 1;
  for (let i = 0; i < 8; i++) {
    const r = Math.hypot(x, y, z);
    if (r > 2.4) break;
    if (r < 0.000001) return { distance: 0, trap: 0 };
    trap = Math.min(trap, r);
    const theta = Math.acos(Math.max(-1, Math.min(1, z / r))) * 8;
    const phi = Math.atan2(y, x) * 8;
    const radial = r ** 7;
    derivative = radial * 8 * derivative + 1;
    x = radial * r * Math.sin(theta) * Math.cos(phi) + px;
    y = radial * r * Math.sin(theta) * Math.sin(phi) + py;
    z = radial * r * Math.cos(theta) + pz;
    const next = Math.max(Math.hypot(x, y, z), 0.000001);
    estimate = Math.max(
      (0.5 * Math.log(next) * next) / Math.max(derivative, 0.000001),
      0
    );
  }
  return { distance: estimate, trap };
}

function bulbSection() {
  const size = 440,
    cell = 1000 / size;
  let body = '',
    contour = '',
    interior = '';
  for (let y = 0; y < size; y++) {
    let runStart = -1;
    for (let x = 0; x <= size; x++) {
      const sample =
        x < size
          ? bulbDistance((x / size - 0.5) * 2.7, (0.5 - y / size) * 2.7, 0.15)
          : { distance: 1, trap: 0 };
      const d = sample.distance;
      if (d < 0.0018 && runStart < 0) runStart = x;
      if (d >= 0.0018 && runStart >= 0) {
        body += `M${(100 + runStart * cell).toFixed(2)} ${(100 + y * cell).toFixed(2)}h${((x - runStart) * cell).toFixed(2)}v${cell.toFixed(2)}h-${((x - runStart) * cell).toFixed(2)}Z`;
        runStart = -1;
      }
      if (d > 0.027 && d < 0.03)
        contour += `M${(100 + x * cell).toFixed(2)} ${(100 + y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}Z`;
      if (d < 0.0018 && Math.abs(((sample.trap * 42) % 1) - 0.5) < 0.08)
        interior += `M${(100 + x * cell).toFixed(2)} ${(100 + y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}Z`;
    }
  }
  return frame(
    `<path d="${body}" fill="${ink}" opacity=".10"/><path d="${interior}" fill="${ink}"/><path d="${contour}" fill="${orange}"/>`,
    'SECTION / Z +0.15 / POWER 8'
  );
}

for (const study of studies) {
  if (!study.construction) continue;
  const path = new URL(
    `../../public${study.construction.image}`,
    import.meta.url
  );
  await mkdir(dirname(path.pathname), { recursive: true });
  await writeFile(
    path,
    study.construction.kind === 'pointer-field' ? pointerField() : bulbSection()
  );
  console.log(`Generated ${study.construction.image}`);
}
