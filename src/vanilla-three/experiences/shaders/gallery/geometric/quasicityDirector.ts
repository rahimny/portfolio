import type { Vector2 } from 'three';
import type { FrameDriver } from '../../ShaderGalleryExperience';

/**
 * The programme that runs Quasicity when nobody is touching it.
 *
 * Three layers, deliberately separate, because they answer different questions:
 *
 *  - **Movements** decide *where the piece is* — a weighted sequence of named
 *    parameter states (survey, core, plaza, spires, plan, negative). Discrete,
 *    seeded, never repeating consecutively.
 *  - **Springs** decide *how it gets there*. Every parameter is critically
 *    damped with its own settling time, so a movement arrives in layers rather
 *    than all at once: streets tighten in a second and a half while the zoom is
 *    still four seconds out. That staggering is what reads as choreography
 *    instead of a crossfade.
 *  - **Breath** decides *that it is never still*. Slow oscillators whose periods
 *    stand in golden-ratio relation, so they never realign and the composition
 *    never returns exactly to a state it has held before. The programme is
 *    quasiperiodic for the same reason the plan is.
 *
 * On top of those, the pointer is treated as attention rather than as a
 * control: moving it slows the traverse and holds the current movement open, so
 * the city waits while you look at it.
 */

interface Params {
  zoom: number;
  planScale: number;
  plaza: number;
  storeys: number;
  storeyHeight: number;
  street: number;
  haze: number;
  mast: number;
  invert: number;
}

interface Movement {
  name: string;
  weight: number;
  /** Seconds to hold before moving on: [min, max]. */
  dwell: [number, number];
  /** Multiplies every settling time. Below 1 is heavier, above 1 is brisker. */
  tempo: number;
  params: Params;
}

/** Seconds for each parameter to settle, before the movement's tempo. */
const SETTLE: Params = {
  zoom: 5.0,
  planScale: 7.0,
  plaza: 4.0,
  storeys: 3.0,
  storeyHeight: 2.2,
  street: 1.6,
  haze: 3.5,
  mast: 2.5,
  invert: 1.8,
};

const UNIFORM: Record<keyof Params, string> = {
  zoom: 'uZoom',
  planScale: 'uPlanScale',
  plaza: 'uPlaza',
  storeys: 'uStoreys',
  storeyHeight: 'uStoreyHeight',
  street: 'uStreet',
  haze: 'uHaze',
  mast: 'uMast',
  invert: 'uInvert',
};

const KEYS = Object.keys(SETTLE) as (keyof Params)[];

export const OPENING: Params = {
  zoom: 11.0,
  planScale: 0.78,
  plaza: -0.05,
  storeys: 16,
  storeyHeight: 0.3,
  street: 0.16,
  haze: 0.22,
  mast: 0.9,
  invert: 0,
};

const MOVEMENTS: readonly Movement[] = [
  {
    name: 'survey',
    weight: 3,
    dwell: [16, 26],
    tempo: 1.0,
    params: {
      ...OPENING,
      zoom: 15.5,
      planScale: 0.68,
      plaza: 0.0,
      storeys: 15,
      storeyHeight: 0.26,
      street: 0.18,
      haze: 0.3,
    },
  },
  {
    name: 'core',
    weight: 3,
    dwell: [12, 20],
    tempo: 0.8,
    params: {
      ...OPENING,
      zoom: 6.2,
      planScale: 0.92,
      plaza: -0.14,
      storeys: 24,
      storeyHeight: 0.34,
      street: 0.12,
      haze: 0.12,
      mast: 0.86,
    },
  },
  {
    name: 'plaza',
    weight: 2,
    dwell: [14, 22],
    tempo: 1.2,
    params: {
      ...OPENING,
      zoom: 12.5,
      planScale: 0.6,
      plaza: 0.24,
      storeys: 10,
      storeyHeight: 0.3,
      street: 0.3,
      haze: 0.24,
      mast: 0.82,
    },
  },
  {
    name: 'spires',
    weight: 2,
    dwell: [12, 18],
    tempo: 0.7,
    params: {
      ...OPENING,
      zoom: 8.5,
      planScale: 1.05,
      plaza: 0.02,
      storeys: 30,
      storeyHeight: 0.2,
      street: 0.09,
      haze: 0.16,
      mast: 0.92,
    },
  },
  {
    name: 'plan',
    weight: 2,
    dwell: [14, 20],
    tempo: 1.4,
    params: {
      ...OPENING,
      zoom: 14.0,
      storeys: 8,
      storeyHeight: 0.11,
      street: 0.24,
      haze: 0.06,
      mast: 0.88,
    },
  },
  {
    name: 'negative',
    weight: 1,
    dwell: [10, 16],
    tempo: 1.0,
    params: {
      ...OPENING,
      zoom: 10.0,
      planScale: 0.85,
      plaza: -0.06,
      storeys: 20,
      street: 0.14,
      haze: 0.18,
      invert: 1,
    },
  },
];

