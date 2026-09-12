import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas, { type ExperienceFactory } from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import { COUNT, MESSAGES } from '@/features/signal-shutters/model';
import {
  INITIAL_STATUS,
  SignalShuttersExperience,
} from '@/vanilla-three/experiences/signal-shutters/SignalShuttersExperience';
import './SignalShuttersExperiment.css';

export default function SignalShuttersExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<SignalShuttersExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const factory = useCallback<ExperienceFactory>((canvas, options) => {
    const next = new SignalShuttersExperience(canvas, setStatus, options);
    experience.current = next;
    return next;
  }, []);
  return (
    <div className="shutters-page">
      <header className="shutters-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / Kinetic typography
        </span>
      </header>
      <div className="shutters-intro" data-poster-hide>
        <div>
          <p className="font-meta">An image with moving parts</p>
          <h1>{study.title}</h1>
        </div>
        <p>
          A message takes a turn.
          <br />
          <span>Put your hand in its way.</span>
        </p>
      </div>
      <section className="shutters-stage" aria-label="Mechanical billboard">
        <ThreeCanvas
          experienceFactory={factory}
          tabIndex={0}
          ariaLabel={`A billboard of rotating triangular shutters. Current message: ${MESSAGES[status.face]} Drag to disturb it. Left and right arrows change transmission; Space disturbs the centre.`}
        />
        <div className="shutters-stage-top font-meta" data-poster-hide>
          <span>
            <i aria-hidden="true" />
            {status.ready
              ? status.reduced
                ? 'Still inspection'
                : status.paused
                  ? 'Transmission held'
                  : status.active
                    ? 'Turning over'
                    : 'Signal aligned'
              : 'Preparing signal'}
          </span>
          <span>Three faces. One surface.</span>
        </div>
        <div className="shutters-stage-bottom font-meta" data-poster-hide>
          <span>
            {status.reduced
              ? 'Reduced motion / still inspection'
              : 'Drag across the sign to interfere'}
          </span>
          <span>0{status.face + 1} / 03</span>
        </div>
      </section>
      <div className="shutters-desk" data-poster-hide>
        <div
          className="shutters-transmissions"
          role="group"
          aria-label="Transmission"
        >
          {MESSAGES.map((message, index) => (
            <button
              key={message}
              aria-pressed={status.face === index}
              disabled={!status.ready}
              onClick={() => experience.current?.transmit(index)}
            >
              <span className="font-meta">0{index + 1}</span>
              <span>{message}</span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className="shutters-tools">
          <button
            disabled={!status.ready}
            onClick={() => experience.current?.disturb()}
          >
            Interfere <span aria-hidden="true">↝</span>
          </button>
          <button
            disabled={!status.ready}
            aria-pressed={status.inspecting}
            onClick={() => experience.current?.inspect()}
          >
            {status.inspecting ? 'Face the sign' : 'Inspect depth'}
          </button>
          <button
            disabled={!status.ready || status.reduced}
            onClick={() => experience.current?.setPaused(!status.paused)}
          >
            {status.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            disabled={!status.ready}
            onClick={() => experience.current?.saveStill()}
          >
            Save still ↗
          </button>
        </div>
      </div>
      <footer className="shutters-footer" data-poster-hide>
        <p>
          {COUNT.toLocaleString()} small decisions.
          <br />
          <span>One collective image.</span>
        </p>
        <details>
          <summary>Inside the sign</summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.decision}</p>
          <p>
            Keyboard: focus the sign and use ← / → to change its message, or
            Space to disturb the centre. Pause holds the current arrangement;
            message buttons show a settled face while paused.
          </p>
        </details>
      </footer>
    </div>
  );
}
