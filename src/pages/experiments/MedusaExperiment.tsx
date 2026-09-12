import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  MedusaExperience,
  type MedusaReadout,
} from '@/vanilla-three/experiences/medusa/MedusaExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './MedusaExperiment.css';

export default function MedusaExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  useDocumentMeta(study.title, study.summary);
  const breadcrumbs = useBreadcrumbFromRoute();
  const controlsContainer = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MedusaReadout | null>(null);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new MedusaExperience(canvas, setStatus, 1289, options);
      return next;
    },
    []
  );
  return (
    <main id="main" className="medusa-page">
      <header className="medusa-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span>
          STUDY {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <div className="medusa-title" data-poster-hide>
        <div>
          <p>A LIVING OIL STUDY</p>
          <h1>{study.title}</h1>
        </div>
        <p>
          Held together by paint.
          <br />
          Carried by the current.
        </p>
      </div>
      <div className="medusa-workspace">
        <section
          className="medusa-frame"
          aria-label="Living jellyfish painting"
        >
          <ThreeCanvas
            experienceFactory={factory}
            controlsContainerRef={controlsContainer}
            tabIndex={0}
            ariaLabel="An oil-painted jellyfish in three dimensions. Drag to turn, scroll to approach. Arrow keys turn, plus and minus zoom, R restores the view. Double click or press Space to stir the water."
          />
          {!status && (
            <div className="medusa-loading" role="status" data-poster-hide>
              Laying down the first strokes…
            </div>
          )}
          <div className="medusa-caption" data-poster-hide>
            <span>
              {status
                ? `SPECIMEN ${String(status.seed).padStart(6, '0')}`
                : 'PREPARING PIGMENT'}
            </span>
            <span>DRAG TO TURN · DOUBLE CLICK TO STIR</span>
          </div>
        </section>
        <aside
          className="medusa-studio"
          aria-label="Painting controls"
          data-poster-hide
        >
          <div ref={controlsContainer} />
          <p>
            Drag to turn; double click or press Space to stir the water. Recipes
            save your generator settings; prints capture the current pose.
            Reduced motion follows your device preference.
          </p>
        </aside>
      </div>
      <footer className="medusa-notes" data-poster-hide>
        <p>
          Procedural anatomy, folded arms and fine trailing filaments. Every
          brush mark keeps its place as the bell opens and contracts. Turn the
          painting to find the space between the strokes.
        </p>
        <p>
          Brush atlas adapted from{' '}
          <a
            href="https://www.artblocks.io/collection/chimera-by-mpkoz"
            target="_blank"
            rel="noreferrer"
          >
            Chimera by mpkoz
          </a>{' '}
          (
          <a
            href="https://creativecommons.org/licenses/by-nc/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-NC 4.0
          </a>
          ). Procedural anatomy, CPU motion model and TSL painter.
        </p>
        <span>
          {status
            ? `${status.marks.toLocaleString()} MARKS / ${status.backend.toUpperCase()}`
            : 'GENERATIVE PAINTING'}
        </span>
      </footer>
    </main>
  );
}
