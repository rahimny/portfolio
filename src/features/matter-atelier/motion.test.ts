import { describe, expect, it } from 'vitest';
import { ACCELERATION, motionDistance, profile } from './motion';
import { generateContours, planPrint, samplePrint } from './toolpath';
import {
  FINISH_APPROACH,
  FINISH_SWEEP,
  FINISH_DURATION,
  sampleProcess,
} from './process';

describe('lookahead motion', () => {
  it('integrates short and long acceleration profiles without overshoot', () => {
    for (const length of [0.001, 0.1, 1, 4]) {
      const p = profile(length, 0, 0, 0.8);
      const duration = p.accelerate + p.cruise + p.decelerate;
      expect(motionDistance(p, 0)).toBe(0);
      expect(motionDistance(p, duration)).toBeCloseTo(length, 9);
      let previous = 0;
      for (let i = 1; i <= 50; i++) {
        const d = motionDistance(p, (duration * i) / 50);
        expect(d).toBeGreaterThanOrEqual(previous);
        expect(d).toBeLessThanOrEqual(length + 1e-9);
        previous = d;
      }
    }
  });
  it('carries reachable speed through contour junctions and brakes before travel', () => {
    const job = planPrint(generateContours('bloom'));
    for (let i = 0; i < job.moves.length; i++) {
      const m = job.moves[i],
        p = m.motion;
      expect(p.peak).toBeGreaterThanOrEqual(Math.max(p.entry, p.exit) - 1e-8);
      expect(Math.abs(p.exit ** 2 - p.entry ** 2)).toBeLessThanOrEqual(
        2 * ACCELERATION * m.length + 1e-8
      );
      expect(motionDistance(p, m.end - m.start)).toBeCloseTo(m.length, 7);
      if (i) expect(p.entry).toBeCloseTo(job.moves[i - 1].motion.exit, 8);
      if (i && m.extrude !== job.moves[i - 1].extrude) expect(p.entry).toBe(0);
    }
  });
  it('moves monotonically upward between adjacent layer seams without a clearance bounce', () => {
    const job = planPrint(generateContours('bloom'));
    for (let layer = 1; layer < 100; layer++) {
      const first = job.moves.findIndex((m) => m.layer === layer && m.extrude);
      const transition = job.moves[first - 1];
      expect(transition.extrude).toBe(false);
      expect(transition.to.y).toBeGreaterThan(transition.from.y);
      expect(transition.to.y - transition.from.y).toBeLessThan(0.03);
      expect(job.moves[first - 2].extrude).toBe(true);
      const a = samplePrint(job, transition.start + 0.00001),
        b = samplePrint(job, transition.end - 0.00001);
      expect(b.position.y).toBeGreaterThan(a.position.y);
    }
  });
});
describe('surface finishing', () => {
  const job = planPrint(generateContours('bloom'));
  it('keeps the arm parked while depositing and returns it after treatment', () => {
    expect(sampleProcess(job, 0).arm).toEqual(
      sampleProcess(job, job.duration - 1).arm
    );
    expect(sampleProcess(job, job.duration + FINISH_DURATION).stage).toBe(
      'complete'
    );
    expect(sampleProcess(job, job.duration + FINISH_DURATION).arm).toEqual(
      sampleProcess(job, 0).arm
    );
  });
  it('synchronises coating height, beam and arm and supports reversible scrubbing', () => {
    const time = job.duration + FINISH_APPROACH + FINISH_SWEEP * 0.5;
    const halfway = sampleProcess(job, time);
    expect(halfway.beam).toBe(true);
    expect(halfway.sweep).toBeCloseTo(0.5);
    expect(halfway.stage).toBe('painting');
    expect(halfway.object.x).toBe(4);
    sampleProcess(job, job.duration + FINISH_DURATION);
    expect(sampleProcess(job, time)).toEqual(halfway);
    expect(sampleProcess(job, 0).sweep).toBe(0);
  });
});
