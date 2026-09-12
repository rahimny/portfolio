import { clamp, ease } from './process';

/** One reversible contact → merge → stretch → drain envelope. */
export function sampleFusion(progress: number, softness = 0.6) {
  const p = clamp(progress);
  const soft = clamp(softness);
  const contact = ease(p / 0.16);
  const merge = ease((p - 0.12) / 0.3);
  const emergence = ease((p - 0.5) / 0.22);
  const drainage = ease((p - 0.75) / 0.23);
  const presence = contact * (1 - drainage);
  const bridge = ease((p - 0.2) / 0.16) * (1 - ease((p - 0.76) / 0.16));
  return {
    active: presence > 0.0001,
    presence,
    merge,
    emergence,
    drainage,
    spread: 1.08 - merge * 0.49,
    radius: (0.19 + merge * 0.21) * presence * (0.72 + soft * 0.28),
    bridgeRadius: bridge * (0.105 + soft * 0.105) * (1 - emergence * 0.62),
    union: 0.18 + soft * 0.16 + merge * 0.1,
    stage:
      p <= 0 || p >= 0.98
        ? 'idle'
        : p < 0.2
          ? 'contact'
          : p < 0.5
            ? 'coalescence'
            : p < 0.76
              ? 'emergence'
              : 'drainage',
  } as const;
}
