import { artComposition } from './patterns';
import type { PrintJob } from './types';
import { BRUSH_BASE, clamp, ease, FINISH_SWEEP } from './process';
import { LoadedBrush } from '../material-surface/brush';
import { FLOOR_SURFACE, SurfacePaint } from '../material-surface/paint';
import type { EditionGenome } from './living';
export const PAINT_TICK = 0.15;
export const DIP = { x: -3.7, y: 0.57, z: 0.95 };
export type Point = { x: number; z: number };

/** Select actual horizontal contours; normalise their silhouette into the arm's
 * reachable annulus. Disconnected uploaded paths remain separate strokes. */
export function paintingPaths(job: PrintJob): Point[][] {
  return [0.18, 0.5, 0.8].map((height, index) => {
    const source =
      job.contours[
        Math.min(
          job.contours.length - 1,
          Math.floor(job.contours.length * height)
        )
      ];
    const bound = Math.max(0.01, ...source.map((p) => Math.hypot(p.x, p.z)));
    const stride = Math.max(1, Math.ceil(source.length / 240));
    const sampled = source.filter((_, i) => i % stride === 0);
    const gesture = sampled.map((p) => {
      const angle = Math.atan2(p.z, p.x);
      const radius = Math.hypot(p.x, p.z) / bound;
      const r = 1.05 + index * 0.36 + radius * 0.65;
      const twist = angle + 0.24 * Math.sin(angle * 2 + index);
      return {
        x:
          BRUSH_BASE.x +
          Math.cos(twist) * r * (1 + 0.09 * Math.sin(angle + index)),
        z: BRUSH_BASE.z + Math.sin(twist) * r * 0.87,
      };
    });
    // Equal-distance samples keep mesh tessellation from changing the gesture speed.
    const lengths = [0];
    for (let i = 1; i < gesture.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            gesture[i].x - gesture[i - 1].x,
            gesture[i].z - gesture[i - 1].z
          )
      );
    let cursor = 1;
    return Array.from({ length: 240 }, (_, i) => {
      const distance = (lengths[lengths.length - 1] * i) / 239;
      while (cursor < lengths.length - 1 && lengths[cursor] < distance)
        cursor++;
      const t =
        (distance - lengths[cursor - 1]) /
        Math.max(1e-8, lengths[cursor] - lengths[cursor - 1]);
      const a = gesture[cursor - 1],
        b = gesture[cursor];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    });
  });
}
/** Short acceleration ramps leave most of the move at a steady speed. */
function steadyMotion(value: number) {
  const t = clamp(value),
    ramp = 0.16;
  const area = (u: number) =>
    0.5 * (u - (ramp / Math.PI) * Math.sin((Math.PI * u) / ramp));
  return (
    (t < ramp
      ? area(t)
      : t > 1 - ramp
        ? 1 - ramp - area(1 - t)
        : t - ramp / 2) /
    (1 - ramp)
  );
}
/** Travel in the shoulder's radial plane: never cut across its singular pivot. */
export function brushTransit(a: Point, b: Point, t: number): Point {
  const ax = a.x - BRUSH_BASE.x,
    az = a.z - BRUSH_BASE.z;
  const bx = b.x - BRUSH_BASE.x,
    bz = b.z - BRUSH_BASE.z;
  const start = Math.atan2(az, ax);
  const delta = Math.atan2(
    Math.sin(Math.atan2(bz, bx) - start),
    Math.cos(Math.atan2(bz, bx) - start)
  );
  const angle = start + delta * t;
  const radius = Math.hypot(ax, az) * (1 - t) + Math.hypot(bx, bz) * t;
  return {
    x: BRUSH_BASE.x + Math.cos(angle) * radius,
    z: BRUSH_BASE.z + Math.sin(angle) * radius,
  };
}
const PAPER_Y = 0.119;
type BrushBeat = {
  kind: 'load' | 'travel' | 'draw' | 'lift' | 'return';
  segment: number;
  reload: number;
  start: number;
  end: number;
  from: Point;
  to: Point;
  fromY: number;
  clearance: number;
};
type BrushProgram = {
  beats: BrushBeat[];
  clocks: number[][];
  depths: number[];
  duration: number;
};
const programs = new WeakMap<Point[][], BrushProgram>();

/** Cache the toolpath clock once. Curvature costs time, so the elbow settles
 * through tight turns without changing the contact point or the fixed links. */
