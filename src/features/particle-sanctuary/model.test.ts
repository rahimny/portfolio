import { describe, expect, it } from 'vitest';
import {
  BURST_CAPACITY,
  BURST_DURATION,
  BurstPool,
  createBlades,
  FIELD_RADIUS,
  readFieldSettings,
} from './model';

describe('sanctuary field', () => {
  it('reproduces a seed with anchored roots inside the field', () => {
    const blades = createBlades(17, 32);
    expect(blades).toEqual(createBlades(17, 32));
    expect(blades.positions).not.toEqual(createBlades(18, 32).positions);
    expect(blades.count).toBeGreaterThan(600);
    expect(blades.positions.length).toBe(blades.count * 9);
    for (let i = 0; i < blades.positions.length; i += 9) {
      expect(
        Math.hypot(blades.positions[i], blades.positions[i + 2])
      ).toBeLessThanOrEqual(FIELD_RADIUS);
      expect(blades.positions.slice(i, i + 3)).toEqual(
        blades.positions.slice(i + 3, i + 6)
      );
    }
  });

  it('bounds concurrent bursts, replaces the oldest, and expires without allocation', () => {
    const pool = new BurstPool();
    const buffer = pool.data;
    for (let i = 0; i < BURST_CAPACITY; i++)
      expect(pool.emit(i, 0, i * 0.1)).toBe(i);
    expect(pool.activeCount(0.4)).toBe(BURST_CAPACITY);
    expect(pool.emit(100, 0, 0.4)).toBe(0);
    expect(pool.data[0]).toBeLessThan(FIELD_RADIUS);
    expect(pool.activeCount(0.4 + BURST_DURATION + 0.01)).toBe(0);
    pool.clear();
    expect(pool.activeCount(0)).toBe(0);
    expect(pool.data).toBe(buffer);
  });

  it('validates untrusted share parameters and bounds text and rendering cost', () => {
    expect(
      readFieldSettings({ seed: NaN, wind: Infinity, quality: 'ultra' })
    ).toEqual({ seed: 17, wind: 0.55, quality: 'standard', text: '' });
    expect(
      readFieldSettings({ seed: -4, wind: 100, text: 'abcdefghijk' })
    ).toEqual({ seed: 1, wind: 1.5, quality: 'standard', text: 'ABCDEFGH' });
  });
});
