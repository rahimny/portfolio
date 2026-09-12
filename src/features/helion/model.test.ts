import { describe, expect, it } from 'vitest';
import { addImpact, createShell, cross, dot, MAX_IMPACTS } from './model';

describe('geodesic shell', () => {
  it('closes with twelve pentagons and otherwise hexagons', () => {
    const cells = createShell(12);
    expect(cells).toHaveLength(1442);
    expect(cells.filter((c) => c.corners.length === 5)).toHaveLength(12);
    expect(cells.filter((c) => c.corners.length === 6)).toHaveLength(1430);
    const edges = new Map<string, number>();
    for (const cell of cells) {
      expect(Math.hypot(...cell.centre)).toBeCloseTo(1);
      for (let i = 0; i < cell.corners.length; i++) {
        const a = cell.corners[i],
          b = cell.corners[(i + 1) % cell.corners.length];
        expect(dot(cross(a, b), cell.centre)).toBeGreaterThan(0);
        const key = [a.join(','), b.join(',')].sort().join('/');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  });
  it('rejects unbounded geometry budgets', () => {
    expect(() => createShell(0)).toThrow();
    expect(() => createShell(33)).toThrow();
  });
});
it('bounds impacts and rejects invalid input', () => {
  const impacts: Parameters<typeof addImpact>[0] = [];
  for (let i = 0; i < 20; i++)
    addImpact(impacts, { direction: [3, 0, 0], time: i, strength: 4 });
  expect(impacts).toHaveLength(MAX_IMPACTS);
  expect(impacts[0].time).toBe(12);
  expect(impacts[0].direction).toEqual([1, 0, 0]);
  expect(impacts[0].strength).toBe(2);
  addImpact(impacts, { direction: [NaN, 0, 0], time: 30, strength: 1 });
  expect(impacts.at(-1)?.time).toBe(19);
});
