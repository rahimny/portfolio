export const PATTERNS = ['cycle', 'breathe', 'tide', 'unfurl'] as const;
export type MotionPattern = (typeof PATTERNS)[number];
export const FINISHES = ['cel', 'ink', 'arcade'] as const;
export interface MandelbulbSettings {
  slicing: 'xy' | 'x' | 'y' | 'off';
  sliceX: number;
  sliceY: number;
  cutAccent: number;
  power: number;
  section: number;
  detail: 'balanced' | 'fine';
  pattern: MotionPattern;
  speed: number;
  amplitude: number;
  morph: number;
  growthDuration: number;
  complexity: number;
  response: number;
  turntable: boolean;
  finish: (typeof FINISHES)[number];
  ink: number;
  hatch: number;
}
export const DEFAULT_SETTINGS: MandelbulbSettings = {
  slicing: 'xy',
  sliceX: 0,
  sliceY: 0,
  cutAccent: 0.12,
  power: 8,
  section: 0,
  detail: 'balanced',
  pattern: 'cycle',
  speed: 0.7,
  amplitude: 0.55,
  morph: 0.8,
  growthDuration: 9,
  complexity: 8,
  response: 0.7,
  turntable: false,
  finish: 'cel',
  ink: 0.65,
  hatch: 0.22,
};
export const NUMERIC_LIMITS = {
  sliceX: [0, 100],
  sliceY: [0, 100],
  cutAccent: [0, 0.4],
  power: [3, 10],
  section: [0, 100],
  speed: [0.1, 2],
  amplitude: [0, 1],
  morph: [0, 2],
  growthDuration: [3, 20],
  complexity: [3, 9],
  response: [0, 1],
  ink: [0, 1],
  hatch: [0, 1],
} as const;
export type NumericSetting = keyof typeof NUMERIC_LIMITS;
export function bounded(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
export function sectionPlane(section: number): number {
  return 1.4 - bounded(section, 0, 100) * 0.019;
}
export function smooth(value: number): number {
  const x = bounded(value, 0, 1);
  return x * x * (3 - 2 * x);
}
export interface GrowthPose {
  progress: number;
  scale: number;
  branching: number;
  complexity: number;
  phase: 'Seed' | 'Multiplying' | 'Branching' | 'Living';
}
/** Separate the appearance of lobes from the later arrival of nested branches. */
export function growthPose(
  age: number,
  duration: number,
  depth: number
): GrowthPose {
  const progress = bounded(age / Math.max(0.01, duration), 0, 1);
  return {
    progress,
    scale: 0.18 + 0.82 * smooth(progress / 0.75),
    branching: smooth((progress - 0.1) / 0.6),
    complexity: 1 + (depth - 1) * smooth((progress - 0.25) / 0.75),
    phase:
      progress < 0.15
        ? 'Seed'
        : progress < 0.5
          ? 'Multiplying'
          : progress < 1
            ? 'Branching'
            : 'Living',
  };
}
/** Convex weights give the automatic phrase continuous transitions between mechanisms. */
export function patternWeights(
  pattern: MotionPattern,
  time: number
): [number, number, number] {
  if (pattern !== 'cycle')
    return [
      Number(pattern === 'breathe'),
      Number(pattern === 'tide'),
      Number(pattern === 'unfurl'),
    ];
  const phase = (((time / 9) % 3) + 3) % 3;
  const index = Math.floor(phase);
  const blend = smooth((phase - index - 0.55) / 0.45);
  const weights: [number, number, number] = [0, 0, 0];
  weights[index] = 1 - blend;
  weights[(index + 1) % 3] = blend;
  return weights;
}
export function readSettings(value: unknown): MandelbulbSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  // Original still links retain their original inspection parameters.
  const state = { ...DEFAULT_SETTINGS, ...raw };
  if (
    raw.power === undefined ||
    raw.section === undefined ||
    raw.detail === undefined
  )
    return null;
  for (const [key, [min, max]] of Object.entries(NUMERIC_LIMITS)) {
    const v = state[key as NumericSetting];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      return null;
  }
  if (
    !['xy', 'x', 'y', 'off'].includes(state.slicing) ||
    !PATTERNS.includes(state.pattern) ||
    !FINISHES.includes(state.finish) ||
    typeof state.turntable !== 'boolean' ||
    !['balanced', 'fine'].includes(state.detail)
  )
    return null;
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS).map((key) => [
      key,
      state[key as keyof MandelbulbSettings],
    ])
  ) as unknown as MandelbulbSettings;
}

/** Cursor axes are independent; cut offsets live in object coordinates. */
export function cursorSlicePercent(coordinate: number): number {
  return bounded((1.7 - bounded(coordinate, -1.5, 1.5)) / 0.034, 0, 100);
}
export function cursorSlicePlane(percent: number): number {
  return 1.7 - bounded(percent, 0, 100) * 0.034;
}
