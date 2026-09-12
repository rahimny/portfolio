/**
 * Integral Apollonian window via Descartes' recurrence.
 *
 * Start with four mutually tangent circles (curvatures −1, 2, 2, 3). Each
 * Descartes quadruple produces four children: the other Soddy circle of each
 * triple, k′ = 2(ka+kb+kc) − kd. Every radius is determined; nothing is placed.
 *
 * Circles are returned largest-first so a growth threshold can reveal them in
 * the order they nucleate.
 */

export const GASKET_CIRCLE_CAP = 192;

export interface GasketCircle {
  x: number;
  y: number;
  /** Curvature k = 1 / signed radius. Outer bounding circle is k = −1. */
  k: number;
  /** BFS depth. 0 = the four generators. */
  gen: number;
}

interface Quad {
  a: number;
  b: number;
  c: number;
  d: number;
}

function circleKey(k: number, x: number, y: number): string {
  return `${Math.round(k * 1000)}:${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

function otherSoddy(
  a: GasketCircle,
  b: GasketCircle,
  c: GasketCircle,
  d: GasketCircle,
  gen: number
): GasketCircle {
  const k = 2 * (a.k + b.k + c.k) - d.k;
  const bx = 2 * (a.k * a.x + b.k * b.x + c.k * c.x) - d.k * d.x;
  const by = 2 * (a.k * a.y + b.k * b.y + c.k * c.y) - d.k * d.y;
  return { k, x: bx / k, y: by / k, gen };
}

export function packGasket(
  cap = GASKET_CIRCLE_CAP,
  kMax = 220
): GasketCircle[] {
  const seeds: GasketCircle[] = [
    { x: 0, y: 0, k: -1, gen: 0 },
    { x: -0.5, y: 0, k: 2, gen: 0 },
    { x: 0.5, y: 0, k: 2, gen: 0 },
    { x: 0, y: 2 / 3, k: 3, gen: 0 },
  ];

  const circles = [...seeds];
  const seen = new Set(seeds.map((c) => circleKey(c.k, c.x, c.y)));
  const queue: Quad[] = [{ a: 0, b: 1, c: 2, d: 3 }];

  const tryPush = (
    p: GasketCircle,
    q: GasketCircle,
    r: GasketCircle,
    s: GasketCircle,
    ip: number,
    iq: number,
    ir: number
  ) => {
    if (circles.length >= cap) return;
    const gen = Math.max(p.gen, q.gen, r.gen, s.gen) + 1;
    const child = otherSoddy(p, q, r, s, gen);
    if (!Number.isFinite(child.k) || child.k <= 0 || child.k > kMax) return;
    const key = circleKey(child.k, child.x, child.y);
    if (seen.has(key)) return;
    const radius = 1 / child.k;
    if (Math.hypot(child.x, child.y) + radius > 1.02) return;
    seen.add(key);
    const index = circles.length;
    circles.push(child);
    queue.push({ a: ip, b: iq, c: ir, d: index });
  };

  let head = 0;
  while (head < queue.length && circles.length < cap) {
    const { a, b, c, d } = queue[head++];
    const A = circles[a];
    const B = circles[b];
    const C = circles[c];
    const D = circles[d];
    tryPush(B, C, D, A, b, c, d);
    tryPush(A, C, D, B, a, c, d);
    tryPush(A, B, D, C, a, b, d);
    tryPush(A, B, C, D, a, b, c);
  }

  return circles.sort((left, right) => Math.abs(left.k) - Math.abs(right.k));
}
