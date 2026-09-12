export type Vec3 = [number, number, number];
export const TAU = Math.PI * 2;
export const SHELL_RADIUS = 2;
export const MAX_IMPACTS = 8;
export const normalise = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;
  return v.map((n) => n / length) as Vec3;
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export interface Cell {
  centre: Vec3;
  corners: Vec3[];
}

/** Dual of a subdivided icosahedron: shared face centres close every cell. */
export function createShell(frequency = 12): Cell[] {
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 32)
    throw new RangeError('Shell frequency must be an integer from 1 to 32.');
  const p = (1 + Math.sqrt(5)) / 2;
  const base: Vec3[] = [
    [-1, p, 0],
    [1, p, 0],
    [-1, -p, 0],
    [1, -p, 0],
    [0, -1, p],
    [0, 1, p],
    [0, -1, -p],
    [0, 1, -p],
    [p, 0, -1],
    [p, 0, 1],
    [-p, 0, -1],
    [-p, 0, 1],
  ];
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const vertices: Vec3[] = [];
  const neighbours: Vec3[][] = [];
  const keys = new Map<string, number>();
  const vertex = (a: Vec3, b: Vec3, c: Vec3, i: number, j: number) => {
    const v = normalise(
      a.map(
        (n, k) => (n * (frequency - i - j) + b[k] * i + c[k] * j) / frequency
      ) as Vec3
    );
    const key = v.map((n) => n.toFixed(7)).join(',');
    let id = keys.get(key);
    if (id === undefined) {
      id = vertices.length;
      keys.set(key, id);
      vertices.push(v);
      neighbours.push([]);
    }
    return id;
  };
  const triangle = (a: number, b: number, c: number) => {
    const centre = normalise(
      vertices[a].map((n, k) => n + vertices[b][k] + vertices[c][k]) as Vec3
    );
    for (const id of [a, b, c]) neighbours[id].push(centre);
  };
  for (const [ai, bi, ci] of faces) {
    const a = base[ai],
      b = base[bi],
      c = base[ci];
    for (let i = 0; i < frequency; i++)
      for (let j = 0; j < frequency - i; j++) {
        triangle(
          vertex(a, b, c, i, j),
          vertex(a, b, c, i + 1, j),
          vertex(a, b, c, i, j + 1)
        );
        if (i + j < frequency - 1)
          triangle(
            vertex(a, b, c, i + 1, j),
            vertex(a, b, c, i + 1, j + 1),
            vertex(a, b, c, i, j + 1)
          );
      }
  }
  return vertices.map((centre, i) => {
    const tangent = normalise(
      cross(centre, Math.abs(centre[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
    );
    const bitangent = cross(centre, tangent);
    const corners = neighbours[i].sort(
      (a, b) =>
        Math.atan2(dot(a, bitangent), dot(a, tangent)) -
        Math.atan2(dot(b, bitangent), dot(b, tangent))
    );
    return { centre, corners };
  });
}

export interface Impact {
  direction: Vec3;
  time: number;
  strength: number;
}
export function addImpact(impacts: Impact[], impact: Impact): void {
  if (
    !Number.isFinite(impact.time) ||
    !Number.isFinite(impact.strength) ||
    !impact.direction.every(Number.isFinite)
  )
    return;
  impacts.push({
    ...impact,
    direction: normalise(impact.direction),
    strength: Math.max(0, Math.min(2, impact.strength)),
  });
  if (impacts.length > MAX_IMPACTS) impacts.shift();
}
