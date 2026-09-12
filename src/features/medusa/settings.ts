import palettes from './palettes.json';
export const LIMITS = {
  seed: [0, 4294967295, 1],
  growthDuration: [2, 12, 0.1],
  width: [0.55, 1.6, 0.01],
  dome: [0.4, 1.8, 0.01],
  lobes: [4, 30, 1],
  scallop: [0, 0.16, 0.005],
  armLength: [0.4, 1.5, 0.01],
  tentacleLength: [0.4, 1.5, 0.01],
  arms: [0, 4, 1],
  tentacles: [0, 20, 1],
  density: [0.25, 1.5, 0.05],
  brushStyle: [0, 3, 1],
  brushSize: [0.3, 2.5, 0.01],
  aspect: [0.3, 3, 0.01],
  distortion: [0, 2, 0.01],
  paintMotion: [0, 2, 0.01],
  grain: [0, 3, 0.01],
  cutoff: [0.05, 0.85, 0.01],
  armWidth: [0.05, 1, 0.01],
  folds: [2, 45, 0.1],
  contrast: [0.3, 2, 0.01],
  rimLight: [0, 1, 0.01],
  depthSoftness: [0, 1, 0.01],
  atmosphere: [0, 1, 0.01],
  suspension: [0, 1, 0.01],
  lightX: [-2, 2, 0.01],
  lightZ: [-2, 2, 0.01],
  palette: [0, 2, 1],
  rate: [0.1, 2, 0.01],
  pulseAmount: [0, 2, 0.01],
  current: [-0.8, 0.8, 0.01],
  turbulence: [0, 3, 0.01],
  drag: [0.5, 8, 0.1],
  turnSpeed: [-2, 2, 0.01],
  tilt: [-1.2, 1.2, 0.01],
  zoom: [0.6, 1.8, 0.01],
} as const;
export const DEFAULT_SETTINGS = {
  seed: 1289,
  growthDuration: 5.2,
  growOnCreation: true,
  width: 1,
  dome: 1,
  lobes: 14,
  scallop: 0.045,
  armLength: 1,
  tentacleLength: 1,
  arms: 4,
  tentacles: 20,
  density: 1,
  brushStyle: 0,
  brushSize: 1,
  aspect: 1,
  distortion: 1,
  paintMotion: 0.5,
  grain: 1,
  cutoff: 0.35,
  armWidth: 0.46,
  folds: 22,
  contrast: 1.12,
  rimLight: 0.55,
  depthSoftness: 0.5,
  atmosphere: 0.65,
  suspension: 0.6,
  lightX: -0.6,
  lightZ: 0.8,
  palette: 1,
  dark: palettes[1].dark,
  mid: palettes[1].mid,
  pale: palettes[1].pale,
  edge: palettes[1].edge,
  ground: palettes[1].ground,
  light: palettes[1].light,
  rate: 1,
  pulseAmount: 1,
  current: 0.12,
  turbulence: 1,
  drag: 2.5,
  paused: false,
  rotating: false,
  turnSpeed: 0.65,
  tilt: 0.28,
  zoom: 1,
};
export type MedusaSettings = typeof DEFAULT_SETTINGS;
export const STRUCTURAL_KEYS = new Set<keyof MedusaSettings>([
  'seed',
  'width',
  'dome',
  'lobes',
  'scallop',
  'armLength',
  'tentacleLength',
  'arms',
  'tentacles',
  'density',
  'brushStyle',
]);
export const COLOR_KEYS = [
  'dark',
  'mid',
  'pale',
  'edge',
  'ground',
  'light',
] as const;

/** Whitelisted recipe format: imports cannot introduce unbounded geometry or invalid uniforms. */
export function parseRecipe(input: unknown): MedusaSettings {
  if (
    !input ||
    typeof input !== 'object' ||
    !('version' in input) ||
    input.version !== 1 ||
    !('settings' in input) ||
    !input.settings ||
    typeof input.settings !== 'object'
  ) {
    throw new Error('Choose a Medusa recipe with version 1.');
  }
  const data = input.settings as Record<string, unknown>;
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Invalid ${key}.`);
    const [min, max, step] = LIMITS[key];
    result[key] = Math.max(
      min,
      Math.min(max, step === 1 ? Math.round(value) : value)
    );
  }
  for (const key of COLOR_KEYS) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== 'string' || !/^#[\da-f]{6}$/i.test(data[key]))
      throw new Error(`Invalid ${key} colour.`);
    result[key] = data[key];
  }
  for (const key of ['paused', 'rotating', 'growOnCreation'] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
    result[key] = data[key];
  }
  return result;
}
export function serializeRecipe(settings: MedusaSettings) {
  return JSON.stringify({ version: 1, settings }, null, 2);
}
