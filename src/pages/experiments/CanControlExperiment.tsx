import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  WALL,
  MAX_POINTS,
  MAX_STROKES,
  presetPath,
  footprint,
  type Path,
  type Settings,
} from '@/features/can-control/model';
import {
  CanControlExperience,
  type CanStatus,
} from '@/vanilla-three/experiences/can-control/CanControlExperience';
import {
  ART_SETTINGS,
  artworkPath,
  isArtwork,
  type Selection,
} from '@/features/can-control/compositions';
import {
  DEFAULT_STROKE_STYLE,
  type StrokeStyle,
} from '@/features/can-control/stroke-style';
import type { PlaybackRate } from '@/features/can-control/performer';
import { type YardView } from '@/vanilla-three/experiences/can-control/YardCamera';
import './CanControlExperiment.css';

type Recipe = {
  selection: Selection;
  settings: Settings;
  style: StrokeStyle;
  path?: Path;
};

const PATH_CHOICES: { value: Selection; label: string }[] = [
  { value: 'hush', label: 'HUSH handstyle' },
  { value: 'ribbon', label: 'Ribbon knot' },
  { value: 'contours', label: 'Contour field' },
  { value: 'specimen', label: 'Full specimen' },
  { value: 'line', label: 'Thin line' },
  { value: 'loop', label: 'Loop' },
  { value: 'hold', label: 'Stationary hold' },
  { value: 'flare', label: 'Flare' },
];
const PRESETS = PATH_CHOICES.map((option) => ({
  ...option,
  thumbnail: (isArtwork(option.value)
    ? artworkPath(option.value)
    : presetPath(option.value)
  ).map((stroke) => ({
    hold: stroke.length === 1,
    x: stroke[0].x * 100,
    y: (WALL.height - stroke[0].y) * 100,
    points: stroke
      .map((p) => `${p.x * 100},${(WALL.height - p.y) * 100}`)
      .join(' '),
  })),
}));

