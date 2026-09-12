import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Vector3 } from 'three';
import {
  advanceMechanism,
  createMechanism,
  driveServo,
  MECHANICS,
} from './mechanics';

const scenarios = [
  new Vector3(-5, 6, 5),
  new Vector3(6, 0.4, 3),
  new Vector3(-4, 0.4, 4),
  new Vector3(5, 7, 3),
  new Vector3(2, 3, 6),
];

describe('mechanical surveillance rig', () => {
  it('limits acceleration and brakes a reversing servo', () => {
    const axis = { position: 0, velocity: 0 };
    driveServo(axis, 1, 1 / 120, 2, 8);
    expect(axis.velocity).toBeCloseTo(8 / 120);
    const velocity = axis.velocity;
    driveServo(axis, -1, 1 / 120, 2, 8);
    expect(Math.abs(axis.velocity - velocity)).toBeLessThanOrEqual(
      8 / 120 + 1e-8
    );
    for (let i = 0; i < 500; i++) driveServo(axis, -1, 1 / 120, 2, 8);
    expect(axis.position).toBeCloseTo(-1, 5);
  });

  it('keeps rigid link lengths, grounded support and bounded gimbals through reversals', () => {
    const state = createMechanism();
    let airborne = 0;
    for (let frame = 0; frame < 3600; frame++) {
      const target = scenarios[Math.floor(frame / 240) % scenarios.length];
      const oldFeet = state.legs.map((leg) => leg.foot.clone());
      const oldGroup = state.swingGroup;
      advanceMechanism(state, target, 1 / 60, frame % 300 < 10 ? 1 : 0);
      expect(Math.abs(state.headYaw.position)).toBeLessThanOrEqual(
        MECHANICS.headYawLimit
      );
      expect(Math.abs(state.headPitch.position)).toBeLessThanOrEqual(
        MECHANICS.headPitchLimit
      );
      expect(
        state.legs.filter((leg) => leg.foot.y > 0.036).length
      ).toBeLessThanOrEqual(4);
      if (state.phase === 'stepping') {
        airborne++;
        expect(state.supportMargin).toBeGreaterThan(0.04);
      }
      for (let i = 0; i < state.legs.length; i++) {
        const leg = state.legs[i];
        expect(leg.hip.distanceTo(leg.knee)).toBeCloseTo(
          MECHANICS.upperLength,
          5
        );
        expect(leg.knee.distanceTo(leg.ankle)).toBeCloseTo(leg.lowerReach, 5);
        expect(leg.knee.distanceTo(leg.hock)).toBeCloseTo(
          MECHANICS.shinLength,
          5
        );
        expect(leg.hock.distanceTo(leg.ankle)).toBeCloseTo(
          MECHANICS.metatarsusLength,
          5
        );
        expect(leg.foot.y).toBeGreaterThanOrEqual(0.0349);
        if (leg.cohort !== state.swingGroup && leg.cohort !== oldGroup)
          expect(leg.foot.distanceTo(oldFeet[i])).toBe(0);
      }
    }
    expect(airborne).toBeGreaterThan(60);
    expect(state.stepCount).toBeGreaterThan(10);
  });

  it('walks to changing goals with locked stance feet and alternating tetrapods', () => {
    const state = createMechanism();
    expect(state.legs).toHaveLength(8);
    expect(state.legs.filter((leg) => leg.cohort === 0)).toHaveLength(4);
    const goals = [
      new Vector3(2.5, 0, 1),
      new Vector3(-2.5, 0, 1),
      new Vector3(-1, 0, -1.8),
      new Vector3(),
    ];
    let overlap = false;
    let simultaneous = false;
    let minSupport = Infinity;
    for (const goal of goals) {
      for (let i = 0; i < 600; i++) {
        const before = state.legs.map((leg) => leg.foot.clone());
        const oldGroup = state.swingGroup;
        advanceMechanism(state, new Vector3(2, 4, 7), 1 / 60, 0, false, goal);
        const raised = state.legs.filter((leg) => leg.foot.y > 0.036);
        if (raised.length === 4) simultaneous = true;
        if (state.phase === 'settling' && raised.length === 0) overlap = true;
        expect(raised.length).toBeLessThanOrEqual(4);
        expect(
          new Set(raised.map((leg) => leg.cohort)).size
        ).toBeLessThanOrEqual(1);
        minSupport = Math.min(minSupport, state.supportMargin);
        for (let j = 0; j < state.legs.length; j++) {
          const leg = state.legs[j];
          expect(leg.hip.distanceTo(leg.knee)).toBeCloseTo(
            MECHANICS.upperLength,
            5
          );
          expect(leg.knee.distanceTo(leg.ankle)).toBeCloseTo(leg.lowerReach, 5);
          if (leg.cohort !== oldGroup && leg.cohort !== state.swingGroup)
            expect(leg.foot.distanceTo(before[j])).toBe(0);
        }
      }
      expect(state.translation.distanceTo(goal)).toBeLessThan(0.16);
    }
    expect(minSupport).toBeGreaterThan(0.08);
    expect(state.travelDistance).toBeGreaterThan(10);
    expect(overlap).toBe(true);
    expect(simultaneous).toBe(true);
  });

  it('folds the extra lower hinge during swing without stretching either section', () => {
    const state = createMechanism();
    let standingAngle = 0;
    let foldedAngle = 0;
    for (let frame = 0; frame < 600; frame++) {
      advanceMechanism(
        state,
        new Vector3(3, 4, 7),
        1 / 60,
        0,
        false,
        new Vector3(2.5, 0, 1)
      );
      for (const leg of state.legs) {
        const angle = leg.hock
          .clone()
          .sub(leg.knee)
          .angleTo(leg.ankle.clone().sub(leg.hock));
        if (leg.foot.y <= 0.036) standingAngle = Math.max(standingAngle, angle);
        if (leg.foot.y > 0.15) foldedAngle = Math.max(foldedAngle, angle);
        expect(leg.knee.distanceTo(leg.hock)).toBeCloseTo(
          MECHANICS.shinLength,
          5
        );
        expect(leg.hock.distanceTo(leg.ankle)).toBeCloseTo(
          MECHANICS.metatarsusLength,
          5
        );
      }
    }
    expect(foldedAngle - standingAngle).toBeGreaterThan(0.2);
  });

  it('holds every articulated pose while paused and places valid discrete poses', () => {
    const state = createMechanism();
    for (let i = 0; i < 100; i++)
      advanceMechanism(state, scenarios[1], 1 / 60, 0);
    const before = JSON.stringify(state);
    advanceMechanism(state, scenarios[3], 0, 1);
    expect(JSON.stringify(state)).toBe(before);
    advanceMechanism(state, scenarios[3], 0, 0, true);
    expect(state.activeLeg).toBe(-1);
    expect(state.legs.every((leg) => leg.foot.y === 0.035)).toBe(true);
  });

  it('keeps the CCTV enclosure above the armour at all pan and tilt limits', () => {
    for (let yaw = -0.68; yaw <= 0.681; yaw += 0.068) {
      for (let pitch = -0.48; pitch <= 0.481; pitch += 0.048) {
        const transform = new Matrix4().makeRotationFromEuler(
          new Euler(pitch, yaw, 0, 'YXZ')
        );
        for (const x of [-0.62, 0.62])
          for (const y of [-0.375, 0.5])
            for (const z of [-0.42, 1.24]) {
              const corner = new Vector3(x, y, z)
                .applyMatrix4(transform)
                .add(MECHANICS.headPivot);
              expect(corner.y).toBeGreaterThan(0.64);
            }
      }
    }
  });

  it('lowers into a watchful crouch after pursuit while the head retains its target', () => {
    const state = createMechanism();
    const gaze = new Vector3(3, 4, 8);
    const goal = new Vector3(2.5, 0, 1);
    let walkingHeight = 0;
    for (let i = 0; i < 900; i++) {
      advanceMechanism(state, gaze, 1 / 60, 0, false, goal);
      if (state.velocity.length() > 0.9)
        walkingHeight = Math.max(walkingHeight, state.height.position);
    }
    expect(walkingHeight - state.height.position).toBeGreaterThan(0.035);
    expect(state.velocity.length()).toBeLessThan(0.01);
    expect(state.phase).toBe('holding');
    expect(Math.abs(state.headYaw.velocity)).toBeLessThan(0.01);
  });

  it('settles instead of continuing an arbitrary idle gait', () => {
    const state = createMechanism();
    for (let i = 0; i < 2400; i++)
      advanceMechanism(state, scenarios[1], 1 / 60, 0);
    const steps = state.stepCount;
    for (let i = 0; i < 600; i++)
      advanceMechanism(state, scenarios[1], 1 / 60, 0);
    expect(state.stepCount).toBe(steps);
    expect(state.phase).toBe('holding');
  });
});
