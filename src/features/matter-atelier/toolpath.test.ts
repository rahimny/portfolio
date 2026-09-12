import { describe, expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import {
  BED_Y,
  generateContours,
  planPrint,
  samplePrint,
  sliceTriangles,
  type Form,
} from './toolpath';

describe('deposition timeline', () => {
  it.each<Form>(['bloom', 'ribbon', 'orbit', 'terrain'])(
    'creates continuous, bounded and reproducible %s paths',
    (form) => {
      const contours = generateContours(form, 4);
      expect(JSON.stringify(contours)).toBe(
        JSON.stringify(generateContours(form, 4))
      );
      expect(JSON.stringify(contours)).not.toBe(
        JSON.stringify(generateContours(form, 5))
      );
      expect(new Set(contours.map((path) => path[0].y)).size).toBe(100);
      const job = planPrint(contours);
      expect(job.layers).toBe(100);
      const invalid = job.moves.find(
        (move, index) =>
          move.end <= move.start ||
          Math.abs(move.to.x) >= 1.7 ||
          Math.abs(move.to.z) >= 1.7 ||
          (index > 0 &&
            (move.from !== job.moves[index - 1].to ||
              move.start !== job.moves[index - 1].end)) ||
          (move.extrude && move.to.y !== move.from.y)
      );
      expect(invalid).toBeUndefined();
      expect(samplePrint(job, -1).position).toEqual(job.moves[0].from);
      for (const axis of ['x', 'y', 'z'] as const)
        expect(samplePrint(job, Infinity).position[axis]).toBeCloseTo(
          job.moves.at(-1)!.to[axis]
        );
    }
  );
  it('synchronises partial extrusion with the nozzle and lifts travel above the object', () => {
    const job = planPrint(generateContours('bloom'));
    const move = job.moves.find((m) => m.extrude)!;
    const sample = samplePrint(job, (move.start + move.end) / 2);
    const travelled = sample.distance - move.offset;
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(move.length);
    expect(
      Math.hypot(
        sample.position.x - move.from.x,
        sample.position.y - move.from.y,
        sample.position.z - move.from.z
      )
    ).toBeCloseTo(travelled, 8);
    // The first extruding segment accelerates from rest rather than jumping to feed speed.
    expect(travelled).toBeLessThan(move.length / 2);
    const lateralTravel = job.moves.filter(
      (m) => !m.extrude && m.to.x !== m.from.x
    );
    expect(lateralTravel.every((m) => m.to.y > BED_Y + 0.025)).toBe(true);
  });
});
describe('STL triangle slicing', () => {
  it('slices a closed cube into closed contours with constant height', () => {
    const geometry = new BoxGeometry(2, 2, 2).toNonIndexed();
    const contours = sliceTriangles(
      geometry.getAttribute('position').array,
      12
    );
    expect(contours).toHaveLength(12);
    for (const path of contours) {
      expect(path[0].x).toBeCloseTo(path.at(-1)!.x);
      expect(path[0].z).toBeCloseTo(path.at(-1)!.z);
      expect(path.every((p) => p.y === path[0].y)).toBe(true);
    }
    expect(planPrint(contours).layers).toBe(12);
    geometry.dispose();
  });
  it('preserves disconnected contours without extruding across their gap', () => {
    const a = new BoxGeometry(1, 1, 1).toNonIndexed();
    const b = new BoxGeometry(1, 1, 1).toNonIndexed();
    b.translate(2, 0, 0);
    const contours = sliceTriangles(
      [
        ...a.getAttribute('position').array,
        ...b.getAttribute('position').array,
      ],
      8
    );
    expect(contours).toHaveLength(16);
    const job = planPrint(contours);
    expect(job.layers).toBe(8);
    expect(job.moves.filter((m) => !m.extrude).length).toBeGreaterThan(16);
    a.dispose();
    b.dispose();
  });
  it('rejects empty, non-finite, flat and excessive meshes', () => {
    expect(() => sliceTriangles([])).toThrow();
    expect(() => sliceTriangles([0, 0, 0, 1, 1, 0, 0, 1, 0])).toThrow(
      /three-dimensional/
    );
    expect(() => sliceTriangles([NaN, 0, 0, 1, 1, 1, 0, 1, 0])).toThrow(
      /invalid coordinates/
    );
    expect(() => sliceTriangles(new Float32Array(900009))).toThrow(/100,000/);
  });
});