function brushProgram(paths: Point[][], depths?: number[]): BrushProgram {
  const cached = programs.get(paths);
  if (cached) return cached;
  const clocks = paths.map((path) => {
    const clock = [0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        c = path[Math.min(i + 1, path.length - 1)];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const nextLength = Math.hypot(c.x - b.x, c.z - b.z);
      const bend =
        nextLength > 1e-6
          ? 1 -
            (dx * (c.x - b.x) + dz * (c.z - b.z)) /
              Math.max(1e-8, length * nextLength)
          : 0;
      clock.push(clock[i - 1] + length * (1 + Math.min(1, bend) * 1.8));
    }
    return clock;
  });
  const beats: BrushBeat[] = [];
  let duration = 0;
  const add = (
    kind: BrushBeat['kind'],
    segment: number,
    reload: number,
    weight: number,
    from: Point,
    to: Point,
    fromY = PAPER_Y
  ) => {
    beats.push({
      kind,
      segment,
      reload,
      start: duration,
      end: duration + weight,
      from,
      to,
      fromY,
      clearance: Math.min(
        0.42,
        0.08 + Math.hypot(to.x - from.x, to.z - from.z) * 0.08
      ),
    });
    duration += weight;
  };
  const distance = (a: Point, b: Point) => {
    let length = 0;
    let previous = a;
    for (let step = 1; step <= 8; step++) {
      const next = brushTransit(a, b, step / 8);
      length += Math.hypot(next.x - previous.x, next.z - previous.z);
      previous = next;
    }
    return length;
  };
  paths.forEach((path, segment) => {
    const reload = Math.floor(segment / 4);
    const first = path[0],
      last = path[path.length - 1];
    if (segment % 4 === 0) {
      add('load', segment, reload, 1.25, DIP, DIP, DIP.y);
      add(
        'travel',
        segment,
        reload,
        0.9 + distance(DIP, first) * 0.85,
        DIP,
        first,
        DIP.y
      );
    }
    add(
      'draw',
      segment,
      reload,
      Math.max(0.6, clocks[segment].at(-1)! * 1.2),
      first,
      last
    );
    add('lift', segment, reload, 0.42, last, last);
    if (segment === paths.length - 1 || (segment + 1) % 4 === 0) {
      add(
        'return',
        segment,
        reload,
        0.9 + distance(last, DIP) * 0.85,
        last,
        DIP,
        PAPER_Y + 0.34
      );
    } else {
      const next = paths[segment + 1][0];
      add(
        'travel',
        segment + 1,
        reload,
        0.65 + distance(last, next) * 0.85,
        last,
        next,
        PAPER_Y + 0.34
      );
    }
  });
  const program = {
    beats,
    clocks,
    duration,
    depths: depths ?? paths.map((_, i) => Math.min(3, Math.floor(i / 4))),
  };
  programs.set(paths, program);
  return program;
}
function pointAtClock(path: Point[], clock: number[], progress: number): Point {
  const target = clamp(progress) * clock[clock.length - 1];
  let lo = 0,
    hi = clock.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (clock[mid] < target) lo = mid;
    else hi = mid;
  }
  const t = (target - clock[lo]) / Math.max(1e-8, clock[hi] - clock[lo]);
  return {
    x: path[lo].x + (path[hi].x - path[lo].x) * t,
    z: path[lo].z + (path[hi].z - path[lo].z) * t,
  };
}
function sampleFineBrush(paths: Point[][], progress: number) {
  const program = brushProgram(paths);
  const time = clamp(progress) * program.duration;
  let lo = 0,
    hi = program.beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (program.beats[mid].end <= time) lo = mid + 1;
    else hi = mid;
  }
  const beat = program.beats[lo];
  const u = clamp((time - beat.start) / (beat.end - beat.start));
  const move = steadyMotion(u);
  const path = paths[beat.segment],
    clock = program.clocks[beat.segment];
  const contact = beat.kind === 'draw' && progress < 1;
  let target: Point = beat.from;
  let y = PAPER_Y,
    cycle = 0,
    phase = 'Loading pigment',
    tether = 0;
  if (beat.kind === 'load') {
    y = DIP.y - 0.11 * Math.sin(Math.PI * u) ** 2;
    cycle = u * 0.1;
  } else if (beat.kind === 'draw') {
    target = pointAtClock(path, clock, move);
    cycle = 0.22 + u * 0.6;
    phase =
      program.depths[beat.segment] > 1
        ? 'Growing fine branches'
        : 'Drawing the structure';
  } else if (beat.kind === 'lift') {
    y += 0.34 * ease(u);
    cycle = 0.82 + u * 0.08;
    tether = u < 0.75 ? u / 0.75 : 0;
    phase = 'Releasing the stroke';
  } else {
    target = brushTransit(beat.from, beat.to, move);
    const endY = beat.kind === 'return' ? DIP.y : PAPER_Y;
    y =
      beat.fromY +
      (endY - beat.fromY) * move +
      Math.sin(Math.PI * move) ** 2 * beat.clearance;
    cycle = beat.kind === 'return' ? 0.9 + u * 0.1 : 0.1 + u * 0.12;
    phase =
      beat.kind === 'return'
        ? 'Returning to pigment'
        : 'Positioning the next branch';
  }
  const taper =
    Math.sin(Math.PI * 0.5 * clamp(u / 0.14)) ** 2 *
    Math.sin(Math.PI * 0.5 * clamp((1 - u) / 0.14)) ** 2;
  const pressure = contact
    ? taper *
      (0.9 - Math.min(3, program.depths[beat.segment]) * 0.12) *
      (0.91 + 0.09 * Math.sin(move * Math.PI * 2 + beat.segment) ** 2)
    : 0;
  return {
    ...target,
    y,
    pressure,
    contact,
    segment: beat.segment,
    cycle,
    angle: Math.atan2(target.z - BRUSH_BASE.z, target.x - BRUSH_BASE.x),
    dipping: beat.kind === 'load' && progress < 1,
    reloadId: beat.reload,
    loadProgress: beat.kind === 'load' ? clamp(u / 0.65) : 1,
    phase: progress >= 1 ? 'Drawing complete' : phase,
    tether,
    anchor: path[path.length - 1],
    surfaceY: PAPER_Y,
  };
}
export function sampleBrush(paths: Point[][], progress: number, fine = false) {
  if (fine) return sampleFineBrush(paths, progress);
  const segment = Math.min(2, Math.floor(clamp(progress) * 3));
  const cycle = clamp(progress) * 3 - segment;
  const stroke = paths[segment];
  const drawProgress = clamp((cycle - 0.22) / 0.6);
  const draw = ease(drawProgress);
  const cursor = draw * (stroke.length - 1);
  const index = Math.min(stroke.length - 2, Math.floor(cursor));
  const a = stroke[index],
    b = stroke[index + 1];
  const t = cursor - index;
  const target = {
    x: a.x + (b.x - a.x) * t,
    y: 0.095,
    z: a.z + (b.z - a.z) * t,
  };
  const contact = cycle >= 0.22 && cycle < 0.82 && progress < 1;
  const pressure = contact
    ? Math.sin(Math.PI * clamp((cycle - 0.22) / 0.6)) ** 0.65 *
      (0.72 + 0.28 * Math.sin(draw * Math.PI * 3 + segment) ** 2)
    : 0;
  const end = stroke[stroke.length - 1];
  if (cycle < 0.1) {
    target.x = DIP.x;
    target.z = DIP.z;
    target.y = DIP.y - 0.13 * Math.sin((Math.PI * cycle) / 0.1) ** 2;
  } else if (cycle < 0.22) {
    const travel = steadyMotion((cycle - 0.1) / 0.12);
    Object.assign(target, brushTransit(DIP, stroke[0], travel));
    target.y =
      DIP.y + (0.095 - DIP.y) * travel + Math.sin(Math.PI * travel) * 0.85;
  } else if (cycle >= 0.82 && cycle < 0.9) {
    target.y += 0.48 * ease((cycle - 0.82) / 0.08);
  } else if (cycle >= 0.9) {
    const travel = steadyMotion((cycle - 0.9) / 0.1);
    Object.assign(target, brushTransit(end, DIP, travel));
    target.y =
      0.575 + (DIP.y - 0.575) * travel + Math.sin(Math.PI * travel) * 0.65;
  }
  const at = (sample: number) => {
    const u = Math.max(0, Math.min(stroke.length - 1, sample));
    const index = Math.min(stroke.length - 2, Math.floor(u)),
      f = u - index;
    return {
      x: stroke[index].x * (1 - f) + stroke[index + 1].x * f,
      z: stroke[index].z * (1 - f) + stroke[index + 1].z * f,
    };
  };
  const before = at(cursor - 3.5),
    after = at(cursor + 3.5);
  let angle = Math.atan2(after.z - before.z, after.x - before.x);
  const dockAngle = Math.atan2(DIP.z - BRUSH_BASE.z, DIP.x - BRUSH_BASE.x);
  const blendAngle = (a: number, b: number, t: number) =>
    a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  if (cycle < 0.1) angle = dockAngle;
  else if (cycle < 0.22)
    angle = blendAngle(dockAngle, angle, ease((cycle - 0.1) / 0.12));
  else if (cycle >= 0.9)
    angle = blendAngle(angle, dockAngle, ease((cycle - 0.9) / 0.1));
  return {
    ...target,
    pressure,
    contact,
    segment,
    cycle,
    angle,
    dipping: cycle < 0.1,
    reloadId: segment,
    loadProgress: clamp(cycle / 0.08),
    surfaceY: 0.095,
    phase:
      cycle < 0.1
        ? 'Loading pigment'
        : cycle < 0.22
          ? 'Approaching'
          : cycle < 0.82
            ? 'Dragging pigment'
            : cycle < 0.9
              ? 'Lifting'
              : 'Returning',
    tether: cycle >= 0.82 && cycle < 0.88 ? clamp((cycle - 0.82) / 0.06) : 0,
    anchor: end,
  };
}
export class FloorPainting {
  readonly paint: SurfacePaint;
  readonly brush: LoadedBrush;
  readonly artwork: string;
  readonly fine: boolean;
  readonly paths: Point[][];
  private tick = 0;
  private reload = -1;
  private beaded = -1;
  readonly richness: number;
  constructor(
    job: PrintJob,
    richness = 1,
    seed?: number,
    genome?: EditionGenome
  ) {
    this.richness = richness;
    this.fine = seed !== undefined;
    const art =
      seed === undefined ? undefined : artComposition(job, seed, genome);
    this.paths = art?.paths ?? paintingPaths(job);
    if (art)
      brushProgram(
        this.paths,
        art.strokes.map((stroke) => stroke.depth)
      );
    this.artwork = art?.name ?? 'Contour gesture';
    this.brush = new LoadedBrush(
      this.fine ? { scale: 0.09, flow: 0.27, round: true } : undefined
    );
    this.paint = new SurfacePaint(
      this.fine
        ? { ...FLOOR_SURFACE, permanentFraction: 0.98, spreading: 0.006 }
        : FLOOR_SURFACE
    );
  }
  advance(elapsed: number) {
    const target = Math.floor(
      Math.max(0, Math.min(FINISH_SWEEP + 60, elapsed)) / PAINT_TICK
    );
    if (target < this.tick) {
      this.paint.clear();
      this.tick = 0;
      this.reload = -1;
      this.beaded = -1;
      this.brush.lift();
      this.brush.load = 0;
    }
    while (this.tick < target) {
      const progress = (++this.tick * PAINT_TICK) / FINISH_SWEEP;
      const pose = sampleBrush(this.paths, Math.min(1, progress), this.fine);
      if (pose.reloadId !== this.reload && progress <= 1) {
        this.brush.dip(0);
        this.reload = pose.reloadId;
      }
      if (pose.dipping && progress < 1)
        this.brush.load = 0.05 * this.richness * ease(pose.loadProgress);
      // Subsample the curved contact path, while wet transport keeps one fixed
      // tick. Fine curves must not turn into chords at the simulation cadence.
      const samples = this.fine ? 4 : 1;
      for (let sample = 1; sample <= samples; sample++) {
        const p = sampleBrush(
          this.paths,
          Math.min(
            1,
            progress - ((1 - sample / samples) * PAINT_TICK) / FINISH_SWEEP
          ),
          this.fine
        );
        if (p.contact && progress < 1)
          this.brush.drag(
            {
              x: p.x - BRUSH_BASE.x + 3.2,
              y: BRUSH_BASE.z + 3.2 - p.z,
              angle: -p.angle,
              pressure: p.pressure,
            },
            1 / (120 * samples),
            this.paint.deposit
          );
        else this.brush.lift();
      }
      if (pose.cycle >= 0.88 && this.beaded !== pose.segment && progress <= 1) {
        const mass = this.brush.release(
          (this.fine ? 0.00015 : 0.0015) * this.richness
        );
        this.paint.deposit({
          x: pose.anchor.x - BRUSH_BASE.x + 3.2,
          y: BRUSH_BASE.z + 3.2 - pose.anchor.z,
          radius: this.fine ? 0.025 : 0.065,
          mass,
        });
        this.beaded = pose.segment;
      }
      this.paint.step();
    }
  }
}
