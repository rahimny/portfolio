import { tokenToRgb } from './colour';
import { HomeWorld } from '../home/HomeWorld';
import { MastheadDomBridge } from './MastheadDomBridge';
import type { MastheadActorsRenderer } from '../../vanilla-three/dom-effects/MastheadActorsRenderer';
import { fontMetrics, rasterFont } from './glyphAtlas';
import {
  inkOccupancy,
  layoutText,
  type CaretRect,
  type LayoutStyle,
  type TextLayout,
} from './layout';
import { MAX_PARTICLES, ParticleTextField } from './ParticleTextField';
import { MotionProgramme, REST, type Modulation } from './MotionProgramme';
import {
  INK_COLS,
  INK_ROWS,
  OrganicPointerMotion,
} from './OrganicPointerMotion';
import { ParticleTextRenderer, type RectMark } from './ParticleTextRenderer';
import type { GraphTopologyKind } from '../particles/graphTopology';
import type {
  ParticleTextSettings,
  ParticleTextSettingsStore,
} from './settings';

/**
 * Ties the type, the particles and the canvas together. No React, no three.js.
 *
 * The heading stays in the document and keeps its box; this draws over it. That
 * ordering matters more than it looks: the reserved height is the one the real
 * `<h1>` claims, so the page cannot reflow when somebody types a longer string,
 * and if the canvas never starts — no WebGL 2, reduced motion, a thrown shader —
 * the heading is simply still there, set in the same face at the same size.
 */

/** How long the solved point size takes to follow a change in text length. */
const SIZE_EASE = 0.28;
/** How long a refit — a new scale, a new line count — takes to arrive. */
const PLACEMENT_EASE = 0.22;
/**
 * Random points overlap, so laying down ink over a fraction `a` of the area
 * covers only `1 - exp(-a)` of it: aiming a Poisson process straight at the
 * wanted coverage always lands short, which is what made the first pass read as
 * a sparse stipple rather than as ink.
 */
const overlapCorrected = (coverage: number) =>
  -Math.log(1 - Math.min(0.97, Math.max(0, coverage)));
/**
 * The sprite fades out over its last tenth of radius rather than ending on a
 * hard edge, so it covers rather less than a disc of the same diameter.
 */
const EDGE_EFFICIENCY = 0.88;
/** Pointer velocity smoothing, seconds. Raw pointer deltas are noise. */
const POINTER_EASE = 0.05;
/** A frame longer than this is a tab coming back, not a slow frame. */
const MAX_DELTA = 1 / 20;

interface Metrics {
  font: string;
  fontSize: number;
  lineHeight: number;
  tracking: number;
  transform: string;
  boxWidth: number;
  boxHeight: number;
}

export class ParticleTextEngine {
  private readonly field = new ParticleTextField(MAX_PARTICLES);
  readonly interactions = new HomeWorld(this.field);
  private readonly actorDom = new MastheadDomBridge(this.interactions);
  private actors: MastheadActorsRenderer | null = null;
  private watcherLane: HTMLElement | null = null;
  private headingPageTop = 0;
  private headingPageLeft = 0;
  private onDrone: ((ready: boolean) => void) | null = null;
  private onWriting: ((active: boolean) => void) | null = null;
  private onSeekers: ((available: boolean, ready: boolean) => void) | null =
    null;
  private published = '';

  public get drone() {
    return this.interactions.droneReady ? this.interactions.drone : null;
  }
  public get isWriting() {
    return this.interactions.performing;
  }
  public setDroneHost(host: HTMLElement | null) {
    this.actorDom.droneHost = host;
  }
  public setWatcherLane(host: HTMLElement | null) {
    this.watcherLane = host;
    this.interactions.watcher.enabled = !!host;
  }
  public setTargetHost(host: HTMLElement | null) {
    this.actorDom.setTargetHost(host);
  }
  public setDroneListener(listener: (ready: boolean) => void) {
    this.onDrone = listener;
  }
  public setWritingListener(listener: (active: boolean) => void) {
    this.onWriting = listener;
  }
  public setSeekersListener(
    listener: (available: boolean, ready: boolean) => void
  ) {
    this.onSeekers = listener;
  }
  public setTargetImpactListener(
    listener: (impact: import('./MastheadTarget').TargetImpact) => void
  ) {
    this.interactions.onImpact = listener;
  }
  public grabDrone(x?: number, y?: number) {
    this.pointerLeave();
    this.interactions.grabDrone(x, y);
  }
  public skipWriting() {
    this.interactions.skip();
  }
  public launchAtTarget() {
    return this.interactions.launchAtTarget();
  }
  public receiveFieldEcho() {
    this.interactions.echo();
  }
  public sendSeekers(x?: number, y?: number) {
    this.measure();
    this.quiet = 0;
    return this.interactions.sendSeekers(x, y);
  }

