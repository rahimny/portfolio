import { describe, expect, it } from 'vitest';
import { membraneFromMask } from './mesh';
import { MembraneSurface } from './surface';

describe('membrane render surface', () => {
  it('preserves a closed surface while increasing render density independently of physics', () => {
    const mesh = membraneFromMask(new Uint8Array(24).fill(1), 4, 6, 0.1);
    const original = mesh.positions.slice();
    const surface = new MembraneSurface(mesh);
    expect(surface.triangles.length).toBe(mesh.triangles.length * 4);
    const edges = new Map<string, number>();
    for (let t = 0; t < surface.triangles.length; t += 3)
      for (let j = 0; j < 3; j++) {
        const a = surface.triangles[t + j],
          b = surface.triangles[t + ((j + 1) % 3)];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(mesh.positions).toEqual(original);
  });
  it('tracks affine deformation with reusable output buffers', () => {
    const mesh = membraneFromMask(new Uint8Array(24).fill(1), 4, 6, 0.1);
    const surface = new MembraneSurface(mesh),
      buffer = surface.positions;
    const before = buffer.slice();
    const deformed = mesh.positions.map(
      (value, i) => value * 1.4 + [2, -1, 0.5][i % 3]
    );
    surface.update(deformed);
    expect(surface.positions).toBe(buffer);
    for (let i = 0; i < buffer.length; i++)
      expect(buffer[i]).toBeCloseTo(before[i] * 1.4 + [2, -1, 0.5][i % 3], 5);
  });
});
