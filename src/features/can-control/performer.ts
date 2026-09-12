import { projectApplicator, WALL_FRAME } from '../material-surface/surface';
import {
  interpolate,
  STEP,
  WALL,
  sweep,
  type Motion,
  type Pose,
  type Score,
  type Settings,
  type Stamp,
} from './model';

export type PlaybackRate = 1 | 2 | 4 | 8;
export type Vec3 = { x: number; y: number; z: number };
export type Phase =
  | 'approach'
  | 'align'
  | 'paint'
  | 'lift'
  | 'inspect'
  | 'rest';
export const FLIGHT = {
  maxSpeed: 1.65,
  maxAcceleration: 5,
  maxJerk: 65,
  minBodyZ: 0.62,
  mountLimit: 0.38,
  mountRate: 1.8,
  pitchLimit: 0.09,
  yawLimit: 0.18,
  rollLimit: 0.2,
  angularRate: 0.7,
  anchor: { x: 0, y: -0.22, z: -0.34 },
  nozzleLength: 0.18,
} as const;
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const magnitude = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const scaled = (v: Vec3, s: number): Vec3 => ({
  x: v.x * s,
  y: v.y * s,
  z: v.z * s,
});
const limit = (v: Vec3, max: number) =>
  scaled(v, Math.min(1, max / (magnitude(v) || 1)));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scaled(sub(b, a), t));

/** Matches THREE.Euler's YXZ order: local Z, then X, then Y. */
export function rotate(v: Vec3, angles: Vec3): Vec3 {
  const cz = Math.cos(angles.z),
    sz = Math.sin(angles.z);
  const cx = Math.cos(angles.x),
    sx = Math.sin(angles.x);
  const cy = Math.cos(angles.y),
    sy = Math.sin(angles.y);
  const x = v.x * cz - v.y * sz,
    y = v.x * sz + v.y * cz;
  const yy = y * cx - v.z * sx,
    z = y * sx + v.z * cx;
  return { x: x * cy + z * sy, y: yy, z: -x * sy + z * cy };
}
export function inverseRotate(v: Vec3, a: Vec3): Vec3 {
  // Transpose the orthonormal rotation, without a rendering-library dependency.
  const x = rotate({ x: 1, y: 0, z: 0 }, a),
    y = rotate({ x: 0, y: 1, z: 0 }, a),
    z = rotate({ x: 0, y: 0, z: 1 }, a);
  return {
    x: v.x * x.x + v.y * x.y + v.z * x.z,
    y: v.x * y.x + v.y * y.y + v.z * y.z,
    z: v.x * z.x + v.y * z.y + v.z * z.z,
  };
}
export type RigPose = {
  body: Vec3;
  angles: Vec3;
  mountPitch: number;
  mountYaw: number;
  rotor: number;
};
export type FlightState = RigPose & { velocity?: Vec3; acceleration?: Vec3 };

export function nozzleTransform(rig: RigPose) {
  const anchor = add(rig.body, rotate(FLIGHT.anchor, rig.angles));
  const localDirection = rotate(
    { x: 0, y: 0, z: -1 },
    { x: rig.mountPitch, y: rig.mountYaw, z: 0 }
  );
  const direction = rotate(localDirection, rig.angles);
  const origin = add(anchor, scaled(direction, FLIGHT.nozzleLength));
  const impact = projectApplicator(WALL_FRAME, origin, direction);
  if (!impact)
    throw new Error('The nozzle must point towards its paint surface.');
  return {
    anchor,
    origin,
    direction,
    impact: {
      x: impact.x,
      y: impact.y,
      distance: impact.distance,
    },
  };
}

