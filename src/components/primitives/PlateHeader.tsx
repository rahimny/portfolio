import { cn } from '@/lib/utils';

/**
 * The heading that opens a plate. Three type tiers run through the site, far
 * enough apart to read as a hierarchy:
 *
 *     hero      --text-hero    the name, once per page
 *     section   --text-3xl     what this plate is          ← this component
 *     row       --text-xl      one entry inside it
 *
 * `context` and `meta` stay in the mono voice: the title says what the section
 * is, the mono says where and when. Colour comes from `currentColor`, so this
 * works unchanged on paper, ink and orange.
 */
export function PlateHeader({
  title,
  context,
  meta,
  className,
}: {
  /** What the section is. Set in display type. */
  title: string;
  /** Optional qualifier beside the title — an employer, a source. */
  context?: string;
  /** Optional fact hard against the right margin — a date range, a count. */
  meta?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-current/25 pb-4',
        className
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl uppercase leading-none md:text-3xl">
          {title}
        </h2>
        {context && <p className="font-meta text-dim">{context}</p>}
      </div>
      {meta && <p className="font-meta text-dim">{meta}</p>}
    </header>
  );
}
