import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A plate: one full-bleed band of the page, on one of three grounds.
 *
 * The page is a stack of these. Each carries its own ground, its own hairline
 * rule and its own registration marks, which is why the marks are drawn here
 * rather than as one fixed overlay on the viewport: a fixed overlay cannot know
 * whether it is currently over paper, ink or orange, so its marks either
 * disappear on one ground or need a blend mode that goes wrong on the orange.
 * Drawn per plate they inherit `currentColor` and are always correct — and
 * crop marks belonging to the panel they register is the honest version of the
 * idea anyway.
 *
 * `tone` also sets the `on-ink` / `on-brand` class the focus-ring rule in
 * index.css keys off, so keyboard focus stays visible on every ground.
 */

type Tone = 'paper' | 'surface' | 'ink' | 'brand';
type Spacing = 'none' | 'tight' | 'default' | 'loose';

const TONE: Record<Tone, string> = {
  paper: 'bg-bg text-fg',
  surface: 'bg-surface text-fg',
  ink: 'on-ink bg-ink text-on-ink',
  brand: 'on-brand bg-brand text-on-brand',
};

const SPACING: Record<Spacing, string> = {
  none: '',
  tight: 'py-[calc(var(--section-y)*0.4)]',
  default: 'py-[var(--section-y)]',
  loose: 'py-[calc(var(--section-y)*1.4)]',
};

/** A single crop mark. 13px arms, hairline, always currentColor. */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 13 13"
      className={cn(
        'pointer-events-none absolute size-3 opacity-40',
        className
      )}
    >
      <path
        d="M6.5 0v13M0 6.5h13"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface PlateProps {
  children: ReactNode;
  as?: ElementType;
  tone?: Tone;
  spacing?: Spacing;
  /** Hairline rule along the top edge of the content column. */
  rule?: boolean;
  /** Crop marks at the top two corners of the content column. */
  marks?: boolean;
  id?: string;
  className?: string;
  /** Escape hatch for the full-bleed element, outside the content column. */
  outerClassName?: string;
}

export function Plate({
  children,
  as: Tag = 'section',
  tone = 'paper',
  spacing = 'default',
  rule = false,
  marks = false,
  id,
  className,
  outerClassName,
}: PlateProps) {
  return (
    <Tag id={id} className={cn('relative w-full', TONE[tone], outerClassName)}>
      <div
        className={cn(
          'relative mx-auto w-full max-w-[var(--content-max)] px-[var(--gutter)]',
          SPACING[spacing],
          className
        )}
      >
        {/* Top corners only. Plates are stacked full-bleed, so marking all
            four corners puts two pairs within a few pixels of every boundary
            and the doubling reads as an accident rather than as registration.
            One pair per plate marks where each one starts. */}
        {marks && (
          <>
            <Mark className="left-[calc(var(--gutter)-0.375rem)] top-[calc(var(--gutter)*0.5)]" />
            <Mark className="right-[calc(var(--gutter)-0.375rem)] top-[calc(var(--gutter)*0.5)]" />
          </>
        )}
        {rule && (
          <hr className="mb-6 border-0 border-t border-current opacity-25" />
        )}
        {children}
      </div>
    </Tag>
  );
}
