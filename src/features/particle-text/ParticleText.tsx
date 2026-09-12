import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DomEffectOverlay } from '../dom-effects/DomEffectOverlay';
import { HomeWatcherStill } from '../home/HomeWatcherStill';
import type { MastheadActorsRenderer } from '../../vanilla-three/dom-effects/MastheadActorsRenderer';
import { cn } from '@/lib/utils';
import { ParticleTextEngine } from './ParticleTextEngine';
import type { HomeLandingEncounter } from '../home/HomeLandingEncounter';
import {
  ParticleTextSettingsStore,
  type ParticleTextSettings,
} from './settings';
import { mastheadProgramme, TypingProgramme } from './TypingProgramme';
import { useParticleTextControls } from './useParticleTextControls';
import type { TargetImpact } from './MastheadTarget';
import './target.css';
import {
  GRAPH_TOPOLOGY_LABELS,
  type GraphTopologyKind,
} from '../particles/graphTopology';

/**
 * A heading, made of ink you can push around and type into.
 *
 * ## What is actually in the document
 *
 * The real heading, with the real text, at the real size. Everything else —
 * canvas, particles, caret — is drawn on top of it and can fail without taking
 * the masthead with it. No WebGL 2, `prefers-reduced-motion`, a thrown shader
 * compile: in every one of those cases nothing starts and the page is the page
 * it always was. The heading also keeps its box, so nothing typed into the
 * field can reflow the fold.
 *
 * ## Why there is a real input
 *
 * A native input provides IME, paste, mobile keyboard and screen-reader support.
 * The window listener only exists to hand the
 * first printable keystroke to it, so typing works without having to be told to
 * click first. Space is left alone until the field has focus, because at the
 * top of a page space still means scroll.
 */

import type { HomeEncounterSpace } from '../home/HomeEncounterSpace';

interface ParticleTextProps {
  /** The resting text — the heading's own content, and what Escape returns to. */
  text: string;
  /** What the opening sequence types in the gap where the name was. */
  hint?: string;
  as?: 'h1' | 'h2' | 'p';
  className?: string;
  /** Shown once the canvas is live; hidden entirely when it is not. */
  caption?: ReactNode;
  captionClassName?: string;
  /** Compose a full landing scene with supporting content and inline play options. */
  landingLayout?: boolean;
  children?: ReactNode;
  /** Run the erase-and-invite opening. Once per session. */
  demo?: boolean;
  settings?: Partial<ParticleTextSettings>;
  /** Dev-only Tweakpane title. Omit for no panel. */
  controls?: string;
  label?: string;
  /** Offer the shared particle field as a force-directed graph. */
  enableGraphMode?: boolean;
  /** The Can Control drone writes the opening using ordered letter strokes. */
  droneWriting?: boolean;
  landingEncounter?: HomeLandingEncounter;
  encounterSpace?: HomeEncounterSpace;
  onTargetImpact?: (impact: TargetImpact) => void;
  fieldEcho?: number;
}

const DEMO_SEEN = 'particle-text:demo';

/**
 * A device with no hover has no pointer field to reward the frame time, so it
 * gets a smaller budget: the opening still plays and the type still assembles,
 * which is the part that carries on a phone.
 */
function coarsePointerDefaults(): Partial<ParticleTextSettings> {
  if (typeof window === 'undefined') return {};
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ? {}
    : { particles: 11000, coverage: 0.88 };
}

