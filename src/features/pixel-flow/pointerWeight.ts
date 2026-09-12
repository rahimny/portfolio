/** Inverse-distance kernel shared by the artwork and its prepared field plate. */
export function pointerWeight(distanceSquared: number, radius: number): number {
  if (distanceSquared < 0 || radius <= 0 || distanceSquared >= radius * radius)
    return 0;
  return Math.min(10, radius / Math.max(1e-9, Math.sqrt(distanceSquared)));
}