  private publishActors() {
    const world = this.interactions;
    const state = `${world.droneReady}/${world.performing}/${world.seekerAvailable}/${world.seekerReady}`;
    if (state === this.published) return;
    this.published = state;
    this.onDrone?.(world.droneReady);
    this.onWriting?.(world.performing);
    this.onSeekers?.(world.seekerAvailable, world.seekerReady);
  }

  public startWriting(actors: MastheadActorsRenderer): boolean {
    if (!this.layout || !this.metrics) {
      actors.dispose();
      return false;
    }
    this.interrupt();
    this.actors = actors;
    this.scale = this.layout.scale;
    this.offsetY = this.layout.offsetY;
    this.pointSize = this.pointSizeTarget;
    this.field.setPlacement(this.scale, this.offsetY);
    this.sizeActors();
    if (!this.interactions.start(this.layout)) {
      actors.dispose();
      this.actors = null;
      return false;
    }
    return true;
  }

  public setLanding(point: { x: number; y: number } | null) {
    const old = this.interactions.landing.point;
    if (old?.x === point?.x && old?.y === point?.y) return;
    this.interactions.setLanding(point);
    this.sizeActors(false);
  }

  private sizeActors(refit = true): void {
    if (!this.metrics) return;
    const bounds = this.heading.getBoundingClientRect();
    this.headingPageTop = bounds.top + window.scrollY;
    this.headingPageLeft = bounds.left + window.scrollX;
    if (refit)
      this.interactions.resize(
        this.metrics.boxWidth,
        this.metrics.boxHeight,
        this.scale,
        this.offsetY
      );
    if (this.watcherLane) {
      const lane = this.watcherLane.getBoundingClientRect();
      this.interactions.watcher.resize(
        bounds.width,
        lane.bottom - bounds.top - 24,
        lane.height
      );
    }
    this.actors?.setSize(
      document.documentElement.clientWidth,
      this.interactions.extent + 220,
      bounds.left,
      100,
      this.scale,
      bounds.top + window.scrollY - 100
    );
  }
  private readonly programme = new MotionProgramme();
  private readonly organicPointer = new OrganicPointerMotion();
  private readonly organicModulation: Modulation = { ...REST };
  private readonly renderer: ParticleTextRenderer;
  private readonly unsubscribe: () => void;

  private settings: Readonly<ParticleTextSettings>;
  private metrics: Metrics | null = null;
  private layout: TextLayout | null = null;
  /** What the reader has chosen — their typing, or the heading's own name. */
  private text = '';
  /** What the act has put up in its place, if anything. */
  private performed: string | null = null;

  /**
   * The vessel, in layout coordinates relative to the heading's top-left.
   *
   * Left and right are the content column exactly — the same margin the
   * paragraph below the masthead is set to — so ink pooling at a wall can be
   * measured against the page rather than against a number chosen for the
   * canvas. Top and bottom are the reserved box grown by `vesselHeadroom`.
   */
  private vessel = { left: 0, top: 0, right: 0, bottom: 0 };
  /** Where layout (0, 0) sits inside the canvas, css px. Drawing only. */
  private originX = 24;
  private originY = 24;
  /**
   * Reused across frames. At most `maxLines` of them, and rebuilding the array
   * every frame would be the only allocation in the render path.
   */
  private readonly rules: RectMark[] = [];
  /**
   * The perimeter's rects, one per field segment. Position is geometry — it
   * only changes when the vessel resizes, so it is rebuilt in `applyBounds`
   * rather than every frame; `heat` is copied from the field each frame,
   * which is the only part of a wall mark that is actually live.
   */
  private readonly perimeter: RectMark[] = [];
  private static readonly EMPTY_MARKS: readonly RectMark[] = [];
  /** Reused across frames rather than allocated fresh on every blink. */
  private readonly caret: CaretRect = { x: 0, y: 0, width: 0, height: 0 };
  private pointSize = 0;
  private pointSizeTarget = 2;
  private scale = 0;
  private offsetY = 0;
  private caretPhase = 0;
  private focused = false;
  /** Seconds since the reader last did anything. Drives the idle performance. */
  private quiet = 0;
  private performances = 0;
  private prompt: string | null = null;
  private onPrompt: ((prompt: string | null) => void) | null = null;
  private organicDepth = 0;
  private organicYaw = 0;
  private organicPitch = 0;
  private graphMode = false;