export function ParticleText({
  text,
  hint = 'type anything',
  as: Tag = 'h1',
  className,
  caption,
  captionClassName,
  landingLayout = false,
  children,
  demo = true,
  settings,
  controls,
  label = 'Type to reshape the heading. Escape restores it.',
  enableGraphMode = false,
  droneWriting = false,
  landingEncounter,
  encounterSpace,
  onTargetImpact,
  fieldEcho = 0,
}: ParticleTextProps) {
  const impactRef = useRef(onTargetImpact);
  impactRef.current = onTargetImpact;
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const droneCanvasRef = useRef<HTMLCanvasElement>(null);
  const droneButtonRef = useRef<HTMLButtonElement>(null);
  const observeDroneRef = useRef<
    ((node: HTMLButtonElement | null) => void) | null
  >(null);
  const dronePointerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<ParticleTextEngine | null>(null);
  const bindDroneHost = useCallback((node: HTMLButtonElement | null) => {
    droneButtonRef.current = node;
    engineRef.current?.setDroneHost(node);
    observeDroneRef.current?.(node);
  }, []);
  const typingProgrammeRef = useRef<TypingProgramme | null>(null);
  const [active, setActive] = useState(false);
  const [preparing, setPreparing] = useState(droneWriting);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState(false);
  const [writing, setWriting] = useState(false);
  const [droneReady, setDroneReady] = useState(false);
  const [dronePlayed, setDronePlayed] = useState(false);
  const guideRef = useRef<HTMLDetailsElement>(null);
  const [seekers, setSeekers] = useState({ available: false, ready: false });
  const replayRef = useRef<(() => void) | null>(null);
  const [graphTopology, setGraphTopology] =
    useState<GraphTopologyKind>('small-world');
  const reducedMotion = useReducedMotion();
  const watcherLaneRef = useRef<HTMLDivElement>(null);
  const [actorsReady, setActorsReady] = useState(false);
  const [graphicsUnavailable, setGraphicsUnavailable] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseActionRef = useRef<((paused: boolean) => void) | null>(null);
  const seenEcho = useRef(0);
  useEffect(() => {
    if (active && fieldEcho !== seenEcho.current) {
      seenEcho.current = fieldEcho;
      engineRef.current?.receiveFieldEcho();
    }
  }, [active, fieldEcho]);

  const storeRef = useRef<ParticleTextSettingsStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new ParticleTextSettingsStore({
      ...coarsePointerDefaults(),
      ...settings,
    });
  }
  const store = storeRef.current;

  const showGraph = () => {
    const engine = engineRef.current;
    if (!engine) return;
    typingProgrammeRef.current?.cancel();
    typingProgrammeRef.current = null;
    engine.setText(text);
    setGraphTopology(engine.setGraphMode(true));
    setGraphMode(true);
    inputRef.current?.blur();
  };

  const showText = () => {
    engineRef.current?.setGraphMode(false);
    setGraphMode(false);
  };

  const cycleGraph = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setGraphTopology(engine.cycleGraphTopology());
  };

  useParticleTextControls(store, controls ?? null);

  useEffect(() => {
    const root = rootRef.current;
    const heading = headingRef.current;
    const canvas = canvasRef.current;
    const input = inputRef.current;
    if (
      !root ||
      !heading ||
      !canvas ||
      !input ||
      reducedMotion ||
      graphicsUnavailable
    )
      return;

    let engine: ParticleTextEngine | null = null;
    let programme: TypingProgramme | null = null;
    let frame = 0;
    let previous = 0;
    let disposed = false;
    let graphicsFailed = false;
    let onScreen = true;
    let needsMeasure = false;
    let writingRevision = 0;
    const frameInterval = 1000 / (navigator.hardwareConcurrency <= 4 ? 30 : 60);
    const measureLanding = () => {
      const target = landingEncounter?.target.current;
      if (!engine || !target) return;
      const box = target.getBoundingClientRect();
      const origin = heading.getBoundingClientRect();
      engine.setLanding({
        x: box.left + box.width / 2 - origin.left,
        y: box.bottom + 38 - origin.top,
      });
    };
    let actorsRenderer: MastheadActorsRenderer | null = null;
    let gesture: { id: number; x: number; y: number; moved: boolean } | null =
      null;

    const writeHeading = async () => {
      pausedRef.current = false;
      setMotionPaused(false);
      const revision = ++writingRevision;
      if (!engine || !droneCanvasRef.current) return;
      try {
        const { MastheadActorsRenderer } = await import(
          '../../vanilla-three/dom-effects/MastheadActorsRenderer'
        );
        if (
          disposed ||
          graphicsFailed ||
          revision !== writingRevision ||
          !engine ||
          !droneCanvasRef.current
        )
          return;
        engine.setGraphMode(false);
        setGraphMode(false);
        input.value = '';
        engine.setText(text);
        actorsRenderer ??= new MastheadActorsRenderer(
          droneCanvasRef.current,
          landingLayout
        );
        if (!engine.startWriting(actorsRenderer)) actorsRenderer = null;
        setActorsReady(!!actorsRenderer);
        engine.frame(0);
      } catch {
        // The live particle field remains usable if the companion cannot start.
        engine?.interrupt();
      }
      run();
    };

    const loop = (now: number) => {
      const delta = now - previous;
      if (delta < frameInterval - 0.5) {
        frame = requestAnimationFrame(loop);
        return;
      }
      previous = now;
      // Resizing the canvas empties it, so it has to happen on the same frame
      // that refills it — see the ResizeObserver below.
      if (needsMeasure) {
        needsMeasure = false;
        engine?.measure();
        measureLanding();
      }
      if (programme) {
        programme.advance(Math.min(delta, 100) / 1000);
        if (programme.done) programme = null;
      }
      engine?.frame(delta, visibleHosts.get(root) !== false);
      frame = requestAnimationFrame(loop);
    };

    const run = () => {
      if (frame || !engine || disposed || graphicsFailed) return;
      if (!onScreen || document.hidden || pausedRef.current) return;
      previous = performance.now();
      frame = requestAnimationFrame(loop);
    };

    const halt = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const contextLost = (event: Event) => {
      event.preventDefault();
      graphicsFailed = true;
      halt();
      setActive(false);
      setPreparing(false);
      setActorsReady(false);
      setGraphicsUnavailable(true);
    };
    const actorCanvas = droneCanvasRef.current;
    canvas.addEventListener('webglcontextlost', contextLost);
    actorCanvas?.addEventListener('webglcontextlost', contextLost);

    // ── Text ───────────────────────────────────────────────────────────────
    const commit = () => {
      if (!engine) return;
      engine.setText(input.value.length > 0 ? input.value : text);
    };

    const claim = () => {
      writingRevision++;
      engine?.interrupt();
      // The first keystroke ends the demonstration wherever it has got to. It
      // has already made its point by then, and finishing it over the top of
      // somebody's typing would be the site arguing with the reader.
      programme?.cancel();
      programme = null;
      typingProgrammeRef.current = null;
    };

    const restore = () => {
      input.value = '';
      claim();
      engine?.setText(text);
    };

    const onInput = () => {
      claim();
      engine?.setGraphMode(false);
      setGraphMode(false);
      commit();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      restore();
      input.blur();
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (!onScreen || !engine) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const focused = document.activeElement;
      if (focused === input) return;
      if (focused && focused !== document.body && focused !== root) return;
      // Space is the page's before it is ours.
      if (event.key === ' ' || Array.from(event.key).length !== 1) return;

      event.preventDefault();
      input.focus({ preventScroll: true });
      // Focusing mid-event does not redirect the keystroke that caused it, so
      // the character has to be placed by hand; everything after this one goes
      // through the input normally.
      input.value = input.value + event.key;
      onInput();
    };

    // Resolve tap versus drag on release. Touch keeps native scrolling; the
    // separate edit control opens its keyboard without accidentally launching.
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        gesture ||
        (event.target as Element).closest('[data-particle-mode]')
      )
        return;
      const rect = heading.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        return;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('pointermove', trackGesture);
      // A touch scroll remains native; a short tap launches without opening a keyboard.
      if (event.pointerType === 'touch') {
        if (!droneWriting) input.focus({ preventScroll: true });
        return;
      }
      input.focus({ preventScroll: true });
      event.preventDefault();
      engine?.grab();
    };

    const trackGesture = (event: PointerEvent) => {
      if (
        gesture?.id === event.pointerId &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 7
      )
        gesture.moved = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const click =
        event.type === 'pointerup' &&
        !gesture.moved &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 7;
      cancelGesture();
      if (click && droneWriting) {
        const rect = heading.getBoundingClientRect();
        engine?.sendSeekers(
          event.clientX - rect.left,
          event.clientY - rect.top
        );
      }
    };

    const cancelGesture = () => {
      engine?.interactions.releaseDrone(true);
      const pointer = dronePointerRef.current;
      dronePointerRef.current = null;
      if (
        pointer !== null &&
        droneButtonRef.current?.hasPointerCapture(pointer)
      )
        droneButtonRef.current.releasePointerCapture(pointer);
      gesture = null;
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('pointermove', trackGesture);
      engine?.releaseGrab();
    };

    // ── Selection ──────────────────────────────────────────────────────────
    //
    // Edge-triggered on purpose: `selectionchange` fires on every pixel of a
    // drag, and the pulse is a single ripple, not a state to hold open for as
    // long as the reader keeps the mouse down.
    let selected = false;
    const onSelectionChange = () => {
      const selection = document.getSelection();
      const isSelected =
        !!selection &&
        !selection.isCollapsed &&
        selection.containsNode(heading, true);
      if (isSelected && !selected) {
        engine?.selectionPulse();
        run();
      }
      selected = isSelected;
    };

    const onFocus = () => engine?.setFocused(true);
    const onBlur = () => {
      engine?.setFocused(false);
      if (input.value.length === 0 && !engine?.isWriting) restore();
    };

    // ── Pointer ────────────────────────────────────────────────────────────
    const onPointerMove = (event: PointerEvent) => {
      if (!engine || event.pointerType === 'touch') return;
      const bounds = heading.getBoundingClientRect();
      engine.pointerMove(
        event.clientX - bounds.left,
        event.clientY - bounds.top
      );
      run();
    };
    const onPointerLeave = () => engine?.pointerLeave();

    // ── Lifecycle ──────────────────────────────────────────────────────────
    //
    // The observer only raises a flag; the work happens at the top of the next
    // frame. Re-measuring in the callback is what made a drag-resize flicker:
    // assigning `canvas.width` clears the drawing buffer, a ResizeObserver
    // fires after layout but before paint, and the heading's own text is not
    // painted while the canvas is live — so the browser composited an empty
    // canvas over a hidden heading and the masthead disappeared for a frame,
    // once per observer tick for the whole drag. Clearing and redrawing inside
    // one frame leaves the canvas trailing the heading by a frame instead,
    // which during a smooth resize is not visible.
    //
    // It also fixes the other half: a resize while the masthead is scrolled
    // away or the tab is hidden used to clear the canvas with no loop running
    // to redraw it. The flag simply waits.
    const resizeObserver = new ResizeObserver(() => {
      needsMeasure = true;
      run();
    });
    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries)
        visibleHosts.set(entry.target, entry.isIntersecting);
      onScreen = [...visibleHosts.values()].some(Boolean);
      if (onScreen) run();
      else {
        cancelGesture();
        halt();
      }
    });
    const visibleHosts = new Map<Element, boolean>([[root, true]]);
    let observedDrone: HTMLButtonElement | null = null;
    observeDroneRef.current = (node) => {
      if (observedDrone) {
        intersectionObserver.unobserve(observedDrone);
        visibleHosts.delete(observedDrone);
      }
      observedDrone = node;
      if (node) intersectionObserver.observe(node);
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelGesture();
        halt();
      } else run();
    };
    pauseActionRef.current = (paused) => {
      pausedRef.current = paused;
      setMotionPaused(paused);
      if (paused) {
        cancelGesture();
        engine?.interactions.releaseDrone(true);
        halt();
      } else run();
    };

    const start = async () => {
      // Rasterising before the webfont has arrived would cache the fallback
      // face for the life of the page.
      await document.fonts.ready;
      if (disposed || graphicsFailed) return;

      try {
        engine = new ParticleTextEngine(canvas, heading, store);
      } catch {
        setPreparing(false);
        return; // The heading is the permanent fallback.
      }
      engineRef.current = engine;
      engine.setDroneHost(droneButtonRef.current);
      engine.interactions.encounterSpace = encounterSpace ?? null;
      engine.setWatcherLane(watcherLaneRef.current);
      engine.setTargetImpactListener((impact) => impactRef.current?.(impact));

      engine.setPromptListener(setPrompt);
      engine.setWritingListener(setWriting);
      engine.setDroneListener(setDroneReady);
      engine.setSeekersListener((available, ready) =>
        setSeekers({ available, ready })
      );
      if (!engine.measure()) {
        setPreparing(false);
        return;
      }
      engine.setText(text);
      // One frame before the heading is handed over, so the canvas is already
      // carrying the word at the instant the DOM copy stops being painted.
      engine.frame(16);

      if (droneWriting) {
        replayRef.current = () => {
          void writeHeading();
        };
        await writeHeading();
        if (disposed || graphicsFailed) return;
      }
      setActive(true);
      setPreparing(false);
      if (landingEncounter) {
        engine.interactions.landing.onArrive = landingEncounter.onArrive;
        landingEncounter.request.current = () => {
          measureLanding();
          const sent = engine?.interactions.landDrone() ?? false;
          run();
          return sent;
        };
        measureLanding();
        const target = landingEncounter.target.current;
        if (target) intersectionObserver.observe(target);
        resizeObserver.observe(document.body);
      }

      let shouldDemo = demo;
      try {
        shouldDemo = demo && sessionStorage.getItem(DEMO_SEEN) === null;
        if (shouldDemo) sessionStorage.setItem(DEMO_SEEN, '1');
      } catch {
        // Private mode, storage disabled: play it, rather than not.
      }
      if (shouldDemo && !droneWriting) {
        programme = new TypingProgramme(
          mastheadProgramme(text, hint),
          text,
          (next) => engine?.setText(next)
        );
        typingProgrammeRef.current = programme;
      }

      resizeObserver.observe(heading);
      intersectionObserver.observe(root);
      if (droneButtonRef.current)
        observeDroneRef.current?.(droneButtonRef.current);
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('selectionchange', onSelectionChange);
      window.addEventListener('keydown', onWindowKeyDown);
      window.addEventListener('blur', cancelGesture);
      root.addEventListener('pointermove', onPointerMove);
      root.addEventListener('pointerleave', onPointerLeave);
      root.addEventListener('pointerdown', onPointerDown);
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', onKeyDown);
      input.addEventListener('focus', onFocus);
      input.addEventListener('blur', onBlur);
      run();
    };

    void start();

    return () => {
      disposed = true;
      if (landingEncounter) landingEncounter.request.current = null;
      writingRevision++;
      cancelGesture();
      replayRef.current = null;
      pauseActionRef.current = null;
      observeDroneRef.current = null;
      halt();
      canvas.removeEventListener('webglcontextlost', contextLost);
      actorCanvas?.removeEventListener('webglcontextlost', contextLost);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('blur', cancelGesture);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', trackGesture);
      gesture = null;
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      engine?.releaseGrab();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      engine?.dispose();
      engine = null;
      engineRef.current = null;
      typingProgrammeRef.current = null;
      setActive(false);
      setActorsReady(false);
      setPrompt(null);
      setGraphMode(false);
      setDroneReady(false);
      setSeekers({ available: false, ready: false });
    };
  }, [
    demo,
    droneWriting,
    hint,
    landingEncounter,
    encounterSpace,
    landingLayout,
    reducedMotion,
    graphicsUnavailable,
    store,
    text,
  ]);

  const interactionHint = droneReady ? (
    <span>
      <span aria-hidden="true">↳ </span>Grab the drone. Take it through the ink.
    </span>
  ) : seekers.available ? (
    <span>
      <span aria-hidden="true">↳ </span>Give the target a nudge.
    </span>
  ) : writing ? (
    <span>
      <span aria-hidden="true">↳ </span>Drag the fresh ink
    </span>
  ) : prompt ? (
    <span key={prompt} className="animate-in fade-in duration-500">
      <span aria-hidden="true">↳ </span>
      {prompt}
    </span>
  ) : graphMode ? (
    <span>
      <span aria-hidden="true">↳ </span>
      Force-directed particle graph
    </span>
  ) : (
    caption
  );

  return (
    <div
      ref={rootRef}
      className={cn('relative isolate', landingLayout && 'masthead-landing')}
    >
      {/* The heading's own box, and nothing else: the canvas is positioned
          against this rather than against the root, so a caption underneath
          cannot stretch it. */}
      <DomEffectOverlay companionCanvasRef={droneCanvasRef}>
        <Tag
          ref={(element: HTMLElement | null) => {
            headingRef.current = element;
          }}
          // With the canvas live the heading is named rather than read, because
          // its own text is no longer painted. Same string either way.
          aria-label={active || preparing ? text : undefined}
          className={cn(
            className,
            active && 'pointer-events-none select-none',
            droneWriting && reducedMotion && 'masthead-static'
          )}
        >
          {/* Once the particles are carrying the name, the DOM copy has to stop
              being PAINTED, not merely be made transparent. An opacity-0
              heading is still text: Select All puts it in the range and the
              browser draws the ::selection fill over letters the page has just
              spent a second promising are made of ink you can push around.
              `visibility: hidden` keeps the box — the fold must not move, and
              the box is what the engine measures — while taking the string out
              of the paint and out of every selection. */}
          {/* Reserve the name's box while the writing intro loads, without
              flashing the finished letters before the drone draws them. */}
          <span
            className={
              active || (preparing && !reducedMotion) ? 'invisible' : undefined
            }
          >
            {text}
          </span>
        </Tag>

        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute',
            active ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* The field. Invisible, but a real control: mobile keyboards, IME,
            paste, undo and a name in the accessibility tree all come free. */}
        <input
          ref={inputRef}
          type="text"
          aria-label={label}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={store.values.maxLength}
          tabIndex={active ? 0 : -1}
          className="pointer-events-none absolute inset-0 size-full appearance-none border-0 bg-transparent p-0 text-[16px] text-transparent caret-transparent outline-none"
        />
        {droneWriting && active && (
          <button
            ref={bindDroneHost}
            type="button"
            hidden
            disabled={motionPaused}
            data-particle-mode
            className="masthead-drone"
            data-hint={landingLayout && droneReady && !dronePlayed}
            aria-label="Grab the drone. Enter picks up or releases; arrow keys move; Escape releases."
            aria-pressed="false"
            onClick={(event) => {
              if (event.detail !== 0) return;
              const engine = engineRef.current;
              if (engine?.drone?.held) engine.interactions.releaseDrone();
              else engine?.grabDrone();
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || dronePointerRef.current !== null)
                return;
              const drone = engineRef.current?.drone;
              const rect = headingRef.current?.getBoundingClientRect();
              if (!drone || !rect) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus({ preventScroll: true });
              dronePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              engineRef.current?.pointerLeave();
              engineRef.current?.grabDrone(
                event.clientX - rect.left,
                event.clientY - rect.top
              );
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              if (dronePointerRef.current !== event.pointerId) return;
              if (engineRef.current?.drone?.held) setDronePlayed(true);
              const rect = headingRef.current?.getBoundingClientRect();
              if (rect)
                engineRef.current?.interactions.moveDrone(
                  event.clientX - rect.left,
                  event.clientY - rect.top
                );
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              if (dronePointerRef.current !== event.pointerId) return;
              dronePointerRef.current = null;
              engineRef.current?.interactions.releaseDrone();
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
              if (dronePointerRef.current === null) return;
              dronePointerRef.current = null;
              engineRef.current?.interactions.releaseDrone(true);
            }}
            onPointerCancel={() => {
              dronePointerRef.current = null;
              engineRef.current?.interactions.releaseDrone(true);
            }}
            onBlur={() => engineRef.current?.interactions.releaseDrone(true)}
            onKeyDown={(event) => {
              const drone = engineRef.current?.drone;
              if (!drone) return;
              const steps: Record<string, [number, number]> = {
                ArrowLeft: [-24, 0],
                ArrowRight: [24, 0],
                ArrowUp: [0, -24],
                ArrowDown: [0, 24],
              };
              if (steps[event.key]) {
                event.preventDefault();
                if (!drone.held) engineRef.current?.grabDrone();
                engineRef.current?.interactions.nudgeDrone(...steps[event.key]);
                if (drone.held) setDronePlayed(true);
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!event.repeat) {
                  if (drone.held)
                    engineRef.current?.interactions.releaseDrone();
                  else engineRef.current?.grabDrone();
                }
              } else if (event.key === 'Escape') {
                event.preventDefault();
                engineRef.current?.interactions.releaseDrone(true);
              }
            }}
          >
            <span className="masthead-drone-label" aria-hidden="true">
              {landingLayout ? 'Drag to play' : 'Grab me'}
            </span>
          </button>
        )}
        {droneWriting && active && seekers.available && (
          <button
            ref={(element) => engineRef.current?.setTargetHost(element)}
            type="button"
            className="masthead-target"
            aria-label="Launch at the target"
            disabled={!seekers.ready || motionPaused}
            onClick={() => engineRef.current?.launchAtTarget()}
          >
            <svg
              viewBox="0 0 88 88"
              aria-hidden="true"
              className="masthead-puck"
            >
              <ellipse cx="44" cy="68" rx="27" ry="5" className="puck-shadow" />
              <g className="puck-body">
                <circle cx="44" cy="49" r="29" className="puck-edge" />
                <circle cx="44" cy="43" r="29" className="puck-face" />
                <circle cx="44" cy="43" r="21" className="puck-ring" />
                <circle cx="44" cy="43" r="12" className="puck-core" />
                <circle cx="44" cy="43" r="4" className="puck-dot" />
                <path
                  d="M44 9v9M44 68v9M9 43h9M70 43h9"
                  className="puck-ticks"
                />
              </g>
              <circle cx="44" cy="43" r="36" className="puck-wave" />
            </svg>
          </button>
        )}
      </DomEffectOverlay>

      {landingLayout && (
        <div
          ref={watcherLaneRef}
          className="home-watcher-lane"
          aria-hidden="true"
        >
          {(!actorsReady || reducedMotion) && <HomeWatcherStill />}
        </div>
      )}

      {children}

      {/* Inline options expand after the identity content, without covering it. */}
      {caption && (active || preparing) && !reducedMotion && (
        <div
          aria-hidden={!active || undefined}
          inert={!active}
          className={cn(
            landingLayout
              ? 'masthead-play font-meta'
              : 'animate-in fade-in mt-4 duration-1000 ease-(--ease-out)',
            captionClassName,
            !active && 'invisible'
          )}
        >
          {!landingLayout && interactionHint}
          {(droneWriting || (enableGraphMode && !prompt && !writing)) && (
            <div
              data-particle-mode
              className={
                landingLayout
                  ? 'masthead-play-toolbar'
                  : 'mt-1 flex flex-wrap items-center gap-x-5'
              }
            >
              {droneWriting && (!landingLayout || writing) && (
                <button
                  type="button"
                  onClick={() =>
                    writing
                      ? engineRef.current?.skipWriting()
                      : replayRef.current?.()
                  }
                  className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current sm:min-h-8"
                >
                  {writing ? 'Skip intro' : 'Watch it write'}
                </button>
              )}
              <details
                ref={guideRef}
                className={
                  landingLayout ? 'masthead-play-disclosure' : 'relative'
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || !event.currentTarget.open)
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }}
              >
                <summary
                  aria-label={
                    landingLayout ? 'Play options' : 'More ways to play'
                  }
                  className="flex min-h-11 cursor-pointer items-center underline decoration-current/40 underline-offset-4 sm:min-h-8"
                >
                  <span className="particle-more-label" aria-hidden="true">
                    {landingLayout ? 'Play options' : 'More ways to play'}
                  </span>
                </summary>
                <div
                  className={landingLayout ? 'masthead-play-sheet' : undefined}
                >
                  {landingLayout && (
                    <div className="masthead-play-help">
                      <p>{interactionHint}</p>
                      <p>
                        Drag the ink or type to reshape it. Escape restores the
                        name. The little camera follows the drone.
                      </p>
                      {droneReady && (
                        <p>
                          With the drone focused, press Enter to pick it up,
                          then use the arrow keys. Enter releases it.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5">
                    {landingLayout && (
                      <button
                        type="button"
                        onClick={() => pauseActionRef.current?.(!motionPaused)}
                        className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current"
                      >
                        {motionPaused ? 'Resume motion' : 'Pause motion'}
                      </button>
                    )}
                    {landingLayout && droneWriting && !writing && (
                      <button
                        type="button"
                        onClick={() => {
                          if (guideRef.current) {
                            guideRef.current.open = false;
                            guideRef.current
                              .querySelector('summary')
                              ?.focus({ preventScroll: true });
                          }
                          replayRef.current?.();
                        }}
                        className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current"
                      >
                        Watch it write
                      </button>
                    )}
                    {droneWriting && seekers.available && (
                      <>
                        <button
                          type="button"
                          disabled={!seekers.ready}
                          onClick={() => engineRef.current?.sendSeekers()}
                          className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current disabled:cursor-wait disabled:opacity-40 sm:min-h-8"
                        >
                          Send seekers
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (landingLayout && guideRef.current)
                              guideRef.current.open = false;
                            inputRef.current?.focus({ preventScroll: true });
                          }}
                          className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current sm:min-h-8"
                        >
                          Edit text
                        </button>
                      </>
                    )}
                    {enableGraphMode && !prompt && !writing && (
                      <>
                        <button
                          type="button"
                          aria-pressed={graphMode}
                          onClick={graphMode ? showText : showGraph}
                          className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current sm:min-h-8"
                        >
                          {graphMode ? 'Text mode' : 'Graph mode'}
                        </button>
                        {graphMode && (
                          <button
                            type="button"
                            onClick={cycleGraph}
                            aria-label={`Graph structure: ${GRAPH_TOPOLOGY_LABELS[graphTopology]}. Show next structure.`}
                            className="min-h-11 underline decoration-current/40 underline-offset-4 hover:decoration-current sm:min-h-8"
                          >
                            {GRAPH_TOPOLOGY_LABELS[graphTopology]} →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </details>
              {landingLayout && (
                <span className="masthead-scroll-cue" aria-hidden="true">
                  Scroll ↓
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
