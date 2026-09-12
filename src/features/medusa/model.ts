import { DEFAULT_SETTINGS, type MedusaSettings } from './settings';
/** Procedural anatomy; independent of the rendering backend. */
export const NODES = 49;
export const CHAINS = 24;
export const STEP = 1 / 120;
export const TAU = Math.PI * 2;
export const GROWTH_END = 5;

export function randomStream(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function pulse(time: number) {
  const phase = (((time * 0.28) % 1) + 1) % 1;
  if (phase < 0.22) return 0.5 - 0.5 * Math.cos((Math.PI * phase) / 0.22);
  if (phase < 0.8)
    return 0.5 + 0.5 * Math.cos((Math.PI * (phase - 0.22)) / 0.58);
  return 0;
}

export interface Anatomy {
  seed: number;
  width: number;
  dome: number;
  lobes: number;
  settings: MedusaSettings;
  lengths: Float32Array;
  angles: Float32Array;
}

export function createAnatomy(
  seed: number,
  settings: MedusaSettings = DEFAULT_SETTINGS
): Anatomy {
  const random = randomStream(seed);
  return {
    seed,
    settings: { ...settings },
    width: (2.05 + random() * 0.35) * settings.width,
    dome: (1.18 + random() * 0.32) * settings.dome,
    lobes: settings.lobes + Math.floor(random() * 3) - 1,
    lengths: Float32Array.from({ length: CHAINS }, (_, i) =>
      i < 4
        ? (4.0 + random() * 0.85) * settings.armLength
        : (4.9 + random() * 1.35) * settings.tentacleLength
    ),
    angles: Float32Array.from({ length: CHAINS }, (_, i) =>
      i < 4
        ? (i / Math.max(1, settings.arms)) * TAU + 0.3
        : ((i - 4) / Math.max(1, settings.tentacles)) * TAU + 0.05 * random()
    ),
  };
}

export function bellPoint(
  out: Float32Array,
  offset: number,
  theta: number,
  angle: number,
  anatomy: Anatomy,
  time: number,
  amplitude = 1,
  suspension = anatomy.settings.suspension
) {
  const contraction = pulse(time - theta * 0.2) * amplitude;
  const rim = Math.pow(Math.sin(theta), 6);
  const radius =
    anatomy.width *
    Math.sin(theta) *
    (1 - contraction * 0.24) *
    (1 + rim * Math.cos(angle * anatomy.lobes) * anatomy.settings.scallop);
  out[offset] = Math.cos(angle) * radius;
  out[offset + 1] =
    1.35 +
    Math.sin(time * 0.28 * TAU - 0.6) * suspension * 0.25 +
    anatomy.dome * Math.cos(theta) +
    contraction * 0.3 * rim +
    Math.sin(angle * anatomy.lobes) * rim * anatomy.settings.scallop;
  out[offset + 2] = Math.sin(angle) * radius;
}

/** Inertial chains with moving bell anchors and fixed-length constraints. */
export class MedusaMotion {
  readonly positions = new Float32Array(CHAINS * NODES * 4);
  private previous = new Float32Array(CHAINS * NODES * 4);
  private scratch = new Float32Array(3);
  private accumulator = 0;
  time = 0;
  current = 0.12;
  pulseAmount = 1;
  impulse = 0;
  turbulence = 1;
  drag = 2.5;
  suspension: number;

  readonly anatomy: Anatomy;

  constructor(anatomy: Anatomy) {
    this.anatomy = anatomy;
    this.suspension = anatomy.settings.suspension;
    for (let chain = 0; chain < CHAINS; chain++) {
      const angle = anatomy.angles[chain];
      bellPoint(this.scratch, 0, chain < 4 ? 0.4 : 1.53, angle, anatomy, 0);
      for (let j = 0; j < NODES; j++) {
        const k = (chain * NODES + j) * 4;
        const u = j / (NODES - 1);
        this.positions[k] = this.scratch[0] + Math.sin(u * 4 + angle) * u * 0.7;
        this.positions[k + 1] = this.scratch[1] - u * anatomy.lengths[chain];
        this.positions[k + 2] =
          this.scratch[2] + Math.cos(u * 4 + angle) * u * 0.7;
        this.positions[k + 3] = 1;
      }
    }
    this.previous.set(this.positions);
  }

  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.accumulator += Math.min(seconds, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      this.tick();
      this.accumulator -= STEP;
    }
  }

  private tick() {
    this.time += STEP;
    this.impulse *= Math.exp(-STEP * 1.2);
    const p = this.positions;
    const previous = this.previous;
    const drag = Math.exp(-STEP * this.drag);
    for (let chain = 0; chain < CHAINS; chain++) {
      const angle = this.anatomy.angles[chain];
      const base = chain * NODES * 4;
      const length = this.anatomy.lengths[chain] / (NODES - 1);
      bellPoint(
        this.scratch,
        0,
        chain < 4 ? 0.4 : 1.53,
        angle,
        this.anatomy,
        this.time,
        this.pulseAmount,
        this.suspension
      );
      for (let j = 0; j < 2; j++) {
        const k = base + j * 4;
        p[k] = this.scratch[0] + Math.cos(angle) * j * length * 0.25;
        p[k + 1] = this.scratch[1] - j * length * 0.968;
        p[k + 2] = this.scratch[2] + Math.sin(angle) * j * length * 0.25;
        previous[k] = p[k];
        previous[k + 1] = p[k + 1];
        previous[k + 2] = p[k + 2];
      }
      for (let j = 2; j < NODES; j++) {
        const k = base + j * 4;
        const u = j / (NODES - 1);
        const sway = Math.sin(this.time * 0.62 - u * 4 + angle * 0.5);
        const forceX =
          (this.current + this.impulse) * 2.8 + sway * 0.55 * this.turbulence;
        const forceZ =
          Math.cos(this.time * 0.48 - u * 3 + angle) * 0.4 * this.turbulence;
        for (let axis = 0; axis < 3; axis++) {
          const old = p[k + axis];
          p[k + axis] +=
            (old - previous[k + axis]) * drag +
            (axis === 0 ? forceX : axis === 1 ? -0.65 : forceZ) * STEP * STEP;
          previous[k + axis] = old;
        }
      }
      for (let iteration = 0; iteration < 10; iteration++) {
        for (let j = 2; j < NODES; j++) {
          const k = base + j * 4;
          const before = k - 4;
          const dx = p[k] - p[before];
          const dy = p[k + 1] - p[before + 1];
          const dz = p[k + 2] - p[before + 2];
          const distance = Math.max(1e-8, Math.hypot(dx, dy, dz));
          const correction = (distance - length) / distance;
          const weight = j === 2 ? 1 : 0.5;
          p[k] -= dx * correction * weight;
          p[k + 1] -= dy * correction * weight;
          p[k + 2] -= dz * correction * weight;
          if (j > 2) {
            p[before] += dx * correction * 0.5;
            p[before + 1] += dy * correction * 0.5;
            p[before + 2] += dz * correction * 0.5;
          }
        }
      }
    }
  }
}

