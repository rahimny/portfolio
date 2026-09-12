import { describe, expect, it } from 'vitest';
import {
  ARM_COUNT,
  ARM_SEGMENTS,
  DEFAULT_POSE,
  sampleArm,
  armLength,
} from './model';
describe('octopus arm kinematics', () => {
  it('keeps every link inextensible across extreme poses and time', () => {
    let maxLengthError = 0;
    let minRadius = Infinity;
    let maxTaperStep = -Infinity;
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      const length = armLength(arm) / ARM_SEGMENTS;
      for (const curl of [0, 1])
        for (const spread of [0, 1])
          for (const time of [0, 2, 91]) {
            const points = sampleArm(arm, time, { curl, spread, current: 1 });
            points.slice(1).forEach((p, i) => {
              const q = points[i];
              maxLengthError = Math.max(
                maxLengthError,
                Math.abs(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) - length)
              );
              minRadius = Math.min(minRadius, p.radius);
              maxTaperStep = Math.max(maxTaperStep, p.radius - q.radius);
            });
          }
    }
    expect(maxLengthError).toBeLessThan(1e-10);
    expect(minRadius).toBeGreaterThan(0);
    expect(maxTaperStep).toBeLessThan(0);
  });
  it('anchors each arm independently and moves its tip with curl', () => {
    const roots = new Set<string>();
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      const rest = sampleArm(arm, 0, DEFAULT_POSE);
      const curled = sampleArm(arm, 3, { ...DEFAULT_POSE, curl: 1 });
      expect(curled[0]).toEqual(rest[0]);
      expect(curled.at(-1)).not.toEqual(rest.at(-1));
      roots.add(`${rest[0].x},${rest[0].z}`);
    }
    expect(roots.size).toBe(8);
  });
  it('keeps the default tips open while whole arms visibly sweep', () => {
    let middleTravel = 0;
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      const start = sampleArm(arm, 0, DEFAULT_POSE);
      const later = sampleArm(arm, 2, DEFAULT_POSE);
      const a = start[32],
        b = later[32];
      middleTravel += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      for (let time = 0; time < 24; time += 0.5) {
        const tip = sampleArm(arm, time, DEFAULT_POSE).at(-1)!;
        expect(tip.bend).toBeLessThan(1.8);
      }
    }
    expect(middleTravel / ARM_COUNT).toBeGreaterThan(0.8);
  });
});
