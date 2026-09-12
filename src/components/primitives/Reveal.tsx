import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Direction = 'up' | 'down' | 'none';

const HIDDEN: Record<Direction, string> = {
  up: 'opacity-0 translate-y-6',
  down: 'opacity-0 -translate-y-6',
  none: 'opacity-0',
};

interface RevealProps {
  children: ReactNode;
  /** Stagger within a group, in ms. */
  delay?: number;
  direction?: Direction;
  /** Re-animate every time it re-enters, rather than once. */
  repeat?: boolean;
  className?: string;
}

/**
 * Scroll-triggered entrance. Replaces the one-off `animate-in fade-in
 * slide-in-from-bottom-4` string that appeared on exactly one element.
 *
 * Uses IntersectionObserver, never a scroll listener — driving transforms from
 * scroll events is the single most reliable way to make a page feel janky.
 *
 * Under reduced motion the content renders visible immediately and no observer
 * is ever created.
 */
export function Reveal({
  children,
  delay = 0,
  direction = 'up',
  repeat = false,
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;

    // Fail open. Content must never be left invisible because an observer
    // could not be created — the hidden state is an animation detail, not a
    // visibility decision.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (!repeat) observer.disconnect();
        } else if (repeat) {
          setVisible(false);
        }
      },
      // Fire slightly before the element reaches the viewport edge, so the
      // motion reads as "already underway" rather than "triggered by me".
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [repeat, reducedMotion]);

  const shown = reducedMotion || visible;

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-[var(--dur-slow)] ease-(--ease-out) motion-reduce:transition-none',
        shown ? 'opacity-100 translate-y-0' : HIDDEN[direction],
        className
      )}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
