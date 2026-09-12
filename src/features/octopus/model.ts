export const ARM_COUNT = 8;
export const ARM_SEGMENTS = 64;
export type OctopusView = 'specimen' | 'anatomy' | 'arm';
export interface OctopusPose {
  curl: number;
  spread: number;
  current: number;
}
export const DEFAULT_POSE: OctopusPose = {
  curl: 0.16,
  spread: 0.55,
  current: 0.45,
};
export interface ArmSample {
  x: number;
  y: number;
  z: number;
  angle: number;
  bend: number;
  radius: number;
}
export function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
export function armLength(index: number): number {
  return 6.7 + Math.sin(index * 2.4) * 0.85;
}
export function armRadius(t: number): number {
  return 0.34 * Math.pow(Math.max(0, 1 - t), 1.3) + 0.018;
}
/** A three-dimensional direction field preserves length and delays bending towards each tip. */
export function sampleArm(
  index: number,
  time: number,
  pose: OctopusPose
): ArmSample[] {
  const angle = (index * Math.PI) / 4 + Math.PI / 8;
  const length = armLength(index);
  let x = Math.cos(angle) * 0.78;
  let z = Math.sin(angle) * 0.78;
  let y = 0.24;
  return Array.from({ length: ARM_SEGMENTS + 1 }, (_, j) => {
    const t = j / ARM_SEGMENTS;
    const envelope = Math.sin(Math.PI * t * 0.9);
    const phase = time * (0.76 + (index % 3) * 0.045) - t * 4.6 + index * 1.37;
    const stroke = Math.sin(phase) * 0.62 * envelope;
    const followThrough =
      Math.sin(time * 1.12 - t * 7.3 + index * 1.37) * 0.14 * t * t;
    const bend =
      0.34 +
      clampUnit(pose.spread) * 0.62 +
      Math.sin(index * 1.71) * 0.12 * t +
      Math.pow(t, 3.2) * (0.25 + clampUnit(pose.curl) * 1.8) +
      stroke +
      followThrough;
    const heading =
      angle +
      Math.sin(t * 3.1 + index * 2.1) * t * 0.18 +
      Math.sin(phase * 0.83 - 0.7) *
        envelope *
        (0.14 + clampUnit(pose.current) * 0.32);
    if (j) {
      const step = length / ARM_SEGMENTS;
      x += Math.sin(bend) * Math.cos(heading) * step;
      y -= Math.cos(bend) * step;
      z += Math.sin(bend) * Math.sin(heading) * step;
    }
    return { x, y, z, angle: heading, bend, radius: armRadius(t) };
  });
}
