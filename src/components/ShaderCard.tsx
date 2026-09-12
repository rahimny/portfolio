import { Link } from 'react-router-dom';
import type { StudyVariant } from '@/features/lab/registry';

interface ShaderCardProps {
  variant: StudyVariant;
}

/**
 * One shader in the gallery. Category is set as a plain fact rather than a
 * colour, keeping the one-hue-per-viewport rule; the poster comes from the
 * registry, which also records an intentional absence where a shader has no
 * honest capture.
 *
 * Same frame as `StudyRow`: hairline, square, inverts to ink on hover. It is a
 * `Link` rather than a div with an onClick, so it is reachable by keyboard and
 * openable in a new tab.
 */
export function ShaderCard({ variant }: ShaderCardProps) {
  return (
    <Link
      to={variant.slug}
      className="group flex h-full flex-col border border-border bg-surface transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-ink hover:text-on-ink focus-visible:bg-ink focus-visible:text-on-ink"
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-current/20 bg-surface-2">
        {variant.poster ? (
          <img
            src={variant.poster}
            alt={`Still frame of ${variant.title}`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
            No capture
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl uppercase leading-none">
            {variant.title}
          </h3>
          <span className="shrink-0 font-meta text-fg-subtle group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
            {variant.family}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-fg-muted group-hover:text-on-ink-muted group-focus-visible:text-on-ink-muted">
          {variant.summary}
        </p>
      </div>
    </Link>
  );
}
