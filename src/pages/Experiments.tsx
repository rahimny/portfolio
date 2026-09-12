import { Routes, Route, Link } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Plate } from '@/components/primitives/Plate';
import { PlateHeader } from '@/components/primitives/PlateHeader';
import { ContactPlate, Colophon } from '@/components/SitePlates';
import { NotFound } from '@/components/NotFound';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { ArcFigure } from '@/features/marks/ArcFigure';
import { collectionRings, studyRings } from '@/features/marks/studyFigures';
import {
  studies,
  editionLabel,
  type Study,
  type StudySlug,
} from '@/features/lab/registry';
import { getStudyLoader } from '@/features/lab/studyRoutes';
import { cn } from '@/lib/utils';
import { StudyVisit } from '@/features/visit/StudyVisit';
import { VisitStamp } from '@/features/visit/VisitStamp';

const studyComponents = new Map(
  studies.map((study) => {
    const slug = study.slug as StudySlug;
    return [slug, lazy(getStudyLoader(slug))] as const;
  })
);

const GrowthRegisterStage = lazy(
  () => import('@/features/lab/GrowthRegisterStage')
);

/**
 * Alternating 7/5 spans. An even three-column grid gives every study the same
 * weight, so none of them has any — and because 7+5 and 5+7 both make 12, the
 * rhythm keeps tiling as the index grows.
 */
const SPANS = [
  'md:col-span-7',
  'md:col-span-5',
  'md:col-span-5',
  'md:col-span-7',
];

/* -------------------------------------------------------------------- card */

function StudyCard({ study, className }: { study: Study; className?: string }) {
  return (
    <Link
      to={`/experiments/${study.slug}`}
      className={cn(
        'group flex h-full flex-col border border-border bg-surface',
        'transition-colors duration-(--dur-base) ease-(--ease-out)',
        'hover:bg-ink hover:text-on-ink focus-visible:bg-ink focus-visible:text-on-ink',
        className
      )}
    >
      {/* Fixed height, not a fixed ratio. The spans alternate 7/5, so an
          aspect ratio makes the two specimens in a row different heights and
          every record below them starts at a different baseline. */}
      <div className="relative h-[clamp(11rem,20vw,18rem)] overflow-hidden border-b border-current/20 bg-surface-2">
        {study.poster ? (
          <img
            src={study.poster}
            alt={`Still frame of ${study.title}`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          /* No capture is possible for the WebGPU compute studies under
             headless rendering. The figure is drawn from the study's own
             record — one arc per technique, each as long as that technique is
             common across the collection — where an empty grey frame was only
             an apology. */
          <div className="flex size-full items-center justify-center py-6">
            <ArcFigure
              rings={studyRings(study, studies)}
              centre="ink"
              revealAccentOnInteraction
              className="h-full w-auto text-ink opacity-80"
            />
          </div>
        )}
        <span className="absolute left-3 top-3 font-meta mix-blend-difference text-paper">
          {editionLabel(study.edition)}
          <VisitStamp slug={study.slug} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl uppercase leading-none">
            {study.title}
          </h3>
          {study.status === 'wip' && (
            <span className="shrink-0 font-meta">In progress</span>
          )}
        </div>

        <p className="max-w-[var(--measure)] flex-1 text-sm leading-relaxed text-fg-muted group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
          {study.summary}
        </p>

        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-2">
            <dt className="font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
              Technique
            </dt>
            <dd className="font-meta">{study.technique.join(' / ')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
              Renderer
            </dt>
            <dd className="font-meta">{study.renderer}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------- page */

// Group by publication status without changing stable edition numbers.
const liveStudies = studies.filter((s) => s.status === 'live');
const wipStudies = studies.filter((s) => s.status === 'wip');

function LabIndex() {
  return (
    <>
      <Plate
        tone="paper"
        spacing="none"
        marks
        className="pt-[calc(var(--navbar-height)+var(--section-y)*0.6)] pb-[calc(var(--section-y)*0.6)]"
      >
        <div className="field items-end gap-y-10">
          <div className="col-span-12 md:col-span-5">
            <p className="font-meta text-fg-subtle">Creative coding</p>
            <h1 className="mt-4 font-hero text-hero md:mt-6">Lab</h1>
            <p className="mt-6 max-w-[var(--measure)] text-lg leading-relaxed text-balance md:mt-8 md:text-xl">
              Real-time graphics, simulation and generative systems.
            </p>
          </div>

          {/* The collection as a living mark, not a featured study. Columns
              6–8 stay empty and the canvas has no panel ground or frame: it is
              one generated object sitting in the page field. */}
          <div className="col-span-12 md:col-span-4 md:col-start-9">
            <div className="relative mx-auto aspect-square w-full max-w-[26rem] md:mr-0">
              <Suspense
                fallback={
                  <div className="flex size-full items-center justify-center py-8">
                    <ArcFigure
                      rings={collectionRings(studies)}
                      centre="ink"
                      className="h-full w-auto opacity-55"
                    />
                  </div>
                }
              >
                <GrowthRegisterStage />
              </Suspense>
            </div>

            <p className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-2 text-fg-subtle">
              <span className="font-meta">
                Registry field · {editionLabel(studies.length)} seeds
              </span>
              <span className="font-meta hidden sm:inline">Press + drag</span>
            </p>
          </div>
        </div>

        <div className="mt-[calc(var(--section-y)*0.55)] border-t border-border pt-8">
          <PlateHeader
            title="Studies"
            context="Live work first, newest of each"
            meta={`${editionLabel(studies.length)} total`}
          />
        </div>

        <div className="field mt-8 gap-y-8">
          {liveStudies.map((study, i) => (
            <div
              key={study.slug}
              className={cn('col-span-12', SPANS[i % SPANS.length])}
            >
              <StudyCard study={study} className="h-full" />
            </div>
          ))}
        </div>

        {wipStudies.length > 0 && (
          <div className="mt-[calc(var(--section-y)*0.55)] border-t border-border pt-8">
            <PlateHeader
              title="In progress"
              context="Reachable, not yet finished"
              meta={`${editionLabel(wipStudies.length)} studies`}
            />
            <div className="field mt-8 gap-y-8">
              {wipStudies.map((study, i) => (
                <div
                  key={study.slug}
                  className={cn(
                    'col-span-12',
                    SPANS[(liveStudies.length + i) % SPANS.length]
                  )}
                >
                  <StudyCard study={study} className="h-full" />
                </div>
              ))}
            </div>
          </div>
        )}
      </Plate>

      <ContactPlate />
      <Colophon />
    </>
  );
}

function ExperimentLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="font-meta text-fg-subtle">Loading study</p>
    </div>
  );
}

export default function Experiments() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route index element={<LabIndex />} />
        {studies.map((study) => {
          const slug = study.slug as StudySlug;
          const StudyComponent = studyComponents.get(slug)!;
          const path = study.variants?.length ? `${slug}/*` : slug;

          return (
            <Route
              key={slug}
              path={path}
              element={
                <Suspense fallback={<ExperimentLoader />}>
                  <StudyVisit>
                    <StudyComponent />
                  </StudyVisit>
                </Suspense>
              }
            />
          );
        })}
        <Route
          path="*"
          element={
            <NotFound
              message="There's no study at this address."
              backTo="/experiments"
              backLabel="All studies"
            />
          }
        />
      </Routes>
    </RouteErrorBoundary>
  );
}
