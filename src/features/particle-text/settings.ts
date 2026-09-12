/**
 * Every value the particle text reads, in units that survive a resize.
 *
 * Spatial parameters are in **em** — multiples of the current font size — and
 * temporal ones in seconds. The masthead is set with `clamp(2.75rem, 11vw, 12rem)`,
 * so a pointer radius in pixels would feel like a different effect on a laptop
 * and on a 6K display. Font-relative parameters and glyph targets keep the
 * interaction proportional at every width.
 * The field projects its shallow depth before passing point sprites to WebGL.
 */
export interface ParticleTextSettings {
  // ── The field ──────────────────────────────────────────────────────────────
  /** Fixed for the life of the surface. Text length changes point size, not count. */
  particles: number;
  /**
   * Target fraction of the letterform actually covered by ink, which is what
   * point size is solved for rather than set: a fixed size makes a long string
   * dissolve into dust and a single letter congeal into a blob.
   */
  coverage: number;
  /** Bounds on the solved diameter, in CSS px. */
  minPointSize: number;
  maxPointSize: number;
  /** Per-particle size spread, 0..1. A little grain stops the fill reading as a screen. */
  sizeJitter: number;
  alpha: number;

  // ── Spring: how the letters assemble ───────────────────────────────────────
  /**
   * Pull toward the glyph target, 1/s².
   *
   * It also decides how much *motion* the turbulence buys per unit of blur, and
   * not in the obvious direction. A soft spring lets the ink wander further, but
   * it lags the moving noise field and settles near its local average, so the
   * offset is large and nearly still. A stiff spring tracks the field, so the
   * ink follows the eddies. Measured at equal visible speed, going from 155 to
   * 280 cut the 90th-percentile offset from 5.6 px to 2.1 px.
   */
  attraction: number;
  /** Damping once settled, 1/s. Low, so the ink stays alive. */
  damping: number;
  /**
   * Extra damping while a particle is still travelling, 1/s. One value cannot
   * serve both jobs — loose enough to shimmer at rest is badly under-damped for
   * a long move, and the whole word oscillates through itself on a resize.
   */
  settle: number;
  /** Distance, in em, at which `settle` is fully applied. */
  travel: number;

  // ── Cohesion: what makes the ink a material rather than 24k springs ───────
  /**
   * How fast a particle is pulled toward the mean velocity of its
   * neighbourhood, 1/s. Zero is the old behaviour: every particle its own
   * independent spring, which cannot look like a liquid however the rest is
   * tuned, because nothing a particle does is ever felt by the one beside it.
   *
   * This is the surviving half of MLS-MPM's particle/grid transfer. It buys
   * momentum spreading, a poke that propagates past the particle it landed on,
   * and swirl that outlives the pointer — without the pressure solve, and so
   * without the compute pass.
   */
  cohesion: number;
  /** Velocity-grid cell size, em. Around a stroke width is right. */
  cohesionCell: number;
  /** 1-2-1 blur passes over the grid, 0–3. One is usually enough. */
  cohesionSmoothing: number;

  // ── Turbulence: what keeps settled ink from looking printed ────────────────
  /**
   * Acceleration from the curl field, em/s².
   *
   * Worth sizing deliberately: against a spring of stiffness `attraction`, a
   * steady force settles at `turbulence * em / attraction` pixels. At the first
   * tuning that came to 0.94 px, so the resting shimmer was invisible — the
   * masthead read as printed. Keep the ratio in view when changing either.
   */
  turbulence: number;
  /** Size of one coarse noise cell, in em. */
  turbulenceScale: number;
  /** Fine layer's cell as a fraction of the coarse one. */
  turbulenceDetail: number;
  /**
   * Fine layer's drift as a multiple of the coarse layer's. Above one, because
   * small eddies turn over faster than large ones — and because the fine layer
   * is where most of the visible speed comes from: the coarse one moves whole
   * strokes together, which reads as weight rather than as motion.
   */
  turbulenceDetailDrift: number;
  /**
   * Fraction of the particles given a new place inside their own letter each
   * second. Zero pins every particle to one point for ever, which is a shiver
   * about a fixed home rather than the circulation a fluid has.
   */
  churn: number;
  /**
   * Seconds a churned particle takes to cross to its new sample, as a time
   * constant on the spring's anchor rather than on the particle.
   *
   * `churn` sets how often the ink circulates; this sets whether that reads as
   * circulation at all. At zero the new sample lands on the spring target in
   * one frame, the error the spring sees is most of a glyph wide, and the
   * particle is fired across the letter — the resting masthead becomes a sheet
   * of pops going off at `churn` per second. Around a second, the same event is
   * a particle drifting to another part of its letter, which is the traffic the
   * mechanism was added for and is slow enough that no single one of them
   * catches the eye.
   */
  churnGlide: number;
  /** How fast the field scrolls across the text, em/s. */
  turbulenceDrift: number;
  /**
   * Peak of the edit wave, em/s².
   *
   * Multiplies the curl field so editing stirs letters locally without
   * displacing the whole word away from its centre.
   */
  burst: number;
  /**
   * Seconds one particle spends inside the wave.
   *
   * The kick is a bump — nothing, rise, peak, fall, nothing — not a step that
   * decays. A step arrives on the frame the key is pressed, which is what made
   * a fast sequence of edits read as a row of separate twitches: each letter
   * snapped, and the snap was over before the eye reached it. Rising into the
   * curl over a few tenths of a second is what lets it read as ink being turned
   * rather than ink being hit.
   */
  burstSpan: number;
  /**
   * How far the wave reaches past the letter that changed, em.
   *
   * Particles that changed letter are lifted whatever the distance; everything
   * else is lifted only as far as this, squared-falloff. Zero restores the
   * older behaviour, where only the changed glyph moved and every edit was
   * visibly one letter's business. A couple of em is about three letters, so a
   * keystroke turns the ink around it and dies out inside the word.
   */
  burstSpread: number;
  /**
   * How fast the wave travels out from the edit, em/s.
   *
   * The delay is what makes it a flow rather than a flash: every particle runs
   * the same bump, but it starts later the further it sits from the letter that
   * changed, so the disturbance crosses the word instead of arriving on all of
   * it at once.
   */
  burstSpeed: number;
  /**
   * Time constant, seconds, for a reassigned particle's spring anchor to travel
   * from its old glyph into the new one. The edit wave delays the start; this
   * value shapes the stream once the front reaches it.
   */
  editGlide: number;
  /**
   * How far the curl field may turn the spring force during an edit. Zero gives
   * the direct horizontal chord; values around one produce a visibly curved,
   * still target-seeking route.
   */
  editCurl: number;

