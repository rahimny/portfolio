import { describe, expect, it } from 'vitest';
import { generateContours, planPrint } from './toolpath';
import {
  sampleProcess,
  FINISH_DURATION,
  FINISH_APPROACH,
  FINISH_SWEEP,
  BRUSH_BASE,
} from './process';
import { FloorPainting, paintingPaths, sampleBrush } from './painting';
import { solveBrushArm, SHOULDER, UPPER_ARM, FOREARM } from './brushKinematics';
const job = planPrint(generateContours('bloom'));
describe('creative pipeline', () => {
  it('keeps one object continuous through lift, bath and delivery', () => {
    let previous = sampleProcess(job, job.duration).object;
    for (let t = 0; t <= FINISH_DURATION; t += 0.25) {
      const current = sampleProcess(job, job.duration + t).object;
      expect(
        Math.hypot(
          current.x - previous.x,
          current.y - previous.y,
          current.z - previous.z
        )
      ).toBeLessThan(0.3);
      if (current.x > -4.9 && current.x < 3.9)
        expect(current.y).toBeCloseTo(3.7);
      previous = current;
    }
    expect(previous).toEqual({ x: 6.3, y: 0, z: 3.8 });
  });
  it('keeps the brush within its annular reach and lifts between separate contours', () => {
    const paths = paintingPaths(job);
    for (let i = 0; i < 1000; i++) {
      const pose = sampleBrush(paths, i / 1000);
      const radius = Math.hypot(pose.x - BRUSH_BASE.x, pose.z - BRUSH_BASE.z);
      expect(radius).toBeGreaterThan(0.95);
      const wrist = solveBrushArm(pose).wrist;
      expect(
        Math.hypot(
          wrist.x - SHOULDER.x,
          wrist.y - SHOULDER.y,
          wrist.z - SHOULDER.z
        )
      ).toBeLessThan(UPPER_ARM + FOREARM);
      if (pose.contact) {
        expect(radius).toBeLessThan(2.95);
        expect(pose.y).toBe(0.095);
      }
    }
    expect(sampleBrush(paths, 1 / 3).contact).toBe(false);
    expect(sampleBrush(paths, 2 / 3).contact).toBe(false);
    expect(paths).not.toEqual(
      paintingPaths(planPrint(generateContours('ribbon')))
    );
  });
  it('reconstructs the same pigment after a backwards seek and different frame increments', () => {
    const painting = new FloorPainting(job);
    painting.advance(40);
    const first = painting.paint.snapshot();
    painting.advance(FINISH_SWEEP + 60);
    painting.advance(40);
    for (const key of ['film', 'mobile', 'solvent', 'settled'] as const)
      expect(
        painting.paint.snapshot()[key].every((v, i) => v === first[key][i])
      ).toBe(true);
    const stepped = new FloorPainting(job);
    for (let t = 0.25; t <= 40; t += 0.25) stepped.advance(t);
    for (const key of ['film', 'mobile', 'solvent', 'settled'] as const)
      expect(
        stepped.paint.snapshot()[key].every((v, i) => v === first[key][i])
      ).toBe(true);
    painting.advance(-FINISH_APPROACH);
    expect(painting.paint.mass).toBe(0);
  });
});
