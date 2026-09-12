import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas, { type ExperienceFactory } from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  INITIAL_STATUS,
  PressureTypeExperience,
} from '@/vanilla-three/experiences/pressure-type/PressureTypeExperience';
import {
  MATERIALS,
  type MaterialName,
} from '@/features/pressure-type/settings';
import './PressureTypeExperiment.css';

export default function PressureTypeExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<PressureTypeExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const studioToggle = useRef<HTMLButtonElement>(null);
  const closeStudio = () => {
    setStudioOpen(false);
    studioToggle.current?.focus();
  };
  const [studioOpen, setStudioOpen] = useState(false);
  const studioHost = useCallback((element: HTMLDivElement | null) => {
    void experience.current?.setStudio(element);
  }, []);
  const factory = useCallback<ExperienceFactory>((canvas, options) => {
    const next = new PressureTypeExperience(canvas, setStatus, options);
    experience.current = next;
    return next;
  }, []);

  return (
    <div className="pressure-page">
      <header className="pressure-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / Material test
        </span>
      </header>
      <div className="pressure-intro" data-poster-hide>
        <div>
          <p className="font-meta">Type, under pressure</p>
          <h1>{study.title}</h1>
        </div>
        <p>
          Give the ink a little air.
          <br /> <span>One pump at a time.</span>
        </p>
      </div>
      <section
        className="pressure-apparatus"
        aria-label="Inflatable ink experiment"
      >
        <div className="pressure-stage">
          {studioOpen && (
            <div
              className="pressure-studio"
              role="region"
              aria-label="Studio controls"
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeStudio();
              }}
              data-poster-hide
            >
              <button
                className="pressure-studio-close"
                onClick={closeStudio}
                aria-label="Close studio controls"
              >
                Close ×
              </button>
              <div ref={studioHost} />
            </div>
          )}
          <div className="pressure-stage-label font-meta" data-poster-hide>
            <span>Archivo / {status.material}</span>
            <span>
              {status.ready
                ? status.burstCount === 3
                  ? 'All out of air'
                  : status.burstCount > 0
                    ? 'Membrane ruptured'
                    : status.air > 1
                      ? 'Overfilled — handle with care'
                      : status.venting
                        ? 'Releasing air'
                        : status.air === 0
                          ? 'Ready to inflate'
                          : 'Air held'
                : 'Preparing membrane'}
            </span>
          </div>
          <ThreeCanvas
            experienceFactory={factory}
            ariaLabel="The word INK as three soft membranes. Pump to inflate, press and drag a letter to dent and pull it, click or tap to knock it, and keep pumping to burst it. A Knock a letter button provides the same action."
          />
          <div className="pressure-stage-foot font-meta" data-poster-hide>
            <span>
              {status.ready
                ? 'Press & drag the skin · drag the space to look around'
                : 'Ink becomes volume'}
            </span>
            <span>{status.volumeRatio.toFixed(1)}× initial volume</span>
          </div>
        </div>
        <aside className="pressure-instrument" data-poster-hide>
          <div className="pressure-gauge">
            <svg viewBox="0 0 180 115" aria-hidden="true">
              <path
                className="pressure-gauge-track"
                d="M 25 90 A 65 65 0 0 1 155 90"
              />
              <path
                className="pressure-gauge-fill"
                d="M 25 90 A 65 65 0 0 1 155 90"
                pathLength="100"
                strokeDasharray={`${Math.min(status.air, 1) * 100} 100`}
              />
              <g
                transform={`rotate(${-90 + Math.min(status.air, 1) * 180} 90 90)`}
              >
                <path className="pressure-needle" d="M 90 90 L 90 38" />
              </g>
              <circle cx="90" cy="90" r="5" className="pressure-gauge-hub" />
            </svg>
            <label className="font-meta" htmlFor="pressure-air">
              Air reservoir
            </label>
            <output id="pressure-air">
              {Math.round(status.air * 100)}
              <small>%</small>
            </output>
            <meter
              className="sr-only"
              min={0}
              max={1.5}
              value={status.air}
              aria-label="Air reservoir"
            />
          </div>
          <button
            className="pressure-pump"
            onClick={() => experience.current?.pump()}
            disabled={!status.ready || status.burstCount === 3 || status.paused}
          >
            <svg viewBox="0 0 160 128" aria-hidden="true">
              <path
                className="pressure-pump-hose"
                d="M 105 100 C 148 100 143 50 150 50"
              />
              <path
                className="pressure-pump-base"
                d="M 39 114 H 120 M 56 109 V 59 H 104 V 109"
              />
              <g className="pressure-plunger">
                <path d="M 80 17 V 78" />
                <path className="pressure-handle" d="M 43 17 H 117" />
              </g>
            </svg>
            <span>
              Pump air <span aria-hidden="true">↓</span>
            </span>
            <small className="font-meta">
              {status.burstCount === 3
                ? 'Reset for fresh letters'
                : status.air >= 1
                  ? 'One stroke too far?'
                  : 'Press to add a stroke'}
            </small>
          </button>
          <button
            className="pressure-valve"
            onClick={() => experience.current?.vent()}
            disabled={!status.ready || status.air === 0 || status.paused}
            aria-pressed={status.venting}
          >
            <span aria-hidden="true">⊗</span>
            {status.venting ? 'Close valve' : 'Release air'}
          </button>
          <p className="pressure-strokes font-meta">
            {String(status.strokes).padStart(2, '0')} pump strokes
          </p>
        </aside>
      </section>
      <div className="pressure-controls" data-poster-hide>
        <p>
          {status.reduced
            ? 'Reduced motion: each action shows a still result.'
            : status.burstCount === 3
              ? 'That was one pump too many. Reset to start again.'
              : 'Pump. Knock the letters. Find their limit.'}
        </p>
        <div>
          <div className="pressure-skins" role="group" aria-label="Material">
            {(Object.keys(MATERIALS) as MaterialName[]).map((name) => (
              <button
                key={name}
                aria-pressed={status.material === name}
                onClick={() => experience.current?.setMaterial(name)}
                disabled={!status.ready}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            aria-pressed={status.sound}
            onClick={() => {
              void experience.current?.toggleSound();
            }}
            disabled={!status.ready}
          >
            {status.sound ? 'Sound on' : 'Sound off'}
          </button>
          <button
            ref={studioToggle}
            aria-expanded={studioOpen}
            onClick={() => setStudioOpen(!studioOpen)}
            disabled={!status.ready}
          >
            Studio controls
          </button>
          <button
            onClick={() => experience.current?.tapLetter()}
            disabled={!status.ready || status.air === 0 || status.paused}
          >
            Knock a letter
          </button>
          <button
            aria-pressed={status.helium}
            onClick={() => experience.current?.setHelium(!status.helium)}
            disabled={!status.ready || status.paused || status.burstCount === 3}
          >
            Helium
          </button>
          <button
            onClick={() => experience.current?.setPaused(!status.paused)}
            disabled={!status.ready || status.reduced}
          >
            {status.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            aria-pressed={status.wireframe}
            onClick={() => experience.current?.setWireframe(!status.wireframe)}
            disabled={!status.ready}
          >
            Show membrane
          </button>
          <button
            onClick={() => experience.current?.reset()}
            disabled={!status.ready}
          >
            Reset
          </button>
          <button
            onClick={() => experience.current?.saveStill()}
            disabled={!status.ready}
          >
            Save still ↗
          </button>
        </div>
      </div>
      <details className="pressure-notes" data-poster-hide>
        <summary>Inside the experiment</summary>
        <p>{study.notes?.mechanism}</p>
        <p aria-live="polite">
          {status.hits} knocks · {status.burstCount} burst letters
        </p>
        <p>{study.notes?.decision}</p>
        <p>
          {status.vertices.toLocaleString()} simulated vertices. Last sampled
          CPU physics step: {status.stepMs.toFixed(2)} ms, excluding rendering.
          Display update and render submission: {status.drawMs.toFixed(2)} ms.
          {status.gpuMs > 0
            ? ` Last asynchronous GPU sample: ${status.gpuMs.toFixed(2)} ms.`
            : ' GPU timing is available in Studio controls when supported.'}
          The canvas is capped at 1.5 million pixels.
        </p>
      </details>
    </div>
  );
}