  private pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    previousX: 0,
    previousY: 0,
    active: false,
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly heading: HTMLElement;

  constructor(
    canvas: HTMLCanvasElement,
    heading: HTMLElement,
    store: ParticleTextSettingsStore
  ) {
    this.interactions.onChange = () => this.publishActors();
    this.canvas = canvas;
    this.heading = heading;
    this.renderer = new ParticleTextRenderer(canvas, MAX_PARTICLES);
    this.renderer.setJitter(this.field.jitter);
    this.renderer.setColors(
      tokenToRgb(heading, '--ink', [0, 0, 0]),
      tokenToRgb(heading, '--brand', [1, 0.21, 0])
    );

    this.settings = store.values;
    this.unsubscribe = store.subscribe((values) => {
      this.settings = values;
      // Headroom and point size both move the vessel, and neither of them
      // changes the heading's box, so `measure` would decline to do anything.
      this.applyBounds();
      this.field.setCount(values.particles);
      if (this.field.graphEdges.length > 0)
        this.renderer.setGraph(this.field.graphEdges, this.field.graphNodes);
      this.rebuild();
    });
  }

  /** True once the heading has a box worth drawing into. */
  public measure(): boolean {
    const cs = getComputedStyle(this.heading);
    const rect = this.heading.getBoundingClientRect();
    const fontSize = parseFloat(cs.fontSize);

    if (!(rect.width > 1 && rect.height > 1 && fontSize > 0)) return false;

    const lineHeight =
      cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / fontSize;
    const tracking =
      (cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing)) /
      fontSize;

    const next: Metrics = {
      font: rasterFont(cs.fontWeight, cs.fontFamily),
      fontSize,
      lineHeight: Number.isFinite(lineHeight) ? lineHeight : 1.2,
      tracking: Number.isFinite(tracking) ? tracking : 0,
      transform: cs.textTransform,
      boxWidth: rect.width,
      boxHeight: rect.height,
    };

    const unchanged =
      this.metrics &&
      (Object.keys(next) as (keyof Metrics)[]).every(
        (key) => this.metrics![key] === next[key]
      );
    if (unchanged) {
      this.sizeActors(false);
      return true;
    }

