import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dampNereidScroll,
  nereidScrollPose,
  nereidScrollProgress,
} from './nereidScroll';
import { SwimScore } from '../nereid/SwimScore';

describe('Nereid homepage score', () => {
  it('swims into the opening, then relaxes the bell while tentacles keep flowing', () => {
    for (let i = 0; i <= 100; i++) {
      const pose = nereidScrollPose(i / 100);
      if (pose.opening > 0.25) expect(pose.swimWeight).toBe(0);
      expect(pose.limbWeight).toBe(1);
    }
    expect(nereidScrollPose(0.27).separation).toBe(0);
    expect(nereidScrollPose(0.24).swimWeight).toBe(1);
    expect(nereidScrollPose(0.24).roll).toBeGreaterThan(0.9);
    expect(nereidScrollPose(0.32).swimWeight).toBeGreaterThan(0.7);
    expect(nereidScrollPose(0.2).swim).toBeGreaterThan(0.18);
    expect(nereidScrollPose(1).separation).toBeCloseTo(0.72);
  });

  it('continues sampling moving tentacles throughout the core reveal', () => {
    const score = new SwimScore();
    score.loadFrames(
      new Uint8Array(readFileSync('public/nereid/home-swim.bin')).buffer
    );
    let previous: number[] | undefined;
    for (const progress of [0.3, 0.4, 0.5, 0.6, 0.7, 0.76]) {
      const pose = nereidScrollPose(progress);
      expect(pose.separation).toBeGreaterThan(0);
      const model = score.sample(pose.swim);
      const positions = [...model.chains[0].positions];
      if (previous) expect(positions).not.toEqual(previous);
      previous = positions;
    }
  });

  it('enters early and begins revealing the core before reaching the centre', () => {
    expect(nereidScrollPose(0.2).arrival).toBeGreaterThan(0.5);
    const approach = nereidScrollPose(0.32);
    expect(approach.arrival).toBeGreaterThan(0.85);
    expect(approach.arrival).toBeLessThan(1);
    expect(approach.separation).toBeGreaterThan(0);
    expect(approach.swimWeight).toBeGreaterThan(0);
    expect(nereidScrollPose(0.8).opening).toBe(1);
  });

  it('bounds the entry, exit and invalid input', () => {
    expect(nereidScrollPose(-10)).toEqual(nereidScrollPose(0));
    expect(nereidScrollPose(Infinity)).toEqual(nereidScrollPose(0));
    expect(nereidScrollPose(10)).toEqual(nereidScrollPose(1));
    expect(nereidScrollProgress(800, 2300, 1000, 948, 52)).toBe(0);
    expect(nereidScrollProgress(-1300, 2300, 1000, 948, 52)).toBe(1);
  });

  it('turns during disassembly and returns every twist to zero when reassembled', () => {
    const assembled = nereidScrollPose(0.27);
    const opened = nereidScrollPose(1);
    expect(
      opened.yaw - assembled.yaw - (opened.arrival - assembled.arrival)
    ).toBeCloseTo(1.45);
    expect(opened.shellTwist).toBeCloseTo(0.22);
    expect(assembled.shellTwist).toBe(0);
    expect(assembled.pitch).toBeCloseTo(0);
    expect(nereidScrollPose(0.52).pitch).toBeLessThan(-0.08);
  });

  it('settles without overshoot at different frame rates and bounds large seeks', () => {
    for (const fps of [30, 60, 120]) {
      let progress = 0.4;
      for (let i = 0; i < fps * 2; i++) {
        progress = dampNereidScroll(progress, 0.5, 1 / fps);
        expect(progress).toBeLessThanOrEqual(0.5);
      }
      expect(progress).toBe(0.5);
    }
    expect(dampNereidScroll(0, 1, 1 / 60)).toBeGreaterThan(0.82);
    expect(dampNereidScroll(1, 0, 1 / 60)).toBeLessThan(0.18);
  });

  it('returns identical tendril and bell poses after reversing and arbitrary seeks', () => {
    const score = new SwimScore();
    const recording = readFileSync('public/nereid/home-swim.bin');
    score.loadFrames(new Uint8Array(recording).buffer);
    const capture = () => ({
      bell: score.model.bell,
      tip: [...score.model.chains[0].positions],
    });
    score.sample(0.37);
    const first = capture();
    score.sample(0.91);
    score.sample(0.12);
    score.sample(0.37);
    expect(capture()).toEqual(first);
    score.sample(0.5);
    expect(capture()).not.toEqual(first);
    expect(
      score.model.chains.every((c) => c.positions.every(Number.isFinite))
    ).toBe(true);
  });

  it('rejects a malformed recording instead of uploading invalid GPU poses', () => {
    expect(() => new SwimScore().loadFrames(new ArrayBuffer(4))).toThrow();
  });

  it('can cancel preparation before advancing the simulation', async () => {
    const controller = new AbortController();
    controller.abort();
    const score = new SwimScore();
    await score.prepare(controller.signal);
    expect(score.model.steps).toBe(0);
  });
});
