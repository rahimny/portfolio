import { createNoise3D } from 'simplex-noise';

export type Vec3 = [number, number, number];
export interface FilamentModel {
  positions: Float32Array;
  light: Float32Array;
  points: Float32Array;
  pointLight: Float32Array;
  segments: number;
  network: Float32Array;
}
export const FILAMENT_SEED = 520589;
const TAU = Math.PI * 2;
export function randomSequence(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const normalise = (p: Vec3): Vec3 => {
  const length = Math.hypot(...p) || 1;
  return p.map((v) => v / length) as Vec3;
};

// Composition landmarks are measured in the supplied 1024 px reference.
// They constrain the envelope; every individual fibre is generated from a seed.
export const COLONIES = [
  [503, 104, 111, 75, 65, 1.08],
  [526, 180, 79, 89, 90, 1.04],
  [231, 209, 75, 73, 70, 1.0],
  [153, 310, 66, 65, 48, 0.72],
  [121, 398, 79, 86, 68, 0.9],
  [143, 582, 116, 98, 55, 0.52],
  [212, 755, 59, 68, 50, 0.74],
  [271, 836, 128, 87, 67, 0.85],
  [531, 883, 99, 97, 75, 0.68],
  [675, 870, 89, 79, 66, 0.58],
  [838, 731, 81, 81, 55, 0.49],
  [869, 631, 72, 66, 51, 0.69],
  [898, 480, 87, 92, 59, 0.44],
  [789, 225, 96, 91, 70, 0.79],
  [751, 154, 63, 51, 45, 0.69],
  [359, 158, 35, 34, 32, 1.17],
  [434, 249, 39, 43, 36, 1.1],
  [626, 296, 29, 28, 27, 1.04],
  [933, 378, 28, 29, 26, 1.05],
  [770, 546, 27, 26, 24, 0.68],
  [962, 548, 26, 25, 23, 0.64],
  [550, 816, 24, 24, 22, 0.94],
] as const;
const ANCHORS = [
  [511, 166, 48],
  [450, 263, 30],
  [270, 249, 26],
  [211, 308, 29],
  [191, 413, 29],
  [184, 568, 15],
  [280, 768, 32],
  [543, 805, 17],
  [807, 743, 12],
  [840, 630, 18],
  [833, 493, 16],
  [914, 392, 14],
  [752, 275, 38],
  [710, 389, 19],
  [574, 336, 17],
] as const;

export function buildFilament(seed = FILAMENT_SEED): FilamentModel {
  const random = randomSequence(seed);
  const noise = createNoise3D(random);
  const positions: number[] = [],
    light: number[] = [];
  const network: number[] = [];
  let captureNetwork = false;
  const points: number[] = [],
    pointLight: number[] = [];
  const sphere = (): Vec3 => {
    const z = random() * 2 - 1,
      angle = random() * TAU;
    const r = Math.sqrt(1 - z * z);
    return [Math.cos(angle) * r, Math.sin(angle) * r, z];
  };
  const confine = (p: Vec3): Vec3 => {
    const r = Math.hypot(p[0] - 512, p[1] - 512);
    if (r <= 482) return p;
    const scale = 482 / r;
    return [512 + (p[0] - 512) * scale, 512 + (p[1] - 512) * scale, p[2]];
  };
  const line = (a: Vec3, b: Vec3, strength: number) => {
    const start = confine(a),
      end = confine(b);
    positions.push(...start, ...end);
    if (captureNetwork) network.push(start[0], start[1], end[0], end[1]);
    light.push(strength, strength);
  };
  const turbulence = (p: Vec3, offset: number) =>
    noise(p[0] * 3.1 + offset, p[1] * 3.1, p[2] * 3.1) * 0.55 +
    noise(p[0] * 8.2, p[1] * 8.2 + offset, p[2] * 8.2) * 0.27 +
    noise(p[0] * 21.3, p[1] * 21.3, p[2] * 21.3 + offset) * 0.12;

  // Local neighbours in the undeformed domain stay connected as the surface
  // folds. This retains fine angular cells instead of drawing a noisy texture.
  const surface = (
    count: number,
    map: (p: Vec3) => Vec3,
    brightness: number,
    neighbours = 5,
    pointDensity = 0.6,
    volume = false
  ) => {
    captureNetwork = count >= 250 && count <= 2000;
    const domain: Vec3[] = [],
      mapped: Vec3[] = [];
    const cell =
      (volume
        ? Math.cbrt((4 * Math.PI) / 3 / count)
        : Math.sqrt((4 * Math.PI) / count)) * 1.65;
    const bins = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let i = 0; i < count; i++) {
      const p = sphere();
      if (volume) {
        const r = Math.cbrt(random());
        p[0] *= r;
        p[1] *= r;
        p[2] *= r;
      }
      domain.push(p);
      const v = map(p);
      mapped.push(v);
      const k = key(...(p.map((n) => Math.floor(n / cell)) as Vec3));
      const bin = bins.get(k);
      if (bin) bin.push(i);
      else bins.set(k, [i]);
      if (random() < pointDensity) {
        points.push(...confine(v));
        pointLight.push(brightness * (0.25 + random() * 0.7));
      }
    }
    for (let i = 0; i < count; i++) {
      const p = domain[i];
      const [x, y, z] = p.map((n) => Math.floor(n / cell));
      const candidates: { j: number; d: number }[] = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of bins.get(key(x + dx, y + dy, z + dz)) ?? []) {
              if (j === i) continue;
              const q = domain[j];
              const d =
                (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
              candidates.push({ j, d });
            }
      candidates.sort((a, b) => a.d - b.d);
      for (const { j } of candidates.slice(0, neighbours)) {
        if (j < i) continue;
        const facing =
          0.48 + 0.52 * Math.max(0, p[2] * 0.6 - p[1] * 0.65 - p[0] * 0.3);
        line(
          mapped[i],
          mapped[j],
          brightness * facing * (0.55 + random() * 0.8)
        );
      }
    }
    captureNetwork = false;
  };

  const rosette = (
    centre: Vec3,
    radius: number,
    brightness: number,
    stretch = 1
  ) => {
    captureNetwork = false;
    const strands = 100,
      steps = 7;
    const bend = (random() - 0.5) * radius * 0.45;
    const ring: Vec3[][] = [];
    for (let j = 0; j < strands; j++) {
      const theta = random() * TAU;
      const reach = radius * (0.5 + random() * 0.5);
      const path: Vec3[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const r = reach * Math.pow(t, 1.8);
        const p: Vec3 = [
          centre[0] + Math.cos(theta) * r + Math.sin(t * Math.PI) * bend,
          centre[1] + Math.sin(theta) * r * stretch,
          centre[2] - t * radius * 0.8,
        ];
        path.push(p);
        if (k > 0) line(path[k - 1], p, brightness * (1 - t * 0.5));
      }
      ring.push(path);
    }
    for (let j = 0; j < strands; j++)
      for (let k = 3; k < steps; k++) {
        const other = Math.floor(random() * strands);
        if (
          Math.hypot(
            ring[j][k][0] - ring[other][k][0],
            ring[j][k][1] - ring[other][k][1]
          ) <
          radius * 0.35
        )
          line(
            ring[j][k],
            ring[other][Math.min(k + 1, steps)],
            brightness * 0.6
          );
      }
  };
  // A sparse spherical cage is visible mainly in the otherwise empty gaps.
  surface(
    3800,
    (p) => [512 + p[0] * 482, 512 + p[1] * 482, p[2] * 150 - 180],
    0.14,
    4,
    0
  );

  surface(
    620,
    (p) => [512 + p[0] * 480, 512 + p[1] * 480, p[2] * 200],
    0.09,
    3,
    0
  );

  COLONIES.forEach(([cx, cy, rx, ry, rz, brightness], index) => {
    const offset = index * 13.37;
    const lobes = Array.from({ length: 30 }, () => ({
      p: sphere(),
      amount: random() * 0.16,
    }));
    const map = (input: Vec3): Vec3 => {
      let nearest = lobes[0].p,
        best = -2;
      for (const lobe of lobes) {
        const dot =
          input[0] * lobe.p[0] + input[1] * lobe.p[1] + input[2] * lobe.p[2];
        if (dot > best) {
          best = dot;
          nearest = lobe.p;
        }
      }
      const pull = Math.exp((best - 1) * 12) * 0.32;
      const p = normalise(
        input.map((v, i) => mix(v, nearest[i], pull)) as Vec3
      );
      const folded = rx > 50 && index !== 2;
      let radius =
        (folded ? 0.82 : 0.94) + turbulence(p, offset) * (folded ? 0.3 : 0.07);
      if (folded)
        radius +=
          Math.pow(
            Math.max(0, noise(p[0] * 2 + offset, p[1] * 2, p[2] * 2)),
            2
          ) * 0.25;
      for (const lobe of lobes) {
        const dot = p[0] * lobe.p[0] + p[1] * lobe.p[1] + p[2] * lobe.p[2];
        radius += lobe.amount * Math.exp((dot - 1) * 22);
      }
      const warp = turbulence([p[1], p[2], p[0]], offset + 8);
      return [
        cx + rx * (p[0] * radius + warp * 0.06),
        cy + ry * (p[1] * radius + warp * 0.045),
        p[2] * rz * radius + 40,
      ];
    };
    const count = Math.round(Math.max(1200, rx * ry * 0.95));
    surface(count, map, brightness * 0.13, 6);
    if (rx > 50) {
      surface(
        Math.round(count * 0.75),
        (p) => {
          const v = map(p);
          const r = 0.74 + 0.16 * noise(p[0] * 5 + offset, p[1] * 5, p[2] * 5);
          return [cx + (v[0] - cx) * r, cy + (v[1] - cy) * r, v[2] * r + 30];
        },
        brightness * 0.075,
        5,
        0.8
      );
    }
    surface(Math.round(count * 0.12), map, brightness * 0.24, 6, 0.1);
    for (let j = 0; j < count * 0.9; j++) {
      const p = sphere(),
        q = normalise([
          p[0] + (random() - 0.5) * 0.75,
          p[1] + (random() - 0.5) * 0.75,
          p[2] + (random() - 0.5) * 0.75,
        ]);
      const scale = 0.4 + Math.pow(random(), 0.3) * 0.6;
      const a = map(p),
        b = map(q);
      const inner = (v: Vec3): Vec3 => [
        cx + (v[0] - cx) * scale,
        cy + (v[1] - cy) * scale,
        v[2] * scale,
      ];
      line(inner(a), inner(b), brightness * 0.08);
    }
    for (let j = 0; j < (rx > 50 ? 28 : 5); j++) {
      const direction = sphere();
      const centre = map(direction);
      rosette(
        centre,
        rx * (0.045 + Math.pow(random(), 2) * 0.28),
        brightness * 0.08
      );
    }
    // Small nested surface colonies enrich the largest lobes at a second scale.
    if (rx > 50)
      for (let j = 0; j < 12; j++) {
        const direction = sphere();
        const centre = map(direction);
        const radius = rx * (0.09 + random() * 0.17);
        surface(
          190,
          (p) => {
            const r = radius * (0.9 + turbulence(p, offset + j) * 0.2);
            return [
              centre[0] + p[0] * r,
              centre[1] + p[1] * r,
              centre[2] + p[2] * r,
            ];
          },
          brightness * 0.18,
          5,
          0.6
        );
      }
  });

  const extraSpikes = Array.from({ length: 32 }, () => sphere());
  const profile = [
    [733, 510],
    [715, 556],
    [713, 612],
    [675, 630],
    [645, 685],
    [612, 668],
    [569, 727],
    [540, 681],
    [500, 714],
    [463, 665],
    [421, 646],
    [373, 665],
    [345, 629],
    [299, 600],
    [319, 558],
    [301, 526],
    [312, 475],
    [343, 462],
    [325, 417],
    [365, 392],
    [367, 357],
    [395, 365],
    [429, 329],
    [478, 322],
    [512, 345],
    [560, 316],
    [591, 336],
    [618, 368],
    [668, 358],
    [662, 396],
    [695, 414],
    [680, 449],
    [714, 463],
  ]
    .map(([x, y]) => ({
      angle: (Math.atan2(y - 520, x - 511) + TAU) % TAU,
      radius: Math.hypot(x - 511, y - 520),
    }))
    .sort((a, b) => a.angle - b.angle);
  const radiusAt = (angle: number) => {
    let i = profile.findIndex((p) => p.angle > angle);
    if (i < 0) i = 0;
    const b = profile[i],
      a = profile[(i + profile.length - 1) % profile.length];
    const span = (b.angle - a.angle + TAU) % TAU;
    let t = ((angle - a.angle + TAU) % TAU) / span;
    t = t * t * (3 - 2 * t);
    return mix(a.radius, b.radius, t);
  };
  const coreMap = (p: Vec3): Vec3 => {
    const angle = (Math.atan2(p[1], p[0]) + TAU) % TAU;
    const radius = radiusAt(angle) + turbulence(p, 3.8) * 12;
    return [511 + p[0] * radius, 520 + p[1] * radius, p[2] * 145 + 30];
  };
  surface(29000, coreMap, 0.14, 6, 0.4);
  surface(
    66000,
    (p) => {
      const radius = Math.hypot(...p);
      const v = coreMap(normalise(p));
      return [
        511 + (v[0] - 511) * radius,
        520 + (v[1] - 520) * radius,
        v[2] * radius,
      ];
    },
    0.056,
    6,
    0.7,
    true
  );
  surface(290, coreMap, 0.48, 6, 0.8);

  for (const direction of extraSpikes) {
    if (direction[2] < -0.25) continue;
    const centre = coreMap(direction);
    rosette(centre, 25 + random() * 37, 0.065, 0.8 + random() * 0.5);
  }

  // Draw ruled, pinched sheets: hundreds of fibres leave a wide patch on the
  // core, collect at a colony, then open into its hollow shell.
  ANCHORS.forEach(([ax, ay, endWidth], index) => {
    const dx = ax - 511,
      dy = ay - 520,
      length = Math.hypot(dx, dy);
    const ux = dx / length,
      uy = dy / length,
      vx = -uy,
      vy = ux;
    if (length < 165) return;
    const strands = 240;
    const paths: Vec3[][] = [];
    for (let j = 0; j < strands; j++) {
      captureNetwork = j % 24 === 0;
      const start = 135 + random() * 40,
        distance = length - start;
      const angle = random() * TAU,
        shell = 0.6 + random() * 0.4;
      const phi = random() * TAU,
        width = 60 + random() * 37;
      const path: Vec3[] = [];
      for (let k = 0; k <= 27; k++) {
        const t = k / 27;
        const radius =
          (width * Math.pow(1 - t, 2.1) + endWidth * Math.pow(t, 15) + 0.5) *
          shell;
        const bend = Math.sin(t * Math.PI) * (index % 2 ? 8 : -8);
        const rough = Math.sin(t * 16 + phi) * Math.sin(t * Math.PI) * 0.9;
        const across = Math.cos(angle) * radius + bend + rough;
        const p: Vec3 = [
          511 + ux * (start + t * distance) + vx * across,
          520 + uy * (start + t * distance) + vy * across,
          Math.sin(angle) * radius + mix(55, 115, t),
        ];
        path.push(p);
        if (k > 0)
          line(
            path[k - 1],
            p,
            (0.023 + random() * 0.016) * (ay < 400 ? 1.4 : 1)
          );
      }
      paths.push(path);
      if (index !== 13 && index !== 14) {
        const tip = path[path.length - 1];
        const a = random() * TAU;
        const l = (25 + random() * 65) * (endWidth / 30);
        const end: Vec3 = [
          ax + Math.cos(a) * l,
          ay + Math.sin(a) * l,
          tip[2] + (random() - 0.5) * 50,
        ];
        line(tip, end, 0.045 + random() * 0.1);
      }
    }
    captureNetwork = false;
    for (let j = 0; j < strands; j++) {
      const other = Math.floor(random() * strands);
      for (let k = 0; k < 27; k += 3)
        if (random() < 0.5)
          line(paths[j][k], paths[other][Math.min(27, k + 1)], 0.033);
    }
  });
  return {
    positions: new Float32Array(positions),
    light: new Float32Array(light),
    points: new Float32Array(points),
    pointLight: new Float32Array(pointLight),
    segments: light.length / 2,
    network: new Float32Array(network),
  };
}
