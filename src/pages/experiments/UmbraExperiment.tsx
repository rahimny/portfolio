import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  UmbraExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/umbra/UmbraExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './UmbraExperiment.css';

export default function UmbraExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<UmbraExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [mode, setMode] = useState<'light' | 'camera'>('light');
  const [message, setMessage] = useState('');
  const [seed, setSeed] = useState('1');
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new UmbraExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  return (
    <div className="umbra-page">
      <header className="umbra-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <section className="umbra-stage" aria-label="Shadow growth specimen">
        <ThreeCanvas
          experienceFactory={factory}
          ariaLabel="Pale ribbed formation. Drag to move the light; arrow keys also move it. Space pauses growth."
          tabIndex={0}
        />
        <div className="umbra-title" data-poster-hide>
          <p className="font-meta">An architecture of absence</p>
          <h1 className="font-display">{study.title}</h1>
          <p>
            Move the light.
            <br />
            Cultivate the shadow.
          </p>
        </div>
        <div className="umbra-readout font-meta" data-poster-hide>
          <span>Seed {String(status.seed).padStart(4, '0')}</span>
          <span>Tick {String(status.tick).padStart(5, '0')}</span>
          <span>
            {!status.ready
              ? 'Initialising'
              : status.reduced || status.paused
                ? 'Time held'
                : 'Accreting in shelter'}
          </span>
        </div>
        <div className="umbra-stage-footer" data-poster-hide>
          <span>
            {mode === 'light'
              ? 'Drag to carry the light · Arrow keys to adjust'
              : 'Drag to explore · Scroll to approach'}
          </span>
          <span>Amber records recent growth</span>
        </div>
      </section>
      <fieldset
        className="umbra-console"
        disabled={!status.ready}
        data-poster-hide
      >
        <legend className="sr-only">UMBRA controls</legend>
        <div className="umbra-control-group">
          <span className="font-meta">01 / The light</span>
          <label htmlFor="umbra-azimuth">
            Azimuth <output>{Math.round(status.azimuth)}°</output>
          </label>
          <input
            id="umbra-azimuth"
            type="range"
            min="-180"
            max="180"
            value={status.azimuth}
            onChange={(e) =>
              experience.current?.setLight(
                Number(e.target.value),
                status.elevation
              )
            }
          />
          <label htmlFor="umbra-elevation">
            Elevation <output>{Math.round(status.elevation)}°</output>
          </label>
          <input
            id="umbra-elevation"
            type="range"
            min="5"
            max="85"
            value={status.elevation}
            onChange={(e) =>
              experience.current?.setLight(
                status.azimuth,
                Number(e.target.value)
              )
            }
          />
        </div>
        <div className="umbra-control-group">
          <span className="font-meta">02 / Time & space</span>
          <div className="umbra-buttons">
            <button
              disabled={status.reduced}
              onClick={() => experience.current?.setPaused(!status.paused)}
            >
              {status.paused || status.reduced ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => experience.current?.stepOnce()}>
              Step growth
            </button>
            <button onClick={() => experience.current?.reset()}>
              Reset seed
            </button>
          </div>
          <div className="umbra-buttons">
            {(['light', 'camera'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  experience.current?.setMode(value);
                }}
              >
                {value === 'light' ? 'Move light' : 'Explore'}
              </button>
            ))}
            <button
              aria-pressed={status.interior}
              onClick={() => {
                if (!experience.current?.setView(!status.interior))
                  setMessage(
                    'The centre no longer has enough clearance. Use Explore to inspect the surface.'
                  );
              }}
            >
              {status.interior ? 'Overview' : 'Enter void'}
            </button>
          </div>
          {status.reduced && (
            <p className="umbra-hint">
              Reduced motion: use Step growth to advance.
            </p>
          )}
        </div>
        <div className="umbra-control-group">
          <span className="font-meta">03 / The edition</span>
          <form
            className="umbra-buttons"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(seed);
              if (Number.isInteger(value) && value >= 1 && value <= 999999)
                experience.current?.reset(value);
            }}
          >
            <label className="sr-only" htmlFor="umbra-seed">
              Seed
            </label>
            <input
              id="umbra-seed"
              type="number"
              min="1"
              max="999999"
              required
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
            <button type="submit">Grow seed</button>
            <button
              type="button"
              onClick={() => {
                const next = (status.seed % 999999) + 1;
                setSeed(String(next));
                experience.current?.reset(next);
              }}
            >
              Next
            </button>
          </form>
          <div className="umbra-buttons">
            <button
              onClick={() => {
                try {
                  experience.current?.saveImpression();
                  setMessage('Shadow impression requested: 2400 × 2800 PNG.');
                } catch {
                  setMessage('The image could not be exported. Try again.');
                }
              }}
            >
              Save impression
            </button>
            <button onClick={() => experience.current?.saveState()}>
              Save state
            </button>
            <label className="umbra-upload">
              Restore state
              <input
                aria-label="Restore state"
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  const owner = experience.current;
                  if (!file || !owner) return;
                  try {
                    const restoredSeed = await owner.loadState(file);
                    if (
                      restoredSeed !== undefined &&
                      experience.current === owner
                    )
                      setSeed(String(restoredSeed));
                    if (experience.current === owner)
                      setMessage('State restored. Time is held.');
                  } catch (error) {
                    if (experience.current === owner)
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'Unable to restore state.'
                      );
                  }
                  input.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </fieldset>
      <footer className="umbra-notes" data-poster-hide>
        <p>
          A room that grows from its own shadows.
          <br />
          <span>Shelter accumulates. Exposure wears away.</span>
        </p>
        <details>
          <summary>Inside the rule</summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.interaction}</p>
          <p>{study.notes?.decision}</p>
          <p className="font-meta">
            36³ cells · 4 ticks/s · {status.cells.toLocaleString()} occupied
            <br />
            Last tick: +{status.grown} / −{status.eroded} cells ·{' '}
            {status.stepMs.toFixed(1)} ms CPU simulation + meshing
          </p>
          <p>
            Rendering is capped at 1.4 million pixels. This is a live CPU
            measurement, not GPU frame time or a device performance guarantee.
            Growth pauses in hidden tabs and outside the viewport.
          </p>
        </details>
      </footer>
      <p className="umbra-message" role="status">
        {message}
      </p>
    </div>
  );
}
