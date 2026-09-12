import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared indexed row: number in column 1, title in 2–6, body in 8–12.
 * First-baseline alignment keeps the three type sizes on the same reading line.
 */
export function IndexRow({
  index,
  title,
  meta,
  children,
  className,
}: {
  /** Rendered zero-padded. Position in the list, not an edition number. */
  index: number;
  title: string;
  /** Optional mono line under the title — a category, a discipline. */
  meta?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'field items-baseline gap-y-3 border-t border-current/20 py-7 md:py-9',
        className
      )}
    >
      <span className="col-span-2 font-meta text-dim md:col-span-1">
        {String(index).padStart(2, '0')}
      </span>

      <div className="col-span-10 md:col-span-5">
        <h3 className="font-display text-xl uppercase leading-tight xl:text-2xl">
          {title}
        </h3>
        {meta && <p className="mt-2 font-meta text-dim">{meta}</p>}
      </div>

      <p className="col-span-12 max-w-[var(--measure)] text-base leading-relaxed text-dim md:col-span-5 md:col-start-8">
        {children}
      </p>
    </div>
  );
}
