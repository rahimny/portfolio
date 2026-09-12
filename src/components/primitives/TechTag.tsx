import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const tagVariants = cva(
  'inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap border transition-colors duration-(--dur-fast)',
  {
    variants: {
      variant: {
        /* Technical metadata: renderer, language, library. */
        default: 'border-border bg-surface-2 text-fg-muted',
        /* Shipped and working. Orange, because active === brand. */
        live: 'border-transparent bg-status-live-bg text-status-live',
        /* In progress. Ink, not a second hue — colour stays rationed. */
        wip: 'border-border bg-status-wip-bg text-status-wip',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-2xs',
        md: 'px-2 py-1 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'sm' },
  }
);

interface TechTagProps extends VariantProps<typeof tagVariants> {
  children: ReactNode;
  className?: string;
}

/** Status and technical metadata use the shared colour tokens. */
export function TechTag({ children, variant, size, className }: TechTagProps) {
  return (
    <span className={cn(tagVariants({ variant, size }), className)}>
      {children}
    </span>
  );
}

export function TagRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {children}
    </div>
  );
}