/** Retiming brakes into corners/endpoints; the original stroke breaks survive. */
function retime(motions: Motion[]): Motion[] {
  const output = motions.map((m) => ({
    ...m,
    from: { ...m.from },
    to: { ...m.to },
  }));
  let start = 0;
  while (start < output.length) {
    if (!output[start].valve) {
      start++;
      continue;
    }
    let end = start;
    while (end < output.length && output[end].valve) end++;
    const lengths = output
      .slice(start, end)
      .map((m) =>
        Math.hypot(
          m.to.x - m.from.x,
          m.to.y - m.from.y,
          m.to.distance - m.from.distance
        )
      );
    const speeds = new Array(lengths.length + 1).fill(1.4) as number[];
    speeds[0] = speeds[speeds.length - 1] = 0;
    for (let j = 1; j < lengths.length; j++) {
      const a = output[start + j - 1],
        b = output[start + j];
      const la = lengths[j - 1],
        lb = lengths[j];
      if (!la || !lb) {
        speeds[j] = 0;
        continue;
      }
      const dot =
        ((a.to.x - a.from.x) * (b.to.x - b.from.x) +
          (a.to.y - a.from.y) * (b.to.y - b.from.y) +
          (a.to.distance - a.from.distance) *
            (b.to.distance - b.from.distance)) /
        (la * lb);
      const turn = Math.acos(clamp(dot, -1, 1));
      speeds[j] =
        turn > 0.6
          ? 0
          : Math.min(
              1.4,
              Math.sqrt((1.1 * Math.min(la, lb)) / Math.max(turn, 0.001)),
              la / a.duration,
              lb / b.duration
            );
    }
    for (let j = 1; j < speeds.length; j++)
      speeds[j] = Math.min(
        speeds[j],
        Math.sqrt(speeds[j - 1] ** 2 + 2 * 1.2 * lengths[j - 1])
      );
    for (let j = speeds.length - 2; j >= 0; j--)
      speeds[j] = Math.min(
        speeds[j],
        Math.sqrt(speeds[j + 1] ** 2 + 2 * 1.2 * lengths[j])
      );
    for (let j = 0; j < lengths.length; j++)
      if (lengths[j])
        output[start + j].duration = Math.max(
          output[start + j].duration,
          (2 * lengths[j]) / Math.max(0.05, speeds[j] + speeds[j + 1])
        );
    start = end;
  }
  return output;
}

export class Performer {
  readonly cap: Settings['cap'];
  readonly motions: Motion[];
  readonly seed: number;
  phase: Phase = 'approach';
  time = 0;
  valve = 0;
  body: Vec3;
  velocity = zero();
  acceleration = zero();
  angles = zero();
  mountPitch = 0;
  mountYaw = 0;
  rotor = 0;
  private index = 0;
  private elapsed = 0;
  private phaseTime = 0;
  private accumulator = 0;
  private previous: RigPose;
  private target: Pose;
  private readonly park: Pose;

