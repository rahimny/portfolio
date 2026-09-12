import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  SurveillanceExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/surveillance/SurveillanceExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './SurveillanceExperiment.css';

export default function SurveillanceExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<SurveillanceExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new SurveillanceExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  return (
    <div className="surveillance-page">
      <div className="surveillance-stage">
        <ThreeCanvas
          experienceFactory={factory}
          tabIndex={0}
          ariaLabel="An eight-legged surveillance droid stalks the cursor. Move or touch to guide its walk and gaze. Click to startle it. Arrow keys move its target; Enter startles; Space pauses."
        />
      </div>
      <header className="surveillance-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">Study {editionLabel(study.edition)}</span>
      </header>
      <div className="surveillance-title" data-poster-hide>
        <p className="font-meta">Autonomous observation</p>
        <h1 className="font-display">{study.title}</h1>
        <p>It noticed you.</p>
      </div>
      <aside
        className="surveillance-readout font-meta"
        data-poster-hide
        aria-label="Observation status"
      >
        <span className="surveillance-state">
          <i /> {status.mode}
        </span>
        <span>
          X {status.x.toFixed(2)} / Y {status.y.toFixed(2)}
        </span>
        <span>Optical unit / 01</span>
      </aside>
      <footer className="surveillance-footer" data-poster-hide>
        <div className="surveillance-instruction">
          <p>
            {status.reduced
              ? 'Still observation. Move to inspect its gaze.'
              : 'Move to lead it. Stop to be watched.'}
          </p>
          <span>Cursor only. No camera access.</span>
        </div>
        <div className="surveillance-actions">
          <button
            disabled={!status.ready || status.reduced}
            aria-pressed={status.paused}
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
          <details>
            <summary>Field notes +</summary>
            <div className="surveillance-notes">
              <p>{study.notes?.mechanism}</p>
              <p>{study.notes?.interaction}</p>
              <p>{study.notes?.decision}</p>
              <p>
                <a
                  href={study.notes?.sourceHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Spider gait research ↗
                </a>
              </p>
            </div>
          </details>
        </div>
      </footer>
    </div>
  );
}