    this.metrics = next;
    this.applyBounds();
    this.organicPointer.resize(next.boxWidth, next.boxHeight);
    this.field.setCount(this.settings.particles);
    if (this.field.graphEdges.length > 0)
      this.renderer.setGraph(this.field.graphEdges, this.field.graphNodes);
    this.rebuild();
    // A different line wrap invalidates the score; complete the lettering
    // before adopting new targets, instead of spraying through the old layout.
    this.sizeActors();
    return true;
  }

  /**
   * Size the vessel, the canvas and the walls from the current metrics.
   *
   * Separate from `measure` because the two things that decide it come from
   * different places: the box comes from layout and the headroom from the
   * settings, so retuning the vessel in the dev panel has to be able to reach
   * this without the heading having changed size.
   *
   * The vessel is derived from the heading's *metrics*, never from the string
   * currently in it. That is the whole point of calling it a vessel: a fixed
   * frame with a varying instance inside it, so typing changes what is in the
   * box and never where its walls are.
   */
  private applyBounds(): void {
    const m = this.metrics;
    if (!m) return;

    const headroom = Math.max(0, this.settings.vesselHeadroom) * m.fontSize;
    this.vessel = {
      left: 0,
      top: -headroom,
      right: m.boxWidth,
      bottom: m.boxHeight + headroom,
    };

    // The canvas is drawn past the vessel by half a sprite, because a particle
    // resting against a wall is a disc centred on it and half of it is outside.
    // This is now the *only* job the margin has: the walls used to be wherever
    // it happened to put them, which is what made the ink pool at an edge
    // nobody could see or measure.
    const overdraw = Math.max(8, this.settings.maxPointSize);
    this.originX = overdraw;
    this.originY = headroom + overdraw;

    const cssWidth = m.boxWidth + this.originX * 2;
    const cssHeight = m.boxHeight + this.originY * 2;
    this.renderer.setSize(
      cssWidth,
      cssHeight,
      Math.min(window.devicePixelRatio || 1, 2)
    );
    // A canvas is a replaced element, so an absolute box with four insets still
    // resolves to its intrinsic pixel size unless the CSS size is stated. The
    // backing store is in device pixels; this is the same box in CSS pixels.
    this.canvas.style.left = `${-this.originX}px`;
    this.canvas.style.top = `${-this.originY}px`;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    const { left, top, right, bottom } = this.vessel;
    this.field.setBounds(left, top, right, bottom);
    this.rebuildPerimeterGeometry();
  }

  /**
   * Copy the field's segment rects into this engine's own `RectMark`s.
   *
   * The field owns the geometry (it is the thing hit-testing against it), but
   * a `RectMark` is a renderer type the field does not import — simulation
   * and drawing stay separate the same way `rules` keeps its own array
   * despite reading `layout.baselines` from elsewhere. Run only here, not per
   * frame: this is position, and position only changes on a resize.
   */
  private rebuildPerimeterGeometry(): void {
    const { perimeterX, perimeterY, perimeterW, perimeterH } = this.field;
    this.perimeter.length = perimeterX.length;
    for (let i = 0; i < perimeterX.length; i++) {
      const mark = (this.perimeter[i] ??= {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
      mark.x = perimeterX[i];
      mark.y = perimeterY[i];
      mark.width = perimeterW[i];
      mark.height = perimeterH[i];
    }
  }

  /** Heat is live; refreshed every frame the perimeter is actually drawn. */
  private perimeterMarks(enabled: boolean): readonly RectMark[] {
    if (!enabled) return ParticleTextEngine.EMPTY_MARKS;
    const heat = this.field.perimeterHeat;
    for (let i = 0; i < this.perimeter.length; i++) {
      this.perimeter[i].heat = heat[i];
    }
    return this.perimeter;
  }

  public setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.caretPhase = 0;
    this.interrupt();
    this.rebuild();
  }

  /** Press and hold: the springs let go until the pointer comes back up. */
  public grab(): void {
    this.quiet = 0;
    if (this.graphMode) return;
    this.programme.grab();
  }

  public releaseGrab(): void {
    if (this.graphMode) return;
    this.programme.releaseGrab();
    if (this.pointer.active)
      this.field.lingerAfterTouch(this.pointer.x, this.pointer.y);
  }

  public setGraphMode(active: boolean): GraphTopologyKind {
    if (active === this.graphMode) return this.field.graphTopology;
    this.graphMode = active;
    this.interactions.setEnabled(!active);
    this.interrupt();
    this.field.setGraphMode(active);
    if (active)
      this.renderer.setGraph(this.field.graphEdges, this.field.graphNodes);
    return this.field.graphTopology;
  }

  public cycleGraphTopology(): GraphTopologyKind {
    const topology = this.field.cycleGraphTopology();
    this.renderer.setGraph(this.field.graphEdges, this.field.graphNodes);
    return topology;
  }

  public setFocused(focused: boolean): void {
    this.focused = focused;
    this.caretPhase = 0;
    // Deliberately not an interruption. Focus moves for all sorts of reasons the
    // reader did not intend, and a press that grabs the ink also focuses the
    // field — treating that as "they are busy, stand down" cancels the grab.
    // Typing stands the act down; focus alone does not.
    this.quiet = 0;
  }

  /**
   * Anything the reader does resets the idle clock and stands the performance
   * down. It is meant to draw them in, so the moment it has worked it should
   * get out of the way.
   */
  public interrupt(): void {
    this.interactions.interrupt();
    this.actors?.hide();
    this.quiet = 0;
    this.organicPointer.suspend();
    this.programme.standDown();
  }

  /** Called when the movement changes the line shown under the masthead. */
  public setPromptListener(listener: (prompt: string | null) => void): void {
    this.onPrompt = listener;
  }

  /**
   * The reader selected the heading — Cmd+A, or a drag across it. The DOM
   * copy stays `visibility: hidden` so the browser never paints its own
   * `::selection` fill over letters that are meant to be ink, not text (see
   * ParticleText.tsx); this stands in for that fill with the one colour event
   * the page already has for "the reader touched this".
   */
  public selectionPulse(): void {
    this.field.flash(1);
  }

  /** Pointer position in CSS px, relative to the heading's own box. */
  public pointerMove(x: number, y: number): void {
    if (!this.pointer.active) {
      this.pointer.previousX = x;
      this.pointer.previousY = y;
    }
    // Attention, not an interruption. Moving the pointer is the thing the act is
    // inviting, so cancelling on it would stand the invitation down the instant
    // it was accepted — and it would end a grab on the first pixel of the drag.
    // It resets the idle clock and, through `attending`, holds the act open.
    this.quiet = 0;
    this.organicPointer.suspend(x, y);
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = true;
  }

  public pointerLeave(): void {
    this.pointer.active = false;
    this.pointer.vx = 0;
    this.pointer.vy = 0;
    this.field.clearPointer();
  }

  public frame(deltaMs: number, headingVisible = true): void {
    const dt = Math.min(MAX_DELTA, Math.max(1e-4, deltaMs / 1000));
    const s = this.settings;
    const layout = this.layout;

    let organicDepthTarget = 0;
    let viewYawTarget = 0;
    let viewPitchTarget = 0;

    if (this.pointer.active) {
      // Velocity from position over the frame, then eased: a pointer sample is
      // noisy and its raw delta depends on how many events the browser chose to
      // coalesce, neither of which should be visible in the ink.
      const instantX = (this.pointer.x - this.pointer.previousX) / dt;
      const instantY = (this.pointer.y - this.pointer.previousY) / dt;
      const response = 1 - 1 / (1 + dt / POINTER_EASE);
      this.pointer.vx += (instantX - this.pointer.vx) * response;
      this.pointer.vy += (instantY - this.pointer.vy) * response;
      this.pointer.previousX = this.pointer.x;
      this.pointer.previousY = this.pointer.y;
      this.field.setPointer(
        this.pointer.x,
        this.pointer.y,
        this.pointer.vx,
        this.pointer.vy
      );
      const width = Math.max(1, this.metrics?.boxWidth ?? 1);
      const height = Math.max(1, this.metrics?.boxHeight ?? 1);
      const nx = Math.max(-1, Math.min(1, (this.pointer.x / width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (this.pointer.y / height - 0.5) * 2));
      viewYawTarget = nx * s.pointerParallax;
      viewPitchTarget = -ny * s.pointerParallax * 0.55;
    } else {
      const organic = this.organicPointer.update(
        dt,
        s.organicMotion &&
          !this.programme.active &&
          !this.isWriting &&
          !this.interactions.projectiles.active,
        s.organicDelay,
        s.organicSpeed,
        s.organicStrength,
        s.organicDepth,
        s.organicAttention
      );
      if (organic.influence > 0.001) {
        // Mechanically this is a pointer, just as Pixel Flow's idle motion is.
        // `mark = 0` keeps the orange signal reserved for an actual reader.
        this.field.setPointer(
          organic.x,
          organic.y,
          organic.vx,
          organic.vy,
          organic.influence,
          0,
          s.organicRadius
        );
        organicDepthTarget = organic.depth;
        viewYawTarget = organic.yaw;
        viewPitchTarget = organic.pitch;
      } else {
        this.field.clearPointer();
      }
    }

    // The force yields to a real pointer immediately; the camera does not.
    // Letting the small z volume close over a few frames avoids a perspective
    // pop at the exact moment the reader enters the heading.
    const spatialBlend = 1 - 1 / (1 + dt / 0.4);
    this.organicDepth +=
      (organicDepthTarget - this.organicDepth) * spatialBlend;
    this.organicYaw += (viewYawTarget - this.organicYaw) * spatialBlend;
    this.organicPitch += (viewPitchTarget - this.organicPitch) * spatialBlend;

    // Point size follows the ink, eased. Deleting a word swings the target in
    // one step, and letting the size jump with it reads as the type changing
    // weight rather than as the same ink rearranging.
    this.pointSize +=
      (this.pointSizeTarget - this.pointSize) * (1 - 1 / (1 + dt / SIZE_EASE));

    // The refit, eased for the reason recorded on `TextLayout`.
    const placementEase = 1 - 1 / (1 + dt / PLACEMENT_EASE);
    this.scale += ((layout?.scale ?? this.scale) - this.scale) * placementEase;
    this.offsetY +=
      ((layout?.offsetY ?? this.offsetY) - this.offsetY) * placementEase;
    const em = this.scale || this.metrics?.fontSize || 16;
    this.field.setPlacement(this.scale, this.offsetY);

    // The performance. It starts itself after a stretch of quiet, waits longer
    // before each repeat, and gives up after a few — a masthead that keeps
    // demonstrating itself to somebody who is reading the page is a nag.
    this.quiet += dt;
    if (
      s.idleInterval > 0 &&
      !this.graphMode &&
      !this.isWriting &&
      !this.programme.active &&
      this.performances < s.idlePerformances &&
      this.quiet > s.idleInterval * (1 + this.performances)
    ) {
      this.programme.start();
      this.performances++;
    }

    this.programme.attending = this.quiet < 0.5;
    this.programme.advance(dt);
    if (this.programme.burst > 0) this.field.kick();
    if (this.programme.prompt !== this.prompt) {
      this.prompt = this.programme.prompt;
      this.onPrompt?.(this.prompt);
    }
    // The act can put its own word up in place of the reader's. Routed through
    // here rather than through `setText`, which would stand the act down and so
    // cancel the thing that had just set it.
    if (this.programme.text !== this.performed) {
      this.performed = this.programme.text;
      this.rebuild();
    }

    const base: Readonly<Modulation> = this.programme.value;
    const modulation = this.organicModulation;
    modulation.attraction = base.attraction;
    modulation.damping = base.damping;
    modulation.turbulence = base.turbulence;
    modulation.cohesion = base.cohesion;
    modulation.pointer = base.pointer;
    modulation.depthMix = base.depthMix;
    modulation.depthOffset = this.organicDepth;
    modulation.yaw = base.yaw + this.organicYaw;
    modulation.pitch = base.pitch + this.organicPitch;
    const watcherBottom =
      this.headingPageTop + this.interactions.watcher.floor - window.scrollY;
    this.interactions.watcher.inView =
      watcherBottom > -40 && watcherBottom < window.innerHeight + 180;
    this.interactions.advance(dt);
    const companion = this.interactions.drone;
    const companionY = this.headingPageTop + companion.y;
    this.interactions.encounterSpace?.updateDrone(
      this.headingPageLeft + companion.x,
      companionY,
      companion.visible &&
        this.interactions.enabled &&
        companionY > window.scrollY - companion.size &&
        companionY < window.scrollY + window.innerHeight + companion.size
    );
    // Offscreen writing and impacts still need ink physics; travel alone does not.
    if (
      headingVisible ||
      this.interactions.performing ||
      this.interactions.projectiles.active
    )
      this.field.step(dt, s, em, modulation);
    this.actors?.frameWorld(this.interactions, headingVisible);
    this.actorDom.update();

    if (!headingVisible) return;

    this.caretPhase += dt;
    const period = Math.max(0.05, s.caretBlink);
    const blink = this.caretPhase % (period * 2) < period;
    // The caret rides the same eased placement as the ink, so a refit does not
    // leave it standing where the last line used to end.
    const showCaret =
      s.caret && layout && this.performed === null && !this.isWriting;
    if (showCaret) {
      this.caret.x = layout.caret.x * this.scale;
      this.caret.y = layout.caret.y * this.scale + this.offsetY;
      this.caret.width = Math.max(2, layout.caret.width * this.scale);
      this.caret.height = layout.caret.height * this.scale;
    }
    const caret = showCaret ? this.caret : null;

    const graphBlend = this.field.graphBlend;
    this.renderer.render({
      data: this.field.data,
      count: this.field.count,
      originX: this.originX,
      originY: this.originY,
      pointSize: this.pointSize * (1 - graphBlend * 0.38),
      sizeJitter: s.sizeJitter,
      alpha: s.alpha * (1 - graphBlend * 0.6),
      depthContrast: s.depthContrast,
      edgeAlpha: graphBlend * 0.38,
      nodeAlpha: graphBlend * 0.95,
      nodeSize: this.pointSize * 1.25,
      rules: this.ruleMarks(layout, s.rules),
      ruleAlpha: s.ruleAlpha,
      perimeter: this.perimeterMarks(s.perimeter),
      perimeterAlpha: s.perimeterAlpha,
      caret,
      // Dimmed until the field has focus, so the caret says "you may type here"
      // before it says "you are typing here".
      caretAlpha: blink ? (this.focused ? 1 : 0.5) : 0,
    });
  }

  public dispose(): void {
    this.interactions.encounterSpace?.updateDrone(0, 0, false);
    this.interactions.dispose();
    this.actorDom.dispose();
    this.actors?.dispose();
    this.actors = null;
    this.unsubscribe();
    this.renderer.dispose();
  }

  /**
   * The baselines, ruled across the vessel.
   *
   * They ride `scale` and `offsetY` exactly as the ink and the caret do, so a
   * refit slides the sheet with the type instead of leaving the rules standing
   * where the last line used to sit. Full vessel width whatever the text has
   * been scaled to: the rule belongs to the container, only its height belongs
   * to the type.
   */
  private ruleMarks(
    layout: TextLayout | null,
    enabled: boolean
  ): readonly RectMark[] {
    const rules = this.rules;
    if (!enabled || !layout) {
      rules.length = 0;
      return rules;
    }

    const { left, right } = this.vessel;
    const width = right - left;
    const baselines = layout.baselines;
    rules.length = baselines.length;

    for (let i = 0; i < baselines.length; i++) {
      const y = baselines[i] * this.scale + this.offsetY;
      // Reused rather than replaced: this runs every frame.
      const mark = (rules[i] ??= { x: 0, y: 0, width: 0, height: 0 });
      mark.x = left;
      mark.y = y;
      mark.width = width;
      // The renderer snaps this to whole device pixels, so the value here only
      // has to mean "one hairline".
      mark.height = 1;
    }
    return rules;
  }

  private rebuild(): void {
    this.interactions.interrupt();
    const m = this.metrics;
    if (!m) return;

    const style: LayoutStyle = {
      font: m.font,
      metrics: fontMetrics(m.font),
      fontSize: m.fontSize,
      lineHeight: m.lineHeight,
      tracking: m.tracking,
      boxWidth: m.boxWidth,
      boxHeight: m.boxHeight,
      maxLines: this.settings.maxLines,
    };

    const layout = layoutText(
      this.transform(this.performed ?? this.text),
      style
    );
    this.layout = layout;

    // First layout of all: adopt the placement outright rather than easing up to
    // it from nothing, or the masthead would swell into place on load.
    if (this.scale === 0) {
      this.scale = layout.scale;
      this.offsetY = layout.offsetY;
      this.field.setPlacement(this.scale, this.offsetY);
    }

    this.field.setLayout(layout);

    // The organic pointer steers on this. Rebuilt with the layout because that
    // is exactly when where-the-ink-is changes, and never touched on a frame.
    this.organicPointer.setInk({
      weight: inkOccupancy(layout, m.boxWidth, m.boxHeight, INK_COLS, INK_ROWS),
      cols: INK_COLS,
      rows: INK_ROWS,
    });

    // Solve the diameter that covers the wanted fraction of the letterform with
    // the particles there are: n discs of radius r laid down at random cover
    // 1 - exp(-n pi r^2 / A) of an area A. Solving for radius stops a single letter
    // congealing and a long line thinning out to dust.
    const inkArea = layout.inkArea * layout.scale * layout.scale;
    if (inkArea > 0) {
      const radius = Math.sqrt(
        (overlapCorrected(this.settings.coverage) * inkArea) /
          (this.field.count * Math.PI)
      );
      this.pointSizeTarget = Math.min(
        this.settings.maxPointSize,
        Math.max(this.settings.minPointSize, (radius * 2) / EDGE_EFFICIENCY)
      );
      if (this.pointSize <= 0) this.pointSize = this.pointSizeTarget;
    }
  }

  private transform(text: string): string {
    const clipped = Array.from(text).slice(0, this.settings.maxLength).join('');
    switch (this.metrics?.transform) {
      case 'uppercase':
        return clipped.toUpperCase();
      case 'lowercase':
        return clipped.toLowerCase();
      default:
        return clipped;
    }
  }
}
