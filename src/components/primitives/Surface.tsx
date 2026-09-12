import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The one card surface.
 *
 * Previously this exact ~14-class string was hardcoded in three places
 * (BaseCard, ContributionCard, ShaderCard), so changing hover behaviour meant
 * changing it three times and hoping they stayed in sync.
 */
const surfaceVariants = cva(
  'relative rounded-lg border transition-[background-color,border-color,box-shadow,transform] duration-(--dur-base) ease-(--ease-out)',
  {
    variants: {
      tone: {
        raised: 'border-border bg-surface shadow-sm',
        sunken: 'border-border bg-surface-2',
        outline: 'border-border bg-transparent',
      },
      interactive: {
        true: 'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md motion-reduce:hover:translate-y-0',
        false: '',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: { tone: 'raised', interactive: false, padding: 'md' },
  }
);

interface SurfaceProps extends VariantProps<typeof surfaceVariants> {
  children: ReactNode;
  className?: string;
}

export function Surface({
  children,
  tone,
  interactive,
  padding,
  className,
}: SurfaceProps) {
  return (
    <div
      className={cn(surfaceVariants({ tone, interactive, padding }), className)}
    >
      {children}
    </div>
  );
}
