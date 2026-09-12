import {
  v,
  add,
  mul,
  rotate,
  qmul,
  axis,
  identity,
  qlerp,
  lerp,
  clamp,
  sub,
  length,
  inverse,
  between,
  dot,
  type Vec3,
  type Quat,
} from '../scene-interactions/math';
export interface Joint {
  name: string;
  parent: number;
  offset: Vec3;
  rest: Quat;
  length: number;
  radius: number;
  finger: number;
  segment: number;
}
export const JOINTS: Joint[] = [
  {
    name: 'palm',
    parent: -1,
    offset: v(),
    rest: identity(),
    length: 0,
    radius: 0.4,
    finger: -1,
    segment: -1,
  },
];
const digits = [
  {
    name: 'index',
    x: -0.43,
    y: 0.56,
    lengths: [0.49, 0.34, 0.26],
    r: 0.145,
    spread: 0.035,
  },
  {
    name: 'middle',
    x: -0.12,
    y: 0.64,
    lengths: [0.55, 0.38, 0.29],
    r: 0.155,
    spread: 0,
  },
  {
    name: 'ring',
    x: 0.2,
    y: 0.59,
    lengths: [0.49, 0.34, 0.26],
    r: 0.148,
    spread: -0.04,
  },
  {
    name: 'little',
    x: 0.49,
    y: 0.45,
    lengths: [0.38, 0.27, 0.23],
    r: 0.125,
    spread: -0.12,
  },
  {
    name: 'thumb',
    x: -0.48,
    y: -0.14,
    lengths: [0.4, 0.31, 0.25],
    r: 0.18,
    spread: 0.92,
  },
];
digits.forEach((d, finger) =>
  d.lengths.forEach((l, segment) =>
    JOINTS.push({
      name: `${d.name}-${segment}`,
      parent: segment === 0 ? 0 : JOINTS.length - 1,
      offset:
        segment === 0
          ? v(d.x, d.y, finger === 4 ? 0.06 : 0)
          : v(0, d.lengths[segment - 1], 0),
      rest: segment === 0 ? axis(v(0, 0, 1), d.spread) : identity(),
      length: l,
      radius: d.r * (1 - segment * 0.12),
      finger,
      segment,
    })
  )
);
export type PoseName =
  | 'open'
  | 'fist'
  | 'point'
  | 'gun'
  | 'pinch'
  | 'beckon'
  | 'palm-up'
  | 'thumbs-up';
