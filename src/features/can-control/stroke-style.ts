import type { Score, Settings } from './model';

export type StrokeStyle = {
  reach: number;
  span: number;
  placement: 'scored' | 'entry' | 'exit' | 'both';
};
export const DEFAULT_STROKE_STYLE: StrokeStyle = {
  reach: 0.27,
  span: 0.25,
  placement: 'scored',
};

/** Standoff is an envelope along the centreline, never an extra paint stamp. */
export function styleScore(
  source: Score,
  settings: Settings,
  style: StrokeStyle,
  accents?: readonly number[]
): Score {
  if (
    !Number.isFinite(style.reach) ||
    style.reach < 0 ||
    style.reach > 0.5 ||
    !Number.isFinite(style.span) ||
    style.span < 0.1 ||
    style.span > 0.5 ||
    !['scored', 'entry', 'exit', 'both'].includes(style.placement)
  )
    throw new Error('Unsupported flare settings.');
  const score = structuredClone(source);
  let index = 0,
    stroke = 0;
  while (index < score.motions.length) {
    if (!score.motions[index].valve) {
      index++;
      continue;
    }
    const start = index;
    while (index < score.motions.length && score.motions[index].valve) index++;
    const moves = score.motions.slice(start, index);
    const length = moves.reduce(
      (sum, m) => sum + Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y),
      0
    );
    const enabled =
      length > 1e-8 &&
      (style.placement !== 'scored' || !accents || accents.includes(stroke));
    const envelope = (t: number) => {
      if (!enabled) return 0;
      const entry = style.placement === 'entry' || style.placement === 'both';
      const exit = style.placement !== 'entry';
      return Math.max(
        entry ? Math.max(0, 1 - t / style.span) ** 1.35 : 0,
        exit ? Math.max(0, (t - (1 - style.span)) / style.span) ** 1.35 : 0
      );
    };
    let travelled = 0;
    for (const motion of moves) {
      const a = length ? travelled / length : 0;
      travelled += Math.hypot(
        motion.to.x - motion.from.x,
        motion.to.y - motion.from.y
      );
      const b = length ? travelled / length : 0;
      motion.from.distance = Math.min(
        0.8,
        settings.distance + style.reach * envelope(a)
      );
      motion.to.distance = Math.min(
        0.8,
        settings.distance + style.reach * envelope(b)
      );
      // Ease off the valve during the pull-away, keeping the core clean.
      motion.valve = 1 - 0.35 * (style.reach / 0.5) * envelope((a + b) / 2);
    }
    if (start > 0) score.motions[start - 1].to = { ...moves[0].from };
    if (index < score.motions.length)
      score.motions[index].from = { ...moves[moves.length - 1].to };
    stroke++;
  }
  return score;
}
