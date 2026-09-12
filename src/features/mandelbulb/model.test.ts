import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  cursorSlicePercent,
  cursorSlicePlane,
  growthPose,
  patternWeights,
  readSettings,
  sectionPlane,
} from './model';

describe('Mandelbulb inspection state', () => {
  it('rejects malformed and non-finite shared parameters before they reach the GPU', () => {
    for (const state of [
      null,
      {},
      { ...DEFAULT_SETTINGS, power: NaN },
      { ...DEFAULT_SETTINGS, power: 11 },
      { ...DEFAULT_SETTINGS, section: Infinity },
      { ...DEFAULT_SETTINGS, section: -1 },
      { ...DEFAULT_SETTINGS, detail: 'unbounded' },
      { ...DEFAULT_SETTINGS, speed: -1 },
      { ...DEFAULT_SETTINGS, pattern: 'missing' },
      { ...DEFAULT_SETTINGS, response: 100 },
      { ...DEFAULT_SETTINGS, complexity: 15 },
    ])
      expect(readSettings(state)).toBeNull();
    expect(readSettings({ power: 3, section: 100, detail: 'fine' })).toEqual({
      ...DEFAULT_SETTINGS,
      power: 3,
      section: 100,
      detail: 'fine',
    });
  });
  it('places the unopened cut outside the body and moves continuously through its centre', () => {
    expect(sectionPlane(0)).toBeGreaterThan(1.3);
    expect(sectionPlane(100)).toBeCloseTo(-0.5);
    expect(sectionPlane(50)).toBeCloseTo(
      (sectionPlane(0) + sectionPlane(100)) / 2
    );
    expect(sectionPlane(-50)).toBe(sectionPlane(0));
    expect(sectionPlane(500)).toBe(sectionPlane(100));
  });
});
describe('growth and natural movement', () => {
  it('grows a seed monotonically and arrives at the requested recursive depth', () => {
    let prior = growthPose(0, 9, 8);
    expect(prior.scale).toBe(0.18);
    expect(prior.branching).toBe(0);
    expect(prior.complexity).toBe(1);
    for (let age = 0.05; age <= 10; age += 0.05) {
      const pose = growthPose(age, 9, 8);
      expect(pose.scale).toBeGreaterThanOrEqual(prior.scale);
      expect(pose.complexity).toBeGreaterThanOrEqual(prior.complexity);
      expect(pose.branching).toBeGreaterThanOrEqual(prior.branching);
      prior = pose;
    }
    expect(prior).toEqual({
      scale: 1,
      complexity: 8,
      branching: 1,
      progress: 1,
      phase: 'Living',
    });
  });
  it('completes at the configured duration without frame-rate-dependent increments', () => {
    expect(growthPose(4.5, 9, 9)).toEqual(growthPose(10, 20, 9));
    expect(growthPose(-1, 9, 8)).toEqual(growthPose(0, 9, 8));
    expect(growthPose(900, 9, 8)).toEqual(growthPose(9, 9, 8));
  });
  it('crossfades patterns without discontinuities or amplitude gain at phase boundaries', () => {
    for (let t = 0; t < 55; t += 0.03) {
      const weights = patternWeights('cycle', t);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      expect(weights.every((v) => v >= 0 && v <= 1)).toBe(true);
      const next = patternWeights('cycle', t + 0.001);
      expect(
        Math.max(...weights.map((v, i) => Math.abs(v - next[i])))
      ).toBeLessThan(0.001);
    }
    expect(patternWeights('cycle', 0)).toEqual(patternWeights('cycle', 27));
    expect(patternWeights('breathe', 9)).toEqual([1, 0, 0]);
    expect(patternWeights('tide', 9)).toEqual([0, 1, 0]);
    expect(patternWeights('unfurl', 9)).toEqual([0, 0, 1]);
  });
});

describe('cursor slice mapping', () => {
  it('maps centre and screen directions to reversible, bounded plane offsets', () => {
    expect(cursorSlicePercent(0)).toBeCloseTo(50);
    expect(cursorSlicePlane(50)).toBeCloseTo(0);
    expect(cursorSlicePlane(0)).toBeCloseTo(1.7);
    for (const value of [-1.5, -0.5, 0, 0.5, 1.5])
      expect(cursorSlicePlane(cursorSlicePercent(value))).toBeCloseTo(value);
    expect(cursorSlicePercent(100)).toBe(cursorSlicePercent(1.5));
    expect(
      readSettings({ ...DEFAULT_SETTINGS, slicing: 'diagonal' })
    ).toBeNull();
    expect(readSettings({ ...DEFAULT_SETTINGS, sliceX: NaN })).toBeNull();
    expect(readSettings({ ...DEFAULT_SETTINGS, cutAccent: 1 })).toBeNull();
  });
});
