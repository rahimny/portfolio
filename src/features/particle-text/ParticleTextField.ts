import { pickInk, type TextLayout } from './layout';
import { sweptExposure, type InkPoint } from './inkContact';
import type { Modulation } from './MotionProgramme';
import type { ParticleTextSettings } from './settings';
import { GraphFormation } from '../particles/GraphFormation';
import type { ParticleState } from '../particles/ParticleState';
import type { GraphTopologyKind } from '../particles/graphTopology';
import {
  WRITING_NOZZLE_OFFSET,
  type DroneWriting,
  type WritingFlight,
} from './DroneWriting';

/**
 * The particles, their targets and the forces between them.
 *
 * The CPU model combines springs, a shared velocity grid and a cached curl
 * field. Its glyph assignments preserve the letterforms during interaction:
 *
 * - coverage-weighted sampling inside the letterform, so density follows the stroke;
 * - sticky per-glyph assignment, so editing does not set the whole word travelling;
 * - travel-scaled damping, so one spring can both settle quickly and stay alive;
 * - a curl field, so settled ink shimmers instead of sitting there printed;
 * - pointer yield, so the letterform dents and refills rather than vibrating.
 *
 * Integration uses CSS pixels. The renderer receives projected point data
 * without GPU readback or a compute pipeline.
 */

/** Cap on allocation. The settings figure is clamped to this. */
export const MAX_PARTICLES = 40000;

/** Upper bound on glyphs in one block; `maxLength` in the settings is well under it. */
const MAX_GLYPHS = 256;

/**
 * Segments the vessel's four walls are divided into for impact registration.
 * Split by each wall's share of the total perimeter length, so a wide, short
 * vessel (the masthead's shape) spends most of its resolution on the top and
 * bottom edges, where ink actually lands.
 */
const PERIMETER_SEGMENTS = 48;
/** CSS px, the drawn thickness of a perimeter segment. Soft on purpose: this
 * is a glow marking an event, not a hairline reference grid like the rules. */
const PERIMETER_THICKNESS = 3;

/**
 * Cells in the velocity grid. The grid is sized in em, so at the masthead it
 * comes out around 86x26 whatever the viewport is; the cap only binds when text
 * has been scaled a long way down, and the cell is widened to fit rather than
 * the grid being truncated.
 */
const MAX_GRID = 256 * 128;

/**
 * Floats per particle in the buffer handed to the renderer: screen x, screen y,
 * tint, and the perspective scale its point size and opacity are read from.
 *
 * Note *screen*: the simulation runs in three dimensions and this is what comes
 * out of the camera. The renderer stays a flat point sprite and knows nothing
 * about the projection.
 */
export const STRIDE = 4;

/**
 * How much faster the programme's own kick crosses the block than an edit's.
 *
 * `kick` sweeps rather than landing everywhere at once, for the same reason an
 * edit does — but the movements it belongs to are a second long, and a front
 * that took a second and a half to cross the name would still be arriving after
 * the word had snapped back.
 */
const KICK_SWEEP = 4;

/**
 * Editing faster than this is a continuous gesture, not a sequence of moments.
 * The first key keeps the full transition; subsequent keys progressively trade
 * travel time for legibility until the cadence falls quiet again.
 */
const RAPID_EDIT_WINDOW = 0.3;
const RAPID_EDIT_FLOOR = 0.06;
/** Fast edits may wait at most this long before changed ink starts moving. */
const RAPID_EDIT_MAX_DELAY = 0.015;
/** How quickly the catch-up state releases after the last repeated key. */
const RAPID_EDIT_RELEASE = 0.16;
/** Shortest edit glide as a fraction of the tuned single-key glide. */
const RAPID_EDIT_GLIDE_RATIO = 0.12;
/** Extra target-seeking pull at the fastest cadence. */
const RAPID_EDIT_PULL = 1.5;
/** Curl retained at maximum cadence; the rest is traded for letter clarity. */
const RAPID_EDIT_CURL_RETAIN = 0.45;

/**
 * A churn step that visits every particle exactly once per lap without ever
 * visiting two neighbours in a row.
 *
 * Any step coprime to the count is a full permutation of the array, so the
 * fairness the old `+1` sweep was written for is kept exactly. Starting the
 * search at the golden section is what buys the *spacing*: consecutive
 * re-homes land about six tenths of the block apart, and the letters a lap
 * touches come up in low-discrepancy order rather than in reading order.
 */
