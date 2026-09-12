import { clamp, v, type Quat } from '../scene-interactions/math';
import { JOINTS, type HandPose } from './rig';

/** Zero velocity and acceleration at both ends; used for deliberate reaches and holds. */
export function minimumJerk(value: number): number {
  const t = clamp(value);
  return t * t * t * (10 + t * (-15 + 6 * t));
}
export function pulse(time: number, start: number, end: number): number {
  return (
    minimumJerk((time - start) / 0.18) * (1 - minimumJerk((time - end) / 0.2))
  );
}

/** Analytic critically damped response. Velocity survives retargeting and phase changes. */
export class PoseMotion {
  readonly value: HandPose;
  readonly rootVelocity = v();
  private rotationVelocity = { x: 0, y: 0, z: 0, w: 0 };
  private jointVelocity = JOINTS.map(() => ({ x: 0, y: 0, z: 0, w: 0 }));
  constructor(initial: HandPose) {
    this.value = structuredClone(initial);
  }
  private springQuaternion(
    value: Quat,
    velocity: Quat,
    target: Quat,
    omega: number,
    dt: number
  ): void {
    const sign =
      value.x * target.x +
        value.y * target.y +
        value.z * target.z +
        value.w * target.w <
      0
        ? -1
        : 1;
    const decay = Math.exp(-omega * dt);
    for (const k of ['x', 'y', 'z', 'w'] as const) {
      const offset = value[k] - target[k] * sign,
        j = velocity[k] + omega * offset;
      value[k] = target[k] * sign + (offset + j * dt) * decay;
      velocity[k] = (velocity[k] - omega * j * dt) * decay;
    }
    const n = Math.hypot(value.x, value.y, value.z, value.w) || 1;
    value.x /= n;
    value.y /= n;
    value.z /= n;
    value.w /= n;
    const radial =
      value.x * velocity.x +
      value.y * velocity.y +
      value.z * velocity.z +
      value.w * velocity.w;
    for (const k of ['x', 'y', 'z', 'w'] as const)
      velocity[k] = (velocity[k] - value[k] * radial) / n;
  }
  step(target: HandPose, dt: number, active: boolean): HandPose {
    const omega = active ? 33 : 17,
      decay = Math.exp(-omega * dt);
    for (const k of ['x', 'y', 'z'] as const) {
      const offset = this.value.root[k] - target.root[k],
        j = this.rootVelocity[k] + omega * offset;
      this.value.root[k] = target.root[k] + (offset + j * dt) * decay;
      this.rootVelocity[k] = (this.rootVelocity[k] - omega * j * dt) * decay;
    }
    this.springQuaternion(
      this.value.rotation,
      this.rotationVelocity,
      target.rotation,
      active ? 34 : 20,
      dt
    );
    for (let i = 0; i < JOINTS.length; i++) {
      const j = JOINTS[i];
      // A shared flexion programme with small distal/adjacent-digit lag, not independent noise.
      const response =
        (active ? 43 : 28) -
        (j.segment > 0 ? j.segment * 2.5 : 0) -
        (j.finger === 1 || j.finger === 2 ? 2 : 0);
      this.springQuaternion(
        this.value.joints[i],
        this.jointVelocity[i],
        target.joints[i],
        response,
        dt
      );
    }
    return this.value;
  }
}
