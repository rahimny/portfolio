import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

const clamp = MathUtils.clamp;
const Y = new Vector3(0, 1, 0);
export const MECHANICS = {
  upperLength: 1.3,
  lowerLength: 1.92,
  shinLength: 1.1,
  metatarsusLength: 1.02,
  ankleHeight: 0.32,
  headYawLimit: 0.68,
  headPitchLimit: 0.48,
  headPivot: new Vector3(0, 1.6, 0.45),
};

export const GIMBAL = {
  fixedBearingTop: 0.7675,
  rotorBottom: 0.78,
  bridgeY: -0.69,
  bridgeHalfHeight: 0.07,
  forkInnerX: 0.66,
};

const nearestAngle = (angle: number, reference: number) =>
  reference +
  Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));

// Pair order runs front to rear. The two interleaved tetrapods each span the body.
export const LEG_LAYOUT = [
  { hipX: 0.89, hipZ: 0.83, footX: 1.58, footZ: 2.12 },
  { hipX: 1.03, hipZ: 0.29, footX: 2.32, footZ: 0.81 },
  { hipX: 1.03, hipZ: -0.29, footX: 2.32, footZ: -0.81 },
  { hipX: 0.89, hipZ: -0.83, footX: 1.58, footZ: -2.12 },
] as const;

export interface Servo {
  position: number;
  velocity: number;
}
const servo = (position = 0): Servo => ({ position, velocity: 0 });

/** Bounded acceleration and braking distance; no instantaneous reversal or elastic overshoot. */
export function driveServo(
  axis: Servo,
  target: number,
  dt: number,
  speed: number,
  acceleration: number
) {
  if (dt <= 0) return;
  const error = target - axis.position;
  const requested =
    Math.sign(error) *
    Math.min(
      speed,
      Math.sqrt(2 * acceleration * Math.abs(error)),
      Math.abs(error) * 12
    );
  axis.velocity += clamp(
    requested - axis.velocity,
    -acceleration * dt,
    acceleration * dt
  );
  const step = axis.velocity * dt;
  if (Math.abs(step) > Math.abs(error) && step * error >= 0) {
    axis.position = target;
    axis.velocity = 0;
  } else axis.position += step;
}

export interface SupportLeg {
  side: number;
  depth: number;
  pair: number;
  cohort: number;
  root: Vector3;
  rest: Vector3;
  foot: Vector3;
  from: Vector3;
  destination: Vector3;
  hip: Vector3;
  knee: Vector3;
  hock: Vector3;
  lowerReach: number;
  ankle: Vector3;
  pole: Vector3;
}

export interface Mechanism {
  time: number;
  yaw: Servo;
  pitch: Servo;
  roll: Servo;
  height: Servo;
  headYaw: Servo;
  headPitch: Servo;
  recoil: Servo;
  translation: Vector3;
  velocity: Vector3;
  travelDistance: number;
  swingGroup: number;
  nextGroup: number;
  swingDuration: number;
  balance: Vector3;
  position: Vector3;
  rotation: Quaternion;
  matrix: Matrix4;
  legs: SupportLeg[];
  activeLeg: number;
  stepTime: number;
  cooldown: number;
  stepCount: number;
  supportMargin: number;
  phase: 'holding' | 'bracing' | 'stepping' | 'settling';
}

export function createMechanism(): Mechanism {
  const result: Mechanism = {
    time: 0,
    yaw: servo(0.3),
    pitch: servo(0.12),
    roll: servo(),
    height: servo(2.34),
    headYaw: servo(),
    headPitch: servo(),
    recoil: servo(),
    translation: new Vector3(),
    velocity: new Vector3(),
    travelDistance: 0,
    swingGroup: -1,
    nextGroup: 0,
    swingDuration: 0.34,
    balance: new Vector3(),
    position: new Vector3(0, 2.34, 0),
    rotation: new Quaternion(),
    matrix: new Matrix4(),
    legs: [],
    activeLeg: -1,
    stepTime: 0,
    cooldown: 0,
    stepCount: 0,
    supportMargin: 1,
    phase: 'holding',
  };
  for (let pair = 0; pair < LEG_LAYOUT.length; pair++) {
    const layout = LEG_LAYOUT[pair];
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex ? 1 : -1;
      const rest = new Vector3(side * layout.footX, 0.035, layout.footZ);
      const foot = rest.clone().applyAxisAngle(Y, result.yaw.position);
      result.legs.push({
        side,
        depth: layout.footZ / 2.12,
        pair,
        cohort: (pair + sideIndex) % 2,
        root: new Vector3(side * layout.hipX, -0.28, layout.hipZ),
        rest,
        foot,
        from: foot.clone(),
        destination: foot.clone(),
        hip: new Vector3(),
        knee: new Vector3(),
        hock: new Vector3(),
        lowerReach: MECHANICS.lowerLength,
        ankle: new Vector3(),
        pole: new Vector3(),
      });
    }
  }
  composeBody(result);
  solveLegs(result);
  return result;
}