function churnStrideFor(count: number): number {
  if (count < 3) return 1;
  let stride = Math.max(2, Math.round(count * 0.618034));
  for (let i = 0; i < count; i++) {
    let a = stride;
    let b = count;
    while (b > 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    if (a === 1) return stride;
    stride = stride + 1 < count ? stride + 1 : 2;
  }
  return 1;
}

/** Weight of the fine noise layer against the coarse one. */
const FINE_AMP = 0.55;

const NOISE_SIZE = 64;
const NOISE_MASK = NOISE_SIZE - 1;

/**
 * A tileable, divergence-free vector field, built once.
 *
 * A 64x64 lookup stores the curl of a sum of harmonics. It is divergence-free
 * and periodic, so ink swirls and the grid wraps seamlessly. Runtime samples
 * use bilinear interpolation instead of evaluating harmonics per particle.
 *
 * It is sampled at two scales drifting in different directions, and that is not
 * decoration. A single layer slid past at a constant velocity is a *rigid*
 * pattern marching through the text: the value at a fixed point changes, but no
 * eddy is ever born and none ever dies, which is what made the first version
 * read as a texture rather than as flow. Two layers at different scales and
 * drifts beat against each other, so the composite genuinely evolves — the cheap
 * stand-in for animating true curl noise along a third axis.
 */
const NOISE = (() => {
  const field = new Float32Array(NOISE_SIZE * NOISE_SIZE * 2);
  const harmonics = [
    { k: 1, amp: 1.0, phaseX: 0.0, phaseY: 0.0 },
    { k: 2, amp: 0.5, phaseX: 1.3, phaseY: 0.7 },
    { k: 3, amp: 0.25, phaseX: 2.1, phaseY: 4.2 },
  ];
  let peak = 0;

  for (let gy = 0; gy < NOISE_SIZE; gy++) {
    for (let gx = 0; gx < NOISE_SIZE; gx++) {
      const x = (gx / NOISE_SIZE) * Math.PI * 2;
      const y = (gy / NOISE_SIZE) * Math.PI * 2;
      // psi = sum amp * sin(k x + px) * cos(k y + py); velocity = curl(psi).
      let dpdx = 0;
      let dpdy = 0;
      for (const h of harmonics) {
        dpdx +=
          h.amp *
          h.k *
          Math.cos(h.k * x + h.phaseX) *
          Math.cos(h.k * y + h.phaseY);
        dpdy +=
          -h.amp *
          h.k *
          Math.sin(h.k * x + h.phaseX) *
          Math.sin(h.k * y + h.phaseY);
      }
      const i = (gy * NOISE_SIZE + gx) * 2;
      field[i] = dpdy;
      field[i + 1] = -dpdx;
      peak = Math.max(peak, Math.hypot(dpdy, dpdx));
    }
  }

  if (peak > 0) {
    for (let i = 0; i < field.length; i++) field[i] /= peak;
  }
  return field;
})();

/** Deterministic per-particle noise: a rebuild reproduces the same scatter. */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export class ParticleTextField {
  private readonly reluctantIds = new Set<number>();
  private reluctantStart = -10;

  /** Let a tiny group from the touched area arrive late, without changing its homes. */
  public lingerAfterTouch(x: number, y: number): void {
    if (!this.hasTargets || this.time - this.reluctantStart < 6) return;
    const nearby: { id: number; distance: number }[] = [];
    for (let p = 0; p < this.count; p++) {
      const distance = Math.hypot(
        this.data[p * STRIDE] - x,
        this.data[p * STRIDE + 1] - y
      );
      if (distance < 70) nearby.push({ id: p, distance });
    }
    if (!nearby.length) return;
    nearby.sort((a, b) => a.distance - b.distance);
    this.reluctantIds.clear();
    nearby.slice(0, 9).forEach(({ id }) => this.reluctantIds.add(id));
    this.reluctantStart = this.time;
  }
  private readonly projection = {
    cosY: 1,
    sinY: 0,
    cosP: 1,
    sinP: 0,
    focal: 1,
    centreX: 0,
    centreY: 0,
  };

  public aimAt(fraction: number, destination: InkPoint): boolean {
    if (!this.hasTargets || this.count === 0) return false;
    const p = Math.min(this.count - 1, Math.floor(fraction * this.count));
    destination.x = this.data[p * STRIDE];
    destination.y = this.data[p * STRIDE + 1];
    return destination.x > -10000;
  }

  /** A swept repulsor transfers force all along its path, including through gaps. */
  public repelInk(
    from: InkPoint,
    to: InkPoint,
    radius: number,
    force: number,
    dt: number
  ): number {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6 || dt <= 0) return 0;
    const forwardX = (to.x - from.x) / length;
    const forwardY = (to.y - from.y) / length;
    const minX = Math.min(from.x, to.x) - radius,
      maxX = Math.max(from.x, to.x) + radius;
    const minY = Math.min(from.y, to.y) - radius,
      maxY = Math.max(from.y, to.y) + radius;
    const { cosY, sinY, cosP, sinP, focal, centreX, centreY } = this.projection;
    let affected = 0;
    for (let p = 0; p < this.count; p++) {
      const x = this.data[p * STRIDE],
        y = this.data[p * STRIDE + 1];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const ox = x - from.x,
        oy = y - from.y;
      const along = ox * forwardX + oy * forwardY;
      const across = -ox * forwardY + oy * forwardX;
      const exposure = sweptExposure(along, across, length, radius) * dt;
      if (exposure <= 0) continue;
      const falloff = (1 - Math.min(1, Math.abs(across) / radius)) ** 2;
      const impulse = force * exposure * falloff * this.invMass[p];
      const side =
        Math.abs(across) < 0.001
          ? hash(p * 17) > 0.5
            ? 1
            : -1
          : Math.sign(across);
      const screenX = (forwardX * 0.25 - forwardY * side) * impulse;
      const screenY = (forwardY * 0.25 + forwardX * side) * impulse;
      this.ballisticWake[p] = Math.min(
        1,
        this.ballisticWake[p] + exposure * 38 * falloff
      );
      affected++;
      // Invert the local projection Jacobian at this particle's depth. Parallax
      // must not move the visible impact away from the ink receiving the force.
      const dx = this.posX[p] - centreX,
        dy = this.posY[p] - centreY;
      const rx = dx * cosY + this.posZ[p] * sinY;
      const rz = this.posZ[p] * cosY - dx * sinY;
      const ry = dy * cosP - rz * sinP;
      const denominator = focal + dy * sinP + rz * cosP;
      const k = focal / denominator;
      const a = k * (cosY + (rx * sinY * cosP) / denominator);
      const b = (-k * rx * sinP) / denominator;
      const c = k * (sinY * sinP + (ry * sinY * cosP) / denominator);
      const d = k * (cosP - (ry * sinP) / denominator);
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-5) continue;
      this.velX[p] += (d * screenX - b * screenY) / det;
      this.velY[p] += (a * screenY - c * screenX) / det;
      this.velZ[p] += (hash(p * 29) - 0.5) * impulse * 0.2;
    }
    return affected;
  }

  public clearProjectileWake() {
    this.ballisticWake.fill(0);
  }

  private writingBirth: Float32Array | null = null;
  private writingSource: Float32Array | null = null;
  private writingOwner: Uint8Array | null = null;
  private writingLive: Uint8Array | null = null;
  private writingGlyphEnd: Float32Array | null = null;
  private writingTime = 0;
  private writingBurst = false;

  public beginWriting(score: DroneWriting): void {
    this.graph.setActive(false, this.count, true);
    this.writingTime = 0;
    this.writingBurst = false;
    this.writingBirth = new Float32Array(this.count);
    this.writingSource = new Float32Array(this.count * 2);
    this.writingOwner = new Uint8Array(this.count);
    this.writingLive = new Uint8Array(this.count);
    this.writingGlyphEnd = new Float32Array(score.byGlyph.length);
    score.byGlyph.forEach((segments, glyph) => {
      this.writingGlyphEnd![glyph] =
        Math.max(
          ...segments.map((segment) => segment.start + segment.duration)
        ) + 0.3;
    });
    for (let p = 0; p < this.count; p++) {
      this.targetU[p] = this.homeU[p];
      this.targetV[p] = this.homeV[p];
      this.placeAtTarget(p);
      const birth = score.deposition(
        this.assignment[p],
        this.targetU[p],
        this.targetV[p]
      );
      // The cloud has a short tail; the edge arrives in scattered droplets.
      this.writingBirth[p] = birth.time + hash(p * 7) * 0.1;
      this.writingOwner[p] = birth.drone;
      this.writingSource[p * 2] = birth.x + WRITING_NOZZLE_OFFSET.x;
      this.writingSource[p * 2 + 1] = birth.y + WRITING_NOZZLE_OFFSET.y;
    }
  }

  public burstWriting(score: DroneWriting): void {
    if (!this.writingBirth || !this.writingLive || score.burstStart === null)
      return;
    this.writingBurst = true;
    const start = score.tracks[0][1].start;
    for (let p = 0; p < this.count; p++) {
      if (this.writingLive[p]) continue;
      // Scatter births across the whole name, independently of letter order.
      this.writingBirth[p] =
        start + hash(p * 31 + 17) * (score.paintEnd - start);
    }
    this.writingGlyphEnd?.fill(score.paintEnd + 0.3);
  }

  /** Emit once into the live solver. Existing ink is never repositioned here. */
  public write(time: number, flights?: readonly WritingFlight[]): void {
    if (!this.writingBirth || !this.writingSource || !this.writingLive) return;
    this.writingTime = time;
    const { scale, offsetY } = this.placement;
    for (let p = 0; p < this.count; p++) {
      if (this.writingLive[p]) continue;
      const i = p * STRIDE;
      if (time < this.writingBirth[p]) {
        this.data[i] = this.data[i + 1] = -100000;
        continue;
      }
      const flight = flights?.[this.writingOwner![p]];
      const sx = flight
        ? flight.x + WRITING_NOZZLE_OFFSET.x
        : this.writingSource[p * 2];
      const sy = flight
        ? flight.y + WRITING_NOZZLE_OFFSET.y
        : this.writingSource[p * 2 + 1];
      const spread = this.writingBurst ? 0.22 : 0.036;
      const spreadX = (hash(p * 11) - 0.5) * spread;
      const spreadY = (hash(p * 13) - 0.5) * spread;
      this.posX[p] = this.data[i] = (sx + spreadX) * scale;
      this.posY[p] = this.data[i + 1] = (sy + spreadY) * scale + offsetY;
      this.posZ[p] = (this.jitter[p] - 0.5) * scale * 0.06;
      this.velX[p] =
        ((this.targetU[p] - sx) * 5 + (flight?.vx ?? 0) * 0.22 + spreadY * 9) *
        scale;
      this.velY[p] =
        ((this.targetV[p] - sy) * 5 + (flight?.vy ?? 0) * 0.22 - spreadX * 9) *
        scale;
      if (this.writingBurst) {
        const angle = hash(p * 43 + 9) * Math.PI * 2;
        const speed = (1.5 + hash(p * 47) * 3) * scale;
        this.velX[p] += Math.cos(angle) * speed;
        this.velY[p] += Math.sin(angle) * speed;
        this.velZ[p] = (hash(p * 53) - 0.5) * scale * 2;
      }
      this.data[i + 2] = 0;
      this.data[i + 3] = 0.3;
      this.writingLive[p] = 1;
    }
  }

  public finishWriting(): void {
    this.writingBurst = false;
    this.writingBirth = null;
    this.writingSource = null;
    this.writingOwner = null;
    this.writingLive = null;
    this.writingGlyphEnd = null;
  }

  public cancelWriting(): void {
    if (!this.writingLive) return;
    for (let p = 0; p < this.count; p++) {
      if (!this.writingLive[p]) this.placeAtTarget(p);
    }
    this.finishWriting();
  }
  /** Interleaved screen x, screen y, tint, depth scale — uploaded as-is. */
  public readonly data: Float32Array;
  /** Static per-particle size variation, 0..1. */
  public readonly jitter: Float32Array;
  public count = 0;
  private readonly graph: GraphFormation;
  private readonly state: ParticleState;

  /** Simulation position, in layout space. `data` holds the projection of it. */
  private readonly posX: Float32Array;
  private readonly posY: Float32Array;
  private readonly posZ: Float32Array;
  private readonly velX: Float32Array;
  private readonly velY: Float32Array;
  private readonly velZ: Float32Array;
  /**
   * Per-particle inverse mass.
   *
   * Varying the response to a shared force lets neighbouring particles
   * separate and rejoin instead of moving whole strokes in lockstep.
   */
  private readonly invMass: Float32Array;
  /** Glyph targets in em; pixels are derived each frame from the eased placement. */
  private readonly targetU: Float32Array;
  private readonly targetV: Float32Array;
  /**
   * Where churn is walking a particle to, as against `targetU/targetV`, which
   * is the point the spring is actually pulling on this frame.
   *
   * The two were one array to begin with and that is what made churn read as a
   * flicker rather than as traffic. A re-home rolls a new sample anywhere in
   * the letter, so writing it straight to the spring target moved the target a
   * whole glyph in one frame; the spring's force is proportional to that error,
   * so the particle did not drift to its new place, it was fired at it. Every
   * re-home was a pop, and at `churn` of the field per second the resting
   * masthead was a sheet of them.
   *
   * Holding the destination separately and easing the spring target toward it
   * turns the same event into a crossing that takes `churnGlide` seconds. The
   * ink circulates, which is what the mechanism was for; nothing about it
   * arrives on a single frame, which is all "flickery" ever was.
   */
  private readonly homeU: Float32Array;
  private readonly homeV: Float32Array;
  /** Target depth within the extrusion, em, scaled by the modulated depth. */
  private readonly targetW: Float32Array;
  /** How hard the pointer has recently worked on this particle, 0..1. */
  private readonly heat: Float32Array;
  private readonly ballisticWake: Float32Array;
  private readonly assignment: Int32Array;
  /**
   * The edit wave, held per particle as an amplitude and a phase.
   *
   * `burst` is how hard this particle is lifted, `wake` where it is in the
   * bump: negative while the front is still travelling toward it, `0..burstSpan`
   * while it passes, and past the span once it has gone. Two numbers rather
   * than one flag because the point of the pair is the *delay* — a particle
   * three letters from the keystroke runs exactly the same bump as one inside
   * it, a fraction of a second later, and that offset is the whole difference
   * between ink flowing across the word and each letter twitching on its own.
   */
  private readonly burst: Float32Array;
  private readonly wake: Float32Array;
  /** One while this particle's spring anchor is travelling between glyphs. */
  private readonly edit: Uint8Array;
  // Rebuild scratch. Reassignment runs on every keystroke, and allocating four
  // arrays each time made it the one place in the feature that produced garbage.
  private readonly previous: Int32Array;
  private readonly free: Int32Array;
  /**
   * Where in its glyph's coverage each particle sits, 0..1.
   *
   * Held per particle rather than derived from the index, so churn can re-roll
   * one without disturbing anything else, and so a rebuild still reproduces
   * exactly the same target for a particle that kept its letter.
   */
  private readonly sampleSeed: Float32Array;
  private churnCursor = 0;
  private churnDebt = 0;
  private churnStride = 1;
  /** The count `churnStride` was solved for; a change re-solves it. */
  private churnStrideCount = 0;
  private readonly quota = new Int32Array(MAX_GLYPHS);
  private readonly held = new Int32Array(MAX_GLYPHS);
  /** Used to distinguish ink entering a new glyph from ink leaving a deleted one. */
  private previousGlyphCount = 0;

  /**
   * The velocity grid — momentum and mass, splatted from the particles each
   * frame and read back as a local mean.
   *
   * Sharing local momentum spreads pointer impulses across nearby particles.
   * This supplies a viscosity term with memory; it does not solve pressure or
   * enforce incompressibility.
   */
  private readonly gridMX = new Float32Array(MAX_GRID);
  private readonly gridMY = new Float32Array(MAX_GRID);
  private readonly gridW = new Float32Array(MAX_GRID);
  private readonly gridTA = new Float32Array(MAX_GRID);
  private readonly gridTB = new Float32Array(MAX_GRID);
  private readonly gridTC = new Float32Array(MAX_GRID);
  private gridCols = 0;
  private gridRows = 0;
  private gridCell = 1;

  private layout: TextLayout | null = null;
  private hasTargets = false;
  private seeded = false;
  private time = 0;
  /** 0 for an isolated edit, approaching 1 while keys arrive continuously. */
  private editTempo = 0;
  private lastEditAt = -Infinity;
  /** Eased px-per-em and vertical offset. See the note on `TextLayout`. */
  private placement = { scale: 16, offsetY: 0 };

  /**
   * Wall-impact energy per perimeter segment, 0..1, decayed every frame.
   * Public and read directly by the engine, the same way `data` is: rebuilding
   * a parallel array of the same numbers every frame would cost more than the
   * coupling saves.
   */
  public readonly perimeterHeat = new Float32Array(PERIMETER_SEGMENTS);
  /** Segment rects in layout space, css px. Rebuilt only when the vessel resizes. */
  public readonly perimeterX = new Float32Array(PERIMETER_SEGMENTS);
  public readonly perimeterY = new Float32Array(PERIMETER_SEGMENTS);
  public readonly perimeterW = new Float32Array(PERIMETER_SEGMENTS);
  public readonly perimeterH = new Float32Array(PERIMETER_SEGMENTS);
  /**
   * Per-wall segment range and extent, order top/right/bottom/left. `origin`
   * and `span` are the coordinate along the wall a hit is measured against —
   * x for top/bottom, y for left/right.
   */
  private readonly perimeterWalls: {
    first: number;
    count: number;
    origin: number;
    span: number;
  }[] = [
    { first: 0, count: 0, origin: 0, span: 1 },
    { first: 0, count: 0, origin: 0, span: 1 },
    { first: 0, count: 0, origin: 0, span: 1 },
    { first: 0, count: 0, origin: 0, span: 1 },
  ];

  private bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  /**
   * The two wave settings, cached from the last frame.
   *
   * `retarget` runs on a keystroke rather than on a frame, so it has no
   * settings in hand, and the reach and speed of the front are exactly what it
   * needs to lay the wave out. Copying them here beats threading the whole
   * settings object through every caller of `setLayout` for two numbers that
   * change only when the dev panel is open.
   */
  private wave = { spread: 2.2, speed: 7 };
  private pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    strength: 1,
    mark: 1,
    /** The organic pointer works a wider, softer patch than a real one. */
    radiusScale: 1,
    active: false,
  };

  constructor(capacity = MAX_PARTICLES) {
    this.graph = new GraphFormation(capacity);
    this.data = new Float32Array(capacity * STRIDE);
    this.jitter = new Float32Array(capacity);
    this.posX = new Float32Array(capacity);
    this.posY = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velY = new Float32Array(capacity);
    this.velZ = new Float32Array(capacity);
    this.invMass = new Float32Array(capacity);
    this.targetU = new Float32Array(capacity);
    this.targetV = new Float32Array(capacity);
    this.homeU = new Float32Array(capacity);
    this.homeV = new Float32Array(capacity);
    this.targetW = new Float32Array(capacity);
    this.heat = new Float32Array(capacity);
    this.ballisticWake = new Float32Array(capacity);
    this.assignment = new Int32Array(capacity).fill(-1);
    this.burst = new Float32Array(capacity);
    this.wake = new Float32Array(capacity).fill(Infinity);
    this.edit = new Uint8Array(capacity);
    this.previous = new Int32Array(capacity);
    this.free = new Int32Array(capacity);
    this.sampleSeed = new Float32Array(capacity);
    this.state = {
      posX: this.posX,
      posY: this.posY,
      posZ: this.posZ,
      velX: this.velX,
      velY: this.velY,
      velZ: this.velZ,
      invMass: this.invMass,
    };
    for (let p = 0; p < capacity; p++) this.sampleSeed[p] = hash(p * 3);

    for (let p = 0; p < capacity; p++) {
      this.jitter[p] = hash(p * 7 + 11);
      // Skewed toward the light end: a few sluggish particles read as weight,
      // a majority of them reads as lag.
      const m = hash(p * 11 + 3);
      this.invMass[p] = 0.5 + m * m * 1.35;
      this.targetW[p] = hash(p * 13 + 5) - 0.5;
    }
  }

  public get capacity(): number {
    return this.jitter.length;
  }

  /**
   * The vessel: the box the particles are held inside, in layout coordinates
   * relative to the heading's own top-left corner.
   *
   * It used to be the heading's box grown by the canvas overdraw margin, which
   * put the walls at a distance chosen so sprites would not be clipped — ink
   * pooled against an edge sitting a couple of dozen pixels outside anything a
   * reader could see. The walls now sit on the page's own grid: left and right
   * exactly on the content column, top and bottom a stated headroom above and
   * below the reserved box. The overdraw margin is still there, but it is only
   * a drawing concern now and the simulation no longer knows about it.
   */
  public setBounds(
    left: number,
    top: number,
    right: number,
    bottom: number
  ): void {
    this.bounds = { left, top, right, bottom };
    this.layoutPerimeter();
  }

  /**
   * Divide the vessel's four edges into `PERIMETER_SEGMENTS` segments,
   * proportional to each edge's share of the total perimeter length. Run only
   * here, not per frame: the vessel is fixed for the life of the layout,
   * so the geometry a hit is measured against only ever changes on a resize.
   *
   * A resize invalidates any mark already sitting on the old geometry, so heat
   * is cleared along with it — an impact remembered against a wall that has
   * since moved is not a record of anything.
   */
  private layoutPerimeter(): void {
    const { left, top, right, bottom } = this.bounds;
    const width = Math.max(1e-3, right - left);
    const height = Math.max(1e-3, bottom - top);
    const perimeter = 2 * (width + height);
    const edges: { origin: number; span: number }[] = [
      { origin: left, span: width }, // top
      { origin: top, span: height }, // right
      { origin: left, span: width }, // bottom
      { origin: top, span: height }, // left
    ];

    let next = 0;
    for (let e = 0; e < 4; e++) {
      const remaining = PERIMETER_SEGMENTS - next;
      const raw =
        e === 3
          ? remaining
          : Math.round((edges[e].span / perimeter) * PERIMETER_SEGMENTS);
      const count = Math.max(0, Math.min(Math.max(1, raw), remaining));
      this.perimeterWalls[e] = {
        first: next,
        count,
        origin: edges[e].origin,
        span: edges[e].span,
      };

      const segSpan = edges[e].span / Math.max(1, count);
      for (let i = 0; i < count; i++) {
        const idx = next + i;
        const a = edges[e].origin + segSpan * i;
        if (e === 0) {
          // top
          this.perimeterX[idx] = a;
          this.perimeterY[idx] = top;
          this.perimeterW[idx] = segSpan;
          this.perimeterH[idx] = PERIMETER_THICKNESS;
        } else if (e === 1) {
          // right
          this.perimeterX[idx] = right - PERIMETER_THICKNESS;
          this.perimeterY[idx] = a;
          this.perimeterW[idx] = PERIMETER_THICKNESS;
          this.perimeterH[idx] = segSpan;
        } else if (e === 2) {
          // bottom
          this.perimeterX[idx] = a;
          this.perimeterY[idx] = bottom - PERIMETER_THICKNESS;
          this.perimeterW[idx] = segSpan;
          this.perimeterH[idx] = PERIMETER_THICKNESS;
        } else {
          // left
          this.perimeterX[idx] = left;
          this.perimeterY[idx] = a;
          this.perimeterW[idx] = PERIMETER_THICKNESS;
          this.perimeterH[idx] = segSpan;
        }
      }
      next += count;
    }
    this.perimeterHeat.fill(0);
  }

  /**
   * Register a hit on one wall (0 top, 1 right, 2 bottom, 3 left), in
   * whichever segment covers `coord`. `impulsePx` is the velocity component
   * the wall just killed; `span` is the px/s that reads as a full hit.
   *
   * A hit can only brighten a segment, matching the ink's own `heat`: several
   * weak hits landing on the same segment in the same frame do not stack past
   * one strong one, and only decay ever dims it.
   */
  private markPerimeter(
    wall: number,
    coord: number,
    impulsePx: number,
    span: number
  ): void {
    const info = this.perimeterWalls[wall];
    if (info.count <= 0) return;
    const t = (coord - info.origin) / Math.max(1e-3, info.span);
    let idx = Math.floor(t * info.count);
    if (idx < 0) idx = 0;
    else if (idx >= info.count) idx = info.count - 1;
    const seg = info.first + idx;
    const contribution = Math.min(1, impulsePx / span);
    if (contribution > this.perimeterHeat[seg]) {
      this.perimeterHeat[seg] = contribution;
    }
  }

  /**
   * The eased mapping from em to pixels. Driven by the engine every frame so a
   * refit arrives over a few frames instead of in one.
   */
  public setPlacement(scale: number, offsetY: number): void {
    this.placement.scale = scale;
    this.placement.offsetY = offsetY;
  }

  public setPointer(
    x: number,
    y: number,
    vx: number,
    vy: number,
    strength = 1,
    mark = 1,
    radiusScale = 1
  ): void {
    this.pointer = { x, y, vx, vy, strength, mark, radiusScale, active: true };
  }

  public clearPointer(): void {
    this.pointer.active = false;
    this.pointer.vx = 0;
    this.pointer.vy = 0;
  }

  public setCount(count: number): void {
    const next = Math.max(1, Math.min(count, this.capacity));
    if (next === this.count) return;

    const added = next > this.count ? { from: this.count, to: next } : null;
    this.count = next;
    this.graph.setCount(next);

    if (this.seeded && this.layout) {
      this.retarget();
      // Particles switched on later join the letters they now belong to rather
      // than flying in from a position they held before the count was reduced.
      if (added) {
        for (let p = added.from; p < added.to; p++) this.placeAtTarget(p);
      }
    } else if (added) {
      for (let p = added.from; p < added.to; p++) this.scatter(p);
    }
  }

  public setGraphMode(active: boolean): void {
    this.reluctantIds.clear();
    this.graph.setActive(active, this.count);
  }

  public cycleGraphTopology(): GraphTopologyKind {
    return this.graph.cycle(this.count);
  }

  public get graphTopology(): GraphTopologyKind {
    return this.graph.topology;
  }

  public get graphEdges(): Uint32Array {
    return this.graph.edges;
  }

  public get graphNodes(): Uint32Array {
    return this.graph.structuralNodes;
  }

  public get graphBlend(): number {
    return this.graph.blend;
  }

  /**
   * Hand the field a new string.
   *
   * Sticky assignment is the whole trick, and it is worth restating why: sharing
   * the particles out evenly across the new ink — however tidy that is — shifts
   * every particle along the string by however much the text grew, so one
   * keystroke sets the entire word travelling and it dissolves in flight.
   * Holding each glyph's particles where they already are means only the
   * particles the new letter actually needs have anywhere to go, and the new
   * character gathers out of the word while the rest of it stays legible.
   */
  public setLayout(layout: TextLayout): void {
    this.reluctantIds.clear();
    this.layout = layout;
    this.hasTargets = layout.glyphs.length > 0;
    this.retarget();

    // First layout with letters in it: put the ink where they already are.
    //
    // Letting the particles fly in from a scatter is the more obviously
    // impressive opening, and it is the wrong one. The browser has already
    // painted this heading; dissolving it and reassembling it teaches the reader
    // nothing they did not know, and it costs the fold half a second of noise.
    // Seeding on target makes the hand-off from DOM text to particle text
    // invisible, and saves the assembly for the moment it means something — when
    // the name is typed back at the end of the opening sequence.
    //
    // `hasTargets` in the condition, not just `seeded`: the engine measures
    // before it is told the text, so the first layout it builds is of the empty
    // string. Seeding on that spent the one chance to start on the letterform
    // on a layout that had none, and left every particle scattered across the
    // vessel to fly in from — the assembly this is here to prevent.
    if (!this.seeded && this.hasTargets) {
      this.seeded = true;
      for (let p = 0; p < this.count; p++) this.placeAtTarget(p);
    }
  }

  /**
   * Drop a particle onto its target with a little grain and no velocity.
   *
   * Both the simulation position and the buffer, and the first of those is the
   * one that matters: `data` is the projection, and `step` overwrites it from
   * `posX/posY/posZ` on the very next frame. Writing only the buffer put the
   * ink on the letterform for exactly as long as it took a frame to run and
   * then snapped it back to wherever the last scatter had left it — which is
   * the assembly-on-load that seeding on target exists to avoid.
   */
  private placeAtTarget(p: number): void {
    if (!this.hasTargets) {
      this.scatter(p);
      return;
    }
    const { scale, offsetY } = this.placement;
    const spread = scale * 0.05;
    const x = this.targetU[p] * scale + (hash(p * 9 + 3) - 0.5) * spread;
    const y =
      this.targetV[p] * scale + offsetY + (hash(p * 9 + 5) - 0.5) * spread;

    this.posX[p] = x;
    this.posY[p] = y;
    this.posZ[p] = 0;

    const i = p * STRIDE;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = 0;
    this.velX[p] = 0;
    this.velY[p] = 0;
    this.velZ[p] = 0;
    this.burst[p] = 0;
    this.wake[p] = Infinity;
    this.edit[p] = 0;
    this.heat[p] = 0;
    this.ballisticWake[p] = 0;
  }

  private retarget(): void {
    const layout = this.layout;
    if (!layout || layout.glyphs.length === 0) {
      this.burst.fill(0);
      this.wake.fill(Infinity);
      this.edit.fill(0);
      this.assignment.fill(-1, 0, this.count);
      this.previousGlyphCount = 0;
      return;
    }

    const glyphs = layout.glyphs;
    const glyphCount = Math.min(glyphs.length, MAX_GLYPHS);
    const count = this.count;
    const oldGlyphCount = this.previousGlyphCount;
    const { assignment, previous, free, quota, held } = this;

    // Shares by ink, so a wide letter holds more particles than a narrow one.
    let total = 0;
    for (let g = 0; g < glyphCount; g++) total += glyphs[g].glyph.area;
    for (let g = 0; g < glyphCount; g++) {
      quota[g] = Math.floor((count * glyphs[g].glyph.area) / total);
      held[g] = 0;
    }

    let freeCount = 0;
    for (let p = 0; p < count; p++) {
      const g = assignment[p];
      previous[p] = g;
      if (g >= 0 && g < glyphCount && held[g] < quota[g]) held[g]++;
      else free[freeCount++] = p;
    }

    let f = 0;
    for (let g = 0; g < glyphCount; g++) {
      while (held[g] < quota[g] && f < freeCount) {
        assignment[free[f++]] = g;
        held[g]++;
      }
    }
    // Whatever the per-glyph rounding left over, dealt round-robin.
    for (let g = 0; f < freeCount; g = (g + 1) % glyphCount) {
      assignment[free[f++]] = g;
    }

    let changedCount = 0;
    let sourceU = 0;
    let sourceV = 0;
    let destinationU = 0;
    let destinationV = 0;

    for (let p = 0; p < count; p++) {
      const g = assignment[p];
      const placed = glyphs[g];
      const glyph = placed.glyph;
      const index = pickInk(
        glyph,
        hash(p * 3) * glyph.cdf[glyph.cdf.length - 1]
      );
      // The sample is a function of the particle index alone, so a particle that
      // keeps its glyph keeps precisely the same target and does not move at all.
      const jx = (hash(p * 3 + 1) - 0.5) * glyph.cell;
      const jy = (hash(p * 3 + 2) - 0.5) * glyph.cell;
      const nextU = placed.u + glyph.x[index] + jx;
      const nextV = placed.v + glyph.y[index] + jy;
      const changed = previous[p] !== g;

      if (changed && this.seeded) {
        // Keep the spring where the ink is. The edit front starts this anchor
        // towards `home` later; pointing the spring at the final glyph here is
        // the straight horizontal snap the routed transition exists to remove.
        const invScale = 1 / Math.max(1e-3, this.placement.scale);
        sourceU += this.posX[p] * invScale;
        sourceV += (this.posY[p] - this.placement.offsetY) * invScale;
        destinationU += nextU;
        destinationV += nextV;
        changedCount++;
        this.edit[p] = 1;
      } else if (!this.edit[p]) {
        this.targetU[p] = nextU;
        this.targetV[p] = nextV;
      }

      this.homeU[p] = nextU;
      this.homeV[p] = nextV;
    }

    if (changedCount > 0) {
      const interval = this.time - this.lastEditAt;
      if (Number.isFinite(interval)) {
        const cadence =
          1 -
          (interval - RAPID_EDIT_FLOOR) /
            (RAPID_EDIT_WINDOW - RAPID_EDIT_FLOOR);
        this.editTempo = Math.max(
          this.editTempo,
          Math.max(0, Math.min(1, cadence))
        );
      }
      this.lastEditAt = this.time;

      const invChanged = 1 / changedCount;
      sourceU *= invChanged;
      sourceV *= invChanged;
      destinationU *= invChanged;
      destinationV *= invChanged;
      const deleting = oldGlyphCount > glyphCount;
      const adding = oldGlyphCount < glyphCount;
      this.raise(
        count,
        adding
          ? destinationU
          : deleting
            ? sourceU
            : (sourceU + destinationU) * 0.5,
        adding
          ? destinationV
          : deleting
            ? sourceV
            : (sourceV + destinationV) * 0.5,
        deleting
      );
    }
    this.previousGlyphCount = glyphCount;
  }

  /**
   * Lay the edit wave out over the ink.
   *
   * Kicking only the particles that changed letter — which is what this used to
   * do — keeps an edit local, and that part was right: lifting the whole word
   * on every keystroke disturbs letters that are not changing and the text
   * stops reading as continuous. What it also did was make every edit arrive on
   * exactly one letter, instantly, so typing a word read as a row of separate
   * pops rather than as one movement through the ink.
   *
   * So it stays local and stops being instant. The particles that changed are
   * lifted fully; their neighbours are lifted as far as `burstSpread` reaches,
   * squared-falloff, and the further a particle sits from the letter that
   * changed the later its bump starts. The result is a front that crosses two
   * or three letters and dies out inside the word.
   */
  private raise(
    count: number,
    originU: number,
    originV: number,
    deleting: boolean
  ): void {
    const spread = Math.max(1e-3, this.wave.spread);
    const invSpread = 1 / spread;
    const invSpeed = 1 / Math.max(1e-3, this.wave.speed);
    const rapidDelay =
      this.editTempo > 0
        ? RAPID_EDIT_MAX_DELAY +
          (RAPID_EDIT_WINDOW - RAPID_EDIT_MAX_DELAY) * (1 - this.editTempo)
        : Infinity;
    const { assignment, previous } = this;

    for (let p = 0; p < count; p++) {
      const changed = previous[p] !== assignment[p];
      // On insertion, the closest donor ink leaves first. On deletion, the
      // closest recipient fills first. That reversal is small but important:
      // measuring both from the old position made every particle in a deleted
      // glyph depart together as one horizontal sheet.
      const u = changed && deleting ? this.homeU[p] : this.targetU[p];
      const v = changed && deleting ? this.homeV[p] : this.targetV[p];
      const du = u - originU;
      const dv = v - originV;
      const distance = Math.sqrt(du * du + dv * dv);
      let amplitude = changed ? 1 : 0;
      if (amplitude === 0 && distance < spread) {
        const reach = 1 - distance * invSpread;
        amplitude = reach * reach;
      }
      // A particle may still be travelling from the previous character. Once
      // typing becomes continuous, bring that pending route into the same short
      // catch-up window so the visible word cannot fall several keys behind.
      if (this.edit[p] && this.editTempo > 0) {
        this.wake[p] = Math.max(this.wake[p], -rapidDelay);
      }

      // Particles the wave does not reach keep whatever is still running on
      // them. Zeroing them would cut an earlier keystroke's wave off mid-bump,
      // which is the one thing a wave must not do while somebody is typing.
      if (amplitude <= 0) continue;
      this.burst[p] = amplitude;
      const delay =
        changed || this.edit[p]
          ? Math.min(distance * invSpeed, rapidDelay)
          : distance * invSpeed;
      this.wake[p] = -delay;
    }
  }

  private scatter(p: number): void {
    const { left, top, right, bottom } = this.bounds;
    this.posX[p] = left + hash(p * 5 + 1) * (right - left);
    this.posY[p] = top + hash(p * 5 + 2) * (bottom - top);
    this.posZ[p] = 0;
    this.velX[p] = 0;
    this.velY[p] = 0;
    this.velZ[p] = 0;
    this.burst[p] = 0;
    this.wake[p] = Infinity;
    this.edit[p] = 0;
  }

  /**
   * Particle-to-grid. Splats each particle's momentum with the same bilinear
   * weights the gather uses, so the pair conserves momentum exactly.
   */
  private scatterVelocities(cellPx: number): boolean {
    const { left, top, right, bottom } = this.bounds;
    const width = right - left;
    const height = bottom - top;
    const span = 1 / Math.max(1e-3, cellPx);
    let cols = Math.ceil(width * span) + 2;
    let rows = Math.ceil(height * span) + 2;

    // Widen the cell rather than truncate the grid: a grid that does not reach
    // the far side of the text would leave that half uncoupled.
    let cell = cellPx;
    while (cols * rows > MAX_GRID) {
      cell *= 1.35;
      const s2 = 1 / cell;
      cols = Math.ceil(width * s2) + 2;
      rows = Math.ceil(height * s2) + 2;
    }
    if (cols < 3 || rows < 3) return false;

    this.gridCols = cols;
    this.gridRows = rows;
    this.gridCell = cell;

    const used = cols * rows;
    this.gridMX.fill(0, 0, used);
    this.gridMY.fill(0, 0, used);
    this.gridW.fill(0, 0, used);

    const invCell = 1 / cell;
    const maxX = cols - 2;
    const maxY = rows - 2;

    for (let p = 0; p < this.count; p++) {
      if (this.writingLive && !this.writingLive[p]) continue;
      const gx = (this.posX[p] - left) * invCell;
      const gy = (this.posY[p] - top) * invCell;
      let ix = gx | 0;
      let iy = gy | 0;
      if (ix < 0) ix = 0;
      else if (ix > maxX) ix = maxX;
      if (iy < 0) iy = 0;
      else if (iy > maxY) iy = maxY;
      const fx = gx - ix;
      const fy = gy - iy;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const vx = this.velX[p];
      const vy = this.velY[p];

      const a = iy * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;

      this.gridMX[a] += vx * w00;
      this.gridMY[a] += vy * w00;
      this.gridW[a] += w00;
      this.gridMX[b] += vx * w10;
      this.gridMY[b] += vy * w10;
      this.gridW[b] += w10;
      this.gridMX[c] += vx * w01;
      this.gridMY[c] += vy * w01;
      this.gridW[c] += w01;
      this.gridMX[d] += vx * w11;
      this.gridMY[d] += vy * w11;
      this.gridW[d] += w11;
    }

    return true;
  }

  /**
   * Mass-weighted 1-2-1 blur, separable, over momentum and mass together.
   *
   * Smoothing the velocities after normalising instead would drag every cell at
   * the edge of a stroke toward the zero velocity of the empty paper beside it,
   * which is extra damping exactly where the ink is thinnest. Carrying the mass
   * through the blur and dividing only at the gather keeps empty cells out of
   * the average entirely.
   */
  private smoothGrid(passes: number): void {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const channels: [Float32Array, Float32Array][] = [
      [this.gridMX, this.gridTA],
      [this.gridMY, this.gridTB],
      [this.gridW, this.gridTC],
    ];

    for (let pass = 0; pass < passes; pass++) {
      for (const [src, tmp] of channels) {
        for (let y = 0; y < rows; y++) {
          const row = y * cols;
          for (let x = 0; x < cols; x++) {
            const i = row + x;
            const l = x > 0 ? src[i - 1] : src[i];
            const r = x < cols - 1 ? src[i + 1] : src[i];
            tmp[i] = (l + src[i] * 2 + r) * 0.25;
          }
        }
        for (let y = 0; y < rows; y++) {
          const row = y * cols;
          for (let x = 0; x < cols; x++) {
            const i = row + x;
            const u = y > 0 ? tmp[i - cols] : tmp[i];
            const d = y < rows - 1 ? tmp[i + cols] : tmp[i];
            src[i] = (u + tmp[i] * 2 + d) * 0.25;
          }
        }
      }
    }
  }

  /**
   * Hand one particle a different place inside the letter it already belongs to.
   *
   * Re-rolling a small fraction of the sample points per second keeps particles
   * circulating inside each glyph. The seed walks by the golden ratio rather than
   * jumping at random, so successive re-rolls of the same particle are
   * low-discrepancy: it visits the whole letter instead of clustering.
   *
   * The cursor steps through every particle rather than picking at random, so
   * every particle gets its turn at the same rate — random picking leaves a
   * tail that never moves at all. It steps by `churnStrideFor` and not by one,
   * which was the first version and was the wrong reading of that requirement:
   * particle index runs in glyph order, because `assign` fills the letters in
   * turn from an ascending free list, so incrementing swept a band of re-homing
   * across the name left to right, at a fixed rate, once every `1 / churn`
   * seconds. Fairness is a property of which particles a lap covers; it says
   * nothing about the order, and in reading order it read as a scanline.
   */
  private rehome(p: number): void {
    // Circulation may cross an entire glyph only after all its strokes exist.
    if (
      this.writingLive &&
      (!this.writingLive[p] ||
        this.writingTime < this.writingGlyphEnd![this.assignment[p]])
    )
      return;
    // An edit already owns this destination. Letting background circulation
    // replace it mid-flight makes a routed character miss the glyph it was
    // recruited for.
    if (this.edit[p]) return;
    const layout = this.layout;
    if (!layout) return;
    const placed = layout.glyphs[this.assignment[p]];
    if (!placed) return;

    const seed = this.sampleSeed[p] * 1.618034 + 0.3183099;
    const next = seed - Math.floor(seed);
    this.sampleSeed[p] = next;

    const glyph = placed.glyph;
    const index = pickInk(glyph, next * glyph.cdf[glyph.cdf.length - 1]);
    const jx = (hash(p * 3 + 1) - 0.5) * glyph.cell;
    const jy = (hash(p * 3 + 2) - 0.5) * glyph.cell;
    this.homeU[p] = placed.u + glyph.x[index] + jx;
    this.homeV[p] = placed.v + glyph.y[index] + jy;
  }

  /** Kick every particle at once — the programme's snap back into the word. */
  public kick(): void {
    // Swept, not simultaneous. The movements this belongs to — the word
    // arriving, the word snapping back — are a movement through the ink, and a
    // kick that lands on every particle on the same frame is a flash across the
    // top of one.
    const invSpeed = 1 / Math.max(1e-3, this.wave.speed * KICK_SWEEP);
    for (let p = 0; p < this.count; p++) {
      this.burst[p] = 1;
      this.wake[p] = -this.targetU[p] * invSpeed;
    }
  }

  /**
   * Knock every particle off its target at once, synchronised rather than
   * swept, and mark it in the same instant.
   *
   * `kick()` stays swept and leaves position alone deliberately — see its own
   * comment — because the movements it belongs to are a travel through ink
   * that is already on its way to a new target (a retype), so the gap
   * `data[i+2]` reads is the retarget's, not the kick's. A selection has no
   * new target to travel to: the only way to open a gap for the reader to see
   * is to push position away from home directly, which is what this does —
   * a real jolt, in a random direction per particle, well past `tintTravel`
   * so it reads as ink rather than as noise. The spring pulls it back over
   * the next few frames the same way it recovers from a pointer release, and
   * `heat` fades on the same clock, so the pop and its colour settle
   * together. This is the field's stand-in for the browser's own
   * `::selection` fill, which never gets painted — the heading it would fill
   * stays `visibility: hidden` so a selection cannot reveal a copy of the
   * type nobody meant to show; see ParticleText.tsx.
   */
  public flash(amount = 1): void {
    // Comfortably past the default `tintTravel` (0.22em) whatever the current
    // type size — `placement.scale` is px-per-em, eased the same way `em` is
    // everywhere else this field is driven from.
    const spread = 0.4 * Math.max(1, this.placement.scale);
    for (let p = 0; p < this.count; p++) {
      this.burst[p] = amount;
      this.wake[p] = 0;
      if (amount > this.heat[p]) this.heat[p] = amount;
      const angle = hash(p * 41 + 17) * Math.PI * 2;
      this.posX[p] += Math.cos(angle) * spread;
      this.posY[p] += Math.sin(angle) * spread;
    }
  }

  /**
   * Advance one frame. `em` is CSS px per em, which converts every spatial
   * setting into the space the particles actually live in.
   */
  public step(
    dt: number,
    s: Readonly<ParticleTextSettings>,
    em: number,
    mod: Readonly<Modulation>
  ): void {
    this.time += dt;

    const data = this.data;
    const count = this.count;
    const hasTargets = this.hasTargets;

    const radius = Math.max(
      1e-3,
      s.pointerRadius * em * this.pointer.radiusScale
    );
    const invRadius = 1 / radius;
    const falloff = s.pointerFalloff;
    // Pointer forces are modulated too, so holding is felt as more than hovering.
    const repel = s.pointerRepel * em * mod.pointer;
    const vortex = s.pointerVortex * em * mod.pointer;
    const drag = s.pointerDrag * mod.pointer;
    const yieldAmount = s.pointerYield;
    const pointerActive = this.pointer.active;
    const px0 = this.pointer.x;
    const py0 = this.pointer.y;
    const pvx = this.pointer.vx;
    const pvy = this.pointer.vy;
    const pointerStrength = this.pointer.strength;
    const pointerMark = this.pointer.mark;

    const graphBlend = this.graph.step(this.state, count, this.bounds, dt, em, {
      active: pointerActive,
      x: px0,
      y: py0,
      radius,
      falloff,
      yieldAmount,
      strength: pointerStrength,
    });
    const textBlend = 1 - graphBlend;

    // Everything the programme modulates is folded in once, here, so the inner
    // loop never learns that a programme exists.
    const attraction = hasTargets
      ? s.attraction * mod.attraction * textBlend
      : 0;
    const travelScale = 1 / Math.max(1e-3, s.travel * em);
    const damping = (hasTargets ? s.damping : s.damping * 0.35) * mod.damping;
    const settle = s.settle * mod.damping;
    const reluctantAge = this.time - this.reluctantStart;
    const returnAge = Math.max(0, reluctantAge - 0.65);
    const reluctantOffset =
      reluctantAge < 2.7 && textBlend > 0.99
        ? Math.cos(returnAge * 5) *
          Math.exp(-returnAge * 2) *
          Math.min(1, (2.7 - reluctantAge) * 4)
        : 0;

    const invCoarse = 1 / Math.max(1, s.turbulenceScale * em);
    const invFine =
      1 / Math.max(1, s.turbulenceScale * s.turbulenceDetail * em);
    const driftPx = this.time * s.turbulenceDrift * em;
    const coarseU = driftPx * invCoarse;
    const coarseV = -driftPx * 0.63 * invCoarse;
    const fineDrift = driftPx * s.turbulenceDetailDrift;
    const fineU = -fineDrift * 0.85 * invFine;
    const fineV = fineDrift * 0.53 * invFine;
    const turbulence = ((s.turbulence * em) / (1 + FINE_AMP)) * mod.turbulence;
    const burstForce = s.burst * em;
    const burstSpan = Math.max(0.01, s.burstSpan);
    const invBurstSpan = 1 / burstSpan;
    const rapidEdit = this.editTempo;
    const editGlideTime =
      s.editGlide * (1 - rapidEdit * (1 - RAPID_EDIT_GLIDE_RATIO));
    const editGlide = editGlideTime > 0 ? dt / (editGlideTime + dt) : 1;
    this.editTempo *= 1 / (1 + dt / RAPID_EDIT_RELEASE);
    // Implicit-Euler lerp, the same form the damping below is written in and
    // for the same reason: stable at any step, monotone, and no per-particle
    // transcendental in the inner loop. A zero glide restores the old snap.
    const glide = s.churnGlide > 0 ? dt / (s.churnGlide + dt) : 1;
    // Read here rather than passed in: `retarget` lays the wave out on a
    // keystroke, not on a frame, and these are the two numbers it needs.
    this.wave.spread = s.burstSpread;
    this.wave.speed = s.burstSpeed;

    // The programme describes the choreography as a 0..1 position between the
    // two tuned states. Keeping the actual depths in settings makes the visual
    // result directly tuneable without teaching Tweakpane about movements.
    const depthMix = Math.max(0, Math.min(1, mod.depthMix));
    const looseDepth = Math.max(s.restDepth, s.looseDepth);
    const depth =
      (s.restDepth +
        (looseDepth - s.restDepth) * depthMix +
        Math.max(0, mod.depthOffset)) *
      em;
    const spatial = depth > em * 0.06;
    const depthPull = attraction * 0.75;

    const tintSpan = Math.max(1e-3, s.tintTravel * em);
    const wakeDecay = Math.exp(-dt / 0.65);
    const heatDecay = 1 / (1 + dt / Math.max(0.01, s.tintDecay));
    const { scale, offsetY } = this.placement;

    // Particle-to-grid, before anything reads it back.
    const cohesion = Math.max(0, s.cohesion * mod.cohesion);
    let coupled = false;
    if (cohesion > 0) {
      coupled = this.scatterVelocities(Math.max(2, s.cohesionCell * em));
      if (coupled && s.cohesionSmoothing > 0) {
        this.smoothGrid(Math.min(3, Math.round(s.cohesionSmoothing)));
      }
    }
    const cohesionBlend = coupled ? 1 - 1 / (1 + cohesion * dt) : 0;
    const gridCols = this.gridCols;
    const invGridCell = 1 / this.gridCell;
    const gridMaxX = gridCols - 2;
    const gridMaxY = this.gridRows - 2;

    // Internal circulation. Fractional counts are carried between frames, so a
    // rate under one particle per frame still happens at the rate asked for.
    if (hasTargets && textBlend > 0.001 && s.churn > 0) {
      if (this.churnStrideCount !== count) {
        this.churnStride = churnStrideFor(count);
        this.churnStrideCount = count;
        this.churnCursor %= count;
      }
      this.churnDebt += s.churn * count * dt;
      let pending = this.churnDebt | 0;
      this.churnDebt -= pending;
      while (pending-- > 0) {
        this.rehome(this.churnCursor);
        this.churnCursor = (this.churnCursor + this.churnStride) % count;
      }
    }

    // The vessel. The grid shares its origin, so a particle's cell index is
    // its offset from the same corner the walls are measured from.
    const { left: minX, top: minY, right: maxX, bottom: maxY } = this.bounds;
    const gridOriginX = minX;
    const gridOriginY = minY;
    const maxZ = Math.max(em * 0.2, depth * 2.2);
    const wall = 12;

    // Perimeter impact: decayed once per frame, deposited per bounce below.
    const perimeterSpan = Math.max(1e-3, s.perimeterImpact * em);
    const perimeterDecay = 1 / (1 + dt / Math.max(0.01, s.perimeterDecay));
    for (let i = 0; i < this.perimeterHeat.length; i++) {
      this.perimeterHeat[i] *= perimeterDecay;
    }

    // Camera. A permanent, very slow idle sway on top of whatever the programme
    // asks for: enough that the masthead is never quite a flat image, far too
    // little to read as motion on its own.
    const yaw = mod.yaw + Math.sin(this.time * 0.21) * 0.009;
    const pitch = mod.pitch + Math.sin(this.time * 0.13 + 1.7) * 0.006;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const focal = em * Math.max(1, s.perspective);
    const centreX = (minX + maxX) * 0.5;
    const centreY = (minY + maxY) * 0.5;

    for (let p = 0; p < count; p++) {
      if (this.writingLive && !this.writingLive[p]) continue;
      const freshPaint = this.writingBirth
        ? Math.max(0, 1 - (this.writingTime - this.writingBirth[p]) / 0.8)
        : 0;
      const x = this.posX[p];
      const y = this.posY[p];
      const z = this.posZ[p];
      let vx = this.velX[p];
      let vy = this.velY[p];
      let vz = this.velZ[p];
      let heat = this.heat[p] * heatDecay;
      const ballisticWake = this.ballisticWake[p] * wakeDecay;
      this.ballisticWake[p] = ballisticWake;
      // Light particles accelerate further under the same force, which is the
      // whole reason neighbours stop travelling as a block.
      const mobility = this.invMass[p];

      // ── Pointer ───────────────────────────────────────────────────────────
      let hold = 1 - ballisticWake * 0.88;
      if (pointerActive) {
        const ox = x - px0;
        const oy = y - py0;
        const distSq = ox * ox + oy * oy;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          const t = 1 - dist * invRadius;
          const force = falloff === 2 ? t * t : Math.pow(t, falloff);
          const inv = 1 / Math.max(dist, 1e-3);
          const dirX = ox * inv;
          const dirY = oy * inv;
          const push = force * mobility * pointerStrength;

          vx += dirX * repel * push * dt;
          vy += dirY * repel * push * dt;
          // Not scaled by dt: this is momentum handed over from the pointer,
          // not an acceleration, so a fast flick displaces the ink further.
          vx += pvx * drag * push;
          vy += pvy * drag * push;
          // Perpendicular, so the dent rotates instead of only opening.
          vx += -dirY * vortex * push * dt;
          vy += dirX * vortex * push * dt;
          if (spatial) vz += (0.5 - hash(p * 17 + 1)) * repel * push * dt;

          hold *= Math.max(0, 1 - force * yieldAmount * pointerStrength);
          // Autonomous movement shares the mechanics of the pointer but not its
          // orange mark: colour continues to mean that the reader touched it.
          const mark = force * pointerMark;
          if (mark > heat) heat = mark;
        }
      }

      // ── Curl field, two scales ────────────────────────────────────────────
      // Both fetches are written out rather than factored into a helper. A
      // helper has to return two numbers, and the only allocation-free ways to
      // do that from module scope — a shared pair of `let`s, or a scratch
      // typed array — are context-slot writes rather than locals. Measured, it
      // tripled the cost of the whole loop.
      const cu = x * invCoarse + coarseU;
      const cv = y * invCoarse + coarseV;
      const cx0 = Math.floor(cu);
      const cy0 = Math.floor(cv);
      const cfx = cu - cx0;
      const cfy = cv - cy0;
      const ca = (((cy0 & NOISE_MASK) << 6) + (cx0 & NOISE_MASK)) * 2;
      const cb = (((cy0 & NOISE_MASK) << 6) + ((cx0 + 1) & NOISE_MASK)) * 2;
      const cc = ((((cy0 + 1) & NOISE_MASK) << 6) + (cx0 & NOISE_MASK)) * 2;
      const cd =
        ((((cy0 + 1) & NOISE_MASK) << 6) + ((cx0 + 1) & NOISE_MASK)) * 2;
      const cw00 = (1 - cfx) * (1 - cfy);
      const cw10 = cfx * (1 - cfy);
      const cw01 = (1 - cfx) * cfy;
      const cw11 = cfx * cfy;

      const fu = x * invFine + fineU;
      const fv = y * invFine + fineV;
      const fx0 = Math.floor(fu);
      const fy0 = Math.floor(fv);
      const ffx = fu - fx0;
      const ffy = fv - fy0;
      const fa = (((fy0 & NOISE_MASK) << 6) + (fx0 & NOISE_MASK)) * 2;
      const fb = (((fy0 & NOISE_MASK) << 6) + ((fx0 + 1) & NOISE_MASK)) * 2;
      const fc = ((((fy0 + 1) & NOISE_MASK) << 6) + (fx0 & NOISE_MASK)) * 2;
      const fd =
        ((((fy0 + 1) & NOISE_MASK) << 6) + ((fx0 + 1) & NOISE_MASK)) * 2;
      const fw00 = (1 - ffx) * (1 - ffy);
      const fw10 = ffx * (1 - ffy);
      const fw01 = (1 - ffx) * ffy;
      const fw11 = ffx * ffy;

      const nfx =
        NOISE[ca] * cw00 +
        NOISE[cb] * cw10 +
        NOISE[cc] * cw01 +
        NOISE[cd] * cw11 +
        (NOISE[fa] * fw00 +
          NOISE[fb] * fw10 +
          NOISE[fc] * fw01 +
          NOISE[fd] * fw11) *
          FINE_AMP;
      const nfy =
        NOISE[ca + 1] * cw00 +
        NOISE[cb + 1] * cw10 +
        NOISE[cc + 1] * cw01 +
        NOISE[cd + 1] * cw11 +
        (NOISE[fa + 1] * fw00 +
          NOISE[fb + 1] * fw10 +
          NOISE[fc + 1] * fw01 +
          NOISE[fd + 1] * fw11) *
          FINE_AMP;

      // The edit wave, as a bump rather than a spike that decays: nothing while
      // the front is still on its way, then a rise to the peak and back to
      // nothing over `burstSpan`. Both ends are zero, so a particle joins and
      // leaves the disturbance without a step in its acceleration — which is
      // all "jerky" ever was.
      let lift = 0;
      const phase = this.wake[p];
      if (phase < burstSpan) {
        const next = phase + dt;
        this.wake[p] = next;
        if (next > 0) {
          const u = next * invBurstSpan;
          lift = this.burst[p] * 4 * u * (1 - u);
        }
      }

      const kick =
        (turbulence +
          burstForce * lift +
          freshPaint * em * 12 +
          ballisticWake * em * 95) *
        mobility;
      vx += nfx * kick * dt;
      vy += nfy * kick * dt;

      if (spatial) {
        // The out-of-plane component, taken from the same field on a plane
        // through z and x. Not the true curl of a 3D potential — that needs a
        // volume, and this is a masthead a few tenths of an em deep — but it is
        // smooth, wraps with the rest, and costs one more fetch only while there
        // is depth to move through.
        const zu = z * invCoarse + coarseV;
        const zv = x * invCoarse - coarseU * 0.5;
        const zx0 = Math.floor(zu);
        const zy0 = Math.floor(zv);
        const zfx = zu - zx0;
        const zfy = zv - zy0;
        const za = (((zy0 & NOISE_MASK) << 6) + (zx0 & NOISE_MASK)) * 2;
        const zb = (((zy0 & NOISE_MASK) << 6) + ((zx0 + 1) & NOISE_MASK)) * 2;
        const zc = ((((zy0 + 1) & NOISE_MASK) << 6) + (zx0 & NOISE_MASK)) * 2;
        const zd =
          ((((zy0 + 1) & NOISE_MASK) << 6) + ((zx0 + 1) & NOISE_MASK)) * 2;
        const nfz =
          NOISE[za] * (1 - zfx) * (1 - zfy) +
          NOISE[zb] * zfx * (1 - zfy) +
          NOISE[zc] * (1 - zfx) * zfy +
          NOISE[zd] * zfx * zfy;
        vz += nfz * kick * dt;
      }

      // ── Grid-to-particle ──────────────────────────────────────────────────
      // Blend toward the mean velocity of the neighbourhood. Momentum and mass
      // are interpolated separately and divided at the end, so empty paper
      // contributes nothing rather than contributing a zero.
      if (cohesionBlend > 0) {
        const gx = (x - gridOriginX) * invGridCell;
        const gy = (y - gridOriginY) * invGridCell;
        let ix = gx | 0;
        let iy = gy | 0;
        if (ix < 0) ix = 0;
        else if (ix > gridMaxX) ix = gridMaxX;
        if (iy < 0) iy = 0;
        else if (iy > gridMaxY) iy = gridMaxY;
        const gfx = gx - ix;
        const gfy = gy - iy;
        const g00 = (1 - gfx) * (1 - gfy);
        const g10 = gfx * (1 - gfy);
        const g01 = (1 - gfx) * gfy;
        const g11 = gfx * gfy;
        const ga = iy * gridCols + ix;
        const gb = ga + 1;
        const gc = ga + gridCols;
        const gd = gc + 1;

        const mass =
          this.gridW[ga] * g00 +
          this.gridW[gb] * g10 +
          this.gridW[gc] * g01 +
          this.gridW[gd] * g11;
        if (mass > 1e-4) {
          const inv = 1 / mass;
          const mx =
            (this.gridMX[ga] * g00 +
              this.gridMX[gb] * g10 +
              this.gridMX[gc] * g01 +
              this.gridMX[gd] * g11) *
            inv;
          const my =
            (this.gridMY[ga] * g00 +
              this.gridMY[gb] * g10 +
              this.gridMY[gc] * g01 +
              this.gridMY[gd] * g11) *
            inv;
          // Scaled by mobility too, so cohesion does not quietly undo the mass
          // spread by dragging every particle onto the same local average.
          const share = cohesionBlend * mobility;
          vx += (mx - vx) * share;
          vy += (my - vy) * share;
        }
      }

      // ── Spring toward the letterform ──────────────────────────────────────
      let dist = 0;
      if (hasTargets) {
        const editing = this.edit[p] === 1;
        // Churn is always allowed to drift. An edit anchor stays in the old
        // letter until its wave arrives, then glides into the new one. This is
        // what makes a deletion peel away from its source instead of snapping
        // every freed particle left on the keydown frame.
        const anchorGlide = editing
          ? this.wake[p] >= 0
            ? editGlide
            : 0
          : glide;
        this.targetU[p] += (this.homeU[p] - this.targetU[p]) * anchorGlide;
        this.targetV[p] += (this.homeV[p] - this.targetV[p]) * anchorGlide;

        if (editing) {
          const homeDu = this.homeU[p] - this.targetU[p];
          const homeDv = this.homeV[p] - this.targetV[p];
          if (homeDu * homeDu + homeDv * homeDv < 1e-6) {
            this.targetU[p] = this.homeU[p];
            this.targetV[p] = this.homeV[p];
            this.edit[p] = 0;
          }
        }

        const late =
          reluctantOffset && this.reluctantIds.has(p) ? reluctantOffset : 0;
        const dx = this.targetU[p] * scale - x + late * em * 0.035;
        const dy = this.targetV[p] * scale + offsetY - y + late * em * 0.15;
        dist = Math.sqrt(dx * dx + dy * dy);
        const pull =
          attraction *
          (1 - freshPaint * 0.65) *
          hold *
          mobility *
          dt *
          (editing ? 1 + rapidEdit * RAPID_EDIT_PULL : 1);
        if (editing && lift > 0 && dist > 1e-3 && s.editCurl > 0) {
          // Keep the forward component target-seeking and use only the curl's
          // perpendicular component to turn it. Adding raw noise can point a
          // far-travelling particle back at its source; steering the spring
          // instead gives it an eddy-shaped route without losing the glyph.
          const dirX = dx / dist;
          const dirY = dy / dist;
          const tangentX = -dirY;
          const tangentY = dirX;
          const cross = nfx * tangentX + nfy * tangentY;
          const rapidCurl = 1 - rapidEdit * (1 - RAPID_EDIT_CURL_RETAIN);
          const bend = Math.max(
            -2.5,
            Math.min(2.5, cross * s.editCurl * lift * rapidCurl)
          );
          const normalise = 1 / Math.sqrt(1 + bend * bend);
          vx += (dirX + tangentX * bend) * normalise * dist * pull;
          vy += (dirY + tangentY * bend) * normalise * dist * pull;
        } else {
          vx += dx * pull;
          vy += dy * pull;
        }
        if (spatial) {
          vz +=
            (this.targetW[p] * depth - z) * depthPull * hold * mobility * dt;
        } else {
          vz -= z * depthPull * dt;
        }
      }

      // Damping scales with how far there is left to go. Written as 1/(1 + k dt)
      // rather than exp(-k dt): unconditionally stable for any k, monotone, and
      // it keeps a per-particle transcendental out of the inner loop.
      // Damping is scaled by mobility too. Scaling only the forces leaves a
      // light particle stiffer but no better damped, so it rings further and the
      // spread shows up as blur instead of as variety. Scaling both keeps every
      // particle's damping ratio identical and varies only its natural
      // frequency — neighbours fall out of step without the edge softening.
      const travel = Math.min(1, dist * travelScale);
      const decay =
        1 / (1 + (damping + travel * settle) * mobility * hold * dt);
      vx *= decay;
      vy *= decay;
      vz *= decay;

      let nx = x + vx * dt;
      let ny = y + vy * dt;
      let nz = z + vz * dt;

      // ── Walls ─────────────────────────────────────────────────────────────
      if (nx < minX) {
        this.markPerimeter(3, ny, Math.abs(vx), perimeterSpan);
        nx = minX;
        vx = Math.abs(vx) * 0.2 + wall;
      } else if (nx > maxX) {
        this.markPerimeter(1, ny, Math.abs(vx), perimeterSpan);
        nx = maxX;
        vx = -Math.abs(vx) * 0.2 - wall;
      }
      if (ny < minY) {
        this.markPerimeter(0, nx, Math.abs(vy), perimeterSpan);
        ny = minY;
        vy = Math.abs(vy) * 0.2 + wall;
      } else if (ny > maxY) {
        this.markPerimeter(2, nx, Math.abs(vy), perimeterSpan);
        ny = maxY;
        vy = -Math.abs(vy) * 0.2 - wall;
      }
      if (nz < -maxZ) {
        nz = -maxZ;
        vz = Math.abs(vz) * 0.2;
      } else if (nz > maxZ) {
        nz = maxZ;
        vz = -Math.abs(vz) * 0.2;
      }

      this.posX[p] = nx;
      this.posY[p] = ny;
      this.posZ[p] = nz;
      this.velX[p] = vx;
      this.velY[p] = vy;
      this.velZ[p] = vz;
      this.heat[p] = heat;

      const i = p * STRIDE;
      // The one colour event on the fold, and it has to mean one thing: ink the
      // reader is displacing, right now, with the pointer.
      //
      // Keying it to distance-from-target alone was wrong twice over. Every
      // particle is far from its target during a retype, so the whole masthead
      // went orange in flight — a full-width signal colour nobody caused. And it
      // said "this ink is not where it belongs", which is a fact about the
      // simulation rather than about the reader. Both terms together say the
      // right thing: the pointer has been here (`heat`), and it moved something
      // (`dist`).
      data[i + 2] = hasTargets ? heat * Math.min(1, dist / tintSpan) : 0;
    }

    this.project(cosY, sinY, cosP, sinP, focal, centreX, centreY);
  }

  /**
   * Yaw, pitch, one perspective divide. A separate pass on purpose: folded into
   * the integrator it cost more than the arithmetic can explain — the loop was
   * already long, and adding six more live arrays to it was enough to lose the
   * good code. Two tight loops measured at half of one long one.
   *
   * It is on the CPU rather than in the vertex shader because the depth scale is
   * wanted for point size *and* opacity anyway, and doing it here keeps the
   * renderer a flat point sprite with nothing to configure.
   */
  private project(
    cosY: number,
    sinY: number,
    cosP: number,
    sinP: number,
    focal: number,
    centreX: number,
    centreY: number
  ): void {
    Object.assign(this.projection, {
      cosY,
      sinY,
      cosP,
      sinP,
      focal,
      centreX,
      centreY,
    });
    const data = this.data;
    for (let p = 0; p < this.count; p++) {
      if (this.writingLive && !this.writingLive[p]) {
        data[p * STRIDE] = data[p * STRIDE + 1] = -100000;
        continue;
      }
      const dx = this.posX[p] - centreX;
      const dy = this.posY[p] - centreY;
      const z = this.posZ[p];
      const rx = dx * cosY + z * sinY;
      let rz = z * cosY - dx * sinY;
      const ry = dy * cosP - rz * sinP;
      rz = dy * sinP + rz * cosP;
      const persp = focal / (focal + rz);

      const i = p * STRIDE;
      data[i] = centreX + rx * persp;
      data[i + 1] = centreY + ry * persp;
      const age = this.writingBirth
        ? Math.max(0, this.writingTime - this.writingBirth[p])
        : 1;
      const arrival = Math.min(1, age / 0.32);
      data[i + 3] = persp * (0.3 + 0.7 * arrival * arrival * (3 - 2 * arrival));
    }
  }
}
