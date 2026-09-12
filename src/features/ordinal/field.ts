/**
 * Each cell stores a continuous codepoint. Calm cells return to their corpus
 * character; excited cells diffuse and advect along the energy gradient.
 * MAX_SHIFT bounds the shear so wave fronts retain a legible core.
 *
 * The ordinal and ink-coverage maps both have inverses. Run advection in each
 * space and blend the results, rather than interpolating incompatible metrics.
 * Barkley's excitable medium supplies travelling fronts and a refractory tail.
 */

import {
  FIRST_CODE,
  LAST_CODE,
  codeFromInkRank,
  codeFromOrdinal,
  inkRankOf,
  ordinalOf,
  type Ramp,
} from './ramp';
import type { OrdinalMood } from './mood';

/* Barkley's model. `a` and `b` set excitability, `eps` the timescale split
   between the fast front and the slow recovery behind it. */
const BARKLEY_A = 0.75;
const BARKLEY_B = 0.02;
const BARKLEY_EPS = 0.08;
const ENERGY_DIFFUSION = 1;
const DT = 0.1;
const SUBSTEPS = 2;

/**
 * Smoothing applied to the character field each step, in its active space, and
 * scaled by how dissolved the cell is.
 *
 * Diffusion is part of dissolution, not a constant. A calm cell has to be inert
 * or it never lands exactly on its corpus character: a fixed Laplacian this
 * strong pulls a cell tens of codepoints away from its target, which the pull
 * term can balance but never beat, and the field reads as permanently almost-
 * legible. Scaling by energy makes the resting state genuinely still.
 */
const CODE_DIFFUSION = 0.11;
/** Cells of shear per unit of energy gradient, before the mood's own gain. */
const SHEAR = 3;
/** The clamp. Beyond about this the text stops being text. */
const MAX_SHIFT = 1.5;
/** Radius of a nucleating wave, in cells. */
const SEED_RADIUS = 2;
/**
 * Excitation ceiling.
 *
 * `u = 1` is a fixed point of Barkley's reaction term — `u(1-u)` vanishes there
 * — so a cell driven all the way to one never recovers on its own and the
 * pointer would leave permanent holes. Stopping just short keeps every cell on
 * the part of the curve that comes back.
 */
const MAX_EXCITATION = 0.95;
/**
 * How fast the accent fades once a cell stops being touched.
 *
 * At 24 fps this is a half-life of about two thirds of a second and a mark that
 * is gone inside two. A first pass decayed at 0.9, which clears in under half a
 * second — measurably present, but too brief to read as anything. The accent has
 * to last long enough to be seen being eaten.
 */
const HEAT_DECAY = 0.96;
/**
 * Gaps resolve more slowly than ink, so words condense before the space around
 * them clears. This is the original's neighbour test — `" " != I[x][p-1]` — read
 * as what it actually achieves: letterforms hold together as blocks because the
 * space between their strokes is brought along with them.
 */
const SPACE_PULL = 0.35;

export interface OrdinalFieldOptions {
  columns: number;
  rows: number;
  seed: number;
  /** `rows` lines, each exactly `columns` characters. */
  corpus: readonly string[];
  ramp: Ramp;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Triangle-fold a value into a range.
 *
 * Wrapping would put a discontinuity at each end of the band, which the shear
 * then amplifies into a seam. Folding is continuous, keeps the texture the
 * diffusion produced, and still guarantees the mood's vocabulary is the only one
 * on screen.
 */
function fold(value: number, low: number, high: number): number {
  const span = high - low;
  if (span <= 0) return low;
  const shifted = value - low;
  const period = 2 * span;
  let t = shifted % period;
  if (t < 0) t += period;
  return low + (t <= span ? t : period - t);
}

export class OrdinalField {
  readonly columns: number;
  readonly rows: number;
  readonly size: number;

  /** Continuous codepoint per cell. Rounded only at the moment of drawing. */
  readonly code: Float32Array;
  /** Barkley's fast variable: how dissolved this cell is, 0..1. Swapped with
      its scratch buffer each substep, so it is not `readonly`. */
  energy: Float32Array;
  /** Barkley's slow variable: the refractory tail behind a front. */
  private recovery: Float32Array;
  /** Where the viewer has acted. The only thing on the page that is orange. */
  readonly heat: Float32Array;

  /** The corpus character this cell resolves to. */
  readonly target: Uint8Array;
  private readonly targetIsInk: Uint8Array;

  private energyNext: Float32Array;
  private recoveryNext: Float32Array;
  private readonly spaceA: Float32Array;
  private readonly spaceB: Float32Array;
  private readonly spaceANext: Float32Array;
  private readonly spaceBNext: Float32Array;
  private readonly residual: Float32Array;

  private readonly ramp: Ramp;
  private random: () => number;
  private readonly initialSeed: number;

  tick = 0;

