import { Link, type LinkProps } from 'react-router-dom';
import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const linkVariants = cva(
  // Base styles - applied to all links
  'inline-flex items-center gap-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary link - main navigation style (dim → bright)
        primary: 'text-foreground/60 hover:text-foreground font-medium',

        // Accent link - call-to-action style (medium → bright)
        accent: 'text-primary/80 hover:text-primary font-medium',

        // Subtle link - minimal style (very dim → bright)
        subtle: 'text-muted-foreground hover:text-foreground',

        // Back link - navigation helper (medium → bright)
        back: 'text-primary/70 hover:text-primary text-sm font-medium',

        // Button-like link (solid → more solid + slight lift effect)
        button:
          'bg-primary text-primary-foreground hover:bg-primary hover:shadow-md hover:shadow-primary/25 hover:-translate-y-0.5 px-4 py-2 rounded-md font-medium',

        // Ghost button link (transparent → visible background)
        ghost:
          'text-foreground/70 hover:bg-accent hover:text-accent-foreground px-3 py-2 rounded-md',
      },
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
      },
      underline: {
        none: '',
        hover: 'hover:underline hover:underline-offset-4',
        always: 'underline underline-offset-4',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      underline: 'none',
    },
  }
);

export interface AppLinkProps
  extends Omit<LinkProps, 'className'>,
    VariantProps<typeof linkVariants> {
  className?: string;
  children: React.ReactNode;
}

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  ({ className, variant, size, underline, children, to, ...props }, ref) => {
    const linkClasses = cn(
      linkVariants({ variant, size, underline, className })
    );

    return (
      <Link ref={ref} to={to} className={linkClasses} {...props}>
        {children}
      </Link>
    );
  }
);

AppLink.displayName = 'AppLink';

export { AppLink };