const TOTAL_WEIGHT = MOVEMENTS.reduce((sum, m) => sum + m.weight, 0);

/** Periods in seconds, each 1.618x the last, so no two ever come back in step. */
const BREATH = {
  zoom: 11.09,
  haze: 17.94,
  storey: 29.03,
  rudder: 23.6,
  sun: 70.6,
  spin: 43.9,
};

/** The sun stays inside the arc that keeps one visible face of every block
 *  unlit. Outside it, both lit faces read the same tone and the drawing goes
 *  flat — the three-tone is the whole reason the massing is legible. */
const SUN_MID = 0.375;
const SUN_SWING = 0.095;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Critically damped spring. Reaches the target without overshoot and without
 * ever being discontinuous, whatever the frame rate, which is what lets a
 * movement change mid-transition without a visible break.
 */
class Spring {
  value: number;
  private velocity = 0;

  constructor(value: number) {
    this.value = value;
  }

  set(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  step(target: number, smoothTime: number, dt: number): number {
    const omega = 2 / Math.max(smoothTime, 1e-3);
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - target;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * decay;
    this.value = target + (change + temp) * decay;
    return this.value;
  }
}

/** Must match WAVES in quasicity-fragment.glsl. */
export const WAVES = 5;

const TAU = Math.PI * 2;
const wave = (t: number, period: number, phase = 0) =>
  Math.sin((TAU * t) / period + phase);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

export class QuasicityDirector implements FrameDriver {
  /** Off hands every parameter back to the pane. */
  auto = true;
  /** World units per second at the reference zoom. */
  travel = 0.7;
  /** Damped pointer parallax, in world units at the frame edge. */
  influence = 3.0;

  private readonly rand = mulberry32(0x5eed1);
  private readonly springs = {} as Record<keyof Params, Spring>;
  /** Uniform name -> value, written once per frame. */
  private readonly out: Record<string, number> = {};

  private time = 0;
  private movement = MOVEMENTS[0];
  private until = 7;
  private phase = 0;
  private zoom = OPENING.zoom;
  private heading = Math.PI * 0.25;
  private panX = 0;
  private panY = 0;

  /** Rises while the pointer moves, decays when it stops. */
  private attention = 0;
  private pointerX = 0;
  private pointerY = 0;

  constructor() {
    for (const key of KEYS) this.springs[key] = new Spring(OPENING[key]);
  }

  update(uniforms: Record<string, { value: any }>, dt: number): void {
    this.time += dt;
    this.trackPointer(uniforms, dt);

    if (this.auto) {
      this.advance(dt);
      for (const name in this.out) {
        if (uniforms[name]) uniforms[name].value = this.out[name];
      }
    } else {
      // The pane owns the parameters now. Keep the springs alongside them so
      // switching auto back on resumes from what is on screen rather than
      // snapping back to wherever the programme had got to.
      this.capture(uniforms);
      this.zoom = uniforms.uZoom?.value ?? this.zoom;
    }

    this.traverse(dt);

    this.writeWaves(uniforms.uWaves?.value);
    uniforms.uPan?.value?.set?.(this.panX, this.panY);
    if (uniforms.uPointer) uniforms.uPointer.value = this.attention;
    if (uniforms.uInfluence) uniforms.uInfluence.value = this.influence;
  }

  /** Adopt whatever the pane currently holds, so handing control back and
   *  forth never jumps. */
  capture(uniforms: Record<string, { value: any }>): void {
    for (const key of KEYS) {
      const u = uniforms[UNIFORM[key]];
      if (u) this.springs[key].set(u.value);
    }
  }

