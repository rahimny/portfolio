import { BRUSH_BASE } from './process';

export const UPPER_ARM = 2;
export const FOREARM = 2.05;
export const SHOULDER = { x: BRUSH_BASE.x, y: 1.35, z: BRUSH_BASE.z };

/** Elbow-up IK with an explicit hinge plane; no ambiguous link roll. */
export function solveBrushArm(pose: {
  x: number;
  y: number;
  z: number;
  pressure: number;
}) {
  const wrist = {
    x: pose.x,
    y: pose.y + 0.62 - pose.pressure * 0.1,
    z: pose.z,
  };
  const dx = wrist.x - SHOULDER.x,
    dz = wrist.z - SHOULDER.z;
  const radial = Math.hypot(dx, dz),
    vertical = wrist.y - SHOULDER.y;
  const distance = Math.min(
    UPPER_ARM + FOREARM - 0.001,
    Math.max(0.001, Math.hypot(radial, vertical))
  );
  const along =
    (UPPER_ARM ** 2 - FOREARM ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2));
  const rx = dx / Math.max(0.001, radial),
    rz = dz / Math.max(0.001, radial);
  const rr = radial / distance,
    yy = vertical / distance;
  return {
    wrist,
    elbow: {
      x: SHOULDER.x + rx * (rr * along - yy * height),
      y: SHOULDER.y + yy * along + rr * height,
      z: SHOULDER.z + rz * (rr * along - yy * height),
    },
    hinge: { x: rz, y: 0, z: -rx },
    azimuth: Math.atan2(dx, dz),
  };
}
