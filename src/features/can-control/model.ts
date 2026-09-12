import { SurfaceField } from '../material-surface/field';
/** Wall metres: origin at bottom left, +x right, +y up, +z towards the can. */
export const WALL = { width: 3.2, height: 2.4 } as const;
export const STEP = 1 / 120;
export const MAX_POINTS = 4096;
export const MAX_STROKES = 32;
export type Point = { x: number; y: number };
export type Path = Point[][];
export type Technique = 'follow' | 'flare';
export type Preset = 'specimen' | 'line' | 'loop' | 'hold' | 'flare';
export type Settings = { distance: number; speed: number; cap: 'fine' | 'fat' };
export const DEFAULT_SETTINGS: Settings = {
  distance: 0.12,
  speed: 0.8,
  cap: 'fine',
};
export type Pose = Point & { distance: number };
export type Motion = { from: Pose; to: Pose; duration: number; valve: number };
export type Stamp = Pose & { mass: number; radius: number };
export type Score = { motions: Motion[]; duration: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function interpolate(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    distance: lerp(a.distance, b.distance, t),
  };
}
export function footprint(distance: number, cap: Settings['cap'] = 'fine') {
  return (
    0.008 +
    Math.max(0.04, Math.min(0.8, distance)) * (cap === 'fine' ? 0.18 : 0.3)
  );
}

export function validatePath(path: Path): void {
  if (!Array.isArray(path) || path.length === 0 || path.length > MAX_STROKES) {
    throw new Error(`Supply between 1 and ${MAX_STROKES} strokes.`);
  }
  let count = 0;
  let length = 0;
  for (const stroke of path) {
    if (!Array.isArray(stroke) || !stroke.length)
      throw new Error('Each stroke needs at least one point.');
    count += stroke.length;
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      if (
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > WALL.width ||
        p.y < 0 ||
        p.y > WALL.height
      ) {
        throw new Error('Keep every path point inside the wall.');
      }
      if (i) length += Math.hypot(p.x - stroke[i - 1].x, p.y - stroke[i - 1].y);
    }
  }
  if (count > MAX_POINTS || length > 40)
    throw new Error('This path is too long. Remove a stroke and try again.');
}

/** Subdivide each edge separately: corner vertices and pen lifts survive. */
export function resample(stroke: Point[], spacing = 0.018): Point[] {
  if (!(spacing > 0) || !Number.isFinite(spacing))
    throw new Error('Spacing must be positive.');
  if (!stroke.length) return [];
  const result = [{ ...stroke[0] }];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1],
      b = stroke[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-8) continue;
    const n = Math.ceil(length / spacing);
    for (let j = 1; j <= n; j++)
      result.push({ x: lerp(a.x, b.x, j / n), y: lerp(a.y, b.y, j / n) });
  }
  return result;
}

function curve(count: number, fn: (t: number) => Point): Point[] {
  return Array.from({ length: count }, (_, i) => fn(i / (count - 1)));
}

export function presetPath(preset: Preset): Path {
  const line = curve(60, (t) => ({
    x: 0.6 + t * 2,
    y: 1.3 + 0.13 * Math.sin(t * Math.PI),
  }));
  const loop = curve(150, (t) => ({
    x: 1.6 + 0.65 * Math.sin(t * Math.PI * 2),
    y: 1.2 + 0.65 * Math.cos(t * Math.PI * 2),
  }));
  const flare = curve(100, (t) => ({
    x: 0.65 + 1.85 * t,
    y: 0.8 + 0.65 * t + 0.15 * Math.sin(t * Math.PI),
  }));
  if (preset === 'line') return [line];
  if (preset === 'loop') return [loop];
  if (preset === 'hold') return [[{ x: 1.6, y: 1.2 }]];
  if (preset === 'flare') return [flare];
  // A calibration composition: four independent gestures, not a signature tag.
  return [
    curve(70, (t) => ({
      x: 0.5 + 1.95 * t,
      y: 1.8 + 0.12 * Math.sin(t * Math.PI),
    })),
    curve(130, (t) => ({
      x: 1.13 + 0.44 * Math.sin(t * 2 * Math.PI),
      y: 1.13 + 0.43 * Math.cos(t * 2 * Math.PI),
    })),
    [{ x: 2.45, y: 0.76 }],
    curve(100, (t) => ({
      x: 0.58 + 1.9 * t,
      y: 0.4 + 0.96 * t + 0.2 * Math.sin(t * Math.PI),
    })),
  ];
}

