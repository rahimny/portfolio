export interface SurveillanceMotion {
  time: number;
  idle: number;
  sample: number;
  targetX: number;
  targetY: number;
  gazeX: number;
  gazeY: number;
  startled: number;
}

export function createMotion(): SurveillanceMotion {
  return {
    time: 0,
    idle: 5,
    sample: 0,
    targetX: 0,
    targetY: 0,
    gazeX: 0,
    gazeY: 0,
    startled: 0,
  };
}

const damp = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

export function advanceMotion(
  state: SurveillanceMotion,
  dt: number,
  pointer: { x: number; y: number },
  active: boolean
): void {
  dt = Math.max(0, Math.min(dt, 0.05));
  if (dt === 0) return;
  state.time += dt;
  state.idle += dt;
  state.sample -= dt;
  state.startled = Math.max(0, state.startled - dt * 1.8);
  // A sampled servo target gives short, deliberate corrections without frame-rate noise.
  if (state.sample <= 0) {
    state.sample = 0.075;
    state.targetX = active
      ? Math.max(-1, Math.min(1, pointer.x))
      : Math.sin(state.time * 0.37) * 0.22;
    state.targetY = active
      ? Math.max(-1, Math.min(1, pointer.y))
      : Math.sin(state.time * 0.23) * 0.12;
  }
  state.gazeX = damp(state.gazeX, state.targetX, 19, dt);
  state.gazeY = damp(state.gazeY, state.targetY, 16, dt);
}
