/** Packed sRGB pigments for the simulated material, independent of interface colour tokens. */
export const MATERIALS = {
  Ink: {
    color: 0x15191f,
    metalness: 0,
    roughness: 0.16,
    coat: 0.85,
    coatRoughness: 0.075,
  },
  Porcelain: {
    color: 0xe9e0d2,
    metalness: 0,
    roughness: 0.21,
    coat: 0.7,
    coatRoughness: 0.12,
  },
  Mercury: {
    color: 0xb6bbc4,
    metalness: 1,
    roughness: 0.13,
    coat: 0.3,
    coatRoughness: 0.08,
  },
} as const;
export type MaterialName = keyof typeof MATERIALS;

export const DEFAULT_SETTINGS = {
  ...MATERIALS.Ink,
  exposure: 1.08,
  environment: 1.25,
  lightAngle: -0.15,
  key: 2.4,
  shadow: 0.19,
  shadowSoftness: 6,
  yaw: -0.12,
  pitch: 0.13,
  zoom: 1,
  hitStrength: 1,
  lift: 1,
  drag: 3,
  tether: 8,
  softness: 1,
  fairing: 0.24,
  burstAt: 1.2,
};
export type PressureSettings = {
  [K in keyof typeof DEFAULT_SETTINGS]: number;
};
export const SETTINGS_KEY = 'pressure-type:studio:v1';

export const SETTING_LIMITS: Record<
  Exclude<keyof PressureSettings, 'color'>,
  readonly [number, number]
> = {
  metalness: [0, 1],
  roughness: [0.08, 0.5],
  coat: [0, 1],
  coatRoughness: [0.04, 0.4],
  exposure: [0.6, 1.7],
  environment: [0.3, 2],
  lightAngle: [-Math.PI, Math.PI],
  key: [0, 5],
  shadow: [0.05, 0.35],
  shadowSoftness: [1, 10],
  yaw: [-0.45, 0.45],
  pitch: [-0.12, 0.4],
  zoom: [0.75, 1.18],
  hitStrength: [0.5, 1.8],
  lift: [0.5, 1.3],
  drag: [2, 5],
  tether: [6, 12],
  softness: [0.8, 1.5],
  fairing: [0.2, 0.3],
  burstAt: [1.15, 1.35],
};

/** Persisted values are untrusted; only known finite values within tested ranges survive. */
export function readSettings(value: unknown): PressureSettings {
  const settings: PressureSettings = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return settings;
  const source = value as Record<string, unknown>;
  const pigment =
    typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)
      ? Number.parseInt(source.color.slice(1), 16)
      : source.color;
  if (
    typeof pigment === 'number' &&
    Number.isInteger(pigment) &&
    pigment >= 0 &&
    pigment <= 0xffffff
  )
    settings.color = pigment;
  for (const key of Object.keys(
    SETTING_LIMITS
  ) as (keyof typeof SETTING_LIMITS)[]) {
    const v = source[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const [min, max] = SETTING_LIMITS[key];
    settings[key] = Math.max(min, Math.min(max, v));
  }
  return settings;
}

export function materialName(
  settings: PressureSettings
): MaterialName | 'Custom' {
  return (
    (Object.keys(MATERIALS) as MaterialName[]).find((name) =>
      Object.entries(MATERIALS[name]).every(
        ([key, value]) => settings[key as keyof PressureSettings] === value
      )
    ) ?? 'Custom'
  );
}