  constructor(
    score: Score,
    cap: Settings['cap'],
    initial?: FlightState,
    seed = 8
  ) {
    this.cap = cap;
    this.seed = seed;
    this.motions = retime(score.motions);
    this.park = {
      ...score.motions[score.motions.length - 1].to,
      x: WALL.width - 0.7,
      y: 0.42,
      distance: 0.45,
    };
    this.target = { ...this.motions[0].to };
    this.body = initial ? { ...initial.body } : this.bodyTarget(this.park);
    if (initial) {
      this.angles = { ...initial.angles };
      this.mountPitch = initial.mountPitch;
      this.mountYaw = initial.mountYaw;
      this.rotor = initial.rotor;
      this.velocity = initial.velocity ? { ...initial.velocity } : zero();
      this.acceleration = initial.acceleration
        ? { ...initial.acceleration }
        : zero();
    }
    this.previous = this.rig;
  }
  get complete() {
    return this.phase === 'rest';
  }
  get rig(): RigPose {
    return {
      body: { ...this.body },
      angles: { ...this.angles },
      mountPitch: this.mountPitch,
      mountYaw: this.mountYaw,
      rotor: this.rotor,
    };
  }
  get flightState(): FlightState {
    return {
      ...this.rig,
      velocity: { ...this.velocity },
      acceleration: { ...this.acceleration },
    };
  }
  get nozzle() {
    return nozzleTransform(this.rig);
  }
  get pose() {
    return this.nozzle.impact;
  }
  get renderRig(): RigPose {
    if (this.complete) return this.rig;
    const t = clamp(this.accumulator / STEP, 0, 1);
    return {
      body: mix(this.previous.body, this.body, t),
      angles: mix(this.previous.angles, this.angles, t),
      mountPitch:
        this.previous.mountPitch +
        (this.mountPitch - this.previous.mountPitch) * t,
      mountYaw:
        this.previous.mountYaw + (this.mountYaw - this.previous.mountYaw) * t,
      rotor: this.previous.rotor + (this.rotor - this.previous.rotor) * t,
    };
  }
  advance(
    seconds: number,
    emit: (stamp: Stamp) => void,
    afterStep?: () => void,
    keepAlive: () => boolean = () => false,
    playbackRate: PlaybackRate = 1
  ) {
    const rate = [1, 2, 4, 8].includes(playbackRate) ? playbackRate : 1;
    this.accumulator += clamp(seconds, 0, 0.1) * rate;
    let steps = 0;
    while (
      this.accumulator + 1e-10 >= STEP &&
      steps++ < 12 * rate &&
      (!this.complete || keepAlive())
    ) {
      if (!this.complete) this.tick(emit);
      afterStep?.();
      this.accumulator -= STEP;
    }
  }
  finish(
    emit: (stamp: Stamp) => void,
    afterStep?: () => void,
    keepAlive: () => boolean = () => false
  ) {
    // Input length is bounded. This guard reports a broken controller instead
    // of locking the main thread indefinitely if a future constraint changes.
    let budget = 120 * 900;
    while ((!this.complete || keepAlive()) && budget-- > 0) {
      if (!this.complete) this.tick(emit);
      afterStep?.();
    }
    if (!this.complete || keepAlive())
      throw new Error(
        'The drone could not settle onto this path. Try a simpler path.'
      );
    this.accumulator = 0;
  }
  private bodyTarget(p: Pose): Vec3 {
    const offset = rotate(FLIGHT.anchor, this.angles);
    return {
      x: p.x - offset.x,
      y: p.y - offset.y,
      z: Math.max(
        FLIGHT.minBodyZ + 0.035,
        p.distance - offset.z + FLIGHT.nozzleLength
      ),
    };
  }
  private setPhase(phase: Phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }
  private tick(emit: (stamp: Stamp) => void) {
    this.previous = this.rig;
    const previousNozzle = this.nozzle;
    this.time += STEP;
    this.phaseTime += STEP;
    let targetVelocity = zero();
    if (this.phase === 'paint') {
      const m = this.motions[this.index];
      const error = magnitude(sub(this.bodyTarget(this.target), this.body));
      const rate = clamp((0.17 - error) / 0.09, 0.08, 1);
      this.elapsed = Math.min(m.duration, this.elapsed + STEP * rate);
      this.target = interpolate(m.from, m.to, this.elapsed / m.duration);
      if (this.elapsed < m.duration || this.motions[this.index + 1]?.valve)
        targetVelocity = {
          x: ((m.to.x - m.from.x) / m.duration) * rate,
          y: ((m.to.y - m.from.y) / m.duration) * rate,
          z: ((m.to.distance - m.from.distance) / m.duration) * rate,
        };
    } else if (this.phase === 'lift') {
      this.target = {
        ...this.target,
        distance: Math.max(this.target.distance, 0.34),
      };
    } else if (this.phase === 'inspect') {
      this.target = this.park;
    }
    const goal = this.bodyTarget(this.target);
    const desiredVelocity = limit(
      add(targetVelocity, scaled(sub(goal, this.body), 8)),
      1.4
    );
    let desiredAcceleration = scaled(sub(desiredVelocity, this.velocity), 12);
    const disturbance =
      this.phase === 'approach' || this.phase === 'lift' ? 0.045 : 0;
    desiredAcceleration.x +=
      disturbance * Math.sin(this.time * 1.7 + this.seed);
    desiredAcceleration.y +=
      disturbance * Math.sin(this.time * 2.1 + this.seed * 0.7);
    // A stopping-distance barrier starts braking before the clearance boundary.
    // It changes acceleration, never repairs a penetrated position afterwards.
    const gap = this.body.z - FLIGHT.minBodyZ;
    const toward = Math.max(0, -this.velocity.z);
    const stop = (toward * toward) / 6 + toward * 0.16 + 0.008;
    if (gap < stop)
      desiredAcceleration.z = Math.max(
        desiredAcceleration.z,
        5 * (1 - gap / stop)
      );
    desiredAcceleration = limit(desiredAcceleration, FLIGHT.maxAcceleration);
    this.acceleration = add(
      this.acceleration,
      limit(sub(desiredAcceleration, this.acceleration), FLIGHT.maxJerk * STEP)
    );
    this.velocity = add(this.velocity, scaled(this.acceleration, STEP));
    this.body = add(this.body, scaled(this.velocity, STEP));
    const targetAngles = {
      x: clamp(
        this.acceleration.z * 0.016,
        -FLIGHT.pitchLimit,
        FLIGHT.pitchLimit
      ),
      y: clamp(-this.velocity.x * 0.1, -FLIGHT.yawLimit, FLIGHT.yawLimit),
      z: clamp(
        -this.acceleration.x * 0.042,
        -FLIGHT.rollLimit,
        FLIGHT.rollLimit
      ),
    };
    for (const axis of ['x', 'y', 'z'] as const)
      this.angles[axis] += clamp(
        (targetAngles[axis] - this.angles[axis]) * 7 * STEP,
        -FLIGHT.angularRate * STEP,
        FLIGHT.angularRate * STEP
      );
    const anchor = add(this.body, rotate(FLIGHT.anchor, this.angles));
    const localAim = inverseRotate(
      sub({ x: this.target.x, y: this.target.y, z: 0 }, anchor),
      this.angles
    );
    const yaw = clamp(
      Math.atan2(-localAim.x, -localAim.z),
      -FLIGHT.mountLimit,
      FLIGHT.mountLimit
    );
    const pitch = clamp(
      Math.atan2(localAim.y, Math.hypot(localAim.x, localAim.z)),
      -FLIGHT.mountLimit,
      FLIGHT.mountLimit
    );
    this.mountYaw += clamp(
      (yaw - this.mountYaw) * 24 * STEP,
      -FLIGHT.mountRate * STEP,
      FLIGHT.mountRate * STEP
    );
    this.mountPitch += clamp(
      (pitch - this.mountPitch) * 24 * STEP,
      -FLIGHT.mountRate * STEP,
      FLIGHT.mountRate * STEP
    );
    this.rotor +=
      STEP *
      (26 + 12 * magnitude(this.velocity) + (this.phase === 'paint' ? 8 : 0));
    const actual = this.nozzle;
    const miss = Math.hypot(
      actual.impact.x - this.target.x,
      actual.impact.y - this.target.y
    );
    const settled =
      magnitude(sub(goal, this.body)) < 0.018 &&
      magnitude(this.velocity) < 0.07;
    this.valve = 0;
    if (this.phase === 'paint') {
      const m = this.motions[this.index];
      const stationary = m.from.x === m.to.x && m.from.y === m.to.y;
      this.valve =
        this.elapsed < m.duration || stationary
          ? 1
          : clamp(magnitude(this.velocity) / 0.2, 0.08, 1);
      if (
        actual.origin.z < 0.035 ||
        actual.origin.z > 0.9 ||
        actual.direction.z > -0.75
      )
        this.valve = 0;
      if (this.valve)
        sweep(
          previousNozzle.impact,
          actual.impact,
          0.0022 * (this.cap === 'fat' ? 1.35 : 1) * STEP * this.valve,
          this.cap,
          emit
        );
      if (this.elapsed >= m.duration) {
        const next = this.motions[this.index + 1];
        if (next?.valve) {
          this.index++;
          this.elapsed = 0;
        } else if (miss < 0.006 && settled) {
          this.index++;
          this.elapsed = 0;
          this.valve = 0;
          this.setPhase('lift');
        }
      }
    } else if (this.phase === 'approach' && settled) this.setPhase('align');
    else if (
      this.phase === 'align' &&
      miss < 0.004 &&
      settled &&
      this.phaseTime > 0.12
    ) {
      this.index++;
      this.elapsed = 0;
      this.setPhase('paint');
    } else if (this.phase === 'lift' && settled && this.phaseTime > 0.22) {
      if (this.index >= this.motions.length - 1) this.setPhase('inspect');
      else {
        this.target = { ...this.motions[this.index].to };
        this.setPhase('approach');
      }
    } else if (this.phase === 'inspect' && settled && this.phaseTime > 1.1)
      this.setPhase('rest');
  }
}
