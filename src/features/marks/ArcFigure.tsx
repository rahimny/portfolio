import { cn } from '@/lib/utils';

/**
 * A constructed figure: concentric hairline circles, thick partial arcs, a disc
 * at the centre.
 *
 * Every ring shares a start angle at twelve o'clock and a
 * common radial step, which makes the sweeps directly readable against each
 * other: a longer arc is a bigger number, and the gap is the remainder. The
 * full hairline circle under each arc is what makes that legible; without it
 * an arc has nothing to be a fraction of.
 */

export interface Ring {
  /** 0–1. The fraction of the circle the heavy arc covers. */
  sweep: number;
  /** Heavy arcs read as present; light ones as secondary. */
  weight?: 'heavy' | 'light';
  /** Paint this ring in the accent. At most one per figure. */
  accent?: boolean;
}

const VIEW = 200;
const C = VIEW / 2;

/** Arc path from twelve o'clock, clockwise, as a fraction of the circle. */
function arc(r: number, sweep: number): string {
  // A full circle cannot be expressed as a single arc — its start and end
  // points coincide — so clamp just short and let it read as closed.
  const t = Math.min(Math.max(sweep, 0), 0.999);
  const a = t * Math.PI * 2 - Math.PI / 2;
  const x = C + r * Math.cos(a);
  const y = C + r * Math.sin(a);
  return `M${C} ${C - r} A${r} ${r} 0 ${t > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
}

export function ArcFigure({
  rings,
  centre = 'accent',
  revealAccentOnInteraction = false,
  className,
}: {
  rings: readonly Ring[];
  /** The disc at the middle. `none` leaves the construction open. */
  centre?: 'accent' | 'ink' | 'none';
  /**
   * Keep the accent in the figure's base colour until an ancestor `group` is
   * hovered or keyboard-focused. Useful when the figure sits inside a link:
   * the orange becomes the affordance without inverting the whole drawing.
   */
  revealAccentOnInteraction?: boolean;
  className?: string;
}) {
  // Reserve the middle for the disc, then divide what is left evenly, so the
  // radial step is the same whether there are three rings or nine. The gap
  // between rings has to stay comfortably wider than the heavy stroke or the
  // construction closes up and reads as a dartboard.
  const rMin = VIEW * 0.11;
  const rMax = VIEW * 0.47;
  const step = rings.length > 1 ? (rMax - rMin) / (rings.length - 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden="true"
      className={cn('block h-full w-full', className)}
    >
      {/* The measure: every ring's full circle, hairline. */}
      {rings.map((_, i) => (
        <circle
          key={`guide-${i}`}
          cx={C}
          cy={C}
          r={rMin + i * step}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          opacity="0.35"
        />
      ))}

      {/* The reading: each ring's arc. */}
      {rings.map((ring, i) => (
        <path
          key={`arc-${i}`}
          d={arc(rMin + i * step, ring.sweep)}
          fill="none"
          stroke="currentColor"
          strokeWidth={ring.weight === 'light' ? 1.5 : 5}
          strokeLinecap="butt"
          className={
            ring.accent
              ? cn(
                  'transition-colors duration-(--dur-base) ease-(--ease-out)',
                  revealAccentOnInteraction
                    ? 'group-hover:text-brand group-focus-visible:text-brand'
                    : 'text-brand'
                )
              : undefined
          }
        />
      ))}

      {centre !== 'none' && (
        <circle
          cx={C}
          cy={C}
          r={rMin * 0.58}
          className={centre === 'accent' ? 'text-brand' : undefined}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
