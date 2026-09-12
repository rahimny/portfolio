import { describe, expect, it } from 'vitest';
import { generateContours, planPrint } from './toolpath';
import { FloorPainting, sampleBrush, paintingPaths } from './painting';
import { BATH_DROPS, BATH_LEVEL, sampleBathDrop } from './bath';
import { FINISH_SWEEP } from './process';
import { LoadedBrush } from '../material-surface/brush';
const job = planPrint(generateContours('bloom'));

describe('material contact consequences', () => {
  it('keeps the tool continuous through dipping, contact, lift and return', () => {
    const paths = paintingPaths(job);
    let previous = sampleBrush(paths, 0);
    for (let i = 1; i <= 6000; i++) {
      const pose = sampleBrush(paths, i / 6000);
      expect(
        Math.hypot(
          pose.x - previous.x,
          pose.y - previous.y,
          pose.z - previous.z
        )
      ).toBeLessThan(0.06);
      if (pose.tether > 0) {
        expect(pose.contact).toBe(false);
        expect(pose.x).toBe(pose.anchor.x);
        expect(pose.z).toBe(pose.anchor.z);
      }
      previous = pose;
    }
  });
  it('limits lift beads to paint actually left in the brush', () => {
    const brush = new LoadedBrush();
    brush.dip(0.001);
    expect(brush.release(0.002)).toBe(0.001);
    expect(brush.release(0.002)).toBe(0);
    expect(brush.load).toBe(0);
  });
  it('changes the finished pigment with brush load and replays the same release events', () => {
    const dry = new FloorPainting(job, 0.6),
      heavy = new FloorPainting(job, 1.4);
    dry.advance(FINISH_SWEEP);
    heavy.advance(FINISH_SWEEP);
    expect(heavy.paint.mass).toBeGreaterThan(dry.paint.mass);
    const mass = heavy.paint.mass;
    heavy.advance(12);
    heavy.advance(FINISH_SWEEP);
    expect(heavy.paint.mass).toBe(mass);
  });
  it('ends each drop at the surface before starting its landing ripple', () => {
    for (let i = 0; i < BATH_DROPS; i++) {
      let landed = false;
      for (let progress = 0.55; progress <= 1; progress += 0.0005) {
        const drop = sampleBathDrop(job, progress, i);
        expect(Number.isFinite(drop.y)).toBe(true);
        if (drop.impactAge > 0 && !landed) {
          expect(drop.visible).toBe(false);
          expect(Math.abs(drop.y - BATH_LEVEL)).toBeLessThan(0.01);
          landed = true;
        }
      }
      expect(landed).toBe(true);
    }
  });
});