export function buildScore(
  path: Path,
  settings: Settings,
  technique: Technique = 'follow',
  specimen = false
): Score {
  validatePath(path);
  const { distance, speed, cap } = settings;
  if (
    !Number.isFinite(distance) ||
    distance < 0.04 ||
    distance > 0.8 ||
    !Number.isFinite(speed) ||
    speed < 0.2 ||
    speed > 3 ||
    !['fine', 'fat'].includes(cap)
  )
    throw new Error('Unsupported can settings.');
  const motions: Motion[] = [];
  let previous: Pose = { x: 2.95, y: 0.22, distance: 0.35 };
  path.forEach((stroke, strokeIndex) => {
    const points = resample(stroke);
    const distances = [0];
    for (let i = 1; i < points.length; i++)
      distances.push(
        distances[i - 1] +
          Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y
          )
      );
    const total = distances[distances.length - 1];
    const flared =
      technique === 'flare' || (specimen && strokeIndex === path.length - 1);
    const poses = points.map((p, i) => {
      const t = total > 0 ? distances[i] / total : 0;
      // Pull away through the last third while continuing along the wall.
      const flick = Math.pow(Math.max(0, (t - 0.57) / 0.43), 1.35);
      return {
        ...p,
        distance: flared ? lerp(distance, 0.78, flick) : distance,
      };
    });
    motions.push({ from: previous, to: poses[0], duration: 0.65, valve: 0 });
    if (total < 1e-8)
      motions.push({ from: poses[0], to: poses[0], duration: 0.9, valve: 1 });
    for (let i = 1; i < poses.length; i++) {
      const t = distances[i] / total;
      // A flare slows briefly as the can pulls away, then closes the valve.
      const tempo = flared ? 1 - 0.62 * Math.pow(t, 4) : 1;
      motions.push({
        from: poses[i - 1],
        to: poses[i],
        duration: (distances[i] - distances[i - 1]) / (speed * tempo),
        valve: 1,
      });
    }
    previous = poses[poses.length - 1];
  });
  motions.push({
    from: previous,
    to: { x: 2.95, y: 0.22, distance: 0.35 },
    duration: 0.8,
    valve: 0,
  });
  return { motions, duration: motions.reduce((sum, m) => sum + m.duration, 0) };
}

/** Swept deposition uses midpoint samples with a fixed total mass. */
export function sweep(
  from: Pose,
  to: Pose,
  mass: number,
  cap: Settings['cap'],
  emit: (stamp: Stamp) => void,
  spacing = 0.35
) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const radius = Math.min(
    footprint(from.distance, cap),
    footprint(to.distance, cap)
  );
  const count = Math.max(1, Math.ceil(length / (radius * spacing)));
  for (let i = 0; i < count; i++) {
    const p = interpolate(from, to, (i + 0.5) / count);
    emit({ ...p, radius: footprint(p.distance, cap), mass: mass / count });
  }
}

export class Programme {
  private index = 0;
  private elapsed = 0;
  private accumulator = 0;
  time = 0;
  valve = 0;
  pose: Pose;
  readonly score: Score;
  readonly cap: Settings['cap'];
  constructor(score: Score, cap: Settings['cap']) {
    this.score = score;
    this.cap = cap;
    this.pose = { ...score.motions[0].from };
  }
  get complete() {
    return this.index >= this.score.motions.length;
  }
  /** Drop excess wall-clock backlog; simulation and paint always share fixed time. */
  advance(seconds: number, emit: (stamp: Stamp) => void) {
    this.accumulator += Math.max(0, Math.min(seconds, 0.1));
    let steps = 0;
    while (this.accumulator + 1e-10 >= STEP && steps < 12 && !this.complete) {
      this.tick(STEP, emit);
      this.accumulator -= STEP;
      steps++;
    }
  }
  finish(emit: (stamp: Stamp) => void) {
    while (!this.complete) this.tick(STEP, emit);
  }
  private tick(dt: number, emit: (stamp: Stamp) => void) {
    let remaining = dt;
    while (remaining > 1e-10 && !this.complete) {
      const m = this.score.motions[this.index];
      const used = Math.min(remaining, m.duration - this.elapsed);
      const from = interpolate(m.from, m.to, this.elapsed / m.duration);
      this.elapsed += used;
      this.pose = interpolate(
        m.from,
        m.to,
        Math.min(1, this.elapsed / m.duration)
      );
      this.valve = m.valve;
      if (m.valve > 0)
        sweep(
          from,
          this.pose,
          0.0022 * (this.cap === 'fat' ? 1.35 : 1) * m.valve * used,
          this.cap,
          emit
        );
      remaining -= used;
      this.time += used;
      if (this.elapsed >= m.duration - 1e-10) {
        this.index++;
        this.elapsed = 0;
      }
    }
    if (this.complete) this.valve = 0;
  }
}

/** CPU mass authority. Float density remains available through resize/context loss. */
/** Compatibility adapter: existing drone coordinates remain wall metres. */
export class PaintField extends SurfaceField {
  constructor(width = 1024, height = 768) {
    super(width, height, WALL.width, WALL.height);
  }
}
