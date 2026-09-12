import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Width = 'prose' | 'content' | 'wide' | 'full';
type Spacing = 'none' | 'tight' | 'default' | 'loose';

const WIDTH: Record<Width, string> = {
  prose: 'max-w-[var(--measure)]',
  content: 'max-w-5xl',
  wide: 'max-w-[var(--content-max)]',
  full: 'max-w-none',
};

const SPACING: Record<Spacing, string> = {
  none: '',
  tight: 'py-[calc(var(--section-y)*0.5)]',
  default: 'py-[var(--section-y)]',
  loose: 'py-[calc(var(--section-y)*1.5)]',
};

interface SectionProps {
  children: ReactNode;
  as?: ElementType;
  width?: Width;
  spacing?: Spacing;
  className?: string;
  /** Escape hatch for full-bleed backgrounds that still want a contained child. */
  outerClassName?: string;
  id?: string;
}

/**
 * The only thing in the app allowed to decide vertical rhythm or measure.
 *
 * Replaces the previous ad-hoc `pt-20 pb-16 px-6` / `px-6 pb-32` /
 * `mb-12 md:mb-16` spacing, which was decided per element.
 */
export function Section({
  children,
  as: Tag = 'section',
  width = 'wide',
  spacing = 'default',
  className,
  outerClassName,
  id,
}: SectionProps) {
  return (
    <Tag
      id={id}
      className={cn('px-[var(--gutter)]', SPACING[spacing], outerClassName)}
    >
      <div className={cn('mx-auto w-full', WIDTH[width], className)}>
        {children}
      </div>
    </Tag>
  );
}