  // ── Pointer ────────────────────────────────────────────────────────────────
  /** Radius of influence, em. */
  pointerRadius: number;
  /** Falloff exponent inside that radius. */
  pointerFalloff: number;
  /** Steady outward push, em/s², so the field is felt with the pointer held still. */
  pointerRepel: number;
  /** Fraction of the pointer's own velocity handed to the particle. */
  pointerDrag: number;
  /** Rotation about the pointer, em/s². */
  pointerVortex: number;
  /**
   * How far attraction and damping relax under the pointer, 0..1. At full
   * strength the spring snaps a displaced particle straight back, which reads as
   * a vibration rather than as something you can push through. Relaxing them
   * lets the letterform dent and refill.
   */
  pointerYield: number;

  // ── Organic pointer ───────────────────────────────────────────────────────
  /** Let a curl-noise path quietly move through the word when nobody is using it. */
  organicMotion: boolean;
  /** Seconds after the reader leaves before the organic pointer fades in. */
  organicDelay: number;
  /** Normalised heading-widths travelled per second. */
  organicSpeed: number;
  /** Fraction of the real pointer force applied by the organic path. */
  organicStrength: number;
  /**
   * The organic pointer's radius, as a multiple of `pointerRadius`.
   *
   * Wider than a real pointer on purpose. A finger-sized dent that nobody put
   * there is a glitch; a swell a letter and a half across, moving slowly, is
   * the masthead breathing. The force is spread over more ink at the same
   * strength, so the reach buys legibility rather than violence.
   */
  organicRadius: number;
  /**
   * How hard the path is pulled back toward ink once it has wandered off it,
   * 0..1, against the curl held at 1.
   *
   * Without it the gesture spends about a quarter of its time over blank paper
   * — measured on the real masthead, where the name fills three quarters of the
   * box it is set in. See the note on `OrganicPointerMotion`.
   *
   * 1.2 is the knee. Below it the path still finds the dead corners; above it
   * the pull starts costing exploration — over four minutes of simulated
   * motion, 1.2 is the first value with no time at all spent off the word, and
   * it still reaches 81% as much of the box as an unbiased curl does.
   */
  organicAttention: number;
  /** Extra depth of the cloud, em, at the crest of the movement. */
  organicDepth: number;

  // ── Spatial reading: a shallow volume, not a separate 3D scene ─────────────
  /** Front-to-back depth of the settled letterform, em. */
  restDepth: number;
  /** Front-to-back depth while the performance is fully loose, em. */
  looseDepth: number;
  /** Perspective focal length, em. Lower values exaggerate depth. */
  perspective: number;
  /** Maximum damped yaw from the real pointer, radians. */
  pointerParallax: number;
  /** Strength of front-to-back opacity separation, 0..1. */
  depthContrast: number;

  // ── Colour: the one signal event ───────────────────────────────────────────
  /**
   * Displacement, in em, at which displaced ink reaches full `--brand`. The
   * tint is the product of this and the pointer's recent influence, so the page
   * only ever goes orange where the reader is actually pushing it.
   */
  tintTravel: number;
  /** How long the pointer's mark lingers after it has moved on, seconds. */
  tintDecay: number;

  // ── The performance ────────────────────────────────────────────────────────
  /**
   * Seconds of quiet before the masthead lets go of the letterform, drifts, and
   * snaps back. Each repeat waits proportionally longer. Zero disables it and
   * holds the resting composition.
   */
  idleInterval: number;
  /** How many times it will do that before leaving the reader alone. */
  idlePerformances: number;

