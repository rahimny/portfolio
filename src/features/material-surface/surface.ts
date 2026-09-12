export type Vector3 = { x: number; y: number; z: number };
export type SurfaceFrame = {
  origin: Vector3;
  u: Vector3;
  v: Vector3;
  normal: Vector3;
};
const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const WALL_FRAME: SurfaceFrame = {
  origin: { x: 0, y: 0, z: 0 },
  u: { x: 1, y: 0, z: 0 },
  v: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
};

/** Orthonormal substrate frames keep impact coordinates in physical metres.
 * Parallel rays and tools pointing away from the substrate deposit nothing. */
export function projectApplicator(
  surface: SurfaceFrame,
  origin: Vector3,
  direction: Vector3
) {
  const offset = {
    x: origin.x - surface.origin.x,
    y: origin.y - surface.origin.y,
    z: origin.z - surface.origin.z,
  };
  const incidence = dot(direction, surface.normal);
  const distance = dot(offset, surface.normal);
  if (incidence >= -1e-6 || distance < 0) return undefined;
  const travel = -distance / incidence;
  const local = {
    x: offset.x + direction.x * travel,
    y: offset.y + direction.y * travel,
    z: offset.z + direction.z * travel,
  };
  return {
    x: dot(local, surface.u),
    y: dot(local, surface.v),
    distance,
    angle: Math.atan2(dot(direction, surface.v), dot(direction, surface.u)),
    stretch: Math.min(
      10,
      Math.hypot(direction.x, direction.y, direction.z) / -incidence
    ),
  };
}
