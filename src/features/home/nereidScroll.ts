const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type NereidChapter = 0 | 1 | 2;

export function scrollEase(start: number, end: number, value: number) {
  const t = clamp((value - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** The score is positional: reversing or seeking never runs physics backwards. */
export function nereidScrollPose(progress: number) {
  const p = clamp(Number.isFinite(progress) ? progress : 0);
  const arrival = scrollEase(0, 0.38, p);
  const settle = scrollEase(0.26, 0.43, p);
  // The final swimming stroke eases into the opening while tentacles keep flowing.
  const opening = scrollEase(0.27, 0.76, p);
  const chapter: NereidChapter = p < 0.31 ? 0 : p < 0.64 ? 1 : 2;
  return {
    progress: p,
    chapter,
    arrival,
    opening,
    separation: opening * 0.72,
    // Give the entrance more of the recorded stroke without freezing the reveal.
    swim: scrollEase(0, 1, Math.pow(p, 0.7)),
    swimWeight: 1 - settle,
    limbWeight: 1,
    roll: 0.9 * (1 - settle) + 0.035 + Math.sin(opening * Math.PI) * 0.12,
    pitch: Math.sin(opening * Math.PI) * -0.1,
    yaw: -0.8 + arrival + opening * 1.45,
    shellTwist: opening * 0.22,
    span: 9.2 + settle * 2.6 + opening * 3.8,
    phase: p < 0.27 ? 'arrival' : 'anatomy',
  };
}

export function nereidScrollProgress(
  top: number,
  height: number,
  viewport: number,
  stageHeight: number,
  stickyTop: number
) {
  const entry = viewport * 0.8;
  return clamp(
    (entry - top) / Math.max(1, height - stageHeight + entry - stickyTop)
  );
}

/** Exact exponential response, with bounded catch-up after a large scroll jump. */
export function dampNereidScroll(
  current: number,
  target: number,
  delta: number
) {
  if (!Number.isFinite(delta) || delta <= 0) return current;
  const bounded = Math.max(target - 0.18, Math.min(target + 0.18, current));
  const next = target + (bounded - target) * Math.exp(-5.5 * delta);
  return Math.abs(next - target) < 0.00005 ? target : next;
}
