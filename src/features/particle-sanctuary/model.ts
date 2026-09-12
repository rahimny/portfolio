import { createFibreBlades } from '../fibre-field/blades';
export { seededRandom } from '../fibre-field/blades';
export const FIELD_RADIUS = 5.5;
export const BURST_CAPACITY = 4;
export const BURST_DURATION = 2.8;

export type FieldQuality = 'standard' | 'high';
export interface FieldSettings {
  seed: number;
  wind: number;
  quality: FieldQuality;
  text: string;
}

export const DEFAULT_FIELD: FieldSettings = {
  seed: 17,
  wind: 0.55,
  quality: 'standard',
  text: '',
};

export function readFieldSettings(value: unknown): FieldSettings {
  const data =
    value && typeof value === 'object' ? (value as Partial<FieldSettings>) : {};
  return {
    seed:
      typeof data.seed === 'number' && Number.isFinite(data.seed)
        ? Math.max(1, Math.min(999999, Math.round(data.seed)))
        : DEFAULT_FIELD.seed,
    wind:
      typeof data.wind === 'number' && Number.isFinite(data.wind)
        ? Math.max(0, Math.min(1.5, data.wind))
        : DEFAULT_FIELD.wind,
    quality: data.quality === 'high' ? 'high' : 'standard',
    text:
      typeof data.text === 'string'
        ? Array.from(data.text).slice(0, 8).join('').toUpperCase()
        : '',
  };
}

export function fieldHeight(x: number, z: number): number {
  return 0.07 * Math.sin(x * 0.8) * Math.cos(z * 0.7);
}
export function createBlades(seed: number, subdivisions: number) {
  return createFibreBlades(seed, subdivisions, {
    radius: FIELD_RADIUS,
    ground: fieldHeight,
  });
}

/** Fixed-size impulse history. A fifth burst replaces the oldest slot. */
export class BurstPool {
  readonly data = new Float32Array(BURST_CAPACITY * 4);
  private cursor = 0;

  constructor() {
    this.clear();
  }

  clear(): void {
    this.cursor = 0;
    for (let i = 0; i < BURST_CAPACITY; i++) {
      this.data.set([0, 0, -1000, 0], i * 4);
    }
  }

  emit(x: number, z: number, time: number, strength = 1): number {
    const slot = this.cursor;
    this.cursor = (slot + 1) % BURST_CAPACITY;
    const distance = Math.hypot(x, z);
    const scale = Math.min(1, (FIELD_RADIUS - 0.3) / Math.max(distance, 0.001));
    this.data.set(
      [x * scale, z * scale, time, Math.max(0, Math.min(1.5, strength))],
      slot * 4
    );
    return slot;
  }

  activeCount(time: number): number {
    let count = 0;
    for (let i = 0; i < BURST_CAPACITY; i++) {
      const age = time - this.data[i * 4 + 2];
      if (age >= 0 && age < BURST_DURATION && this.data[i * 4 + 3] > 0) count++;
    }
    return count;
  }
}