export interface HandPose {
  root: Vec3;
  rotation: Quat;
  joints: Quat[];
}
export interface JointTransform {
  position: Vec3;
  rotation: Quat;
  tip: Vec3;
}
export const HOME = v(-2.15, -0.05, 0);
const poseCache = new Map<PoseName, HandPose>();
export function pose(name: PoseName = 'open'): HandPose {
  const cached = poseCache.get(name);
  if (cached) return structuredClone(cached);
  const p: HandPose = {
    root: { ...HOME },
    rotation:
      name === 'palm-up'
        ? qmul(
            axis(v(0, 0, 1), -0.95),
            qmul(axis(v(1, 0, 0), -0.95), axis(v(0, 1, 0), 0.25))
          )
        : axis(v(0, 0, 1), name === 'thumbs-up' ? -Math.PI / 2 + 0.1 : -0.55),
    joints: JOINTS.map((j) => {
      if (j.finger < 0) return identity();
      if (name === 'thumbs-up' && j.finger === 4)
        return j.segment === 0
          ? qmul(axis(v(0, 0, 1), 1.5), axis(v(0, 1, 0), -0.15))
          : axis(v(1, 0, 0), 0.08);
      if (name === 'pinch' && j.finger === 4) {
        return j.segment === 0
          ? qmul(axis(v(0, 0, 1), -0.1), axis(v(1, 0, 0), 0.45))
          : axis(v(1, 0, 0), j.segment === 1 ? 0.6 : 0.42);
      }
      let curl = [0.12, 0.19, 0.25, 0.32, 0.16][j.finger];
      if (name === 'fist' || name === 'thumbs-up')
        curl = j.finger === 4 ? 0.85 : [1.5, 1.65, 1.2][j.segment];
      if (name === 'point' || name === 'gun')
        curl =
          j.finger === 0
            ? 0
            : j.finger === 4
              ? name === 'gun'
                ? 0
                : 0.8
              : 1.4;
      if (name === 'beckon') curl = [0.02, 1.2, 1.3, 1.32, 0.65][j.finger];
      if (name === 'palm-up') curl = [0.06, 0.12, 0.18, 0.25, 0.1][j.finger];
      if (name === 'pinch') curl = j.finger === 0 ? 1.15 : 0.62;
      const oppose =
        j.finger === 4
          ? name === 'gun'
            ? -0.35
            : name === 'pinch'
              ? 0.8
              : name === 'fist'
                ? 0.95
                : 0.18
          : 0;
      return qmul(
        j.rest,
        qmul(
          axis(v(0, 1, 0), oppose),
          axis(v(1, 0, 0), clamp(curl * (j.segment === 2 ? 0.8 : 1), 0, 1.7))
        )
      );
    }),
  };
  if (name === 'pinch') {
    for (const [tip, x] of [
      [3, -0.22],
      [15, -0.48],
    ]) {
      const target = add(p.root, rotate(v(x, 0.57, 0.5), p.rotation));
      solveFinger(p, tip, target);
    }
  }
  if (name === 'fist')
    solveFinger(p, 15, add(p.root, rotate(v(-0.12, 0.1, 0.87), p.rotation)));
  poseCache.set(name, structuredClone(p));
  return p;
}
export function solveFinger(p: HandPose, tip: number, target: Vec3): void {
  for (let pass = 0; pass < 12; pass++) {
    for (let joint = tip; joint > tip - 3; joint--) {
      const t = transforms(p),
        parent = JOINTS[joint].parent;
      const delta = between(
        sub(t[tip].tip, t[joint].position),
        sub(target, t[joint].position)
      );
      const rotation = parent < 0 ? p.rotation : t[parent].rotation;
      p.joints[joint] = qmul(
        qmul(qmul(inverse(rotation), delta), rotation),
        p.joints[joint]
      );
    }
    if (length(sub(transforms(p)[tip].tip, target)) < 0.001) break;
  }
}
export function mix(a: HandPose, b: HandPose, t: number): HandPose {
  return {
    root: lerp(a.root, b.root, t),
    rotation: qlerp(a.rotation, b.rotation, t),
    joints: a.joints.map((q, i) => qlerp(q, b.joints[i], t)),
  };
}
export function transforms(p: HandPose): JointTransform[] {
  const result: JointTransform[] = [];
  JOINTS.forEach((j, i) => {
    const parent =
      j.parent < 0
        ? { position: p.root, rotation: p.rotation }
        : result[j.parent];
    const position = add(parent.position, rotate(j.offset, parent.rotation)),
      rotation = qmul(parent.rotation, p.joints[i]);
    result.push({
      position,
      rotation,
      tip: add(position, rotate(v(0, j.length, 0), rotation)),
    });
  });
  return result;
}
export function socket(p: HandPose): { position: Vec3; direction: Vec3 } {
  let position = p.root,
    rotation = p.rotation;
  // Only the index chain contributes to this socket; do not evaluate the whole skeleton.
  for (let i = 0; i <= 3; i++) {
    position = add(position, rotate(JOINTS[i].offset, rotation));
    rotation = qmul(rotation, p.joints[i]);
  }
  return {
    position: add(
      position,
      rotate(v(0, JOINTS[3].length + JOINTS[3].radius, 0), rotation)
    ),
    direction: rotate(v(0, 1, 0), rotation),
  };
}

/** Aim the fingertip ray, accounting for the socket's offset from the wrist. */
export function aimHand(p: HandPose, target: Vec3, roll = 0): HandPose {
  p.rotation = identity();
  const tip = socket(p);
  const offset = sub(tip.position, p.root);
  const destination = sub(target, p.root);
  const projection = dot(offset, tip.direction);
  const travel =
    -projection +
    Math.sqrt(
      Math.max(
        0,
        projection * projection +
          dot(destination, destination) -
          dot(offset, offset)
      )
    );
  p.rotation = qmul(
    axis(destination, roll),
    between(add(offset, mul(tip.direction, travel)), destination)
  );
  return p;
}
export function idle(time: number, erratic: boolean, variation = 0): HandPose {
  const p = pose();
  const breath = Math.sin(time * 0.71 + variation),
    drift = Math.sin(time * 0.37 + variation * 2);
  p.root = add(
    HOME,
    v(0.045 * drift, 0.065 * breath, 0.025 * Math.sin(time * 0.51))
  );
  p.rotation = qmul(
    p.rotation,
    qmul(axis(v(0, 1, 0), 0.3 + 0.09 * drift), axis(v(1, 0, 0), 0.055 * breath))
  );
  const flexion =
    (erratic ? 0.075 : 0.035) *
    (Math.sin(time * 1.1 + variation) + 0.35 * Math.sin(time * 0.47));
  p.joints = p.joints.map((q, i) => {
    const j = JOINTS[i];
    if (j.finger < 0) return q;
    const coupling = [0.45, 0.9, 1, 0.8, 0.25][j.finger];
    return qmul(
      q,
      axis(v(1, 0, 0), flexion * coupling * (1 - j.segment * 0.2))
    );
  });
  return p;
}
export function restSegments(): JointTransform[] {
  const p = pose();
  p.root = v();
  p.rotation = identity();
  p.joints = JOINTS.map((j) => j.rest);
  return transforms(p);
}
export const palmScale = mul(v(1.1, 1.3, 0.46), 0.5);
