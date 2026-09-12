import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: ReactNode;
  variant?: 'default' | 'hero' | 'fullscreen';
  className?: string;
  containerClassName?: string;
}

interface PageSectionProps {
  children: ReactNode;
  variant?: 'hero' | 'content';
  className?: string;
}

export function PageLayout({
  children,
  variant = 'default',
  className,
  containerClassName,
}: PageLayoutProps) {
  const baseClasses = 'min-h-screen bg-background relative overflow-hidden';

  const variantClasses = {
    default: 'pt-16',
    hero: '',
    fullscreen: '',
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className={cn('relative z-10', containerClassName)}>{children}</div>
    </div>
  );
}

export function PageSection({
  children,
  variant = 'content',
  className,
}: PageSectionProps) {
  const variantClasses = {
    hero: 'pt-20 pb-16 px-6',
    content: 'px-6 pb-32',
  };

  const containerClasses = {
    hero: 'max-w-6xl mx-auto',
    content: 'max-w-7xl mx-auto',
  };

  return (
    <div className={cn(variantClasses[variant], className)}>
      <div className={containerClasses[variant]}>{children}</div>
    </div>
  );
}
