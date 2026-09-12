import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'base' | 'lead';

const SIZE: Record<Size, string> = {
  sm: 'text-sm leading-relaxed',
  base: 'text-base leading-relaxed',
  lead: 'text-xl leading-[1.6] text-fg-muted',
};

interface ProseProps {
  children: ReactNode;
  as?: ElementType;
  size?: Size;
  /** Narrower measure for lead paragraphs and pull quotes. */
  tight?: boolean;
  className?: string;
}

/**
 * Enforces measure. Any run of body copy goes through this.
 *
 * The old hero paragraph had no max-width and ran ~95 characters per line at
 * 1440px; anything past ~75 costs the reader the line return.
 */
export function Prose({
  children,
  as: Tag = 'p',
  size = 'base',
  tight = false,
  className,
}: ProseProps) {
  return (
    <Tag
      className={cn(
        SIZE[size],
        tight ? 'max-w-[var(--measure-tight)]' : 'max-w-[var(--measure)]',
        'text-pretty',
        className
      )}
    >
      {children}
    </Tag>
  );
}
