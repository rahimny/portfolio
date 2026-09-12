import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  Pause,
  Play,
  SkipForward,
  Undo2,
  Eraser,
  Orbit,
  MousePointer2,
  Wind,
  Save,
  FolderOpen,
  Camera,
  Expand,
  Volume2,
  VolumeX,
  ChevronDown,
  Plus,
  Check,
} from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { getStudy, editionLabel } from '@/features/lab/registry';
import {
  M,
  MATERIALS,
  SCENES,
  DISCOVERIES,
  type Tool,
  type SceneName,
} from '@/features/aftermatter/model';
import {
  AftermatterExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/aftermatter/AftermatterExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './AftermatterExperiment.css';

const PROMPTS: Record<SceneName, string> = {
  Terrarium: 'A little fire on the purple powder. What could happen?',
  'Chain reaction': 'One spark. Three floors. Start at the lower left.',
  Volcanic: 'Pour water into the crater. Make a new piece of land.',
  Empty: 'Make a world from nothing. Sand is a good beginning.',
};
export default function AftermatterExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  useDocumentMeta(study.title, study.summary);
  const breadcrumbs = useBreadcrumbFromRoute();
  const experience = useRef<AftermatterExperience | null>(null),
    vessel = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(INITIAL_STATUS),
    [tool, setTool] = useState<Tool>(M.Sand),
    [radius, setRadius] = useState(4),
    [scene, setScene] = useState<SceneName>('Terrarium'),
    [orbit, setOrbit] = useState(false),
    [sound, setSound] = useState(false),
    [message, setMessage] = useState(''),
    [journal, setJournal] = useState(false);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const e = new AftermatterExperience(canvas, setStatus, options);
      experience.current = e;
      return e;
    },
    []
  );
  const [discovery, setDiscovery] = useState('');
  const latestDiscovery = status.discoveries[status.discoveries.length - 1];
  useEffect(() => {
    setDiscovery(latestDiscovery ?? '');
    if (!latestDiscovery) return;
    const timer = window.setTimeout(() => setDiscovery(''), 3600);
    return () => window.clearTimeout(timer);
  }, [latestDiscovery]);
  const selected = MATERIALS.find((m) => m.id === tool);
  const choose = (next: Tool) => {
    setTool(next);
    experience.current?.setTool(next);
    setOrbit(false);
    experience.current?.setOrbit(false);
  };
  const action = (fn: () => void, success: string) => {
    try {
      fn();
      setMessage(success);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'That action is unavailable.'
      );
    }
  };
  return (
    <div className="aftermatter-page">
      <header className="aftermatter-breadcrumb" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <div className="aftermatter-console" ref={vessel}>
        <header className="aftermatter-header" data-poster-hide>
          <div className="aftermatter-wordmark">
            <span className="aftermatter-emblem" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <h1>{study.title}</h1>
          </div>
          <p>
            A small world.
            <br />
            <span>Beautiful consequences.</span>
          </p>
          <button
            className="aftermatter-journal-toggle"
            aria-expanded={journal}
            onClick={() => setJournal(!journal)}
          >
            <span className="aftermatter-led" /> Discoveries{' '}
            <strong>
              {status.discoveries.length}
              <span> / 6</span>
            </strong>
            <ChevronDown size={14} />
          </button>
        </header>
        <div className="aftermatter-scene-bar" data-poster-hide>
          <label>
            WORLD{' '}
            <select
              aria-label="World"
              value={scene}
              disabled={!status.ready}
              onChange={(e) => {
                const next = e.target.value as SceneName;
                setScene(next);
                experience.current?.loadScene(next);
                setMessage(
                  'World loaded. Undo brings the previous chamber back.'
                );
              }}
            >
              {SCENES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <span className="aftermatter-scene-hint">{PROMPTS[scene]}</span>
          <span className="aftermatter-running">
            <i className={status.paused || status.reduced ? 'is-paused' : ''} />
            {status.reduced
              ? 'STILL MODE'
              : status.paused
                ? 'TIME HELD'
                : 'LIVE SIMULATION'}
          </span>
        </div>
        <div className="aftermatter-stage">
          <ThreeCanvas
            experienceFactory={factory}
            ariaLabel="Interactive material chamber. Arrow keys move the brush. Enter pours material. Space pauses time."
            tabIndex={0}
          />
          <div
            className="aftermatter-stage-label"
            aria-hidden="true"
            data-poster-hide
          >
            <span>MATTER / PLAYGROUND</span>
            <span>DRAW. DISTURB. DISCOVER.</span>
          </div>
          <div className="aftermatter-stage-tools" data-poster-hide>
            <button
              aria-label="Draw mode"
              aria-pressed={!orbit}
              onClick={() => {
                setOrbit(false);
                experience.current?.setOrbit(false);
              }}
              title="Draw mode"
            >
              <MousePointer2 size={18} />
            </button>
            <button
              aria-label="Orbit view"
              aria-pressed={orbit}
              onClick={() => {
                setOrbit(true);
                experience.current?.setOrbit(true);
              }}
              title="Orbit view"
            >
              <Orbit size={18} />
            </button>
            <button
              aria-label="Front view"
              onClick={() => experience.current?.front()}
              title="Reset camera"
            >
              ↙
            </button>
          </div>
          {discovery && (
            <div
              className="aftermatter-discovery"
              role="status"
              data-poster-hide
            >
              <Check size={14} />
              <span>
                <small>Reaction discovered</small>
                {discovery}
              </span>
            </div>
          )}
          {journal && (
            <aside className="aftermatter-journal" data-poster-hide>
              <h2>Follow your curiosity.</h2>
              <p>Six reactions to find. No right order.</p>
              {DISCOVERIES.map((d, i) => (
                <div
                  key={d}
                  className={status.discoveries.includes(d) ? 'is-found' : ''}
                >
                  <span>
                    {status.discoveries.includes(d) ? (
                      <Check size={14} />
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  <span>{d}</span>
                </div>
              ))}
            </aside>
          )}
          <div className="aftermatter-stage-bottom" data-poster-hide>
            <span>
              {orbit
                ? 'Drag to turn the chamber · scroll to zoom'
                : 'Hold to pour · drag to draw'}
            </span>
            <span>{status.cells.toLocaleString('en-GB')} particles</span>
          </div>
        </div>
        <div
          className="aftermatter-materials"
          aria-label="Material palette"
          data-poster-hide
        >
          {MATERIALS.map((m, i) => (
            <button
              key={m.id}
              disabled={!status.ready}
              aria-label={m.name}
              aria-pressed={tool === m.id}
              style={{ '--material': m.color } as CSSProperties}
              onClick={() => choose(m.id)}
            >
              <span className="aftermatter-material-chip" aria-hidden="true" />
              <span>{m.name}</span>
              <small>{String(i + 1).padStart(2, '0')}</small>
            </button>
          ))}
        </div>
        <div className="aftermatter-workbench" data-poster-hide>
          <div className="aftermatter-brush-control">
            <label htmlFor="aftermatter-radius">
              Brush <strong>{radius}</strong>
            </label>
            <input
              id="aftermatter-radius"
              aria-label="Brush size"
              type="range"
              min="1"
              max="14"
              value={radius}
              onChange={(e) => {
                setRadius(Number(e.target.value));
                experience.current?.setRadius(Number(e.target.value));
              }}
            />
          </div>
          <div className="aftermatter-tool-group">
            <button
              aria-label="Eraser"
              aria-pressed={tool === M.Empty}
              onClick={() => choose(M.Empty)}
              title="Eraser"
            >
              <Eraser size={17} />
            </button>
            <button
              aria-label="Vortex"
              aria-pressed={tool === 'vortex'}
              onClick={() => choose('vortex')}
              title="Vortex"
            >
              <Wind size={17} />
            </button>
            <button
              aria-label="Undo"
              onClick={() => experience.current?.undo()}
              title="Undo"
            >
              <Undo2 size={17} />
            </button>
          </div>
          <div className="aftermatter-time">
            <button
              disabled={!status.ready || status.reduced}
              aria-label={status.paused ? 'Resume' : 'Pause'}
              onClick={() => experience.current?.setPaused(!status.paused)}
            >
              {status.paused ? <Play size={16} /> : <Pause size={16} />}
              <span>{status.paused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              aria-label="Step simulation"
              disabled={!status.ready || (!status.paused && !status.reduced)}
              title="Step simulation"
              onClick={() => experience.current?.step()}
            >
              <SkipForward size={16} />
            </button>
            <select
              aria-label="Simulation speed"
              defaultValue="1"
              onChange={(e) =>
                experience.current?.setSpeed(Number(e.target.value))
              }
            >
              <option value="0.25">¼×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
          </div>
          <div className="aftermatter-tool-group aftermatter-utilities">
            <button
              aria-label="Save chamber"
              title="Save chamber in this browser"
              disabled={!status.ready}
              onClick={() =>
                action(
                  () => experience.current?.save(),
                  'Chamber saved in this browser.'
                )
              }
            >
              <Save size={17} />
            </button>
            <button
              aria-label="Load chamber"
              title="Load saved chamber"
              disabled={!status.ready}
              onClick={() =>
                action(
                  () => experience.current?.load(),
                  'Saved chamber restored.'
                )
              }
            >
              <FolderOpen size={17} />
            </button>
            <button
              aria-label="Save image"
              title="Save image"
              disabled={!status.ready}
              onClick={() =>
                action(() => experience.current?.saveStill(), 'Image saved.')
              }
            >
              <Camera size={17} />
            </button>
            <button
              disabled={!status.ready}
              aria-label={sound ? 'Mute sound' : 'Enable sound'}
              aria-pressed={sound}
              title={sound ? 'Mute sound' : 'Enable sound'}
              onClick={() =>
                action(
                  () => {
                    experience.current?.setSound(!sound);
                    setSound(!sound);
                  },
                  sound ? 'Sound off.' : 'Sound on. Reactions make sound.'
                )
              }
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              aria-label="Fullscreen"
              title="Fullscreen"
              onClick={async () => {
                try {
                  if (document.fullscreenElement)
                    await document.exitFullscreen();
                  else await vessel.current?.requestFullscreen();
                } catch {
                  setMessage('Fullscreen is unavailable in this browser.');
                }
              }}
            >
              <Expand size={17} />
            </button>
          </div>
        </div>
        <div className="aftermatter-description" data-poster-hide>
          <p>
            <strong>
              {selected?.name ?? (tool === 'vortex' ? 'Vortex' : 'Eraser')}
            </strong>
            <span>
              {selected?.hint ??
                (tool === 'vortex'
                  ? 'Stir loose material into a rising swirl.'
                  : 'Carve a channel. Remove anything inside the brush.')}
            </span>
          </p>
          <button
            disabled={!status.ready}
            onClick={() => experience.current?.pour()}
          >
            <Plus size={14} /> Pour at cursor
          </button>
        </div>
      </div>
      <footer className="aftermatter-footer" data-poster-hide>
        <p>
          Nothing to win.
          <br />
          <span>Everything to set in motion.</span>
        </p>
        <details>
          <summary>
            Inside the chamber <ChevronDown size={13} />
          </summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.decision}</p>
          <p>
            Keyboard: focus the chamber, use arrow keys to aim, Enter to pour
            and Space to pause. Reduced motion starts with still material; use
            Step to advance reactions.
          </p>
          <p>
            {status.frameMs.toFixed(1)} ms observed frame interval. Browser
            scheduling is included; this is not GPU timing.
          </p>
          <a href={study.notes?.sourceHref} target="_blank" rel="noreferrer">
            Inspired by DAN-BALL’s Powder Game 2 ↗
          </a>
        </details>
      </footer>
      <p className="aftermatter-message" role="status">
        {message}
      </p>
    </div>
  );
}
