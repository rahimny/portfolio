import {
  BED_Y,
  LAYERS,
  PRINT_HEIGHT,
  type Point,
  type Contour,
  distance,
} from './types';
/** Input is a non-indexed triangle soup, normalised into the machine envelope.
 * STL convention is Z-up; the adapter maps it to this scene's Y-up space.
 */
export function sliceTriangles(
  positions: ArrayLike<number>,
  layers = LAYERS
): Contour[] {
  if (positions.length % 9 !== 0 || positions.length === 0)
    throw new Error('STL has no valid triangles.');
  if (positions.length > 900000)
    throw new Error('Please use an STL with fewer than 100,000 triangles.');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const value = positions[i];
    if (!Number.isFinite(value))
      throw new Error('STL contains invalid coordinates.');
    const axis = i % 3;
    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }
  const span = max.map((v, i) => v - min[i]);
  if (Math.min(...span) < 1e-6)
    throw new Error('Use a three-dimensional, closed STL mesh.');
  const scale = Math.min(2.6 / span[0], 2.6 / span[1], PRINT_HEIGHT / span[2]);
  const height = span[2] * scale;
  const points: Point[] = [];
  for (let i = 0; i < positions.length; i += 3)
    points.push({
      x: (positions[i] - (min[0] + max[0]) / 2) * scale,
      z: (positions[i + 1] - (min[1] + max[1]) / 2) * scale,
      y: (positions[i + 2] - min[2]) * scale + BED_Y + 0.025,
    });
  const contours: Contour[] = [];
  let totalSegments = 0;
  for (let layer = 0; layer < layers; layer++) {
    const y = BED_Y + 0.025 + ((layer + 0.5) / layers) * height;
    const segments: [Point, Point][] = [];
    for (let i = 0; i < points.length; i += 3) {
      const hits: Point[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = points[i + edge],
          b = points[i + ((edge + 1) % 3)];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          const t = (y - a.y) / (b.y - a.y);
          hits.push({ x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t });
        }
      }
      if (hits.length === 2 && distance(hits[0], hits[1]) > 1e-6)
        segments.push([hits[0], hits[1]]);
    }
    totalSegments += segments.length;
    if (totalSegments > 65000 || segments.length > 3000)
      throw new Error(
        'This mesh produces too many contours. Simplify it before uploading.'
      );
    // Spatial buckets join slice endpoints without quadratic contour searches.
    const epsilon = 0.0001;
    const key = (p: Point) =>
      `${Math.round(p.x / epsilon)},${Math.round(p.z / epsilon)}`;
    const buckets = new Map<string, number[]>();
    segments.forEach((segment, index) =>
      segment.forEach((p) => {
        const k = key(p);
        const bucket = buckets.get(k) ?? [];
        bucket.push(index);
        buckets.set(k, bucket);
      })
    );
    const used = new Set<number>();
    for (let start = 0; start < segments.length; start++) {
      if (used.has(start)) continue;
      used.add(start);
      const path = [...segments[start]];
      while (true) {
        const tail = path[path.length - 1];
        const bx = Math.round(tail.x / epsilon),
          bz = Math.round(tail.z / epsilon);
        let next = -1,
          endpoint = 0;
        for (let dx = -1; dx <= 1 && next < 0; dx++)
          for (let dz = -1; dz <= 1 && next < 0; dz++) {
            for (const candidate of buckets.get(`${bx + dx},${bz + dz}`) ??
              []) {
              if (used.has(candidate)) continue;
              for (let end = 0; end < 2; end++)
                if (distance(tail, segments[candidate][end]) < epsilon * 2) {
                  next = candidate;
                  endpoint = end;
                  break;
                }
              if (next >= 0) break;
            }
          }
        if (next < 0) break;
        used.add(next);
        path.push(segments[next][1 - endpoint]);
      }
      contours.push(path);
    }
  }
  if (!contours.length)
    throw new Error('No printable cross-sections found in this STL.');
  return contours;
}
