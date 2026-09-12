import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  Expand,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  HelionExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/helion/HelionExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import {
  RENDER_PRESETS,
  type RenderPreset,
  type RenderingSettings,
} from '@/features/helion/rendering';
import './HelionExperiment.css';

export default function HelionExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<HelionExperience | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [sound, setSound] = useState(false);
  const [intensity, setIntensity] = useState(1);
  const [message, setMessage] = useState('');
  const [rendering, setRendering] = useState<RenderingSettings>({
    ...RENDER_PRESETS.Cel,
  });
  const [preset, setPreset] = useState<RenderPreset | null>('Cel');
  const renderingRef = useRef(rendering);
  const updateRendering = (
    next: RenderingSettings,
    name: RenderPreset | null = null
  ) => {
    renderingRef.current = next;
    setRendering(next);
    setPreset(name);
    experience.current?.setRendering(next);
  };
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new HelionExperience(canvas, setStatus, options);
      next.setRendering(renderingRef.current);
      experience.current = next;
      return next;
    },
    []
  );
  return (
    <div className="helion-page">
      <header className="helion-heading" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <header className="helion-intro" data-poster-hide>
        <h1 className="font-display">
          {study.title}
          <span lang="ja">ヘリオン</span>
        </h1>
        <p>
          Touch the shell. Stir something up.
          <br />
          <span>A study in pressure, play and chain reactions.</span>
        </p>
      </header>
      <div className="helion-vessel" ref={stage}>
        <div className="helion-stage">
          <ThreeCanvas
            experienceFactory={factory}
            ariaLabel={study.summary}
            tabIndex={0}
          />
          <div className="helion-live font-meta" data-poster-hide>
            <span>
              {status.reduced
                ? 'Still / Reduced motion'
                : status.paused
                  ? 'Time suspended'
                  : status.tile >= 0
                    ? `Tile ${String(status.tile + 1).padStart(3, '0')} / Locked`
                    : status.mood === 'Frenzy'
                      ? 'Attack / Active'
                      : 'Orbit / Active'}
            </span>
            <span>{status.time.toFixed(1).padStart(5, '0')} s</span>
            {!status.paused && !status.reduced && (
              <span className="helion-mood">
                {status.combo > 1
                  ? `×${status.combo} CHAIN`
                  : status.mood.toUpperCase()}
                <i
                  style={{
                    transform: `scaleX(${status.mood === 'Frenzy' ? 1 : status.resonance})`,
                  }}
                />
              </span>
            )}
          </div>
          <div className="helion-instruction" data-poster-hide>
            <span className="helion-charge" aria-hidden="true">
              <i style={{ transform: `scaleX(${status.charge})` }} />
            </span>
            <p>
              {status.dragging
                ? 'Keep sweeping. Release for a burst.'
                : status.charge > 0.05
                  ? `Charging ${Math.round(status.charge * 100)}% — release to strike`
                  : 'Brush the shell. Hold to charge.'}
            </p>
            <span className="font-meta">
              {status.mood === 'Breathing' || status.mood === 'Gathering'
                ? 'Circle your pointer to stir the swarm / Drag outside to orbit'
                : status.mood === 'Frenzy'
                  ? 'Chain taps for coins / Hold for a super burst'
                  : 'Catch your breath / Brush the shell to wake it'}
            </span>
          </div>
          <span
            className="helion-coordinate font-meta"
            aria-hidden="true"
            data-poster-hide
          >
            {status.cells} tiles / Touch to disturb
          </span>
        </div>
        <div className="helion-toolbar" data-poster-hide>
          <button
            className="helion-discharge"
            disabled={!status.ready}
            onClick={() => experience.current?.discharge()}
          >
            <Zap size={15} /> Discharge
          </button>
          <label className="helion-energy">
            Energy
            <input
              aria-label="Energy"
              type="range"
              min="0.25"
              max="1.8"
              step="0.05"
              value={intensity}
              onChange={(event) => {
                const value = Number(event.target.value);
                setIntensity(value);
                experience.current?.setIntensity(value);
              }}
            />
            <span>{intensity.toFixed(2)}</span>
          </label>
          <div className="helion-tools">
            <button
              disabled={!status.ready || status.reduced}
              onClick={() => experience.current?.setPaused(!status.paused)}
              aria-label={status.paused ? 'Resume' : 'Pause'}
              title={status.paused ? 'Resume' : 'Pause'}
            >
              {status.paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              aria-label={sound ? 'Mute sound' : 'Enable sound'}
              aria-pressed={sound}
              onClick={() => {
                experience.current?.setSound(!sound);
                setSound(!sound);
              }}
              title={sound ? 'Mute sound' : 'Enable sound'}
            >
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              disabled={!status.ready}
              aria-label="Save still"
              title="Save still"
              onClick={() => {
                experience.current?.saveStill();
                setMessage('Still saved at the current rendering resolution.');
              }}
            >
              <Download size={16} />
            </button>
            <button
              aria-label="Fullscreen"
              title="Fullscreen"
              onClick={async () => {
                try {
                  if (document.fullscreenElement)
                    await document.exitFullscreen();
                  else await stage.current?.requestFullscreen();
                } catch {
                  setMessage('Fullscreen is unavailable in this browser.');
                }
              }}
            >
              <Expand size={16} />
            </button>
          </div>
        </div>
        <details className="helion-render-settings" data-poster-hide>
          <summary className="font-meta">
            Rendering <span>{preset ?? 'Custom'}</span>
            <ArrowUpRight size={14} />
          </summary>
          <div className="helion-render-body">
            <div
              className="helion-presets"
              role="group"
              aria-label="Rendering presets"
            >
              {(Object.keys(RENDER_PRESETS) as RenderPreset[]).map((name) => (
                <button
                  key={name}
                  aria-pressed={preset === name}
                  onClick={() =>
                    updateRendering({ ...RENDER_PRESETS[name] }, name)
                  }
                >
                  {name}
                </button>
              ))}
              <p>
                Cel shading, ink contours and paper hatching. The motion stays
                yours.
              </p>
            </div>
            <div className="helion-render-sliders">
              {(
                [
                  ['cel', 'Cel shading'],
                  ['ink', 'Ink weight'],
                  ['hatch', 'Hatching'],
                  ['glow', 'Glow'],
                  ['pixels', 'Pixel accents'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <output>{Math.round(rendering[key] * 100)}%</output>
                  <input
                    aria-label={label}
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={rendering[key]}
                    onChange={(event) =>
                      updateRendering({
                        ...rendering,
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </details>
      </div>
      <footer className="helion-notes" data-poster-hide>
        <p>
          A small chain reaction.
          <br />
          <span>Your gesture becomes a force the whole shell feels.</span>
        </p>
        <details>
          <summary className="font-meta">
            Inside the field <ArrowUpRight size={13} />
          </summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.interaction}</p>
          <p>{study.notes?.decision}</p>
          <p className="font-meta">
            {status.pixels} px · {status.drawCalls} draw calls ·{' '}
            {status.frameMs.toFixed(1)} ms observed frame interval
          </p>
          <p>
            Frame interval includes browser scheduling; it is not a GPU timing.
            Rendering resolution adapts to sustained load.
          </p>
        </details>
      </footer>
      <p role="status" className="helion-message">
        {message}
      </p>
    </div>
  );
}