  constructor(options: OrdinalFieldOptions) {
    this.columns = Math.max(1, Math.floor(options.columns));
    this.rows = Math.max(1, Math.floor(options.rows));
    this.size = this.columns * this.rows;
    this.ramp = options.ramp;
    this.initialSeed = options.seed;
    this.random = mulberry32(options.seed);

    this.code = new Float32Array(this.size);
    this.energy = new Float32Array(this.size);
    this.recovery = new Float32Array(this.size);
    this.heat = new Float32Array(this.size);
    this.target = new Uint8Array(this.size);
    this.targetIsInk = new Uint8Array(this.size);

    this.energyNext = new Float32Array(this.size);
    this.recoveryNext = new Float32Array(this.size);
    this.spaceA = new Float32Array(this.size);
    this.spaceB = new Float32Array(this.size);
    this.spaceANext = new Float32Array(this.size);
    this.spaceBNext = new Float32Array(this.size);
    this.residual = new Float32Array(this.size);

    this.setCorpus(options.corpus);
    this.reset(options.seed);
  }

  /** Re-target the field without disturbing what is currently on screen. */
  setCorpus(corpus: readonly string[]): void {
    for (let y = 0; y < this.rows; y++) {
      const line = corpus[y] ?? '';
      for (let x = 0; x < this.columns; x++) {
        const code = line.charCodeAt(x);
        const printable =
          Number.isFinite(code) && code >= FIRST_CODE && code <= LAST_CODE
            ? code
            : FIRST_CODE;
        const i = y * this.columns + x;
        this.target[i] = printable;
        this.targetIsInk[i] = printable === FIRST_CODE ? 0 : 1;
      }
    }
  }

  /**
   * Start again from a seed.
   *
   * The field opens fully dissolved and fully agitated, so the first thing the
   * viewer sees is the corpus condensing out of noise rather than a finished
   * page that then falls apart.
   */
  reset(seed: number = this.initialSeed): void {
    this.random = mulberry32(seed);
    this.tick = 0;
    for (let i = 0; i < this.size; i++) {
      this.code[i] = FIRST_CODE + this.random() * (LAST_CODE - FIRST_CODE);
      // Open fully dissolved, jittered by the seed. The medium relaxes out of
      // this over about a second, so the first thing on screen is the index
      // condensing rather than a finished page that then falls apart — and the
      // jitter means the collapse is uneven enough to leave fronts behind it.
      this.energy[i] = 0.55 + this.random() * 0.4;
      this.recovery[i] = 0;
      this.heat[i] = 0;
    }
  }

  private index(x: number, y: number): number {
    // The field is a torus. The original wraps rows and clips columns, which is
    // what makes it drain; nothing here should drain, because the corpus has to
    // survive being stirred.
    const cx = ((x % this.columns) + this.columns) % this.columns;
    const cy = ((y % this.rows) + this.rows) % this.rows;
    return cy * this.columns + cx;
  }

  /* ------------------------------------------------------------------ input */

