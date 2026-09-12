import { describe, it, expect } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { generateContours, planPrint } from './toolpath';
import {
  artComposition,
  ART_FAMILIES,
  ART_POINT_BUDGET,
  MAX_ART_STROKES,
  type ArtPoint,
} from './patterns';
import type { EditionGenome } from './living';
import { DIP, FloorPainting, sampleBrush, paintingPaths } from './painting';
import { solveBrushArm, SHOULDER, UPPER_ARM, FOREARM } from './brushKinematics';
import { BRUSH_BASE, FINISH_SWEEP } from './process';
const job = planPrint(generateContours('bloom'));
const pathLength = (path: ArtPoint[]) =>
  path.reduce(
    (length, point, index) =>
      length +
      (index
        ? Math.hypot(point.x - path[index - 1].x, point.z - path[index - 1].z)
        : 0),
    0
  );
const distanceToPath = (point: ArtPoint, path: ArtPoint[]) => {
  let distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.z - a.z) * dz) /
          Math.max(1e-12, dx * dx + dz * dz)
      )
    );
    distance = Math.min(
      distance,
      Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t)
    );
  }
  return distance;
};
const rotation = (
  from: typeof SHOULDER,
  to: typeof SHOULDER,
  hinge: typeof SHOULDER
) => {
  const y = new Vector3().subVectors(to, from).normalize();
  const x = new Vector3().copy(hinge);
  const z = new Vector3().crossVectors(x, y).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(x, y, z)
  );
};