function composeBody(state: Mechanism) {
  state.position.copy(state.translation).add(state.balance);
  state.position.y = state.height.position;
  state.rotation.setFromEuler(
    new Euler(
      state.pitch.position,
      state.yaw.position,
      state.roll.position,
      'YXZ'
    )
  );
  state.matrix.compose(state.position, state.rotation, new Vector3(1, 1, 1));
}

/** Solve rigid links to a reachable ankle, returning no artificial segment scaling. */
export function solveKnee(
  hip: Vector3,
  ankle: Vector3,
  pole: Vector3,
  output: Vector3,
  upperLength = MECHANICS.upperLength,
  lowerLength = MECHANICS.lowerLength
) {
  const axis = ankle.clone().sub(hip);
  const distance = axis.length();
  const min = Math.abs(lowerLength - upperLength) + 0.001;
  const max = upperLength + lowerLength - 0.001;
  const reach = clamp(distance, min, max);
  axis.normalize();
  const along =
    (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
  const bend = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const normal = pole
    .clone()
    .addScaledVector(axis, -pole.dot(axis))
    .normalize();
  output.copy(hip).addScaledVector(axis, along).addScaledVector(normal, bend);
}

function lowerReach(leg: SupportLeg) {
  return (
    MECHANICS.lowerLength - clamp((leg.foot.y - 0.035) / 0.25, 0, 1) * 0.18
  );
}

function solveLegs(state: Mechanism) {
  for (const leg of state.legs) {
    leg.hip.copy(leg.root).applyMatrix4(state.matrix);
    leg.ankle.copy(leg.foot).y += MECHANICS.ankleHeight;
    leg.pole
      .set(leg.side, 0.08, leg.depth * 0.75)
      .applyQuaternion(state.rotation);
    leg.lowerReach = lowerReach(leg);
    solveKnee(
      leg.hip,
      leg.ankle,
      leg.pole,
      leg.knee,
      MECHANICS.upperLength,
      leg.lowerReach
    );
    // The extra lower hinge tucks during swing and unfolds into a loaded stance.
    solveKnee(
      leg.knee,
      leg.ankle,
      leg.pole,
      leg.hock,
      MECHANICS.shinLength,
      MECHANICS.metatarsusLength
    );
  }
}

function cross(a: Vector3, b: Vector3, c: Vector3) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

export function supportMargin(point: Vector3, feet: Vector3[]): number {
  if (feet.length < 3) return -1;
  const sorted = [...feet].sort((a, b) => a.x - b.x || a.z - b.z);
  const lower: Vector3[] = [],
    upper: Vector3[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return Math.min(
    ...hull.map((a, i) => {
      const b = hull[(i + 1) % hull.length];
      return (
        cross(a, b, point) / Math.max(0.00001, Math.hypot(b.x - a.x, b.z - a.z))
      );
    })
  );
}

function neutralFoot(state: Mechanism, leg: SupportLeg, anticipate = false) {
  const ahead = anticipate ? 0.24 : 0;
  return leg.rest
    .clone()
    .applyAxisAngle(Y, state.yaw.position + state.yaw.velocity * ahead)
    .add(state.translation)
    .addScaledVector(state.velocity, ahead);
}

export function advanceMechanism(
  state: Mechanism,
  target: Vector3,
  delta: number,
  startled: number,
  discrete = false,
  travelTarget = state.translation
) {
  if (discrete) {
    state.yaw.position = Math.atan2(
      target.x - state.translation.x,
      target.z - state.translation.z
    );
    state.yaw.velocity = 0;
    state.pitch.position = 0.08;
    state.pitch.velocity = 0;
    state.roll.position = 0;
    state.roll.velocity = 0;
    state.height.position = 2.34;
    state.height.velocity = 0;
    state.velocity.set(0, 0, 0);
    state.balance.set(0, 0, 0);
    state.activeLeg = state.swingGroup = -1;
    state.phase = 'holding';
    for (const leg of state.legs) leg.foot.copy(neutralFoot(state, leg));
    composeBody(state);
    aimHead(state, target, 0, true);
    solveLegs(state);
    return;
  }
  let remaining = clamp(delta, 0, 0.05);
  while (remaining > 0.000001) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    state.time += dt;
    state.cooldown = Math.max(0, state.cooldown - dt);
    driveServo(state.recoil, startled, dt, 4, 24);
    const toGoal = travelTarget.clone().sub(state.translation).setY(0);
    const distance = toGoal.length();
    const desiredVelocity =
      distance > 0.1
        ? toGoal
            .normalize()
            .multiplyScalar(Math.min(1.35, (distance - 0.1) * 2.1))
        : new Vector3();
    desiredVelocity.multiplyScalar(1 - state.recoil.position * 0.75);
    const errors = state.legs.map((leg) =>
      leg.foot.distanceTo(neutralFoot(state, leg))
    );
    const stanceError = Math.max(...errors);
    // Let the feet catch up before the chassis can outrun their reach envelope.
    const reachBrake = clamp((1.05 - stanceError) / 0.4, 0, 1);
    desiredVelocity.multiplyScalar(reachBrake);
    const previousVelocity = state.velocity.clone();
    const change = desiredVelocity.sub(state.velocity).clampLength(0, 2.5 * dt);
    state.velocity.add(change);
    if (state.velocity.length() < 0.008 && distance <= 0.1)
      state.velocity.set(0, 0, 0);
    const support = state.legs
      .filter((leg) => leg.cohort !== state.swingGroup)
      .map((leg) => leg.foot);
    const nextPosition = state.translation
      .clone()
      .addScaledVector(state.velocity, dt)
      .add(state.balance);
    if (supportMargin(nextPosition, support) < 0.12)
      state.velocity.multiplyScalar(Math.exp(-30 * dt));
    state.translation.addScaledVector(state.velocity, dt);
    state.travelDistance += state.velocity.length() * dt;
    const speed = state.velocity.length();
    const worldYaw = nearestAngle(
      Math.atan2(target.x - state.position.x, target.z - state.position.z),
      state.yaw.position
    );
    const bodyTarget =
      worldYaw - clamp(worldYaw - state.yaw.position, -0.12, 0.12);
    driveServo(
      state.yaw,
      bodyTarget,
      dt,
      stanceError > 0.8 ? 0.14 : state.swingGroup >= 0 ? 0.65 : 1.0,
      2.4
    );
    const acceleration = state.velocity
      .clone()
      .sub(previousVelocity)
      .multiplyScalar(1 / dt)
      .applyAxisAngle(Y, -state.yaw.position);
    const elevation = Math.atan2(
      target.y - (state.height.position + MECHANICS.headPivot.y),
      Math.hypot(target.x - state.position.x, target.z - state.position.z)
    );
    // Share the viewing angle with the chassis rather than holding the neck at a hard stop.
    const viewingPitch = clamp(-elevation * 0.45, -0.18, 0.16);
    driveServo(
      state.pitch,
      clamp(
        viewingPitch + acceleration.z * 0.025 + state.recoil.position * 0.13,
        -0.2,
        0.24
      ),
      dt,
      0.5,
      2
    );
    driveServo(
      state.roll,
      clamp(-state.yaw.velocity * 0.08 - acceleration.x * 0.03, -0.1, 0.1),
      dt,
      0.5,
      2
    );
    const transfer =
      state.swingGroup >= 0
        ? Math.sin(Math.PI * clamp(state.stepTime / state.swingDuration, 0, 1))
        : 0;
    driveServo(
      state.height,
      2.34 +
        Math.min(speed, 1) * 0.12 -
        0.16 * state.recoil.position -
        transfer * 0.045,
      dt,
      0.38,
      2
    );

    if (state.swingGroup < 0 && state.cooldown === 0) {
      const groupError = [0, 1].map((group) =>
        Math.max(...errors.filter((_, i) => state.legs[i].cohort === group))
      );
      let group = state.nextGroup;
      // Corrections at rest may need only one cohort; sustained travel alternates both.
      if (groupError[group] < 0.17 && groupError[1 - group] > 0.24)
        group = 1 - group;
      if (groupError[group] > 0.2 || speed > 0.1) {
        const contacts = state.legs
          .filter((leg) => leg.cohort !== group)
          .map((leg) => leg.foot);
        if (supportMargin(state.position, contacts) > 0.18) {
          state.swingGroup = group;
          state.nextGroup = 1 - group;
          state.activeLeg = state.legs.findIndex((leg) => leg.cohort === group);
          state.stepTime = 0;
          state.swingDuration = 0.38 - clamp(speed / 1.35, 0, 1) * 0.1;
          state.phase = 'stepping';
          for (const leg of state.legs.filter((leg) => leg.cohort === group)) {
            leg.from.copy(leg.foot);
            leg.destination.copy(neutralFoot(state, leg, true));
            // Constrain each swing to its own radial sector, so neighbouring legs cannot swap lanes.
            const local = leg.destination
              .clone()
              .sub(state.translation)
              .applyAxisAngle(Y, -state.yaw.position);
            local.z = clamp(local.z, leg.rest.z - 0.28, leg.rest.z + 0.28);
            local.x = leg.side * Math.max(1.15, Math.abs(local.x));
            leg.destination.copy(
              local.applyAxisAngle(Y, state.yaw.position).add(state.translation)
            );
            leg.destination.y = 0.035;
          }
        } else state.phase = 'bracing';
      } else state.phase = 'holding';
    }
    const supporters = state.legs
      .filter((leg) => leg.cohort !== state.swingGroup)
      .map((leg) => leg.foot);
    const centre = supporters
      .reduce((sum, foot) => sum.add(foot), new Vector3())
      .multiplyScalar(1 / supporters.length);
    const balanceTarget = centre
      .sub(state.translation)
      .setY(0)
      .multiplyScalar(state.swingGroup >= 0 ? 0.18 : 0.04)
      .clampLength(0, 0.1);
    state.balance.lerp(balanceTarget, 1 - Math.exp(-8 * dt));
    if (state.swingGroup >= 0) {
      state.stepTime += dt;
      const t = clamp(state.stepTime / state.swingDuration, 0, 1);
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      for (const leg of state.legs.filter(
        (leg) => leg.cohort === state.swingGroup
      )) {
        leg.foot.lerpVectors(leg.from, leg.destination, eased);
        leg.foot.y =
          0.035 + Math.sin(Math.PI * t) ** 2 * (0.19 + speed * 0.055);
      }
      if (t === 1) {
        state.swingGroup = state.activeLeg = -1;
        state.stepCount += 4;
        state.cooldown = 0.11 + (1 - Math.min(speed, 1)) * 0.04;
        state.phase = 'settling';
      }
    }
    composeBody(state);
    state.supportMargin = supportMargin(
      state.position,
      state.legs
        .filter((leg) => leg.cohort !== state.swingGroup)
        .map((leg) => leg.foot)
    );
    // Keep the chassis inside the rigid links' workspace, never stretch a planted leg.
    for (let iteration = 0; iteration < 2; iteration++) {
      let excess = 0;
      for (const leg of state.legs) {
        const hip = leg.root.clone().applyMatrix4(state.matrix);
        const ankle = leg.foot
          .clone()
          .add(new Vector3(0, MECHANICS.ankleHeight, 0));
        const horizontal = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
        const maxVertical = Math.sqrt(
          Math.max(
            0,
            (MECHANICS.upperLength + lowerReach(leg) - 0.05) ** 2 -
              horizontal ** 2
          )
        );
        excess = Math.max(excess, hip.y - ankle.y - maxVertical);
      }
      if (excess > 0) {
        state.height.position -= excess;
        state.height.velocity = Math.min(0, state.height.velocity);
        composeBody(state);
      }
    }
    aimHead(state, target, dt, false);
    solveLegs(state);
  }
}

function aimHead(
  state: Mechanism,
  target: Vector3,
  dt: number,
  discrete: boolean
) {
  const local = target
    .clone()
    .applyMatrix4(state.matrix.clone().invert())
    .sub(MECHANICS.headPivot);
  const yaw = clamp(
    Math.atan2(local.x, local.z),
    -MECHANICS.headYawLimit,
    MECHANICS.headYawLimit
  );
  const pitch = clamp(
    -Math.atan2(local.y, Math.hypot(local.x, local.z)),
    -MECHANICS.headPitchLimit,
    MECHANICS.headPitchLimit
  );
  if (discrete) {
    state.headYaw.position = yaw;
    state.headPitch.position = pitch;
    state.headYaw.velocity = state.headPitch.velocity = 0;
  } else {
    driveServo(state.headYaw, yaw, dt, 3.6, 24);
    driveServo(state.headPitch, pitch, dt, 2.8, 20);
    state.headYaw.position = clamp(
      state.headYaw.position,
      -MECHANICS.headYawLimit,
      MECHANICS.headYawLimit
    );
    state.headPitch.position = clamp(
      state.headPitch.position,
      -MECHANICS.headPitchLimit,
      MECHANICS.headPitchLimit
    );
  }
}