export interface PaintSamples {
  binding: Float32Array;
  shape: Float32Array;
  pigment: Float32Array;
  growth: Float32Array;
  count: number;
}

/** Stable anatomical coordinates keep each mark attached while the animal swims. */
export function createPaintSamples(anatomy: Anatomy): PaintSamples {
  const random = randomStream(anatomy.seed ^ 0x532a);
  const { density, arms, tentacles } = anatomy.settings;
  const binding: number[] = [];
  const shape: number[] = [];
  const pigment: number[] = [];
  const growth: number[] = [];
  const add = (
    kind: number,
    u: number,
    v: number,
    w: number,
    width: number,
    height: number,
    angle: number,
    tone: number
  ) => {
    binding.push(kind, u, v, w);
    // Each family is a mark construction, not a mask stretched over oil dabs.
    const style = anatomy.settings.brushStyle;
    let x = width,
      y = height;
    if (style === 1) {
      x = width * 0.8;
      y = Math.max(height * 1.6, x * 0.65);
    }
    if (style === 2) {
      x = Math.sqrt(width * height) * 0.5;
      y = x;
    }
    if (style === 3) {
      x = width * 1.3;
      y = height * 0.85;
    }
    shape.push(x, y, angle, Math.floor(random() * 4));
    pigment.push(tone, random(), random(), random());
    // A spatial birth field, shared by neighbouring marks: crown → margin →
    // folded arms → filament tips. Never a random full-object dissolve.
    const ripple = (Math.sin(v * 3 + u * 7) + 1) * 0.055;
    const birth =
      kind === 0
        ? Math.max(0, (u / 1.65) * 1.65 + ripple + tone * 0.07 - 0.05)
        : kind === 1
          ? 1.0 + Math.pow(u, 0.85) * 2.15 + v * 0.065 + ripple
          : 1.65 + u * 2.45 + (v - 4) * 0.014 + ripple;
    growth.push(birth, kind === 2 ? 0.3 : 0.44);
  };
  const stipple = anatomy.settings.brushStyle === 2;
  if (stipple) {
    const count = Math.round(340 * density) * 26;
    for (let i = 0; i < count; i++) {
      const theta = Math.acos(1 - ((i + 0.5) / count) * 1.025);
      const angle = i * 2.399963229728653;
      add(0, theta, angle, 0.006, 0.13, 0.05, 0, random());
    }
  } else {
    // Distribute whole loaded strokes evenly, then lay overlapping dabs along
    // each track. Independent evenly spaced dots read as stipple instead of oil.
    const budget = Math.round(340 * density);
    const tracks = Math.floor(budget * 0.75);
    const foundation = (budget - tracks) * 26;
    // A recessed layer of broad paint closes gaps revealed by an oblique view.
    // It shares the anatomy and pigments, rather than introducing a plastic mesh.
    for (let i = 0; i < foundation; i++) {
      const theta = Math.acos(1 - ((i + 0.5) / foundation) * 1.025);
      const angle = i * 2.399963229728653;
      add(0, theta, angle, -0.025, 0.16, 0.1, angle, 0.5);
    }
    for (let track = 0; track < tracks; track++) {
      const theta = Math.acos(1 - ((track + 0.5) / tracks) * 0.99);
      const angle = track * 2.399963229728653;
      const tone = random();
      const width = 0.12 + random() * 0.07;
      const height = 0.044 + random() * 0.024;
      for (let j = 0; j < 26; j++) {
        const along = (j / 25 - 0.5) * 0.18;
        add(
          0,
          Math.max(0.005, Math.min(1.61, theta + along)),
          angle + Math.sin(along * 5 + angle) * 0.025,
          0.006 + tone * 0.012,
          width,
          height,
          angle,
          tone
        );
      }
    }
  }
  for (let j = 0; j < Math.round(1800 * density); j++) {
    const angle = random() * TAU;
    add(
      0,
      1.48 + random() * 0.16,
      angle,
      0.01 + random() * 0.005,
      0.065 + random() * 0.04,
      0.024 + random() * 0.018,
      angle + Math.PI / 2,
      0.72 + random() * 0.28
    );
  }
  for (let chain = 0; chain < arms; chain++) {
    for (let j = 0; j < Math.round((stipple ? 1400 : 3600) * density); j++) {
      const u = random();
      const across = random() * 2 - 1;
      add(
        1,
        u,
        chain,
        across,
        0.06 + random() * 0.055,
        0.026 + random() * 0.025,
        random() * 0.6,
        0.2 + random() * 0.8
      );
    }
  }
  for (let chain = 4; chain < 4 + tentacles; chain++) {
    const tone = random();
    for (let j = 0; j < Math.round((stipple ? 180 : 540) * density); j++) {
      const u = j / Math.round((stipple ? 180 : 540) * density);
      add(
        2,
        u,
        chain,
        (random() - 0.5) * 0.006,
        (stipple ? 0.05 : 0.03 + random() * 0.055) * (1 - u * 0.5),
        (stipple ? 0.04 : 0.01 + random() * 0.015) * (1 - u * 0.65),
        0,
        tone
      );
    }
  }
  return {
    binding: new Float32Array(binding),
    shape: new Float32Array(shape),
    pigment: new Float32Array(pigment),
    growth: new Float32Array(growth),
    count: binding.length / 4,
  };
}