describe('fine compositions and stable arm hinges', () => {
  it('varies seeded families and arrangement within a finite reachable drawing budget', () => {
    const families = new Set<string>();
    const arrangements = new Set<string>();
    const pathCounts = new Set<number>();
    for (let seed = 1; seed <= 48; seed++) {
      const art = artComposition(job, seed);
      if (seed <= 6) expect(art).toEqual(artComposition(job, seed));
      families.add(art.name);
      pathCounts.add(art.paths.length);
      arrangements.add(
        art.paths
          .map((path) => `${path[0].x.toFixed(2)},${path[0].z.toFixed(2)}`)
          .join('|')
      );
      expect(art.paths.length).toBeGreaterThanOrEqual(9);
      expect(art.paths.length).toBeLessThanOrEqual(MAX_ART_STROKES);
      expect(
        art.paths.reduce((count, path) => count + path.length, 0)
      ).toBeLessThanOrEqual(ART_POINT_BUDGET);
      const totalLength = art.paths.reduce(
        (length, path) => length + pathLength(path),
        0
      );
      expect(totalLength).toBeGreaterThan(8);
      expect(totalLength).toBeLessThan(100);
      const points = art.paths.flat();
      expect(
        points.every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.z)
        )
      ).toBe(true);
      const radii = points.map((point) =>
        Math.hypot(point.x - BRUSH_BASE.x, point.z - BRUSH_BASE.z)
      );
      expect(Math.min(...radii)).toBeGreaterThan(0.95);
      expect(Math.max(...radii)).toBeLessThan(2.95);
      const angles = points
        .map((point) =>
          Math.atan2(point.z - BRUSH_BASE.z, point.x - BRUSH_BASE.x)
        )
        .sort((a, b) => a - b);
      let largestGap = angles[0] + Math.PI * 2 - angles.at(-1)!;
      for (let i = 1; i < angles.length; i++)
        largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
      expect(Math.PI * 2 - largestGap).toBeGreaterThan(4.5);
    }
    expect(families).toEqual(new Set(ART_FAMILIES));
    expect(arrangements.size).toBe(48);
    expect(pathCounts.size).toBeGreaterThanOrEqual(4);
  });
  it('grows connected detail only after its parents, rather than replaying closed loops', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const art = artComposition(job, seed);
      expect(art.strokes).toHaveLength(art.paths.length);
      expect(
        art.strokes.filter((stroke) => stroke.parent === null)
      ).toHaveLength(1);
      expect(
        Math.max(...art.strokes.map((stroke) => stroke.depth))
      ).toBeGreaterThanOrEqual(3);
      expect(
        art.strokes.filter((stroke) => !stroke.closed).length
      ).toBeGreaterThan(art.paths.length / 2);
      for (const [index, stroke] of art.strokes.entries()) {
        if (index)
          expect(stroke.depth).toBeGreaterThanOrEqual(
            art.strokes[index - 1].depth
          );
        if (stroke.parent !== null) {
          expect(stroke.parent).toBeLessThan(index);
          expect(stroke.depth).toBe(art.strokes[stroke.parent].depth + 1);
          // Resampling preserves the parent curve to sub-bristle accuracy;
          // children need not land on one of its discretised vertices.
          expect(
            distanceToPath(art.paths[index][0], art.paths[stroke.parent])
          ).toBeLessThan(0.012);
        }
        if (stroke.closed)
          expect(art.paths[index].at(-1)).toEqual(art.paths[index][0]);
      }
    }
  });
  it('carries inherited shape traits and the printed silhouette into every family', () => {
    const genome: EditionGenome = {
      seed: 3,
      parentSeed: 2,
      generation: 1,
      lobes: 3,
      twist: 0.72,
      asymmetry: 0.1,
      phase: 0.08,
      branching: 0.2,
    };
    const descendant = {
      ...genome,
      lobes: 8,
      twist: 1.2,
      phase: 0.6,
      branching: 0.9,
    };
    const otherForm = planPrint(generateContours('ribbon'));
    const checked = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const art = artComposition(job, seed, genome);
      if (checked.has(art.name)) continue;
      checked.add(art.name);
      const evolved = artComposition(job, seed, descendant);
      expect(evolved.name).toBe(art.name);
      expect(evolved.paths).not.toEqual(art.paths);
      expect(artComposition(otherForm, seed, genome).paths).not.toEqual(
        art.paths
      );
      expect(
        artComposition(job, seed, { ...genome, branching: 1 }).paths.length
      ).toBeGreaterThan(
        artComposition(job, seed, { ...genome, branching: 0 }).paths.length
      );
      expect(evolved).toEqual(artComposition(job, seed, descendant));
    }
    expect(checked.size).toBe(ART_FAMILIES.length);
  });
  it('avoids pivot crossings and sudden link or wrist spins, including reload and edition boundaries', () => {
    for (let seed = 0; seed <= 24; seed++) {
      const paths = seed ? artComposition(job, seed).paths : paintingPaths(job);
      let prior = sampleBrush(paths, 0, seed > 0);
      let arm = solveBrushArm(prior);
      let upper = rotation(SHOULDER, arm.elbow, arm.hinge),
        lower = rotation(arm.elbow, arm.wrist, arm.hinge);
      let minimumRadius = Infinity,
        maximumLinkError = 0;
      let maximumUpperTurn = 0,
        maximumLowerTurn = 0,
        maximumWristTurn = 0;
      let maximumStep = 0;
      // 42 seconds of brush operation at studio pace, sampled at 120 Hz.
      for (let i = 1; i <= 5040; i++) {
        const pose = sampleBrush(paths, i / 5040, seed > 0);
        arm = solveBrushArm(pose);
        const u = rotation(SHOULDER, arm.elbow, arm.hinge),
          l = rotation(arm.elbow, arm.wrist, arm.hinge);
        minimumRadius = Math.min(
          minimumRadius,
          Math.hypot(pose.x - BRUSH_BASE.x, pose.z - BRUSH_BASE.z)
        );
        maximumLinkError = Math.max(
          maximumLinkError,
          Math.abs(
            new Vector3().subVectors(arm.elbow, SHOULDER).length() - UPPER_ARM
          ),
          Math.abs(
            new Vector3().subVectors(arm.wrist, arm.elbow).length() - FOREARM
          )
        );
        maximumUpperTurn = Math.max(maximumUpperTurn, u.angleTo(upper));
        maximumLowerTurn = Math.max(maximumLowerTurn, l.angleTo(lower));
        const wrist = Math.atan2(
          Math.sin(pose.angle - prior.angle),
          Math.cos(pose.angle - prior.angle)
        );
        maximumWristTurn = Math.max(maximumWristTurn, Math.abs(wrist));
        if (!seed || (pose.contact && prior.contact))
          maximumStep = Math.max(
            maximumStep,
            Math.hypot(pose.x - prior.x, pose.y - prior.y, pose.z - prior.z)
          );
        prior = pose;
        upper = u;
        lower = l;
      }
      expect(minimumRadius, `seed ${seed}`).toBeGreaterThan(0.95);
      expect(maximumLinkError, `seed ${seed}`).toBeLessThan(0.000001);
      expect(maximumUpperTurn, `seed ${seed}`).toBeLessThan(0.09);
      expect(maximumLowerTurn, `seed ${seed}`).toBeLessThan(0.09);
      expect(maximumWristTurn, `seed ${seed}`).toBeLessThan(0.15);
      // Fine contact speed stays bounded; lifted transfers travel farther.
      // Preserve the broad brush's existing 0.06-at-6000-samples bound.
      expect(maximumStep, `seed ${seed}`).toBeLessThan(
        seed ? 0.06 : (0.06 * 6000) / 5040
      );
      const next = sampleBrush(artComposition(job, seed + 1).paths, 0, true);
      expect(
        Math.abs(
          Math.atan2(
            Math.sin(next.angle - prior.angle),
            Math.cos(next.angle - prior.angle)
          )
        )
      ).toBeLessThan(1e-5);
    }
  });
  it('settles the brush at every phase boundary without a jump or unbounded acceleration', () => {
    const seconds = 42;
    const step = 1e-7;
    const separation = (a: { x: number; y: number; z: number }, b: typeof a) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    for (let seed = 1; seed <= 12; seed++) {
      const paths = artComposition(job, seed).paths;
      let previous = sampleBrush(paths, 0, true);
      for (let i = 1; i < 2400; i++) {
        const progress = i / 2400;
        const pose = sampleBrush(paths, progress, true);
        if (pose.phase !== previous.phase) {
          let lo = (i - 1) / 2400,
            hi = progress;
          for (let search = 0; search < 28; search++) {
            const middle = (lo + hi) / 2;
            if (sampleBrush(paths, middle, true).phase === previous.phase)
              lo = middle;
            else hi = middle;
          }
          const boundary = (lo + hi) / 2;
          const before = sampleBrush(paths, boundary - step, true);
          const at = sampleBrush(paths, boundary, true);
          const after = sampleBrush(paths, boundary + step, true);
          expect(
            separation(before, at) / (step * seconds),
            `seed ${seed}, ${previous.phase} end`
          ).toBeLessThan(0.02);
          expect(
            separation(after, at) / (step * seconds),
            `seed ${seed}, ${pose.phase} start`
          ).toBeLessThan(0.02);
          const acceleration =
            Math.hypot(
              after.x - 2 * at.x + before.x,
              after.y - 2 * at.y + before.y,
              after.z - 2 * at.z + before.z
            ) /
            (step * seconds) ** 2;
          expect(acceleration, `seed ${seed}, ${pose.phase}`).toBeLessThan(200);
        }
        previous = pose;
      }
    }
  });
  it('contacts every stroke in order, lifting between them and sharing a load across several strokes', () => {
    // Includes the rendered flange radius and the outside of the paper rim.
    expect(
      Math.hypot(DIP.x - BRUSH_BASE.x, DIP.z - BRUSH_BASE.z) - 0.47 - 3.12
    ).toBeGreaterThan(0.15);
    for (let seed = 1; seed <= 12; seed++) {
      const paths = artComposition(job, seed).paths;
      const contacts: number[] = [],
        reloads = new Set<number>();
      let lastStroke = -1,
        maximumLift = 0,
        wasDipping = false,
        dips = 0;
      let previous = sampleBrush(paths, 0, true);
      let dockOnlyReloads = true,
        contactOnPaper = true,
        liftsSeparateStrokes = true;
      const starts: ArtPoint[] = [],
        ends: ArtPoint[] = [];
      for (let i = 0; i <= 12000; i++) {
        const pose = sampleBrush(paths, i / 12000, true);
        if (pose.dipping) {
          if (!wasDipping) dips++;
          reloads.add(pose.reloadId);
          dockOnlyReloads &&=
            !pose.contact && pose.x === DIP.x && pose.z === DIP.z;
        }
        if (pose.contact) {
          if (pose.segment !== lastStroke) {
            if (lastStroke >= 0)
              expect(
                maximumLift,
                `seed ${seed}, stroke ${pose.segment}`
              ).toBeGreaterThan(0.29);
            contacts.push(pose.segment);
            starts[pose.segment] = pose;
            lastStroke = pose.segment;
          }
          ends[pose.segment] = pose;
          maximumLift = 0;
          contactOnPaper &&= pose.y === pose.surfaceY && !pose.dipping;
        } else if (lastStroke >= 0)
          maximumLift = Math.max(maximumLift, pose.y - pose.surfaceY);
        if (pose.segment !== previous.segment)
          liftsSeparateStrokes &&= !(pose.contact && previous.contact);
        previous = pose;
        wasDipping = pose.dipping;
      }
      expect(contacts).toEqual(paths.map((_, index) => index));
      expect(dockOnlyReloads).toBe(true);
      expect(contactOnPaper).toBe(true);
      expect(liftsSeparateStrokes).toBe(true);
      expect(dips).toBe(reloads.size);
      expect(dips).toBeGreaterThan(1);
      expect(dips).toBeLessThanOrEqual(Math.ceil(paths.length / 3));
      for (const [index, path] of paths.entries()) {
        expect(
          Math.hypot(starts[index].x - path[0].x, starts[index].z - path[0].z)
        ).toBeLessThan(0.025);
        expect(
          Math.hypot(
            ends[index].x - path.at(-1)!.x,
            ends[index].z - path.at(-1)!.z
          )
        ).toBeLessThan(0.025);
      }
      expect(previous.contact).toBe(false);
      expect(previous.x).toBeCloseTo(DIP.x, 8);
      expect(previous.z).toBeCloseTo(DIP.z, 8);
    }
  });
  it('retains fine ink and gives identical results after seeking backwards', () => {
    const painting = new FloorPainting(job, 1, 2);
    painting.advance(FINISH_SWEEP);
    const mass = painting.paint.mass;
    expect(mass).toBeGreaterThan(0.01);
    expect(mass).toBeLessThan(0.15);
    const film = painting.paint.density.slice();
    const snapshot = painting.paint.snapshot();
    const incremental = new FloorPainting(job, 1, 2);
    for (let time = 0.37; time < FINISH_SWEEP; time += 0.37)
      incremental.advance(time);
    incremental.advance(FINISH_SWEEP);
    const incrementalSnapshot = incremental.paint.snapshot();
    for (const key of ['film', 'mobile', 'solvent', 'settled'] as const)
      expect(
        incrementalSnapshot[key].every(
          (value, index) => value === snapshot[key][index]
        )
      ).toBe(true);
    painting.advance(12);
    painting.advance(FINISH_SWEEP);
    expect(painting.paint.mass).toBe(mass);
    expect(painting.paint.density.every((v, i) => v === film[i])).toBe(true);
    const times = [0.01, 0.137, 0.333, 0.574, 0.789, 0.97];
    const poses = times.map((time) => sampleBrush(painting.paths, time, true));
    for (let index = times.length - 1; index >= 0; index--)
      expect(sampleBrush(painting.paths, times[index], true)).toEqual(
        poses[index]
      );
  });
});
