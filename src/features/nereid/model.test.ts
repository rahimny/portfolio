import { describe, expect, it } from 'vitest';
import {
  clampSeparation,
  hexCell,
  LIMBS,
  LATTICE_ROWS,
  tentaclePoint,
} from './model';

describe('Nereid construction', () => {
  it('keeps all lattice cells on the tapered limb domain', () => {
    for (let row = 0; row < LATTICE_ROWS; row++) {
      const cell = hexCell(row, 0);
      expect(cell).toHaveLength(6);
      for (const [u, v] of cell) {
        expect(Number.isFinite(u)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('attaches eight distinct limbs to the same ring and descends continuously', () => {
    const roots = Array.from({ length: LIMBS }, (_, i) => tentaclePoint(0, i));
    expect(new Set(roots.map(String)).size).toBe(LIMBS);
    for (let limb = 0; limb < LIMBS; limb++) {
      expect(Math.hypot(roots[limb][0], roots[limb][2])).toBeCloseTo(2.02);
      let previous = roots[limb][1];
      for (let step = 1; step <= 100; step++) {
        const point = tentaclePoint(step / 100, limb);
        expect(point.every(Number.isFinite)).toBe(true);
        expect(point[1]).toBeLessThan(previous);
        previous = point[1];
      }
    }
  });
  it('bounds malformed and interrupted explosion requests', () => {
    expect(clampSeparation(NaN)).toBe(0);
    expect(clampSeparation(Infinity)).toBe(0);
    expect(clampSeparation(-2)).toBe(0);
    expect(clampSeparation(2)).toBe(1);
    expect(clampSeparation(0.37)).toBe(0.37);
  });
});
