/** Distance-domain lookahead. Units are scene centimetres and simulation seconds.
 * The viewer accelerates this clock; physical feed limits remain reproducible.
 */
export const ACCELERATION = 2.4;
export interface MotionProfile {
  entry: number;
  peak: number;
  exit: number;
  acceleration: number;
  accelerate: number;
  cruise: number;
  decelerate: number;
}
export function profile(
  length: number,
  entry: number,
  exit: number,
  limit: number
): MotionProfile {
  const peak = Math.min(
    limit,
    Math.sqrt(ACCELERATION * length + (entry * entry + exit * exit) / 2)
  );
  const accelerate = Math.max(0, (peak - entry) / ACCELERATION);
  const decelerate = Math.max(0, (peak - exit) / ACCELERATION);
  const rampDistance =
    ((entry + peak) * accelerate) / 2 + ((exit + peak) * decelerate) / 2;
  return {
    entry,
    peak,
    exit,
    acceleration: ACCELERATION,
    accelerate,
    cruise: Math.max(0, (length - rampDistance) / peak),
    decelerate,
  };
}
export function motionDistance(p: MotionProfile, elapsed: number): number {
  const t = Math.max(0, elapsed);
  if (t <= p.accelerate) return p.entry * t + 0.5 * p.acceleration * t * t;
  const ramp = ((p.entry + p.peak) * p.accelerate) / 2;
  if (t <= p.accelerate + p.cruise) return ramp + (t - p.accelerate) * p.peak;
  const decel = Math.min(p.decelerate, t - p.accelerate - p.cruise);
  return (
    ramp +
    p.cruise * p.peak +
    p.peak * decel -
    0.5 * p.acceleration * decel * decel
  );
}
