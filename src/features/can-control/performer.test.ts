import { describe, expect, it } from 'vitest';
import {
  buildScore,
  DEFAULT_SETTINGS,
  presetPath,
  STEP,
  type Stamp,
} from './model';
import { FLIGHT, magnitude, nozzleTransform, Performer } from './performer';

describe('voxel drone performer', () => {
  it('finishes each preset with distinct approach, paint, lift and inspection phases', () => {
    for (const preset of [
      'specimen',
      'line',
      'loop',
      'hold',
      'flare',
    ] as const) {
      const p = new Performer(
        buildScore(
          presetPath(preset),
          DEFAULT_SETTINGS,
          preset === 'flare' ? 'flare' : 'follow',
          preset === 'specimen'
        ),
        'fine'
      );
      const phases = new Set<string>();
      let steps = 0,
        count = 0;
      while (!p.complete && steps++ < 120 * 120) {
        phases.add(p.phase);
        p.advance(STEP, () => {
          count++;
        });
      }
      expect(
        p.complete,
        `${preset}: ${p.phase}, time ${p.time}, body ${JSON.stringify(p.body)}, target ${JSON.stringify(p.pose)}`
      ).toBe(true);
      expect([...phases]).toEqual([
        'approach',
        'align',
        'paint',
        'lift',
        'inspect',
      ]);
      expect(count).toBeGreaterThan(0);
      expect(p.valve).toBe(0);
    }
  });

  it('repeats trajectory and paint events across 30/60/120 Hz rendering', () => {
    const score = buildScore(presetPath('loop'), DEFAULT_SETTINGS);
    const run = (hz: number) => {
      const p = new Performer(score, 'fine');
      const stamps: Stamp[] = [];
      for (let i = 0; i < hz * 6; i++) p.advance(1 / hz, (s) => stamps.push(s));
      return { rig: p.rig, time: p.time, phase: p.phase, stamps };
    };
    expect(run(30)).toEqual(run(120));
    expect(run(60)).toEqual(run(120));
  });

  it('bounds flight, angular motion and mount travel through a close, fast corner and reversal', () => {
    const score = buildScore(
      [
        [
          { x: 0.3, y: 0.3 },
          { x: 2.8, y: 2 },
          { x: 0.3, y: 0.3 },
          { x: 0.3, y: 2.1 },
        ],
      ],
      { distance: 0.04, speed: 3, cap: 'fat' }
    );
    const p = new Performer(score, 'fat');
    let steps = 0;
    while (!p.complete && steps++ < 120 * 120) {
      const a = { ...p.acceleration },
        angles = { ...p.angles },
        pitch = p.mountPitch,
        yaw = p.mountYaw;
      p.advance(STEP, () => {});
      expect(p.body.z).toBeGreaterThanOrEqual(FLIGHT.minBodyZ);
      expect(p.nozzle.origin.z).toBeGreaterThan(0.035);
      expect(magnitude(p.velocity)).toBeLessThanOrEqual(FLIGHT.maxSpeed);
      expect(magnitude(p.acceleration)).toBeLessThanOrEqual(
        FLIGHT.maxAcceleration + 1e-8
      );
      expect(
        Math.hypot(
          p.acceleration.x - a.x,
          p.acceleration.y - a.y,
          p.acceleration.z - a.z
        ) / STEP
      ).toBeLessThanOrEqual(FLIGHT.maxJerk + 1e-7);
      expect(Math.abs(p.mountPitch)).toBeLessThanOrEqual(FLIGHT.mountLimit);
      expect(Math.abs(p.mountYaw)).toBeLessThanOrEqual(FLIGHT.mountLimit);
      expect(Math.abs(p.mountPitch - pitch) / STEP).toBeLessThanOrEqual(
        FLIGHT.mountRate + 1e-8
      );
      expect(Math.abs(p.mountYaw - yaw) / STEP).toBeLessThanOrEqual(
        FLIGHT.mountRate + 1e-8
      );
      for (const axis of ['x', 'y', 'z'] as const)
        expect(
          Math.abs(p.angles[axis] - angles[axis]) / STEP
        ).toBeLessThanOrEqual(FLIGHT.angularRate + 1e-8);
    }
    expect(p.complete).toBe(true);
  });

  it('deposits only from the actual articulated nozzle and never during approach or inspection', () => {
    const p = new Performer(
      buildScore(presetPath('flare'), DEFAULT_SETTINGS, 'flare'),
      'fine'
    );
    while (!p.complete) {
      const before = p.pose;
      const phase = p.phase;
      const events: Stamp[] = [];
      p.advance(STEP, (s) => events.push(s));
      const actual = nozzleTransform(p.rig);
      expect(p.pose).toEqual(actual.impact);
      if (phase !== 'paint') expect(events).toHaveLength(0);
      for (const stamp of events) {
        const segmentLength = Math.hypot(
          p.pose.x - before.x,
          p.pose.y - before.y
        );
        expect(
          Math.hypot(stamp.x - before.x, stamp.y - before.y)
        ).toBeLessThanOrEqual(segmentLength + 1e-8);
      }
    }
  });
});
