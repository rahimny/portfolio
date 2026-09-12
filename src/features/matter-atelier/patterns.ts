import type { PrintJob } from './types';
import { BRUSH_BASE } from './process';
import type { EditionGenome } from './living';

export type ArtPoint = { x: number; z: number };
export interface ArtStroke {
  parent: number | null;
  depth: number;
  closed: boolean;
}
export const ART_FAMILIES = [
  'Dendritic grove',
  'Accretion shell',
  'Recursive rosette',
] as const;
export const MAX_ART_STROKES = 28;
export const ART_POINT_BUDGET = 6144;

type GrowthStroke = ArtStroke & { points: ArtPoint[] };
const TAU = Math.PI * 2;
const blend = (a: ArtPoint, b: ArtPoint, t: number): ArtPoint => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});
const offset = (point: ArtPoint, x: number, z: number): ArtPoint => ({
  x: point.x + x,
  z: point.z + z,
});
function randomSource(seed: number) {
  let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function cubic(a: ArtPoint, b: ArtPoint, c: ArtPoint, d: ArtPoint, count = 65) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return blend(
      blend(blend(a, b, t), blend(b, c, t), t),
      blend(blend(b, c, t), blend(c, d, t), t),
      t
    );
  });
}
function at(path: ArtPoint[], fraction: number) {
  const position = Math.max(0, Math.min(1, fraction)) * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(position));
  return blend(path[index], path[index + 1], position - index);
}
/** One continuous contour traces both margins of a frond. Nested edge scales
 * create pinnae and smaller teeth while the zero-width ends meet the stem. */
function frond(centre: ArtPoint[], width: number, divisions: number) {
  return Array.from({ length: 321 }, (_, i) => {
    const u = i / 320;
    const t = u <= 0.5 ? u * 2 : 2 - u * 2;
    const side = u <= 0.5 ? 1 : -1;
    const point = at(centre, t);
    const before = at(centre, Math.max(0, t - 0.01));
    const after = at(centre, Math.min(1, t + 0.01));
    const dx = after.x - before.x,
      dz = after.z - before.z;
    const length = Math.max(1e-8, Math.hypot(dx, dz));
    const edge =
      width *
      Math.sin(Math.PI * t) ** 0.85 *
      (0.72 +
        0.22 * Math.cos(t * TAU * divisions) +
        0.06 * Math.sin(t * TAU * divisions * 2 + side * 0.4));
    return offset(
      point,
      (-dz / length) * edge * side,
      (dx / length) * edge * side
    );
  });
}
function measure(points: ArtPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
    );
  return distances;
}

/** Uniform distances let the tool schedule time independently of curve detail. */
function resample(points: ArtPoint[], count: number): ArtPoint[] {
  const distances = measure(points);
  let cursor = 1;
  return Array.from({ length: count }, (_, i) => {
    const distance = (distances[distances.length - 1] * i) / (count - 1);
    while (cursor < distances.length - 1 && distances[cursor] < distance)
      cursor++;
    const t =
      (distance - distances[cursor - 1]) /
      Math.max(1e-8, distances[cursor] - distances[cursor - 1]);
    return blend(points[cursor - 1], points[cursor], t);
  });
}

/** Curves live in a polar chart: x is angle and z is radial growth. A smooth
 * radial bound keeps every branch away from the shoulder and paper edge without
 * clipping tips flat. The same map preserves exact parent/child attachments. */
