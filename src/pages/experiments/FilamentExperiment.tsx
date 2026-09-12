import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas, { type ExperienceFactory } from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  FilamentExperience,
  INITIAL_STATUS,
  MOTION_MODES,
} from '@/vanilla-three/experiences/filament/FilamentExperience';
import './FilamentExperiment.css';
export default function FilamentExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<FilamentExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [message, setMessage] = useState('');
  const factory = useCallback<ExperienceFactory>((canvas, options) => {
    const next = new FilamentExperience(canvas, setStatus, options);
    experience.current = next;
    return next;
  }, []);
  return (
    <main className="filament-page">
      <header className="filament-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <div className="filament-work">
        <div className="filament-stage" data-artboard>
          <ThreeCanvas
            experienceFactory={factory}
            tabIndex={0}
            ariaLabel="A sphere of silver filaments on black. Hollow colonies connect to a dense central membrane through fine stretched threads. Left and right arrows change tension; Space plays or pauses; Enter advances time; Escape restores the reference composition. Hover to reveal nearby fibres. Drag to pull and fracture the network; release to send a pulse."
          />
        </div>
        <aside className="filament-desk" data-poster-hide>
          <p className="font-meta">A study in connection</p>
          <h1>{study.title}</h1>
          <p className="filament-intro">
            A thousand small threads.
            <br />
            One suspended world.
          </p>
          <p className="filament-motion-description">
            Hover to trace. Drag to pull. Release to send.
          </p>
          <fieldset disabled={!status.ready}>
            <legend className="sr-only">Filament controls</legend>
            <div
              className="filament-modes"
              role="group"
              aria-label="Motion field"
            >
              {MOTION_MODES.map((mode) => (
                <button
                  key={mode}
                  aria-pressed={status.mode === mode}
                  onClick={() => experience.current?.setMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="filament-motion-description">
              {status.mode === 'Still'
                ? 'The structure holds still while pulses spread through its branches.'
                : status.mode === 'Vortex'
                  ? 'Inner and outer fibres twist in opposing currents.'
                  : status.mode === 'Liquid'
                    ? 'Travelling lenses stretch and release the web.'
                    : 'The specimen repeats inside its own centre.'}
            </p>
            <div className="filament-actions filament-network">
              <button
                aria-pressed={status.network}
                onClick={() => experience.current?.setNetwork(!status.network)}
              >
                Network {status.network ? 'on' : 'off'}
              </button>
              <button onClick={() => experience.current?.sendPulse()}>
                Send pulse
              </button>
            </div>
            <label htmlFor="filament-pulse">
              Pulse force{' '}
              <output>{Math.round(status.pulseForce * 100)}%</output>
            </label>
            <input
              id="filament-pulse"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={status.pulseForce}
              onChange={(e) =>
                experience.current?.setPulseForce(Number(e.target.value))
              }
            />
            <label htmlFor="filament-strength">
              Deformation
              <output>{Math.round(status.strength * 100)}%</output>
            </label>
            <input
              id="filament-strength"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={status.strength}
              onChange={(e) =>
                experience.current?.setStrength(Number(e.target.value))
              }
            />
            <label htmlFor="filament-speed">
              Speed <output>{status.speed.toFixed(1)}×</output>
            </label>
            <input
              id="filament-speed"
              type="range"
              min="0.2"
              max="2"
              step="0.05"
              value={status.speed}
              onChange={(e) =>
                experience.current?.setSpeed(Number(e.target.value))
              }
            />
            <label htmlFor="filament-spectral">
              Prism <output>{Math.round(status.spectral * 100)}%</output>
            </label>
            <input
              id="filament-spectral"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={status.spectral}
              onChange={(e) =>
                experience.current?.setSpectral(Number(e.target.value))
              }
            />
            <details className="filament-fine-controls filament-distortion">
              <summary>Digital distortion</summary>
              <p>Slice the signal, hold a pixel, stretch a passing pulse.</p>
              <div
                className="filament-modes"
                role="group"
                aria-label="Drag response"
              >
                <button
                  aria-pressed={!status.digitalDrag}
                  onClick={() => experience.current?.setDigitalDrag(false)}
                >
                  Elastic drag
                </button>
                <button
                  aria-pressed={status.digitalDrag}
                  onClick={() => experience.current?.setDigitalDrag(true)}
                >
                  Digital drag
                </button>
              </div>
              {(
                [
                  [
                    'glitch',
                    'Glitch',
                    status.glitch,
                    (value: number) => experience.current?.setGlitch(value),
                  ],
                  [
                    'pixelation',
                    'Pixelation',
                    status.pixelation,
                    (value: number) => experience.current?.setPixelation(value),
                  ],
                  [
                    'stretch',
                    'Pixel stretch',
                    status.stretch,
                    (value: number) => experience.current?.setStretch(value),
                  ],
                ] as const
              ).map(([id, label, value, change]) => (
                <div key={id}>
                  <label htmlFor={`filament-${id}`}>
                    {label}
                    <output>{Math.round(value * 100)}%</output>
                  </label>
                  <input
                    id={`filament-${id}`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={value}
                    onChange={(e) => change(Number(e.target.value))}
                  />
                </div>
              ))}
              <div
                className="filament-modes"
                role="group"
                aria-label="Stretch direction"
              >
                <button
                  aria-pressed={!status.stretchVertical}
                  onClick={() => experience.current?.setStretchVertical(false)}
                >
                  Horizontal
                </button>
                <button
                  aria-pressed={status.stretchVertical}
                  onClick={() => experience.current?.setStretchVertical(true)}
                >
                  Vertical
                </button>
              </div>
              <div className="filament-actions">
                <button onClick={() => experience.current?.triggerGlitch()}>
                  Glitch now
                </button>
                <button onClick={() => experience.current?.clearDistortion()}>
                  Clear effects
                </button>
              </div>
            </details>
            <details className="filament-fine-controls">
              <summary>Fine controls</summary>
              <label htmlFor="filament-depth">
                Depth <output>{Math.round(status.depth * 100)}%</output>
              </label>
              <input
                id="filament-depth"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={status.depth}
                onChange={(e) =>
                  experience.current?.setDepth(Number(e.target.value))
                }
              />
              <label htmlFor="filament-tension">
                Tension <output>{status.tension.toFixed(2)}</output>
              </label>
              <input
                id="filament-tension"
                type="range"
                min="0.3"
                max="1.7"
                step="0.01"
                value={status.tension}
                onChange={(e) =>
                  experience.current?.setTension(Number(e.target.value))
                }
              />
              <label htmlFor="filament-exposure">
                Light <output>{status.exposure.toFixed(2)}</output>
              </label>
              <input
                id="filament-exposure"
                type="range"
                min="0.3"
                max="2"
                step="0.01"
                value={status.exposure}
                onChange={(e) =>
                  experience.current?.setExposure(Number(e.target.value))
                }
              />
              <label htmlFor="filament-zoom">
                Magnification <output>{status.zoom.toFixed(1)}×</output>
              </label>
              <input
                id="filament-zoom"
                type="range"
                min="1"
                max="2.5"
                step="0.01"
                value={status.zoom}
                onChange={(e) =>
                  experience.current?.setZoom(Number(e.target.value))
                }
              />
            </details>
            <div className="filament-actions">
              <button
                disabled={status.reduced}
                onClick={() => experience.current?.setPlaying(!status.playing)}
              >
                {status.playing && !status.reduced ? 'Pause' : 'Animate'}
              </button>
              <button onClick={() => experience.current?.step()}>
                Advance 0.5 s
              </button>
            </div>
            <div className="filament-actions">
              <button onClick={() => experience.current?.reset()}>
                Restore reference
              </button>
            </div>
            <button
              className="filament-save"
              onClick={() => {
                setMessage('Preparing still…');
                void experience.current
                  ?.saveStill()
                  .then(() => setMessage('Still saved at 2400 × 2400 px.'))
                  .catch(() => setMessage('Could not save the still.'));
              }}
            >
              Save still ↗
            </button>
          </fieldset>
          <p className="filament-status font-meta" role="status">
            {message ||
              (status.ready
                ? `${status.playing && !status.reduced ? 'In motion' : 'Time held'} · ${status.time.toFixed(1)} s`
                : 'Loading the specimen…')}
          </p>
          <details>
            <summary>Inside the specimen</summary>
            <p>{study.notes?.mechanism}</p>
            <p>{study.notes?.decision}</p>
            <p>
              Pulses spread along connected fibres, branching outward and
              leaving a fading wake. Network works with every motion field; the
              structure and its signals bend together. The fine structure is a
              2400 px rendering of our procedural model. Four precomputed
              distance fields drive the pulses without live particle routing.
              Display rendering is capped at 1.5 million pixels; hidden work
              sleeps.
            </p>
            <p>
              {status.reduced
                ? 'Reduced motion is active. Static controls remain available.'
                : 'Hover reveals the nearby lattice. Drag pulls its fibres; Digital drag fractures them into pixels as strain builds. Release sends a pulse from the nearest of four origins. Enter advances time; Space plays or pauses.'}
            </p>
          </details>
        </aside>
      </div>
    </main>
  );
}