  private trackPointer(
    uniforms: Record<string, { value: any }>,
    dt: number
  ): void {
    const mouse = uniforms.uMouse?.value;
    let moved = 0;
    if (mouse) {
      moved = Math.hypot(mouse.x - this.pointerX, mouse.y - this.pointerY);
      this.pointerX = mouse.x;
      this.pointerY = mouse.y;
    }
    // Rises fast on movement and falls slowly on stillness: the marker should
    // feel immediate to summon and reluctant to leave.
    const target = moved > 0.0015 ? 1 : 0;
    const rate = target > this.attention ? 9 : 0.55;
    this.attention += (target - this.attention) * (1 - Math.exp(-dt * rate));
  }

  private advance(dt: number): void {
    if (this.time >= this.until) this.nextMovement();

    const { params, tempo } = this.movement;
    for (const key of KEYS) {
      this.springs[key].step(params[key], SETTLE[key] * tempo, dt);
    }

    const t = this.time;

    // Breath, applied after the springs so it is never damped away.
    this.zoom = this.springs.zoom.value * (1 + 0.05 * wave(t, BREATH.zoom));
    const haze = this.springs.haze.value + 0.03 * wave(t, BREATH.haze, 1.1);
    const storey =
      this.springs.storeyHeight.value *
      (1 + 0.04 * wave(t, BREATH.storey, 2.2));

    // The field turns slowly, and at a varying rate, so the plan reorganises
    // under a camera that is also moving. Neither alone reads as much.
    this.phase += dt * 0.018 * (1 + 0.5 * wave(t, BREATH.spin));

    // The pointer nudges the sun within the safe arc: moving the mouse sweeps
    // every shadow in the city at once, which is the cheapest way to feel the
    // massing without adding a single primitive.
    const sun =
      SUN_MID +
      SUN_SWING * wave(t, BREATH.sun) +
      this.pointerX * 0.045 * this.attention;

    this.out.uZoom = Math.max(this.zoom, 2);
    this.out.uPlanScale = this.springs.planScale.value;
    this.out.uPlaza = this.springs.plaza.value;
    this.out.uStoreys = this.springs.storeys.value;
    this.out.uStoreyHeight = Math.max(storey, 0.05);
    this.out.uStreet = this.springs.street.value;
    this.out.uHaze = clamp(haze, 0, 0.6);
    this.out.uMast = this.springs.mast.value;
    this.out.uInvert = this.springs.invert.value;
    this.out.uSun = clamp(sun, SUN_MID - 0.13, SUN_MID + 0.13);
  }

  /**
   * The five wave vectors the fragment shader reads. They depend only on the
   * field phase, so they are built once a frame here rather than being derived
   * from scratch inside the loop that runs for every cell of every ray.
   */
  private writeWaves(waves: Vector2[] | undefined): void {
    if (!waves) return;
    for (let k = 0; k < WAVES; k++) {
      const a = (k * TAU) / WAVES + this.phase;
      waves[k].set(Math.cos(a), Math.sin(a));
    }
  }

  private nextMovement(): void {
    let pick = this.movement;
    // Weighted, but never the same movement twice running. A few rerolls is
    // cheaper and far clearer than rebuilding the weight table each time.
    for (let i = 0; i < 8 && pick === this.movement; i++) {
      let roll = this.rand() * TOTAL_WEIGHT;
      for (const m of MOVEMENTS) {
        roll -= m.weight;
        if (roll <= 0) {
          pick = m;
          break;
        }
      }
    }
    this.movement = pick;
    const [min, max] = pick.dwell;
    // Attention extends the dwell: the city waits while it is being looked at.
    this.until =
      this.time + (min + this.rand() * (max - min)) * (1 + this.attention);
  }

  /**
   * A slowly turning rudder rather than a straight line or an orbit: the
   * heading is integrated from two incommensurate oscillators, so the path
   * curves both ways and never closes. Speed scales with zoom, so the city
   * passes at the same apparent rate however far out the camera is.
   */
  private traverse(dt: number): void {
    if (this.travel <= 0) return;
    const t = this.time;
    this.heading +=
      dt * (0.1 * wave(t, BREATH.rudder) + 0.04 * wave(t, BREATH.spin, 0.7));
    // Attention slows the drift to a third, so a moving pointer settles the view.
    const speed =
      this.travel * (this.zoom / OPENING.zoom) * (1 - 0.67 * this.attention);
    this.panX += Math.cos(this.heading) * speed * dt;
    this.panY += Math.sin(this.heading) * speed * dt;
  }
}