export function artComposition(
  job: PrintJob,
  seed: number,
  genome?: EditionGenome
) {
  const random = randomSource(seed);
  const family = Math.floor(random() * ART_FAMILIES.length);
  const orientation = random() * TAU + (genome?.phase ?? 0) * TAU;
  const handedness = random() > 0.5 ? 1 : -1;
  const lobes = Math.max(
    3,
    Math.min(9, genome?.lobes ?? 3 + Math.floor(random() * 6))
  );
  const branching = Math.max(0, Math.min(1, genome?.branching ?? random()));
  const twist = genome?.twist ?? 0.7 + random() * 0.6;
  const contour = job.contours[Math.floor(job.contours.length * 0.5)];
  let contourBound = 0.01;
  for (const point of contour)
    contourBound = Math.max(contourBound, Math.hypot(point.x, point.z));
  const silhouette = (angle: number) => {
    const u = ((((angle / TAU) % 1) + 1) % 1) * (contour.length - 1);
    const a = contour[Math.floor(u)],
      b = contour[Math.min(contour.length - 1, Math.floor(u) + 1)];
    return (
      (Math.hypot(a.x, a.z) * (1 - (u % 1)) + Math.hypot(b.x, b.z) * (u % 1)) /
      contourBound
    );
  };
  const strokes: GrowthStroke[] = [];
  const add = (
    points: ArtPoint[],
    parent: number | null = null,
    closed = false
  ) => {
    const id = strokes.length;
    strokes.push({
      points,
      parent,
      closed,
      depth: parent === null ? 0 : strokes[parent].depth + 1,
    });
    return id;
  };

  if (family === 0) {
    const span = 4.65 + random() * 0.9;
    const sway = random() * TAU;
    const spine = add(
      Array.from({ length: 129 }, (_, i) => {
        const t = i / 128;
        return {
          x: (t - 0.5) * span,
          z: -0.88 + t * 1.7 + Math.sin(t * Math.PI * 1.5 + sway) * 0.13,
        };
      })
    );
    const count = 4 + Math.min(2, Math.floor(branching * 2 + random()));
    const limbs: number[] = [];
    for (let limb = 0; limb < count; limb++) {
      const t = 0.14 + (limb * 0.67) / (count - 1) + (random() - 0.5) * 0.05;
      const root = at(strokes[spine].points, t);
      const side = limb % 2 ? -1 : 1;
      const reach = 0.55 + random() * 0.4;
      const tip = offset(root, 0.26 + random() * 0.29, side * reach);
      limbs.push(
        add(
          cubic(
            root,
            offset(root, 0.11, side * 0.08),
            offset(tip, -0.24, -side * 0.18),
            tip
          ),
          spine
        )
      );
    }
    for (const [limb, parent] of limbs.entries()) {
      for (let twig = 0; twig < 2; twig++) {
        const root = at(strokes[parent].points, 0.44 + twig * 0.3);
        const side = (limb + twig) % 2 ? -1 : 1;
        const tip = offset(
          root,
          0.2 + random() * 0.16,
          side * (0.24 + random() * 0.27)
        );
        const path = frond(
          cubic(
            root,
            offset(root, 0.09, side * 0.02),
            offset(tip, -0.05, side * 0.15),
            tip
          ),
          0.07 + random() * 0.035,
          5 + Math.floor(lobes * 0.7)
        );
        const branch = add(path, parent, true);
        if (twig === 0) {
          const bud = at(path, 0.62);
          add(
            Array.from({ length: 65 }, (_, i) => {
              const t = i / 64;
              const angle = t * Math.PI * 2.3;
              const radius =
                (0.07 + 0.045 * branching) *
                t *
                (1 + Math.sin(angle * 3) * 0.12 + Math.sin(angle * 7) * 0.04);
              return offset(
                bud,
                Math.sin(angle) * radius,
                -side * (1 - Math.cos(angle)) * radius
              );
            }),
            branch
          );
        }
      }
    }
  } else if (family === 1) {
    const turns = 0.78 + random() * 0.14;
    const spine = add(
      Array.from({ length: 385 }, (_, i) => {
        const t = i / 384;
        return {
          x: t * TAU * turns,
          z: -1.45 + t * 2.9 + Math.sin(t * TAU) * 0.09 * twist,
        };
      })
    );
    const count = 6 + Math.min(2, Math.floor(branching * 2 + random()));
    const ribs: number[] = [];
    for (let rib = 0; rib < count; rib++) {
      const t = 0.09 + (rib * 0.76) / count;
      const start = at(strokes[spine].points, t);
      const end = at(strokes[spine].points, t + 0.075 + random() * 0.035);
      const rise = 0.32 + random() * 0.35;
      ribs.push(
        add(
          cubic(
            start,
            offset(start, -0.12, rise),
            offset(end, 0.11, rise * 0.8),
            end,
            97
          ),
          spine
        )
      );
    }
    for (const [index, parent] of ribs.entries()) {
      let vein = parent;
      for (let layer = 0; layer < 2; layer++) {
        const start = at(strokes[parent].points, 0.14 + layer * 0.13);
        const end = at(strokes[parent].points, 0.89 - layer * 0.12);
        const centre = blend(start, end, 0.5);
        const line = cubic(
          start,
          offset(centre, -0.09, -0.23 + layer * 0.09),
          offset(centre, 0.07, -0.16 + layer * 0.065),
          end,
          129
        );
        vein = add(
          line.map((point, i) => {
            const t = i / (line.length - 1);
            return offset(
              point,
              0,
              Math.sin(Math.PI * t) ** 2 *
                (Math.sin(t * TAU * (lobes + 3)) * 0.026 +
                  Math.sin(t * TAU * (lobes + 3) * 2) * 0.008)
            );
          }),
          parent
        );
      }
      if (index % 3 === 1) {
        const root = at(strokes[vein].points, 0.45);
        const radius = 0.03 + random() * 0.025;
        add(
          Array.from({ length: 65 }, (_, i) => {
            const t = i / 64;
            return offset(
              root,
              Math.sin(t * TAU * 1.1) * radius * t,
              (1 - Math.cos(t * TAU * 1.1)) * radius * t
            );
          }),
          vein
        );
      }
    }
  } else {
    const span = 4.9 + random() * 0.75;
    const bias = (random() - 0.5) * 0.45;
    const spine = add(
      Array.from({ length: 129 }, (_, i) => {
        const t = i / 128;
        return {
          x: (t - 0.5) * span,
          z: Math.sin(t * Math.PI * 1.2) * 0.28 + bias,
        };
      })
    );
    const count = 5 + (branching + random() * 0.35 > 0.65 ? 1 : 0);
    for (let flower = 0; flower < count; flower++) {
      const side = flower % 2 ? -1 : 1;
      const root = at(
        strokes[spine].points,
        0.1 + (flower * 0.8) / (count - 1)
      );
      const tip = offset(
        root,
        (random() - 0.5) * 0.3,
        side * (0.21 + random() * 0.24)
      );
      const stalk = add(
        cubic(root, offset(root, 0.12, 0), offset(tip, -0.1, -side * 0.1), tip),
        spine
      );
      const petals = Math.max(
        8,
        Math.min(
          14,
          lobes + 5 + (flower === 0 ? 0 : Math.round(random() * 2 - 1))
        )
      );
      const phase = random() * TAU;
      const width = 0.22 + random() * 0.08;
      const height = 0.4 + random() * 0.12;
      const outline = (angle: number) => {
        const r =
          1 +
          Math.cos(angle * petals + phase) * 0.12 +
          Math.sin(angle * (petals * 2 + 1) + phase) * 0.045 +
          Math.sin(angle * (petals * 4 - 1) - phase) * 0.014;
        const sweep = angle + Math.sin(angle * 2 + phase) * 0.15;
        return {
          x: Math.cos(sweep) * width * r * (1 + Math.sin(angle + phase) * 0.12),
          z: Math.sin(sweep) * height * r * side,
        };
      };
      const first = outline(-Math.PI / 2);
      const bloom = add(
        Array.from({ length: 257 }, (_, i) => {
          const point = outline(-Math.PI / 2 + (i / 256) * TAU);
          return offset(tip, point.x - first.x, point.z - first.z);
        }),
        stalk,
        true
      );
      for (let detail = 0; detail < 2; detail++) {
        const fraction = 0.13 + detail * 0.45;
        const start = at(strokes[bloom].points, fraction);
        const startAngle = -Math.PI / 2 + fraction * TAU;
        const startOutline = outline(startAngle);
        const centre = offset(tip, -first.x, -first.z);
        const turns = 0.82 + random() * 0.28;
        add(
          Array.from({ length: 321 }, (_, i) => {
            const t = i / 320;
            const point = outline(startAngle + t * TAU * turns);
            const radius = 1 - t * (detail ? 0.87 : 0.7);
            return {
              x:
                centre.x +
                point.x * radius +
                (start.x - centre.x - startOutline.x) * (1 - t),
              z:
                centre.z +
                point.z * radius +
                (start.z - centre.z - startOutline.z) * (1 - t),
            };
          }),
          bloom
        );
      }
    }
  }

  const order = strokes
    .map((_, index) => index)
    .sort((a, b) => strokes[a].depth - strokes[b].depth || a - b)
    .slice(0, MAX_ART_STROKES);
  const remap = new Map(order.map((original, index) => [original, index]));
  const mapped = order.map((index) =>
    strokes[index].points.map((point) => {
      const angle =
        orientation +
        handedness * point.x +
        Math.sin(point.z * 2) * (twist - 1) * 0.12;
      const radius =
        1.96 + 0.88 * Math.tanh(point.z + (silhouette(angle) - 0.65) * 0.2);
      return {
        x: BRUSH_BASE.x + Math.cos(angle) * radius,
        z: BRUSH_BASE.z + Math.sin(angle) * radius,
      };
    })
  );
  const lengths = mapped.map((points) => measure(points).at(-1)!);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const budget = ART_POINT_BUDGET - mapped.length * 24;
  const paths = mapped.map((points, i) => {
    const count = Math.min(
      768,
      24 + Math.floor((budget * lengths[i]) / Math.max(totalLength, 0.001))
    );
    const path = resample(points, count);
    if (strokes[order[i]].closed) path[path.length - 1] = { ...path[0] };
    return path;
  });
  return {
    name: ART_FAMILIES[family],
    paths,
    strokes: order.map(
      (index): ArtStroke => ({
        parent:
          strokes[index].parent === null
            ? null
            : remap.get(strokes[index].parent)!,
        depth: strokes[index].depth,
        closed: strokes[index].closed,
      })
    ),
  };
}
