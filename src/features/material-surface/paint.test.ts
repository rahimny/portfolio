import { projectApplicator, WALL_FRAME } from './surface';
import { describe, expect, it } from 'vitest';
import { SurfacePaint, FLOOR_SURFACE } from './paint';
import { SurfaceField } from './field';
import { LoadedBrush, surfaceGravity } from './brush';

const centroid = (paint: SurfacePaint) => {
  let x = 0,
    y = 0,
    total = 0;
  for (let i = 0; i < paint.surface.length; i += 4) {
    x += ((i / 4) % paint.wetWidth) * paint.surface[i];
    y += Math.floor(i / 4 / paint.wetWidth) * paint.surface[i];
    total += paint.surface[i];
  }
  return [x / total, y / total];
};
describe('orientation-independent material surfaces', () => {
  it('intersects spray with wall and floor frames and rejects grazing or rear-facing rays', () => {
    const impact = projectApplicator(
      WALL_FRAME,
      { x: 1, y: 2, z: 1 },
      { x: 0.5, y: 0, z: -1 }
    );
    expect(impact?.x).toBeCloseTo(1.5);
    expect(impact?.stretch).toBeGreaterThan(1);
    const floor = {
      origin: { x: 0, y: 0, z: 0 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: -1 },
      normal: { x: 0, y: 1, z: 0 },
    };
    expect(
      projectApplicator(floor, { x: 1, y: 2, z: 3 }, { x: 0, y: -1, z: 0 })
    ).toMatchObject({ x: 1, y: -3, distance: 2, stretch: 1 });
    expect(
      projectApplicator(WALL_FRAME, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })
    ).toBeUndefined();
    expect(
      projectApplicator(WALL_FRAME, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })
    ).toBeUndefined();
  });
  it('projects gravity into the substrate, independently of the camera', () => {
    expect(surfaceGravity([0, -1, 0], [1, 0, 0], [0, 0, -1])).toEqual([0, 0]);
    expect(surfaceGravity([0, -1, 0], [1, 0, 0], [0, 1, 0])).toEqual([0, -1]);
    const slope = surfaceGravity(
      [0, -1, 0],
      [1, 0, 0],
      [0, Math.SQRT1_2, Math.SQRT1_2]
    );
    expect(slope[1]).toBeCloseTo(-Math.SQRT1_2);
  });
  it('normalises rotated elliptical deposition in physical units', () => {
    for (const angle of [0, 0.4, 1.57, 2.3]) {
      const field = new SurfaceField(128, 96, 4, 3);
      field.deposit({
        x: 2,
        y: 1.5,
        radius: 0.4,
        minorRadius: 0.07,
        angle,
        mass: 0.03,
      });
      expect(field.mass).toBeCloseTo(0.03, 8);
    }
  });
  it('spreads on a level floor without a preferred downward direction or pigment loss', () => {
    const paint = new SurfacePaint({
      ...FLOOR_SURFACE,
      resolution: [128, 128],
      wetResolution: [32, 32],
    });
    paint.deposit({ x: 3.2, y: 3.2, radius: 0.35, mass: 0.1 });
    const before = centroid(paint);
    const occupied = paint.surface.filter(
      (v, i) => i % 4 === 0 && v > 0
    ).length;
    for (let i = 0; i < 120; i++) paint.step();
    expect(paint.mass).toBeCloseTo(0.1, 7);
    expect(centroid(paint)[0]).toBeCloseTo(before[0], 5);
    expect(centroid(paint)[1]).toBeCloseTo(before[1], 5);
    expect(
      paint.surface.filter((v, i) => i % 4 === 0 && v > 0).length
    ).toBeGreaterThan(occupied);
  });
  it('limits brush deposition to its load and never bridges a lift', () => {
    const brush = new LoadedBrush();
    brush.dip(0.003);
    let mass = 0;
    for (let i = 0; i < 200; i++)
      brush.drag(
        { x: i * 0.03, y: 1, angle: 0, pressure: 1 },
        1 / 120,
        (p) => (mass += p.mass)
      );
    expect(mass).toBeCloseTo(0.003, 9);
    expect(brush.load).toBe(0);
    brush.dip();
    brush.drag({ x: 0, y: 0, angle: 0, pressure: 1 }, 1 / 120, () => {});
    brush.lift();
    const xs: number[] = [];
    brush.drag({ x: 5, y: 0, angle: 0, pressure: 1 }, 1 / 120, (p) =>
      xs.push(p.x)
    );
    expect(xs.every((x) => x === 5)).toBe(true);
  });
});