  /** Raise a wave. The pointer's only verb. */
  excite(column: number, row: number, radius: number, strength: number): void {
    const r = Math.max(0, radius);
    const span = Math.ceil(r);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const distance = Math.hypot(dx, dy);
        if (distance > r) continue;
        const falloff = 1 - distance / (r || 1);
        const i = this.index(column + dx, row + dy);
        this.energy[i] = clamp(
          this.energy[i] + strength * falloff,
          0,
          MAX_EXCITATION
        );
        this.heat[i] = Math.max(this.heat[i], falloff * strength);
      }
    }
  }

  /**
   * Put a character into the field and let it be eaten.
   *
   * Typing does not write to the corpus — the injected character lands in the
   * live field, marked as touched, with a small wave raised around it, so the
   * viewer watches their own input being metabolised rather than pinned.
   */
  inject(column: number, row: number, code: number): void {
    const i = this.index(column, row);
    this.code[i] = clamp(code, FIRST_CODE, LAST_CODE);
    this.heat[i] = 1;
    this.excite(column, row, 1.6, 0.45);
    this.heat[i] = 1;
  }

  /* -------------------------------------------------------------------- sim */

  step(mood: OrdinalMood): void {
    this.stepEnergy(mood);
    this.stepCode(mood);
    for (let i = 0; i < this.size; i++) this.heat[i] *= HEAT_DECAY;
    this.tick++;
  }

  private stepEnergy(mood: OrdinalMood): void {
    const { columns, rows } = this;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      const u = this.energy;
      const v = this.recovery;
      const un = this.energyNext;
      const vn = this.recoveryNext;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const i = y * columns + x;
          const laplacian =
            u[this.index(x - 1, y)] +
            u[this.index(x + 1, y)] +
            u[this.index(x, y - 1)] +
            u[this.index(x, y + 1)] -
            4 * u[i];

          const threshold = (v[i] + BARKLEY_B) / BARKLEY_A;
          const reaction =
            (u[i] * (1 - u[i]) * (u[i] - threshold)) / BARKLEY_EPS;

          un[i] = clamp(
            u[i] + DT * (ENERGY_DIFFUSION * laplacian + reaction),
            0,
            1
          );
          vn[i] = clamp(v[i] + DT * (u[i] - v[i]), 0, 1);
        }
      }

      // Swap rather than copy; the buffers are the same shape and nothing else
      // holds a reference to them between steps.
      this.energy = un;
      this.recovery = vn;
      this.energyNext = u;
      this.recoveryNext = v;
    }

    if (this.random() < mood.excite) {
      this.excite(
        Math.floor(this.random() * columns),
        Math.floor(this.random() * rows),
        SEED_RADIUS,
        1
      );
    }
  }

  /**
   * One semi-Lagrangian advection plus a small Laplacian, in whichever space it
   * is handed. Called twice per step — once per metric — with the same velocity.
   */
  private advect(source: Float32Array, out: Float32Array, drift: number): void {
    const { columns, rows, energy } = this;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const i = y * columns + x;

        const gx =
          0.5 * (energy[this.index(x + 1, y)] - energy[this.index(x - 1, y)]);
        const gy =
          0.5 * (energy[this.index(x, y + 1)] - energy[this.index(x, y - 1)]);

        // Perpendicular to the gradient: characters shear *along* a wave front
        // rather than being pushed through it. Flowing down the gradient would
        // pile every character into the troughs within a second.
        let vx = -gy * SHEAR * drift;
        let vy = gx * SHEAR * drift;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SHIFT) {
          vx = (vx / speed) * MAX_SHIFT;
          vy = (vy / speed) * MAX_SHIFT;
        }

        const sx = x - vx;
        const sy = y - vy;
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;

        const s00 = source[this.index(x0, y0)];
        const s10 = source[this.index(x0 + 1, y0)];
        const s01 = source[this.index(x0, y0 + 1)];
        const s11 = source[this.index(x0 + 1, y0 + 1)];
        const advected =
          s00 * (1 - fx) * (1 - fy) +
          s10 * fx * (1 - fy) +
          s01 * (1 - fx) * fy +
          s11 * fx * fy;

        const laplacian =
          source[this.index(x - 1, y)] +
          source[this.index(x + 1, y)] +
          source[this.index(x, y - 1)] +
          source[this.index(x, y + 1)] -
          4 * source[i];

        out[i] = advected + CODE_DIFFUSION * energy[i] * laplacian;
      }
    }
  }

  private stepCode(mood: OrdinalMood): void {
    const { ramp, code, energy, target, targetIsInk, size } = this;
    const [low, high] = mood.band;

    for (let i = 0; i < size; i++) {
      this.spaceA[i] = ordinalOf(code[i]);

      // The ink lookup happens on the rounded codepoint, and only here. Tone is
      // a property of a glyph, not of a value sitting between two glyphs: the
      // ink ordering is a permutation, so interpolating the ranks of codepoints
      // 65 and 66 lands somewhere unrelated to either and the round trip stops
      // being a round trip. On the integer lattice both maps are exact.
      //
      // The sub-glyph remainder is set aside and added back afterwards rather
      // than discarded. Dropping it would make the ink path quantise — every
      // step nudging a cell toward its own nearest glyph — and that force is
      // strong enough to beat the weak pull on the cells whose corpus character
      // is a space, parking a whole field of them one codepoint above their
      // target. It is not a behaviour anything asked for, only an artefact of
      // where the rounding happened.
      const nearest = Math.round(code[i]);
      this.residual[i] = code[i] - nearest;
      this.spaceB[i] = inkRankOf(ramp, nearest);
    }

    this.advect(this.spaceA, this.spaceANext, mood.drift);
    this.advect(this.spaceB, this.spaceBNext, mood.drift);

    for (let i = 0; i < size; i++) {
      const fromOrdinal = codeFromOrdinal(this.spaceANext[i]);
      const fromInk =
        codeFromInkRank(ramp, this.spaceBNext[i]) + this.residual[i];
      let next = fromOrdinal + (fromInk - fromOrdinal) * mood.metric;

      // The mood's vocabulary only claims the cells that are dissolved. A calm
      // cell keeps whatever the corpus is pulling it toward, whether or not that
      // character is in the band.
      const free = energy[i];
      if (free > 0) {
        const folded = fold(next, low, high);
        next += (folded - next) * free;
      }

      const pull = mood.pull * (targetIsInk[i] ? 1 : SPACE_PULL) * (1 - free);
      next += (target[i] - next) * pull;

      code[i] = clamp(next, FIRST_CODE, LAST_CODE);
    }
  }

  /* ----------------------------------------------------------------- output */

  /** The field as text, one string per row. */
  glyphs(): string[] {
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.columns; x++) {
        line += String.fromCharCode(
          clamp(
            Math.round(this.code[y * this.columns + x]),
            FIRST_CODE,
            LAST_CODE
          )
        );
      }
      lines.push(line);
    }
    return lines;
  }

  /** Mean energy — how stirred the field is, fed back into the mood clock. */
  agitation(): number {
    let total = 0;
    for (let i = 0; i < this.size; i++) total += this.energy[i];
    return total / this.size;
  }

  /** Fraction of cells currently sitting on their corpus character. */
  resolved(): number {
    let count = 0;
    for (let i = 0; i < this.size; i++) {
      if (Math.round(this.code[i]) === this.target[i]) count++;
    }
    return count / this.size;
  }
}
