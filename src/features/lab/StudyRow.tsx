import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArcFigure } from '@/features/marks/ArcFigure';
import { studyRings } from '@/features/marks/studyFigures';
import { editionLabel, studies, type Study } from './registry';
import { VisitStamp } from '../visit/VisitStamp';

/**
 * A ruled registry entry with aligned edition numbers, titles and records.
 * Hover and focus invert the row using the shared plate tokens.
 */
export function StudyRow({ study }: { study: Study }) {
  return (
    <Link
      to={`/experiments/${study.slug}`}
      className={cn(
        'group block border-t border-border',
        'transition-colors duration-(--dur-base) ease-(--ease-out)',
        'hover:bg-ink hover:text-on-ink focus-visible:bg-ink focus-visible:text-on-ink'
      )}
    >
      {/*
          1 edition · 5 title · [7 empty] · 3 record · 2 specimen

          Column 7 is left empty and the row breathes vertically. Packed
          1+5+3+2+1 across all twelve at py-5, the index read as a table.
      */}
      <div className="field items-center gap-y-3 px-3 py-6 md:py-9">
        {/* Edition — the left-hand alignment for the whole index */}
        <span className="col-span-2 self-start font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted md:col-span-1 md:self-center">
          {editionLabel(study.edition)}
          <VisitStamp slug={study.slug} />
        </span>

        {/* Title. text-3xl, not text-4xl: at 72px the longer titles wrapped and the
            row heights stopped being regular, which is the one thing an index
            has to get right. */}
        <h3 className="col-span-10 font-display text-2xl uppercase md:col-span-5 md:text-3xl">
          {study.title}
        </h3>

        {/* Record. A small square specimen sits beside it on a phone, where
            the full 16:9 desktop thumbnail below would be too wide for a row
            that's already three lines tall — a thumbnail small enough to sit
            beside the record beats no thumbnail at all. */}
        <div className="col-span-12 flex items-center gap-4 md:col-span-3 md:col-start-8 md:flex-col md:items-start">
          <div className="size-12 shrink-0 overflow-hidden border border-current/25 bg-surface-2 md:hidden">
            {study.poster ? (
              <img
                src={study.poster}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center p-1">
                <ArcFigure
                  rings={studyRings(study, studies)}
                  centre="ink"
                  className="h-full w-auto text-ink opacity-70"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
              {study.technique.join(' / ')}
            </span>
            <span className="font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
              {study.renderer} · {study.year}
            </span>
            {/* Differentiated by weight, not by hue: an orange tag on every
                unfinished row would put three colour events in one viewport
                and the index is not where the colour belongs. */}
            {study.status === 'wip' && (
              <span className="font-meta">In progress</span>
            )}
          </div>
        </div>

        {/* Specimen. `md:` and up only — the phone gets the small square
            thumbnail above instead of this 16:9 one. */}
        <div className="col-span-2 col-start-11 hidden md:block">
          <div className="aspect-[16/9] w-full overflow-hidden border border-current/25 bg-surface-2">
            {study.poster ? (
              <img
                src={study.poster}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              /* No usable capture — the WebGPU compute studies do not draw
                 under headless rendering. The figure is drawn from the study's
                 own record; the grey "No capture" frame it replaces was only
                 an apology. */
              <div className="flex size-full items-center justify-center py-2">
                <ArcFigure
                  rings={studyRings(study, studies)}
                  centre="ink"
                  revealAccentOnInteraction
                  className="h-full w-auto text-ink opacity-70"
                />
              </div>
            )}
          </div>
        </div>

        {/* No arrow in column 12: the whole row inverts to ink on hover and
            focus, which already says "this goes somewhere". */}
      </div>
    </Link>
  );
}