export default function CanControlExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<CanControlExperience | null>(null);
  const editorButton = useRef<HTMLButtonElement>(null);
  const editorSurface = useRef<SVGSVGElement>(null);
  const work = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);
  const [status, setStatus] = useState<CanStatus>({
    ready: false,
    paused: false,
    complete: false,
    phase: 'Preparing the wall.',
    recoverable: false,
  });
  const [settings, setSettings] = useState<Settings>({ ...ART_SETTINGS });
  const [style, setStyle] = useState<StrokeStyle>({ ...DEFAULT_STROKE_STYLE });
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [instant, setInstant] = useState(false);
  const [customPath, setCustomPath] = useState<Path>();
  const [savedPath, setSavedPath] = useState<Path>();
  const recipe = useRef<Recipe>({
    selection: 'hush',
    settings: { ...ART_SETTINGS },
    style: { ...DEFAULT_STROKE_STYLE },
  });
  const previousRecipe = useRef<Recipe | undefined>(undefined);
  const [overpaint, setOverpaint] = useState(false);
  const [preset, setPreset] = useState<Selection>('hush');
  const [editing, setEditing] = useState(false);
  const [paths, setPaths] = useState<Path>([]);
  const activeStroke = useRef<number | null>(null);
  const [message, setMessage] = useState('');
  const factory = useCallback((canvas: HTMLCanvasElement) => {
    const next = new CanControlExperience(canvas, setStatus);
    experience.current = next;
    return next;
  }, []);

  useEffect(() => {
    if (editing) {
      editorSurface.current?.focus({ preventScroll: true });
      work.current?.scrollIntoView({ block: 'start' });
    } else if (wasEditing.current) {
      editorButton.current?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);

  function paint(
    options: { path?: Path; selection?: Selection; result?: boolean } = {}
  ) {
    const path = options.selection ? undefined : (options.path ?? customPath);
    const selection = options.selection ?? preset;
    try {
      experience.current?.play(selection, settings, path, overpaint, style);
      if (options.result ?? instant) experience.current?.showResult();
      previousRecipe.current = recipe.current;
      recipe.current = {
        selection,
        settings: { ...settings },
        style: { ...style },
        path,
      };
      if (options.path) setSavedPath(options.path);
      setPreset(selection);
      setCustomPath(path);
      setEditing(false);
      activeStroke.current = null;
      setMessage(
        path ? 'Custom path ready to replay with these settings.' : ''
      );
      if (options.path) editorButton.current?.focus();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'This path could not be used.'
      );
    }
  }
  function beginEditing() {
    setPaths([]);
    setEditing(true);
    setMessage('');
    experience.current?.setEditing(true);
  }
  function cancelEditing() {
    activeStroke.current = null;
    setEditing(false);
    setPaths([]);
    setMessage('');
    experience.current?.setEditing(false);
    editorButton.current?.focus();
  }
  function pointerPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return experience.current?.wallPoint(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height
    );
  }
  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const point = pointerPoint(event);
    if (!point) return;
    if (paths.length >= MAX_STROKES || paths.flat().length >= MAX_POINTS) {
      setMessage('Path limit reached. Undo or clear a stroke to continue.');
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStroke.current = paths.length;
    setPaths((previous) => [...previous, [point]]);
  }
  function moveStroke(event: PointerEvent<SVGSVGElement>) {
    if (activeStroke.current === null || !event.isPrimary) return;
    const point = pointerPoint(event);
    if (!point) {
      activeStroke.current = null;
      return;
    }
    if (paths.reduce((sum, stroke) => sum + stroke.length, 0) >= MAX_POINTS) {
      activeStroke.current = null;
      setMessage('Path limit reached. Undo or clear a stroke to continue.');
      return;
    }
    const index = activeStroke.current;
    setPaths((previous) => {
      if (
        previous.reduce((sum, stroke) => sum + stroke.length, 0) >= MAX_POINTS
      )
        return previous;
      const stroke = previous[index];
      if (!stroke) return previous;
      const last = stroke[stroke.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < 0.006)
        return previous;
      return previous.map((s, i) => (i === index ? [...s, point] : s));
    });
  }
  function endStroke(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary) return;
    moveStroke(event);
    activeStroke.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const panelTop =
    editing && status.ready
      ? experience.current?.project({ x: 0, y: WALL.height })
      : undefined;
  const panelBottom =
    editing && status.ready
      ? experience.current?.project({ x: WALL.width, y: 0 })
      : undefined;

  return (
    <div className="can-control bg-bg text-fg">
      <div className="can-control-heading" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <div className="can-control-title">
          <h1 className="font-display">{study.title}</h1>
          <span className="font-meta text-fg-muted">
            {editionLabel(study.edition)} / The siding /{' '}
            {study.status.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="can-control-layout">
        <div className="can-control-work" ref={work}>
          {!editing && (
            <div
              className="can-control-transport can-control-controls"
              data-poster-hide
            >
              <fieldset disabled={!status.ready}>
                <legend className="sr-only">Playback</legend>
                <div className="can-control-transport-actions">
                  <button
                    type="button"
                    className="can-control-primary"
                    onClick={() => paint()}
                  >
                    Replay path
                  </button>
                  <button type="button" onClick={() => paint({ result: true })}>
                    Preview result
                  </button>
                  <button
                    type="button"
                    disabled={status.complete}
                    onClick={() => experience.current?.togglePause()}
                  >
                    {status.paused && !status.complete ? 'Resume' : 'Pause'}
                  </button>
                </div>
                <label
                  className="can-control-rate can-control-mobile-path"
                  htmlFor="can-quick-path"
                >
                  Path
                  <select
                    id="can-quick-path"
                    value={customPath ? 'custom' : preset}
                    onChange={(event) => {
                      if (event.target.value === 'custom' && savedPath)
                        paint({ path: savedPath });
                      else
                        paint({ selection: event.target.value as Selection });
                    }}
                  >
                    {PRESETS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {savedPath && <option value="custom">Your path</option>}
                  </select>
                </label>
                <label className="can-control-rate" htmlFor="can-playback">
                  Playback
                  <select
                    id="can-playback"
                    value={playbackRate}
                    onChange={(event) => {
                      const rate = Number(event.target.value) as PlaybackRate;
                      setPlaybackRate(rate);
                      experience.current?.setPlaybackRate(rate);
                    }}
                  >
                    {[1, 2, 4, 8].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}×
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </div>
          )}
          <div className="can-control-wall">
            <ThreeCanvas
              experienceFactory={factory}
              ariaLabel="A voxel drone paints a freight wagon in a stylised rail yard. Drag to orbit, scroll to zoom, or focus the scene and use arrow keys. Heavy wet paint runs down the wagon."
            />
            {editing && (
              <svg
                className="can-control-editor"
                ref={editorSurface}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') cancelEditing();
                }}
                viewBox="0 0 1000 750"
                preserveAspectRatio="none"
                aria-label="Path drawing surface. Draw with a pointer or touch. Built-in paths are available in the controls."
                role="img"
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={() => {
                  activeStroke.current = null;
                }}
                onLostPointerCapture={() => {
                  activeStroke.current = null;
                }}
              >
                {panelTop && panelBottom && (
                  <rect
                    aria-label="Paintable panel"
                    x={panelTop.x}
                    y={panelTop.y}
                    width={panelBottom.x - panelTop.x}
                    height={panelBottom.y - panelTop.y}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="5 5"
                    opacity="0.4"
                    pointerEvents="none"
                  />
                )}
                {paths.map((stroke, index) => {
                  const points = stroke.map((point) =>
                    experience.current!.project(point)
                  );
                  return points.length === 1 ? (
                    <circle
                      key={index}
                      cx={points[0].x}
                      cy={points[0].y}
                      r="3"
                      fill="currentColor"
                    />
                  ) : (
                    <polyline
                      key={index}
                      points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            )}
          </div>
          {!editing && (
            <div
              className="can-control-camera can-control-controls"
              data-poster-hide
            >
              <fieldset disabled={!status.ready}>
                <legend className="font-meta">View</legend>
                <div className="can-control-camera-buttons">
                  {(
                    [
                      ['yard', 'Yard'],
                      ['front', 'Front'],
                      ['detail', 'Close-up'],
                      ['follow', 'Follow drone'],
                    ] as [Exclude<YardView, 'manual'>, string][]
                  ).map(([view, label]) => (
                    <button
                      type="button"
                      key={view}
                      aria-pressed={status.view === view}
                      onClick={() => experience.current?.setView(view)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => experience.current?.zoom(0.85)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => experience.current?.zoom(1.18)}
                  >
                    −
                  </button>
                </div>
              </fieldset>
              <span className="text-fg-muted">
                Drag to orbit. Shift-drag to pan. Scroll to zoom.
              </span>
            </div>
          )}
          <div className="can-control-caption" data-poster-hide>
            <p role="status" aria-live="polite">
              {status.phase}
            </p>
            <span className="font-meta text-fg-muted">
              {editing
                ? `${paths.length} strokes`
                : `${WALL.width} × ${WALL.height} m panel`}
            </span>
          </div>
          {!editing && (
            <div className="can-control-controls" data-poster-hide>
              <fieldset disabled={!status.ready}>
                {' '}
                <div className="can-control-buttons can-control-playback">
                  <button
                    type="button"
                    disabled={status.complete}
                    onClick={() => experience.current?.showResult()}
                  >
                    Show result
                  </button>
                  <button
                    type="button"
                    ref={editorButton}
                    onClick={beginEditing}
                  >
                    Give it a path
                  </button>
                  <button
                    type="button"
                    disabled={!status.recoverable}
                    onClick={() => {
                      experience.current?.restore();
                      if (previousRecipe.current) {
                        const restored = previousRecipe.current;
                        previousRecipe.current = recipe.current;
                        recipe.current = restored;
                        setPreset(restored.selection);
                        setSettings(restored.settings);
                        setStyle(restored.style);
                        setCustomPath(restored.path);
                      }
                      setMessage(
                        'Previous paint, wetness and flight state restored.'
                      );
                    }}
                  >
                    Restore previous
                  </button>
                </div>
              </fieldset>
            </div>
          )}
          <p className="can-control-intro text-fg-muted" data-poster-hide>
            Tap a path to interrupt and start again. Tune the can, then replay.
            Playback changes how quickly you watch; travel speed changes the
            paint.
          </p>
        </div>
        <aside
          className="can-control-controls can-control-studio"
          aria-label="Can controls"
          data-poster-hide
        >
          {editing ? (
            <div className="can-control-editor-controls">
              <h2 className="font-display text-xl">Give it a path</h2>
              <p className="text-sm text-fg-muted">
                Draw on the wagon panel. Lift to break a stroke; tap for a hold.{' '}
                {overpaint
                  ? 'Sending adds paint to this wall.'
                  : 'Sending replaces the current piece.'}
              </p>
              <div className="can-control-buttons">
                <button
                  type="button"
                  disabled={!paths.length}
                  onClick={() => setPaths((previous) => previous.slice(0, -1))}
                >
                  Undo stroke
                </button>
                <button
                  type="button"
                  disabled={!paths.length}
                  onClick={() => setPaths([])}
                >
                  Clear path
                </button>
                <button
                  type="button"
                  className="can-control-primary"
                  disabled={!paths.length || !status.ready}
                  onClick={() => paint({ path: paths })}
                >
                  Send path
                </button>
                <button type="button" onClick={cancelEditing}>
                  Cancel
                </button>
              </div>
              <p className="text-sm text-fg-muted">
                Prefer a keyboard? Cancel and choose a built-in path.
              </p>
            </div>
          ) : (
            <>
              <fieldset disabled={!status.ready}>
                <legend className="font-meta">Quick paths</legend>
                <label className="can-control-instant">
                  <input
                    type="checkbox"
                    checked={instant}
                    onChange={(event) => setInstant(event.target.checked)}
                  />
                  Instant results on selection & replay
                </label>
                <div className="can-control-presets">
                  {savedPath && (
                    <button
                      type="button"
                      aria-pressed={!!customPath}
                      onClick={() => paint({ path: savedPath })}
                    >
                      Your path · {savedPath.length} strokes
                    </button>
                  )}
                  {PRESETS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      aria-pressed={!customPath && preset === option.value}
                      onClick={() => paint({ selection: option.value })}
                    >
                      <svg viewBox="0 0 320 240" aria-hidden="true">
                        {option.thumbnail.map((stroke, i) =>
                          stroke.hold ? (
                            <circle
                              key={i}
                              cx={stroke.x}
                              cy={stroke.y}
                              r="8"
                              fill="currentColor"
                            />
                          ) : (
                            <polyline
                              key={i}
                              points={stroke.points}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )
                        )}
                      </svg>
                      {option.label}
                    </button>
                  ))}
                </div>
                {customPath && (
                  <p className="can-control-hint">
                    Custom path selected · {customPath.length} strokes. Replay
                    keeps this path.
                  </p>
                )}
              </fieldset>
              <fieldset
                disabled={!status.ready}
                className="can-control-technique"
              >
                <legend className="font-meta">Can technique</legend>
                <div className="can-control-technique-presets">
                  <button
                    type="button"
                    onClick={() => {
                      setSettings({ distance: 0.14, speed: 1.2, cap: 'fine' });
                      setStyle({ ...DEFAULT_STROKE_STYLE, reach: 0 });
                    }}
                  >
                    Clean
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettings({ distance: 0.14, speed: 1.1, cap: 'fat' });
                      setStyle({ ...DEFAULT_STROKE_STYLE, reach: 0.38 });
                    }}
                  >
                    Flared
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettings({ distance: 0.16, speed: 0.4, cap: 'fat' });
                      setStyle({ ...DEFAULT_STROKE_STYLE, reach: 0 });
                    }}
                  >
                    Loaded
                  </button>
                </div>
                <label className="can-control-range" htmlFor="can-distance">
                  <span>
                    Distance{' '}
                    <output>{Math.round(settings.distance * 100)} cm</output>
                  </span>
                  <input
                    id="can-distance"
                    type="range"
                    min="0.12"
                    max="0.8"
                    step="0.01"
                    value={settings.distance}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        distance: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="can-control-range" htmlFor="can-speed">
                  <span>
                    Travel speed{' '}
                    <output>{settings.speed.toFixed(1)} m/s</output>
                  </span>
                  <input
                    id="can-speed"
                    type="range"
                    min="0.2"
                    max="1.4"
                    step="0.1"
                    value={settings.speed}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        speed: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="can-control-range" htmlFor="can-flare">
                  <span>
                    Flare reach{' '}
                    <output>
                      {style.reach === 0
                        ? 'Off'
                        : `+${Math.round(style.reach * 100)} cm`}
                    </output>
                  </span>
                  <input
                    id="can-flare"
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={style.reach}
                    onChange={(event) =>
                      setStyle({ ...style, reach: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="can-control-range" htmlFor="can-flare-span">
                  <span>
                    Flare length{' '}
                    <output>{Math.round(style.span * 100)}% of stroke</output>
                  </span>
                  <input
                    id="can-flare-span"
                    type="range"
                    min="0.1"
                    max="0.5"
                    step="0.01"
                    disabled={!style.reach}
                    value={style.span}
                    onChange={(event) =>
                      setStyle({ ...style, span: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="can-control-cap" htmlFor="can-placement">
                  <span>Flares</span>
                  <select
                    id="can-placement"
                    value={style.placement}
                    disabled={!style.reach}
                    onChange={(event) =>
                      setStyle({
                        ...style,
                        placement: event.target
                          .value as StrokeStyle['placement'],
                      })
                    }
                  >
                    <option value="scored">Scored accents</option>
                    <option value="exit">Every exit</option>
                    <option value="entry">Every entry</option>
                    <option value="both">Entry + exit</option>
                  </select>
                </label>
                <label className="can-control-cap" htmlFor="can-cap">
                  <span>Cap</span>
                  <select
                    id="can-cap"
                    value={settings.cap}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        cap: event.target.value as Settings['cap'],
                      })
                    }
                  >
                    <option value="fine">Fine round</option>
                    <option value="fat">Fat round</option>
                  </select>
                </label>
                <label className="can-control-cap" htmlFor="can-surface">
                  <span>Surface</span>
                  <select
                    id="can-surface"
                    value={overpaint ? 'overpaint' : 'fresh'}
                    onChange={(event) =>
                      setOverpaint(event.target.value === 'overpaint')
                    }
                  >
                    <option value="fresh">Fresh wall</option>
                    <option value="overpaint">Overpaint</option>
                  </select>
                </label>
                <p className="can-control-hint text-fg-muted">
                  Nominal spray diameter:{' '}
                  {(footprint(settings.distance, settings.cap) * 200).toFixed(
                    1
                  )}{' '}
                  cm. Flare peak:{' '}
                  {Math.round(
                    Math.min(0.8, settings.distance + style.reach) * 100
                  )}{' '}
                  cm (80 cm limit). Close and fast gives a tighter core. Flare
                  reach pulls the can away; length spreads that movement along
                  the stroke. The drone slows for tight turns. Replay applies
                  these settings; overpaint keeps existing marks.
                </p>
              </fieldset>
            </>
          )}
          {!editing && (
            <div className="can-control-apply">
              <button
                type="button"
                className="can-control-primary"
                disabled={!status.ready}
                onClick={() => {
                  paint();
                  work.current?.scrollIntoView({ block: 'start' });
                }}
              >
                Apply & replay
              </button>
              <button
                type="button"
                disabled={!status.ready}
                onClick={() => {
                  paint({ result: true });
                  work.current?.scrollIntoView({ block: 'start' });
                }}
              >
                Apply & preview
              </button>
            </div>
          )}
          {message && (
            <p role="status" className="can-control-message text-sm">
              {message}
            </p>
          )}
          <details className="can-control-notes">
            <summary>About the study</summary>
            <p>{study.notes?.mechanism}</p>
            <p>{study.notes?.decision}</p>
            <p>
              “Show result” completes the flight and dries the paint. Pause
              freezes both.
            </p>
            <p>
              Reduced motion starts with a still specimen. “Replay path”
              explicitly starts playback.
            </p>
          </details>
        </aside>
      </div>
    </div>
  );
}
