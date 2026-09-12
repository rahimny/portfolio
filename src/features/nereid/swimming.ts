import { LIMBS, tentaclePoint } from './model';

export const SWIM_STEP = 1 / 120;
export const CHAIN_NODES = 33;
export const SWIM_CONTROLS = [
  {
    key: 'frequency',
    label: 'Pulse rate',
    min: 0.15,
    max: 1.2,
    step: 0.05,
    unit: 'Hz',
  },
  {
    key: 'stroke',
    label: 'Bell contraction',
    min: 0,
    max: 0.32,
    step: 0.01,
    unit: '%',
  },
  {
    key: 'glide',
    label: 'Glide interval',
    min: 0.05,
    max: 0.45,
    step: 0.01,
    unit: '%',
  },
  {
    key: 'flexibility',
    label: 'Tendril flexibility',
    min: 0,
    max: 1,
    step: 0.05,
    unit: '%',
  },
  {
    key: 'current',
    label: 'Cross-current',
    min: -1,
    max: 1,
    step: 0.05,
    unit: '',
  },
  { key: 'turbulence', label: 'Eddies', min: 0, max: 1, step: 0.05, unit: '%' },
] as const;
export type SwimParameter = (typeof SWIM_CONTROLS)[number]['key'];
export type SwimParameters = Record<SwimParameter, number>;
export const DEFAULT_SWIM: SwimParameters = {
  frequency: 0.35,
  stroke: 0.28,
  glide: 0.26,
  flexibility: 0.65,
  current: 0.1,
  turbulence: 0.1,
};
export const SWIM_PRESETS = {
  Hover: {
    frequency: 0.25,
    stroke: 0.12,
    glide: 0.4,
    flexibility: 0.8,
    current: 0.1,
    turbulence: 0.2,
  },
  Row: DEFAULT_SWIM,
  Current: {
    frequency: 0.6,
    stroke: 0.3,
    glide: 0.12,
    flexibility: 0.9,
    current: 0.8,
    turbulence: 0.6,
  },
} satisfies Record<string, SwimParameters>;

export function sanitiseSwim(
  input: Partial<SwimParameters>,
  base = DEFAULT_SWIM
): SwimParameters {
  const next = { ...base };
  for (const c of SWIM_CONTROLS) {
    const value = input[c.key];
    if (typeof value === 'number' && Number.isFinite(value))
      next[c.key] = Math.max(c.min, Math.min(c.max, value));
  }
  return next;
}

export function pulseAt(phase: number, glide: number) {
  const p = ((phase % 1) + 1) % 1;
  const active = 1 - glide;
  const contractionEnd = active * 0.3;
  if (p < contractionEnd)
    return {
      activation: 0.5 - 0.5 * Math.cos((Math.PI * p) / contractionEnd),
      stage: 'Contract' as const,
    };
  if (p < active)
    return {
      activation:
        0.5 +
        0.5 *
          Math.cos(
            (Math.PI * (p - contractionEnd)) / (active - contractionEnd)
          ),
      stage: 'Recover' as const,
    };
  return { activation: 0, stage: 'Glide' as const };
}

// Conservative envelope for the pressure core and sampling spine, including
// the lattice radius. It is a contact constraint, not a pull towards a pose.
export function coreClearance(y: number) {
  if (y > -0.8) return 1.12;
  return Math.max(0, 1.12 - (-0.8 - y) * 0.37);
}

export interface SwimChain {
  rest: Float64Array;
  positions: Float64Array;
  previous: Float64Array;
  velocities: Float64Array;
  lengths: Float64Array;
  bendLengths: Float64Array;
  stretchLambda: Float64Array;
  bendLambda: Float64Array;
}

/** Small, fixed-step, one-way fluid/rod model. No calibrated hydrodynamic force claims. */
export class SwimmingModel {
  params = { ...DEFAULT_SWIM };
  time = 0;
  phase = 0;
  bell = 0;
  bellVelocity = 0;
  margin = 0;
  marginVelocity = 0;
  speed = 0;
  distance = 0;
  currentTravel = 0;
  recapture = 0;
  steps = 0;
  readonly chains: SwimChain[];
  private accumulator = 0;
  private currentParams = { ...DEFAULT_SWIM };

