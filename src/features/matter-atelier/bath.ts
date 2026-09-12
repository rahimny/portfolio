import { BATH, OBJECT_SCALE, clamp, ease, immersionHeight } from './process';
import type { PrintJob } from './types';

export const BATH_LEVEL = 0.535;
export const BATH_DROPS = 24;
/** Deterministic release, fall and impact events. These are a bounded thin-film
 * treatment, not a volumetric liquid solver. Each ripple uses its drop's landing. */
export function sampleBathDrop(job: PrintJob, progress: number, index: number) {
  const contour = job.contours[Math.min(2, job.contours.length - 1)];
  const source = contour[Math.floor((index / BATH_DROPS) * contour.length)];
  const release = 0.59 + (index % 8) * 0.027;
  const age = (progress - release) * 8;
  const height = Math.max(
    BATH_LEVEL + 0.09,
    immersionHeight(release + 0.18 / 8) + source.y * OBJECT_SCALE
  );
  const fallDuration = Math.sqrt((2 * (height - 0.075 - BATH_LEVEL)) / 3);
  const attached = age >= 0 && age < 0.18;
  const fallAge = Math.max(0, age - 0.18);
  const originY = immersionHeight(progress) + source.y * OBJECT_SCALE;
  return {
    x: BATH.x + source.x * OBJECT_SCALE,
    z: BATH.z + source.z * OBJECT_SCALE,
    y: attached
      ? originY - 0.075 * ease(age / 0.18)
      : height - 0.075 - 1.5 * fallAge ** 2,
    originY,
    attached,
    stretch: clamp(age / 0.18),
    visible: age >= 0 && fallAge < fallDuration,
    impactAge: age - 0.18 - fallDuration,
    radius: 0.025 + (index % 3) * 0.009,
  };
}
