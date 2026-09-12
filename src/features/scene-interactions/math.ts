export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat extends Vec3 {
  w: number;
}
export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 =>
  v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 =>
  v(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / (length(a) || 1));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  add(a, mul(sub(b, a), t));
export const clamp = (n: number, a = 0, b = 1): number =>
  Math.max(a, Math.min(b, n));
export const smooth = (n: number): number => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
export const identity = (): Quat => ({ ...v(), w: 1 });
export const axis = (a: Vec3, angle: number): Quat => ({
  ...mul(unit(a), Math.sin(angle / 2)),
  w: Math.cos(angle / 2),
});
export const qmul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export const inverse = (q: Quat): Quat => ({
  x: -q.x,
  y: -q.y,
  z: -q.z,
  w: q.w,
});
export function rotate(p: Vec3, q: Quat): Vec3 {
  const r = qmul(qmul(q, { ...p, w: 0 }), inverse(q));
  return v(r.x, r.y, r.z);
}
export function between(a: Vec3, b: Vec3): Quat {
  const x = unit(a),
    y = unit(b),
    d = dot(x, y);
  if (d < -0.99999)
    return axis(Math.abs(x.x) < 0.9 ? v(1, 0, 0) : v(0, 0, 1), Math.PI);
  const q = {
    x: x.y * y.z - x.z * y.y,
    y: x.z * y.x - x.x * y.z,
    z: x.x * y.y - x.y * y.x,
    w: 1 + d,
  };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
export function qlerp(a: Quat, b: Quat, t: number): Quat {
  const s = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const q = {
    x: a.x + (b.x * s - a.x) * t,
    y: a.y + (b.y * s - a.y) * t,
    z: a.z + (b.z * s - a.z) * t,
    w: a.w + (b.w * s - a.w) * t,
  };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
export function nearestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const d = sub(b, a);
  return add(a, mul(d, clamp(dot(sub(p, a), d) / (dot(d, d) || 1))));
}
