export interface InkPoint {
  x: number;
  y: number;
}

/** Fraction of a straight frame segment spent inside a particle's influence disc.
 * Analytic interval overlap prevents slow frames from applying a whole frame's
 * force to every particle crossed by a fast projectile.
 */
export function sweptExposure(
  along: number,
  across: number,
  travel: number,
  radius: number
): number {
  if (travel <= 0 || Math.abs(across) >= radius) return 0;
  const half = Math.sqrt(radius * radius - across * across);
  return (
    Math.max(0, Math.min(travel, along + half) - Math.max(0, along - half)) /
    travel
  );
}
