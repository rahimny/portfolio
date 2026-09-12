import { describe, expect, it } from 'vitest';
import {
  Euler,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import {
  advanceMechanism,
  createMechanism,
  GIMBAL,
  MECHANICS,
} from './mechanics';
import { observationPosition } from './observation';

describe('whole-body observation', () => {
  it('follows targets around the entire body and through the angle wrap', () => {
    const state = createMechanism();
    for (const angle of [2.5, 3.4, 4.7, 6.1, 7.4]) {
      const target = new Vector3(Math.sin(angle) * 8, 4, Math.cos(angle) * 8);
      for (let frame = 0; frame < 1000; frame++)
        advanceMechanism(state, target, 1 / 60, 0);
      const error = Math.atan2(
        Math.sin(angle - state.yaw.position),
        Math.cos(angle - state.yaw.position)
      );
      expect(Math.abs(error)).toBeLessThan(0.2);
      expect(Math.abs(state.headYaw.position)).toBeLessThan(0.23);
      for (const leg of state.legs) {
        expect(leg.hip.distanceTo(leg.knee)).toBeCloseTo(
          MECHANICS.upperLength,
          5
        );
        expect(leg.knee.distanceTo(leg.ankle)).toBeCloseTo(leg.lowerReach, 5);
      }
    }
  });

  it.each([1440 / 898, 390 / 792])(
    'repositions for high and low cursor targets at aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(
        aspect < 0.75 ? 57 : 42,
        aspect,
        0.1,
        60
      );
      camera.position.set(6.5, 7.2, 12);
      camera.lookAt(0, 1.7, 0);
      camera.updateMatrixWorld();
      const normal = camera.getWorldDirection(new Vector3());
      const right = new Vector3(1, 0, 0)
        .applyQuaternion(camera.quaternion)
        .setY(0)
        .normalize();
      const forward = normal.clone().setY(0).normalize();
      const centre = new Vector3(0, 2.7, 0).addScaledVector(normal, -6.5);
      const plane = new Plane().setFromNormalAndCoplanarPoint(normal, centre);
      const ray = new Raycaster();
      for (const [x, y] of [
        [0, 0.95],
        [-0.9, 0.9],
        [0.9, 0.9],
        [0, -0.9],
      ]) {
        const state = createMechanism();
        ray.setFromCamera(new Vector2(x, y), camera);
        const target = ray.ray.intersectPlane(plane, new Vector3())!;
        const preferred = right
          .clone()
          .multiplyScalar(x * (aspect < 0.75 ? 0.85 : 2.7))
          .addScaledVector(forward, y * (aspect < 0.75 ? 1.25 : 2.4));
        const goal = observationPosition(
          target,
          preferred,
          right,
          forward,
          aspect < 0.75 ? 0.85 : 3.2,
          3.94,
          new Vector3()
        );
        for (let frame = 0; frame < 1400; frame++)
          advanceMechanism(state, target, 1 / 60, 0, false, goal);
        const optic = new Vector3(0, 0, 1)
          .applyQuaternion(
            new Quaternion().setFromEuler(
              new Euler(
                state.headPitch.position,
                state.headYaw.position,
                0,
                'YXZ'
              )
            )
          )
          .applyQuaternion(state.rotation);
        const pivot = MECHANICS.headPivot.clone().applyMatrix4(state.matrix);
        const error = optic.angleTo(target.clone().sub(pivot));
        expect(error, `cursor ${x}, ${y}`).toBeLessThan(0.035);
        expect(Math.abs(state.headPitch.position)).toBeLessThan(0.43);
        expect(state.translation.distanceTo(goal)).toBeLessThan(0.16);
      }
    }
  );

  it('separates the rotating bridge, bearing and fork from stationary hardware', () => {
    expect(GIMBAL.rotorBottom - GIMBAL.fixedBearingTop).toBeGreaterThan(0.01);
    expect(
      MECHANICS.headPivot.y +
        GIMBAL.bridgeY -
        GIMBAL.bridgeHalfHeight -
        GIMBAL.fixedBearingTop
    ).toBeGreaterThan(0.05);
    // Tilt preserves X, so this clearance holds across the complete pitch sweep.
    expect(GIMBAL.forkInnerX - 0.62).toBeGreaterThan(0.035);
  });
});