  constructor(params: Partial<SwimParameters> = {}) {
    this.params = sanitiseSwim(params);
    this.currentParams = { ...this.params };
    this.chains = Array.from({ length: LIMBS }, (_, limb) => {
      const rest = new Float64Array(CHAIN_NODES * 3);
      for (let i = 0; i < CHAIN_NODES; i++)
        rest.set(tentaclePoint(i / (CHAIN_NODES - 1), limb), i * 3);
      const length = (a: number, b: number) =>
        Math.hypot(
          rest[a * 3] - rest[b * 3],
          rest[a * 3 + 1] - rest[b * 3 + 1],
          rest[a * 3 + 2] - rest[b * 3 + 2]
        );
      return {
        rest,
        positions: rest.slice(),
        previous: rest.slice(),
        velocities: new Float64Array(rest.length),
        lengths: Float64Array.from({ length: CHAIN_NODES - 1 }, (_, i) =>
          length(i, i + 1)
        ),
        bendLengths: Float64Array.from({ length: CHAIN_NODES - 2 }, (_, i) =>
          length(i, i + 2)
        ),
        stretchLambda: new Float64Array(CHAIN_NODES - 1),
        bendLambda: new Float64Array(CHAIN_NODES - 2),
      };
    });
  }

  get stage() {
    return pulseAt(this.phase, this.currentParams.glide).stage;
  }
  get flowBias() {
    return this.currentParams.current;
  }
  get stroke() {
    return this.currentParams.stroke;
  }
  get rootHeight() {
    return 0.85 + this.stroke * 1.6 * this.margin;
  }
  get rootScale() {
    return 1 - this.stroke * (0.72 * this.bell + 0.28 * this.margin);
  }
  setParameters(params: Partial<SwimParameters>) {
    this.params = sanitiseSwim(params, this.params);
  }

  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Hidden tabs never try to catch up minutes of missed physics.
    this.accumulator += Math.min(seconds, 0.1);
    while (this.accumulator + 1e-10 >= SWIM_STEP) {
      this.step();
      this.accumulator -= SWIM_STEP;
    }
    if (this.accumulator < 0) this.accumulator = 0;
  }

  private step() {
    const dt = SWIM_STEP;
    this.time += dt;
    this.steps++;
    for (const c of SWIM_CONTROLS)
      this.currentParams[c.key] +=
        (this.params[c.key] - this.currentParams[c.key]) *
        (1 - Math.exp(-dt * 4));
    const p = this.currentParams;
    this.phase = (this.phase + p.frequency * dt) % 1;
    const activation = pulseAt(this.phase, p.glide).activation;
    // Active bell drive, then a softer, slightly underdamped passive margin.
    const spring = 16;
    this.bellVelocity +=
      ((activation - this.bell) * spring * spring -
        2 * 0.85 * spring * this.bellVelocity) *
      dt;
    this.bell += this.bellVelocity * dt;
    this.marginVelocity +=
      ((this.bell - this.margin) * 90 - 13 * this.marginVelocity) * dt;
    this.margin += this.marginVelocity * dt;
    // Qualitative delayed recovery impulse; not CFD or an efficiency estimate.
    this.recapture +=
      (Math.max(0, -this.bellVelocity) * p.stroke * 0.4 -
        this.recapture * 0.7) *
      dt;
    const acceleration =
      Math.max(0, this.bellVelocity) * p.stroke * 4 +
      this.recapture * 3 -
      0.45 * this.speed -
      0.18 * this.speed * Math.abs(this.speed);
    this.speed = Math.max(0, this.speed + acceleration * dt);
    this.distance += this.speed * dt;
    this.currentTravel += p.current * 1.5 * dt;

    for (const chain of this.chains) {
      const x = chain.positions,
        rest = chain.rest,
        velocity = chain.velocities;
      chain.previous.set(x);
      for (let i = 2; i < CHAIN_NODES; i++) {
        const j = i * 3,
          t = i / (CHAIN_NODES - 1);
        const flowX =
          p.current * 1.5 +
          p.turbulence *
            0.75 *
            Math.sin(x[j + 2] * 0.75 + this.time * 0.8) *
            Math.cos(x[j + 1] * 0.6 - this.time * 0.4);
        const flowZ =
          p.turbulence *
          0.8 *
          Math.sin(x[j] * 0.6 - this.time * 0.65) *
          Math.cos(x[j + 1] * 0.6 + this.time * 0.35);
        const flowY =
          -this.speed +
          p.turbulence *
            0.15 *
            Math.sin(x[j] * 0.8 + x[j + 2] * 0.4 + this.time * 0.5);
        const drag = 1.15 + 0.35 * t;
        for (let axis = 0; axis < 3; axis++) {
          const water = axis === 0 ? flowX : axis === 1 ? flowY : flowZ;
          const force = axis === 1 ? -acceleration : 0;
          velocity[j + axis] =
            (velocity[j + axis] + (water * drag + force) * dt) /
            (1 + drag * dt);
          x[j + axis] += velocity[j + axis] * dt;
        }
      }
      x[0] = rest[0] * this.rootScale;
      x[1] = this.rootHeight;
      const radius = Math.hypot(rest[0], rest[2]);
      const rx = rest[0] / radius,
        rz = rest[2] / radius;
      const radial = (rest[3] - rest[0]) * rx + (rest[5] - rest[2]) * rz;
      const side = (rest[3] - rest[0]) * -rz + (rest[5] - rest[2]) * rx;
      const dy = rest[4] - rest[1];
      const angle = -this.stroke * 3.2 * (0.7 * this.bell + 0.3 * this.margin);
      const dr = radial * Math.cos(angle) - dy * Math.sin(angle);
      x[3] = x[0] + dr * rx - side * rz;
      x[4] = x[1] + radial * Math.sin(angle) + dy * Math.cos(angle);
      x[5] = rest[2] * this.rootScale + dr * rz + side * rx;
      x[2] = rest[2] * this.rootScale;
      chain.stretchLambda.fill(0);
      chain.bendLambda.fill(0);
      const bendCompliance = 0.000000001 + p.flexibility ** 3 * 0.000001;
      for (let iteration = 0; iteration < 12; iteration++) {
        for (let i = 0; i < CHAIN_NODES - 2; i++)
          this.constrain(
            chain,
            i,
            i + 2,
            chain.bendLengths[i],
            bendCompliance,
            chain.bendLambda,
            i
          );
        for (let i = 0; i < CHAIN_NODES - 1; i++)
          this.constrain(
            chain,
            i,
            i + 1,
            chain.lengths[i],
            0.0000002,
            chain.stretchLambda,
            i
          );
        for (let i = 2; i < CHAIN_NODES; i++) {
          const j = i * 3;
          const clearance = coreClearance(x[j + 1]);
          const radius = Math.hypot(x[j], x[j + 2]);
          if (radius < clearance) {
            const cx = radius > 1e-8 ? x[j] / radius : rx;
            const cz = radius > 1e-8 ? x[j + 2] / radius : rz;
            x[j] = cx * clearance;
            x[j + 2] = cz * clearance;
          }
        }
      }
      for (let i = 6; i < x.length; i++)
        velocity[i] = (x[i] - chain.previous[i]) / dt;
    }
  }

  private constrain(
    chain: SwimChain,
    a: number,
    b: number,
    length: number,
    compliance: number,
    lambdas: Float64Array,
    index: number
  ) {
    const p = chain.positions,
      ia = a * 3,
      ib = b * 3;
    const dx = p[ib] - p[ia],
      dy = p[ib + 1] - p[ia + 1],
      dz = p[ib + 2] - p[ia + 2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) return;
    const wa = a < 2 ? 0 : 1,
      wb = b < 2 ? 0 : 1;
    if (wa + wb === 0) return;
    const alpha = compliance / (SWIM_STEP * SWIM_STEP);
    const delta =
      (-(distance - length) - alpha * lambdas[index]) / (wa + wb + alpha);
    lambdas[index] += delta;
    const correction = delta / distance;
    p[ia] -= dx * correction * wa;
    p[ia + 1] -= dy * correction * wa;
    p[ia + 2] -= dz * correction * wa;
    p[ib] += dx * correction * wb;
    p[ib + 1] += dy * correction * wb;
    p[ib + 2] += dz * correction * wb;
  }

  reset() {
    this.time =
      this.phase =
      this.bell =
      this.bellVelocity =
      this.margin =
      this.marginVelocity =
      this.speed =
      this.distance =
      this.currentTravel =
      this.recapture =
      this.steps =
      this.accumulator =
        0;
    this.currentParams = { ...this.params };
    for (const chain of this.chains) {
      chain.positions.set(chain.rest);
      chain.previous.set(chain.rest);
      chain.velocities.fill(0);
    }
  }
}
