import { ACCELERATION, motionDistance, profile } from './motion';
import {
  BED_Y,
  distance,
  type Point,
  type Contour,
  type Move,
  type PrintJob,
} from './types';
export * from './types';
export { generateContours } from './forms';
export { sliceTriangles } from './slicing';

export function planPrint(contours: Contour[]): PrintJob {
  const moves: Move[] = [];
  let last: Point = { x: -1.6, y: BED_Y + 0.35, z: 1.6 };
  let previousHeight = -Infinity,
    layer = -1,
    offset = 0,
    height = BED_Y;
  const add = (to: Point, extrude: boolean) => {
    const length = distance(last, to);
    if (length < 0.000001) return;
    moves.push({
      from: last,
      to,
      start: 0,
      end: 0,
      extrude,
      layer,
      length,
      offset,
      motion: profile(length, 0, 0, 0.8),
    });
    last = to;
    offset += length;
  };
  for (const contour of contours) {
    if (contour.length < 2) continue;
    const first = contour[0];
    const nextLayer = first.y > previousHeight + 0.001;
    if (Math.abs(first.y - previousHeight) > 0.001) {
      layer++;
      previousHeight = first.y;
    }
    height = Math.max(height, first.y);
    // Adjacent contour seams need only a small upward move. Disconnected
    // islands still get clearance above everything already deposited.
    if (moves.length && nextLayer && distance(last, first) < 0.14)
      add(first, false);
    else {
      const safeHeight = Math.max(last.y, first.y) + 0.07;
      add({ ...last, y: safeHeight }, false);
      add({ ...first, y: safeHeight }, false);
      add(first, false);
    }
    for (let i = 1; i < contour.length; i++) add(contour[i], true);
  }
  if (!moves.length)
    throw new Error('The model contains no printable contours.');
  add({ ...last, y: height + 0.18 }, false);
  add({ x: 1.6, y: last.y, z: -1.6 }, false);
  const limits = moves.map((m) =>
    m.extrude ? 0.8 : Math.abs(m.to.y - m.from.y) > 0.001 ? 0.35 : 1.6
  );
  const speeds = new Float64Array(moves.length + 1);
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1],
      b = moves[i];
    if (a.extrude !== b.extrude) continue;
    const dot =
      ((a.to.x - a.from.x) * (b.to.x - b.from.x) +
        (a.to.y - a.from.y) * (b.to.y - b.from.y) +
        (a.to.z - a.from.z) * (b.to.z - b.from.z)) /
      (a.length * b.length);
    const half = Math.sqrt(Math.max(0, (1 + Math.min(1, dot)) / 2));
    const corner = Math.sqrt(
      (ACCELERATION * 0.012 * half) / Math.max(0.00001, 1 - half)
    );
    speeds[i] = Math.min(limits[i - 1], limits[i], corner);
  }
  for (let i = 0; i < moves.length; i++)
    speeds[i + 1] = Math.min(
      speeds[i + 1],
      Math.sqrt(speeds[i] ** 2 + 2 * ACCELERATION * moves[i].length)
    );
  for (let i = moves.length - 1; i >= 0; i--)
    speeds[i] = Math.min(
      speeds[i],
      Math.sqrt(speeds[i + 1] ** 2 + 2 * ACCELERATION * moves[i].length)
    );
  let time = 0;
  moves.forEach((move, i) => {
    move.motion = profile(move.length, speeds[i], speeds[i + 1], limits[i]);
    move.start = time;
    time +=
      move.motion.accelerate + move.motion.cruise + move.motion.decelerate;
    move.end = time;
  });
  return { moves, duration: time, layers: layer + 1, contours, height };
}
export function samplePrint(job: PrintJob, time: number) {
  const clamped = Math.max(0, Math.min(time, job.duration));
  let lo = 0,
    hi = job.moves.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (job.moves[mid].end < clamped) lo = mid + 1;
    else hi = mid;
  }
  const move = job.moves[lo];
  const travelled = Math.min(
    move.length,
    motionDistance(move.motion, clamped - move.start)
  );
  const t = travelled / move.length;
  return {
    move,
    index: lo,
    distance: move.offset + travelled,
    position: {
      x: move.from.x + (move.to.x - move.from.x) * t,
      y: move.from.y + (move.to.y - move.from.y) * t,
      z: move.from.z + (move.to.z - move.from.z) * t,
    },
  };
}
