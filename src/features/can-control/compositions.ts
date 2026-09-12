import {
  buildScore,
  DEFAULT_SETTINGS,
  type Path,
  type Point,
  type Preset,
  type Score,
  type Settings,
} from './model';

export const ART_SETTINGS: Settings = { ...DEFAULT_SETTINGS, cap: 'fat' };

export type Artwork = 'hush' | 'ribbon' | 'contours';
export type Selection = Preset | Artwork;
export const isArtwork = (value: Selection): value is Artwork =>
  value === 'hush' || value === 'ribbon' || value === 'contours';
type Pair = [number, number];
type Curve = [Pair, Pair, Pair];

/** Original centreline construction. Curves describe pen motion, not font outlines. */
function stroke(start: Pair, ...curves: Curve[]): Point[] {
  const points: Point[] = [{ x: start[0], y: start[1] }];
  let from = start;
  for (const [a, b, end] of curves) {
    for (let i = 1; i <= 40; i++) {
      const t = i / 40,
        u = 1 - t;
      points.push({
        x:
          u ** 3 * from[0] +
          3 * u * u * t * a[0] +
          3 * u * t * t * b[0] +
          t ** 3 * end[0],
        y:
          u ** 3 * from[1] +
          3 * u * u * t * a[1] +
          3 * u * t * t * b[1] +
          t ** 3 * end[1],
      });
    }
    from = end;
  }
  return points;
}

export function artworkPath(artwork: Artwork): Path {
  if (artwork === 'ribbon')
    return [
      Array.from({ length: 241 }, (_, i) => {
        const t = (i / 240) * Math.PI * 2;
        return {
          x: 1.6 + (1.2 * Math.sin(t)) / (1 + 0.45 * Math.cos(t) ** 2),
          y: 1.2 + (0.77 * Math.sin(t * 2)) / (1 + 0.3 * Math.cos(t) ** 2),
        };
      }),
    ];
  if (artwork === 'contours')
    return Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 101 }, (_, i) => {
        const t = i / 100;
        return {
          x: 0.3 + t * 2.6,
          y:
            0.42 +
            row * 0.34 +
            Math.sin(t * Math.PI) *
              Math.sin(t * Math.PI * 2 + row * 0.28) *
              0.23,
        };
      })
    );
  return [
    stroke(
      [0.16, 1.84],
      [
        [0.43, 2.1],
        [0.66, 1.99],
        [0.47, 1.73],
      ],
      [
        [0.39, 1.32],
        [0.24, 0.88],
        [0.21, 0.69],
      ]
    ),
    stroke(
      [0.88, 1.91],
      [
        [0.76, 1.59],
        [0.63, 0.97],
        [0.62, 0.69],
      ]
    ),
    stroke(
      [0.15, 1.24],
      [
        [0.34, 1.39],
        [0.65, 1.22],
        [0.91, 1.43],
      ]
    ),
    stroke(
      [1.12, 1.79],
      [
        [1.03, 1.47],
        [0.87, 0.74],
        [1.12, 0.7],
      ],
      [
        [1.36, 0.65],
        [1.47, 1.41],
        [1.56, 1.86],
      ]
    ),
    stroke(
      [2.15, 1.67],
      [
        [2.1, 1.97],
        [1.65, 1.87],
        [1.64, 1.5],
      ],
      [
        [1.63, 1.24],
        [2.12, 1.23],
        [2.04, 0.92],
      ],
      [
        [1.97, 0.61],
        [1.59, 0.64],
        [1.55, 0.83],
      ]
    ),
    stroke(
      [2.45, 1.92],
      [
        [2.35, 1.6],
        [2.21, 1.0],
        [2.17, 0.69],
      ]
    ),
    stroke(
      [2.99, 2.02],
      [
        [2.78, 1.61],
        [2.74, 0.99],
        [2.72, 0.69],
      ],
      [
        [2.79, 0.57],
        [2.98, 0.83],
        [3.02, 1.0],
      ]
    ),
    stroke(
      [2.15, 1.27],
      [
        [2.37, 1.39],
        [2.68, 1.24],
        [2.99, 1.49],
      ]
    ),
    stroke(
      [0.24, 0.53],
      [
        [0.72, 0.18],
        [1.98, 0.43],
        [2.96, 0.61],
      ]
    ),
    stroke(
      [0.32, 2.1],
      [
        [0.76, 2.25],
        [1.02, 2.2],
        [1.24, 2.12],
      ]
    ),
  ];
}

/** Each gesture owns a valve/standoff/tempo envelope, all performed by the rig. */
export function artworkScore(artwork: Artwork, settings: Settings): Score {
  const score = buildScore(artworkPath(artwork), settings);
  let start = 0,
    strokeIndex = 0;
  while (start < score.motions.length) {
    if (!score.motions[start].valve) {
      start++;
      continue;
    }
    let end = start;
    while (end < score.motions.length && score.motions[end].valve) end++;
    const length = score.motions
      .slice(start, end)
      .reduce(
        (sum, m) => sum + Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y),
        0
      );
    let travelled = 0;
    const crossbar = artwork === 'hush' && [2, 7, 9].includes(strokeIndex);
    const flare = artwork === 'hush' && [0, 6, 8].includes(strokeIndex);
    const distance = (t: number) => {
      const entry = flare ? Math.max(0, 1 - t / 0.13) ** 2 * 0.18 : 0;
      const exit = flare ? Math.max(0, (t - 0.82) / 0.18) ** 1.3 * 0.27 : 0;
      return Math.min(0.8, settings.distance + entry + exit);
    };
    for (let i = start; i < end; i++) {
      const motion = score.motions[i];
      const a = travelled / length;
      travelled += Math.hypot(
        motion.to.x - motion.from.x,
        motion.to.y - motion.from.y
      );
      const b = travelled / length;
      motion.from.distance = distance(a);
      motion.to.distance = distance(b);
      const tempo = artwork === 'hush' ? (crossbar ? 1.15 : 0.72) : 1;
      motion.duration /= tempo;
      motion.valve = flare
        ? 0.65 + 0.35 * Math.sin((Math.PI * (a + b)) / 2)
        : 1;
    }
    score.motions[start - 1].to = { ...score.motions[start].from };
    if (end < score.motions.length)
      score.motions[end].from = { ...score.motions[end - 1].to };
    strokeIndex++;
    start = end;
  }
  score.duration = score.motions.reduce((sum, m) => sum + m.duration, 0);
  return score;
}
