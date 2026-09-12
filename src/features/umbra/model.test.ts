import { describe, expect, it } from 'vitest';
import {
  CELLS,
  createField,
  index,
  restore,
  sheltered,
  snapshot,
  step,
} from './model';

describe('UMBRA visibility feedback', () => {
  it('casts shelter from occupancy, independently of the view', () => {
    const cells = new Uint8Array(CELLS);
    const light = { azimuth: 0, elevation: 5 };
    expect(sheltered(cells, 18, 18, 18, light)).toBe(false);
    cells[index(18, 18, 21)] = 1;
    expect(sheltered(cells, 18, 18, 18, light)).toBe(true);
    expect(sheltered(cells, 18, 18, 18, { azimuth: 180, elevation: 5 })).toBe(
      false
    );
  });
  it('reproduces a fixed seed and tick sequence', () => {
    expect(snapshot(createField(7))).toEqual(snapshot(createField(7)));
  });
  it('changes geometry when only the light changes', () => {
    const left = createField(3),
      right = restore(snapshot(left));
    left.light = { azimuth: -90, elevation: 20 };
    right.light = { azimuth: 90, elevation: 20 };
    for (let t = 0; t < 32; t++) {
      step(left);
      step(right);
    }
    const difference = left.matter.reduce(
      (sum, value, i) => sum + Number(value !== right.matter[i]),
      0
    );
    expect(difference).toBeGreaterThan(30);
  });
  it('restores history exactly, including future growth', () => {
    const original = createField(12);
    original.light.azimuth = 103;
    for (let t = 0; t < 8; t++) step(original);
    const restored = restore(JSON.parse(JSON.stringify(snapshot(original))));
    for (let t = 0; t < 12; t++) {
      step(original);
      step(restored);
    }
    expect(snapshot(restored)).toEqual(snapshot(original));
  });
  it('keeps 64 consecutive seeds bounded, varied and centrally inhabitable', () => {
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 64; seed++) {
      const field = createField(seed);
      let hash = 0;
      field.matter.forEach((value, i) => {
        if (value) hash = Math.imul(hash ^ i, 31);
      });
      signatures.add(String(hash));
      const occupied = field.matter.reduce((a, b) => a + b, 0);
      expect(occupied).toBeGreaterThan(500);
      expect(occupied).toBeLessThan(CELLS * 0.3);
      for (let z = 15; z <= 21; z++)
        for (let y = 15; y <= 21; y++)
          for (let x = 15; x <= 21; x++)
            if (Math.hypot(x - 18, y - 18, z - 18) <= 3)
              expect(field.matter[index(x, y, z)]).toBe(0);
    }
    expect(signatures.size).toBe(64);
  }, 30000);
  it('only adds to a frontier and preserves material budgets and substrate over time', () => {
    const field = createField(4);
    const budget = field.resource.reduce((a, b) => a + b, 0);
    for (let t = 0; t < 100; t++) {
      if (t === 50) field.light.azimuth *= -1;
      const previous = field.matter.slice();
      step(field);
      field.matter.forEach((value, i) => {
        if (value && !previous[i])
          expect(
            previous[i - 1] +
              previous[i + 1] +
              previous[i - 36] +
              previous[i + 36] +
              previous[i - 1296] +
              previous[i + 1296]
          ).toBeGreaterThanOrEqual(2);
        if (field.substrate[i]) expect(value).toBe(1);
      });
    }
    expect(field.resource.reduce((a, b) => a + b, 0)).toBeLessThan(budget);
    expect(field.matter.reduce((a, b) => a + b, 0)).toBeLessThan(CELLS * 0.35);
  }, 30000);
  it('rejects invalid snapshots without allocating arbitrary grids', () => {
    expect(() => restore({})).toThrow();
    const valid = snapshot(createField(1, false));
    expect(() =>
      restore({ ...valid, light: { azimuth: NaN, elevation: 30 } })
    ).toThrow();
    expect(() => restore({ ...valid, matter: [0] })).toThrow();
    expect(() =>
      restore({ ...valid, resource: Array(CELLS).fill(9) })
    ).toThrow();
  });
});