  // ── The vessel ─────────────────────────────────────────────────────────────
  /**
   * Air above and below the reserved box, in em, before the ink meets a wall.
   *
   * The walls themselves are not a new number: left and right sit exactly on
   * the content column, which is the margin every other line on the page is set
   * to, so ink pooling at the edge can be measured against the paragraph under
   * it. Only the vertical extent is a choice, and it is a choice about how much
   * room the ink has to be loose in — the letterform's ascenders already reach
   * above the box at the masthead's 0.82 line-height, so some of this is spent
   * before any particle moves.
   *
   * Derived from the heading's metrics rather than from the current string, so
   * the vessel is a fixed frame with a varying instance inside it: typing
   * changes what is in it, never where its walls are.
   */
  vesselHeadroom: number;
  /**
   * Rule the baselines across the vessel.
   *
   * The one visible mark the container makes, and the reason the rest of it is
   * legible: at rest the type sits on its own baselines and reads as a
   * specimen, and the moment the ink is pushed or lets go, the rules stay put
   * and the displacement has something to be measured against. Without them the
   * masthead comes apart against nothing and 2 px of shimmer and 18 px of drift
   * look like the same amount of nothing.
   */
  rules: boolean;
  /** Rule opacity. A hairline that states the grid without drawing attention. */
  ruleAlpha: number;
  /**
   * Remember a wall hit. Off by default, alongside the rules it lights: the
   * perimeter is drawn in segments, each holding the strength of its most
   * recent impact until it decays. Same rule as the ink itself — orange
   * is where the system is being acted on, and a wall is part of the system.
   */
  perimeter: boolean;
  /** Velocity, em/s, a bounce needs to read as a full hit on its segment. */
  perimeterImpact: number;
  /** Seconds for a hit to fade back to nothing. */
  perimeterDecay: number;
  /** Peak opacity of a freshly-hit segment. */
  perimeterAlpha: number;

  // ── Text ───────────────────────────────────────────────────────────────────
  /** Beyond this the block is scaled down rather than allowed to grow the fold. */
  maxLines: number;
  maxLength: number;
  caret: boolean;
  /** Half-period of the caret blink, seconds. */
  caretBlink: number;
}

export const DEFAULT_PARTICLE_TEXT_SETTINGS: Readonly<ParticleTextSettings> = {
  particles: 19000,
  coverage: 0.88,
  minPointSize: 1.1,
  maxPointSize: 4.5,
  sizeJitter: 0.28,
  alpha: 0.92,

  attraction: 280,
  damping: 1.5,
  settle: 26,
  travel: 0.35,

  cohesion: 6,
  cohesionCell: 0.11,
  cohesionSmoothing: 1,

  turbulence: 4.5,
  turbulenceScale: 0.34,
  turbulenceDetail: 0.34,
  turbulenceDrift: 2.2,
  turbulenceDetailDrift: 1.9,
  churn: 0.1,
  churnGlide: 1.1,
  burst: 2.8,
  burstSpan: 0.85,
  burstSpread: 2.2,
  burstSpeed: 7,
  editGlide: 0.2,
  editCurl: 1.35,

  pointerRadius: 0.6,
  pointerFalloff: 2,
  pointerRepel: 5.5,
  pointerDrag: 0.14,
  pointerVortex: 4,
  pointerYield: 0.8,

  organicMotion: true,
  organicDelay: 1.4,
  organicSpeed: 0.075,
  organicStrength: 0.62,
  organicRadius: 1.6,
  organicAttention: 1.2,
  organicDepth: 0.08,

  restDepth: 0.1,
  looseDepth: 0.45,
  perspective: 6,
  pointerParallax: 0.1,
  depthContrast: 0.4,

  tintTravel: 0.22,
  tintDecay: 0.3,

  idleInterval: 11,
  idlePerformances: 2,

  vesselHeadroom: 0.3,
  rules: false,
  ruleAlpha: 0.16,
  perimeter: false,
  perimeterImpact: 3,
  perimeterDecay: 0.5,
  perimeterAlpha: 0.8,

  maxLines: 3,
  maxLength: 42,
  caret: false,
  caretBlink: 0.62,
};

type SettingsListener = (settings: Readonly<ParticleTextSettings>) => void;

/**
 * Mutable settings shared by a group of surfaces.
 *
 * Same shape as PixelFlowSettingsStore: Tweakpane mutates `values` in place and
 * calls `commit()`, so the dev panel needs no knowledge of the engine and the
 * engine needs none of Tweakpane.
 */
export class ParticleTextSettingsStore {
  public readonly values: ParticleTextSettings;
  private readonly listeners = new Set<SettingsListener>();
  private readonly initial: ParticleTextSettings;

  constructor(initial: Partial<ParticleTextSettings> = {}) {
    this.values = { ...DEFAULT_PARTICLE_TEXT_SETTINGS, ...initial };
    this.initial = { ...this.values };
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.values);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public commit(): void {
    this.listeners.forEach((listener) => listener(this.values));
  }

  public reset(): void {
    Object.assign(this.values, this.initial);
    this.commit();
  }
}
