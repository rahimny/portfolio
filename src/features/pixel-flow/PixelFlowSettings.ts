export interface PixelFlowSettings {
  offsetStrength: number;
  gridSize: number;
  mouseRadius: number;
  strength: number;
  relaxation: number;
  velocitySmoothing: number;
}

export const DEFAULT_PIXEL_FLOW_SETTINGS: Readonly<PixelFlowSettings> = {
  offsetStrength: 0.032,
  gridSize: 84,
  mouseRadius: 110,
  strength: 0.72,
  relaxation: 0.9,
  velocitySmoothing: 0.4,
};

type SettingsListener = (settings: Readonly<PixelFlowSettings>) => void;

/** Mutable settings shared by a group of Pixel Flow surfaces. */
export class PixelFlowSettingsStore {
  public readonly values: PixelFlowSettings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(initial: Partial<PixelFlowSettings> = {}) {
    this.values = { ...DEFAULT_PIXEL_FLOW_SETTINGS, ...initial };
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.values);
    return () => this.listeners.delete(listener);
  }

  /** Notify effects after Tweakpane has mutated `values`. */
  public commit(): void {
    this.listeners.forEach((listener) => listener(this.values));
  }

  public reset(): void {
    Object.assign(this.values, DEFAULT_PIXEL_FLOW_SETTINGS);
    this.commit();
  }
}
