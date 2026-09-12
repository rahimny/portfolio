import {
  BATH,
  DISPLAY,
  PRINTER,
  FINISH_APPROACH,
  FINISH_SWEEP,
  SPECTRAL_DURATION,
  FINISH_DURATION,
  ease,
  sampleProcess,
} from './process';
import type { PrintJob, Point } from './types';

export const FACTORY_PERIOD = 30;
export const FACTORY_LIFETIME = 80;
export const brushProgress = (age: number) =>
  Math.max(0, Math.min(1, (age - 3) / 21));
export function factoryIds(time: number) {
  const newest = Math.floor(Math.max(0, time) / FACTORY_PERIOD);
  return Array.from({ length: 3 }, (_, i) => newest - 2 + i).filter(
    (id) => id >= 0 && time - id * FACTORY_PERIOD < FACTORY_LIFETIME
  );
}
export function editionTime(job: PrintJob, age: number) {
  if (age < 24) return job.duration * ease(age / 24);
  if (age < 30) return job.duration + ((age - 24) / 6) * FINISH_APPROACH;
  if (age < 46)
    return (
      job.duration +
      FINISH_APPROACH +
      FINISH_SWEEP +
      ((age - 30) / 16) * SPECTRAL_DURATION
    );
  if (age < 51)
    return (
      job.duration +
      FINISH_APPROACH +
      FINISH_SWEEP +
      SPECTRAL_DURATION +
      ((age - 46) / 5) * 36
    );
  return job.duration + FINISH_DURATION;
}
export function factoryProcess(job: PrintJob, age: number) {
  const state = sampleProcess(job, editionTime(job, age));
  // Pigment is prepared while this edition is being fabricated.
  state.sweep = brushProgress(age);
  state.coatingY = job.height + 0.1;
  state.beam = false;
  if (age >= 51) state.object.y = -3.2 * ease((age - 75) / 5);
  return state;
}
function returnCradle(progress: number): Point {
  const travel = ease((progress - 0.22) / 0.56);
  return {
    x: DISPLAY.x + (PRINTER.x - DISPLAY.x) * travel,
    y: 3.7 * (ease(progress / 0.22) - ease((progress - 0.78) / 0.22)),
    z: DISPLAY.z + (PRINTER.z - DISPLAY.z) * travel,
  };
}
export function factoryCarrier(job: PrintJob, time: number) {
  const phase = ((time % FACTORY_PERIOD) + FACTORY_PERIOD) % FACTORY_PERIOD;
  if (phase >= 21 && phase < 24)
    return { position: returnCradle((phase - 21) / 3), engaged: false };
  if (phase >= 24)
    return { position: factoryProcess(job, phase).object, engaged: true };
  return { position: factoryProcess(job, phase + 30).object, engaged: true };
}
export function factoryRhythm(time: number) {
  const phase = ((time % FACTORY_PERIOD) + FACTORY_PERIOD) % FACTORY_PERIOD;
  return {
    phase,
    brush: brushProgress(phase),
    feed: Math.max(0, Math.min(1, (phase - 23) / 7)),
    bath: phase < 16,
    handoff: phase >= 24 || (phase >= 16 && phase < 21),
    focus:
      phase < 7
        ? 'studio'
        : phase < 15
          ? 'brush'
          : phase < 21
            ? 'bath'
            : 'studio',
    receiver: BATH,
  } as const;
}
