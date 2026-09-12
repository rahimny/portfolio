export interface RenderingSettings {
  cel: number;
  ink: number;
  hatch: number;
  glow: number;
  pixels: number;
}
export const RENDER_PRESETS = {
  Cel: { cel: 0.85, ink: 0.6, hatch: 0.22, glow: 0.12, pixels: 0.5 },
  Ink: { cel: 1, ink: 0.85, hatch: 0.7, glow: 0, pixels: 0.25 },
  Arcade: { cel: 0, ink: 0.12, hatch: 0, glow: 0.45, pixels: 1 },
} as const satisfies Record<string, RenderingSettings>;
export type RenderPreset = keyof typeof RENDER_PRESETS;
export function normaliseRendering(
  settings: RenderingSettings
): RenderingSettings {
  return Object.fromEntries(
    Object.entries(RENDER_PRESETS.Cel).map(([key, fallback]) => {
      const value = settings[key as keyof RenderingSettings];
      return [
        key,
        Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback,
      ];
    })
  ) as unknown as RenderingSettings;
}
