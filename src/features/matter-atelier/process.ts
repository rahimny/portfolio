import { BED_Y, type PrintJob } from './types';
export const FINISH_APPROACH = 48;
export const FINISH_SWEEP = 108;
export const SPECTRAL_DURATION = 96;
export const FINISH_RETURN = SPECTRAL_DURATION + 36;
export const FINISH_DURATION = FINISH_APPROACH + FINISH_SWEEP + FINISH_RETURN;
export const PRINTER = { x: -5, y: 0, z: -2.4 };
export const BATH = { x: 4, y: 0, z: -2.4 };
export const DISPLAY = { x: 6.3, y: 0, z: 3.8 };
export const BRUSH_BASE = { x: -0.7, y: 0, z: 3.2 };
export const OBJECT_SCALE = 0.72;
export const clamp = (v: number) => (v < 1e-9 ? 0 : v > 1 - 1e-9 ? 1 : v);
export const ease = (v: number) => {
  const t = clamp(v);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
export type PipelineStage =
  | 'printing'
  | 'transfer'
  | 'painting'
  | 'spectral'
  | 'exhibit'
  | 'complete';
export type Treatment = 'prismatic' | 'recursive' | 'glitch';
export const STAGE_LABELS: Record<PipelineStage, string> = {
  printing: 'Fabrication',
  transfer: 'Transfer',
  painting: 'Wet pigment',
  spectral: 'Spectral bath',
  exhibit: 'Edition delivery',
  complete: 'Edition complete',
};
export function immersionHeight(progress: number) {
  return (
    -0.28 * Math.sin(Math.PI * progress) ** 2 +
    0.7 * (ease((progress - 0.48) / 0.22) - ease((progress - 0.84) / 0.16))
  );
}
export function sampleProcess(job: PrintJob, time: number) {
  const elapsed = Math.max(0, time - job.duration);
  const sweep = clamp((elapsed - FINISH_APPROACH) / FINISH_SWEEP);
  const spectral = clamp(
    (elapsed - FINISH_APPROACH - FINISH_SWEEP) / SPECTRAL_DURATION
  );
  const delivery = clamp(
    (elapsed - FINISH_APPROACH - FINISH_SWEEP - SPECTRAL_DURATION) / 36
  );
  const transfer = clamp(elapsed / FINISH_APPROACH);
  const stage: PipelineStage =
    time < job.duration
      ? 'printing'
      : transfer < 1
        ? 'transfer'
        : sweep < 1
          ? 'painting'
          : spectral < 1
            ? 'spectral'
            : delivery < 1
              ? 'exhibit'
              : 'complete';
  const object = { ...PRINTER };
  if (stage !== 'printing') {
    // Lift clear of the open gantry before any lateral transport.
    object.x += (BATH.x - PRINTER.x) * ease((transfer - 0.3) / 0.4);
    object.y = 3.7 * (ease(transfer / 0.3) - ease((transfer - 0.7) / 0.3));
    // The finished object and its carrier share every movement.
    object.x += (DISPLAY.x - BATH.x) * ease((delivery - 0.25) / 0.5);
    object.z += (DISPLAY.z - BATH.z) * ease((delivery - 0.25) / 0.5);
    object.y += 2.8 * (ease(delivery / 0.25) - ease((delivery - 0.75) / 0.25));
    // A shallow immersion preserves the silhouette above the reservoir.
    if (spectral > 0 && spectral < 1) object.y += immersionHeight(spectral);
  }
  if (stage === 'complete') Object.assign(object, DISPLAY);
  return {
    stage,
    sweep,
    spectral,
    delivery,
    transfer,
    elapsed,
    object,
    coatingY: BED_Y - 0.08 + ease(sweep) * (job.height - BED_Y + 0.22),
    beam: stage === 'painting',
    arm: { x: -2.45, y: 1.35, z: 0.3 },
    duration: job.duration + FINISH_DURATION,
  };
}
export type ProcessState = ReturnType<typeof sampleProcess>;
