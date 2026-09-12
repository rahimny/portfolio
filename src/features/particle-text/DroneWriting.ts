import { LETTER_STROKES } from './letterStrokes';
import type { TextLayout } from './layout';

export const WRITING_NOZZLE_OFFSET = { x: 0.075, y: -0.1 } as const;
/**
 * Global drone pacing multiplier: >1 speeds up the writing flight and the
 * retained drone's physics together, <1 slows them down. Tune this one
 * number rather than the per-stroke durations below.
 */
export const DRONE_SPEED = 1.4;
export interface WritingPoint {
  x: number;
  y: number;
}
export interface WritingSegment {
  from: WritingPoint;
  to: WritingPoint;
  start: number;
  duration: number;
  spray: boolean;
  glyph: number;
  ease: number;
  lift: number;
  drone: number;
}
export interface WritingFlight extends WritingPoint {
  vx: number;
  vy: number;
  roll: number;
  pitch: number;
  rotor: number;
  spray: boolean;
  visible: boolean;
}
export interface WritingJob {
  glyphs: number[];
  drone: number;
  start: number;
  end: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const strokeEase = (t: number, amount: number) =>
  t * (1 - amount) + t * t * (3 - 2 * t) * amount;
function inverseEase(value: number, amount: number) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (strokeEase(mid, amount) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Exclusive letter jobs, clear travel lanes and a shared departure. */
export class DroneWriting {
  readonly segments: WritingSegment[] = [];
  readonly tracks: WritingSegment[][] = [[], []];
  readonly byGlyph: WritingSegment[][] = [];
  readonly jobs: WritingJob[] = [];
  readonly flights: WritingFlight[];
  duration: number;
  paintEnd: number;
  burstStart: number | null = null;
  private readonly span: number;
  private readonly bottom: number;
  private readonly retainFirst: boolean;
  time = 0;
  cancelled = false;

  constructor(layout: TextLayout, width: number, retainFirst = false) {
    this.retainFirst = retainFirst;
    const span = width / layout.scale;
    this.span = span;
    const geometry = layout.glyphs.map((placed) => {
      const paths = LETTER_STROKES[placed.char ?? ''];
      if (!paths) throw new Error('No writing gesture for this glyph');
      let left = Infinity,
        right = -Infinity,
        top = Infinity,
        bottom = -Infinity;
      for (let i = 0; i < placed.glyph.x.length; i++) {
        left = Math.min(left, placed.glyph.x[i]);
        right = Math.max(right, placed.glyph.x[i]);
        top = Math.min(top, placed.glyph.y[i]);
        bottom = Math.max(bottom, placed.glyph.y[i]);
      }
      return {
        paths: paths.map((path) =>
          path.map(([x, y]) => ({
            x: placed.u + left + x * (right - left),
            y: placed.v + top + y * (bottom - top),
          }))
        ),
        left: placed.u + left,
        right: placed.u + right,
        top: placed.v + top,
        bottom: placed.v + bottom,
      };
    });
    if (!geometry.length) throw new Error('No letters to write');
    const words: number[][] = [];
    layout.glyphs.forEach((placed, i) => {
      const previous = layout.glyphs[i - 1];
      // Word spacing and line changes come from the actual typographic layout.
      if (
        !previous ||
        placed.v !== previous.v ||
        placed.word !== previous.word ||
        geometry[i].left - geometry[i - 1].right > 0.17
      )
        words.push([]);
      words[words.length - 1].push(i);
    });
    // One continuous word can still be shared, with a single handoff boundary.
    if (words.length === 1 && words[0].length > 3) {
      const tail = words[0].splice(Math.ceil(words[0].length / 2));
      words.push(tail);
    }
    const times = [0.12, 0.37];
    const previous = [
      { x: -1.2, y: geometry[0].top + 0.15 },
      {
        x: span + 1.2,
        y: geometry[Math.min(words[0].length, geometry.length - 1)].top + 0.2,
      },
    ];
    this.flights = previous.map((point) => ({
      ...point,
      vx: 0,
      vy: 0,
      roll: 0,
      pitch: 0,
      rotor: 0,
      spray: false,
      visible: false,
    }));
    const add = (
      drone: number,
      to: WritingPoint,
      duration: number,
      spray: boolean,
      glyph: number,
      ease: number,
      lift = 0
    ) => {
      const segment = {
        from: previous[drone],
        to,
        start: times[drone],
        duration,
        spray,
        glyph,
        ease,
        lift,
        drone,
      };
      this.segments.push(segment);
      this.tracks[drone].push(segment);
      if (spray) (this.byGlyph[glyph] ??= []).push(segment);
      times[drone] += duration;
      previous[drone] = to;
    };
    // After their opening words, share a longer remaining word at a letter
    // boundary. The second finisher can help instead of hovering unemployed.
    const queue = words.flatMap((glyphs, word) => {
      if (word < 2 || glyphs.length < 4) return [glyphs];
      const split = Math.ceil(glyphs.length / 2);
      return [glyphs.slice(0, split), glyphs.slice(split)];
    });
    queue.forEach((glyphs, word) => {
      const drone = word < 2 ? word : times[0] <= times[1] ? 0 : 1;
      const start = times[drone];
      const first = this.tracks[drone].length === 0;
      const firstPoint = geometry[glyphs[0]].paths[0][0];
      if (!first && Math.abs(firstPoint.y - previous[drone].y) > 0.3) {
        // Change rows via a clear horizontal lane below the previous line.
        const lane =
          Math.max(previous[drone].y, geometry[glyphs[0]].top) + 0.18;
        add(
          drone,
          { x: previous[drone].x + 0.28, y: lane },
          0.24,
          false,
          -1,
          1
        );
        add(
          drone,
          { x: firstPoint.x, y: lane },
          0.32 + Math.abs(firstPoint.x - previous[drone].x) * 0.065,
          false,
          -1,
          0.9
        );
      }
      for (const glyph of glyphs) {
        for (const points of geometry[glyph].paths) {
          const gap = Math.hypot(
            points[0].x - previous[drone].x,
            points[0].y - previous[drone].y
          );
          const entering = this.tracks[drone].length === 0;
          add(
            drone,
            points[0],
            entering ? 0.85 : 0.105 + Math.min(0.3, gap * 0.085),
            false,
            glyph,
            1,
            entering ? 0.12 : Math.min(0.13, gap * 0.06)
          );
          for (let i = 1; i < points.length; i++) {
            const distance = Math.hypot(
              points[i].x - previous[drone].x,
              points[i].y - previous[drone].y
            );
            if (distance < 0.0001) continue;
            add(
              drone,
              points[i],
              Math.max(0.009, distance / 2.9) +
                (points.length <= 5 ? 0.034 : 0),
              true,
              glyph,
              points.length <= 5 ? 0.7 : 0.1
            );
          }
        }
      }
      this.jobs.push({ glyphs, drone, start, end: times[drone] });
    });
    this.paintEnd = Math.max(...times);
    const lastBottom = Math.max(...geometry.map((g) => g.bottom));
    this.bottom = lastBottom;
    // The first finisher inspects from the clear lower margin. Departure waits
    // for the other pilot, then forms a staggered pair without crossing paths.
    for (let drone = 0; drone < 2; drone++) {
      if (!this.tracks[drone].length) continue;
      const stage = {
        x: span - 0.4 - drone * 0.88,
        y: lastBottom + 0.16 + drone * 0.08,
      };
      add(
        drone,
        { x: previous[drone].x + 0.35, y: stage.y },
        0.34,
        false,
        -1,
        1
      );
      add(
        drone,
        stage,
        0.45 + Math.abs(stage.x - previous[drone].x) * 0.045,
        false,
        -1,
        1
      );
    }
    const depart = Math.max(...times) + 0.3;
    for (let drone = 0; drone < 2; drone++) {
      if (!this.tracks[drone].length) continue;
      add(
        drone,
        { ...previous[drone] },
        depart - times[drone] + drone * 0.17,
        false,
        -1,
        1
      );
      add(
        drone,
        retainFirst && drone === 0
          ? { x: span * 0.7, y: lastBottom + 0.18 }
          : { x: span + 1.4, y: lastBottom - 0.5 + drone * 0.18 },
        0.85,
        false,
        -1,
        0.85,
        0.15
      );
    }
    this.duration = Math.max(...times) + 0.15;
  }

  get done() {
    return this.cancelled || this.time >= this.duration;
  }

  /** Redirect the live pilots; retain their position, velocity and rotor phase. */
  skip() {
    if (this.burstStart !== null || this.done) return false;
    this.burstStart = this.time;
    // Once all droplets have left the nozzles, keep the existing departure.
    // A late skip must not call the departing partner back into the heading.
    if (this.time >= this.paintEnd + 0.1) return false;
    const entry = 0.16 * DRONE_SPEED;
    const spray = 0.64 * DRONE_SPEED;
    const exit = 0.85 * DRONE_SPEED;
    this.paintEnd = this.time + entry + spray;
    this.duration = this.paintEnd + exit;
    this.tracks.forEach((track, drone) => {
      const flight = this.flights[drone];
      track.length = 0;
      let from = { x: flight.x, y: flight.y };
      let start = this.time;
      const add = (to: WritingPoint, duration: number, spray: boolean) => {
        track.push({
          from,
          to,
          start,
          duration,
          spray,
          glyph: -1,
          ease: 1,
          lift: 0,
          drone,
        });
        from = to;
        start += duration;
      };
      // Each pilot throws ink across its own side of the heading.
      const side = clamp(flight.x / this.span) < 0.5 ? 0.3 : 0.7;
      const x = this.span * side;
      const y = Math.max(0.2, this.bottom * (drone ? 0.62 : 0.38));
      add({ x, y }, entry, false);
      add({ x: x + (drone ? -0.45 : 0.45), y: y + 0.2 }, spray, true);
      add(
        this.retainFirst && drone === 0
          ? { x: this.span * 0.7, y: this.bottom + 0.18 }
          : { x: this.span + 1.4, y: this.bottom - 0.32 },
        exit,
        false
      );
    });
    return true;
  }
  advance(dt: number) {
    let remaining = Math.min(
      Math.max(0, dt * DRONE_SPEED),
      this.duration - this.time
    );
    while (remaining > 1e-8) {
      const step = Math.min(1 / 120, remaining);
      this.time += step;
      remaining -= step;
      this.fly(step);
    }
    // The substep tolerance must not leave the score permanently short of done.
    if (this.duration - this.time < 1e-8) this.time = this.duration;
  }

  sample(time = this.time, drone = 0) {
    const track = this.tracks[drone];
    const segment =
      track.find((s) => time < s.start + s.duration) ?? track[track.length - 1];
    if (!segment)
      return { x: -2, y: 0, spray: false, glyph: -1, lift: 0, visible: false };
    const t = clamp((time - segment.start) / segment.duration);
    const u = strokeEase(t, segment.ease);
    const burst = this.burstStart !== null && segment.spray;
    const scatter = burst ? Math.sin(Math.PI * t) : 0;
    return {
      x:
        segment.from.x +
        (segment.to.x - segment.from.x) * u +
        scatter * Math.sin(t * 17 + drone * 2) * 0.55,
      y:
        segment.from.y +
        (segment.to.y - segment.from.y) * u -
        Math.sin(Math.PI * t) * segment.lift +
        scatter * Math.sin(t * 23 + drone * 3) * 0.38,
      spray: segment.spray && time >= segment.start && !this.cancelled,
      glyph: segment.glyph,
      lift: segment.spray ? 0 : Math.sin(Math.PI * t),
      visible:
        !this.cancelled &&
        time >= track[0].start &&
        ((this.retainFirst && drone === 0) ||
          time <=
            track[track.length - 1].start +
              track[track.length - 1].duration +
              0.15),
    };
  }

  private fly(dt: number) {
    this.flights.forEach((flight, drone) => {
      const desired = this.sample(this.time, drone);
      const ahead = this.sample(this.time + 0.035, drone);
      const targetVx = (ahead.x - desired.x) / 0.035,
        targetVy = (ahead.y - desired.y) / 0.035;
      // Curl of a moving potential: both insects inhabit the same changing
      // air, but their different positions produce different turns and eddies.
      const a = flight.x * 2.4 + this.time * 0.7;
      const b = flight.y * 2.4 - this.time * 0.6;
      const c = (flight.x - flight.y) * 1.4 + this.time * 0.9;
      const windX = 28.8 * Math.sin(a) * Math.cos(b) - 9.8 * Math.cos(c);
      const windY = -28.8 * Math.cos(a) * Math.sin(b) - 9.8 * Math.cos(c);
      const beat = this.time * (drone ? 2.3 : 2.05) + drone * 0.37;
      const burst = Math.exp(-(beat - Math.floor(beat)) * 9);
      const hovering = Math.hypot(targetVx, targetVy) < 0.08;
      const pursuit = hovering ? 155 : 310 + burst * 220;
      const air = desired.spray ? 1.15 : 1.7;
      let ax =
        (desired.x - flight.x) * pursuit +
        (targetVx * 0.68 - flight.vx) * 23 +
        windX * air;
      let ay =
        (desired.y - flight.y) * pursuit +
        (targetVy * 0.68 - flight.vy) * 23 +
        windY * air;
      const other = this.flights[1 - drone];
      const dx = flight.x - other.x,
        dy = flight.y - other.y,
        distance = Math.hypot(dx, dy);
      if (other.visible && distance < 0.85 && distance > 0.001) {
        const closing = Math.max(
          0,
          -((flight.vx - other.vx) * dx + (flight.vy - other.vy) * dy) /
            distance
        );
        const separation = ((0.85 - distance) * 260 + closing * 12) / distance;
        ax += dx * separation;
        ay += dy * separation;
      }
      // Local alignment/cohesion only engages near a partner, so distant
      // workers keep their jobs while the rendezvous becomes a small swarm.
      if (other.visible && distance > 0.7 && distance < 1.8) {
        const social = (1.8 - distance) / 1.1;
        ax += ((other.vx - flight.vx) * 2.5 - dx * 3) * social;
        ay += ((other.vy - flight.vy) * 2.5 - dy * 3) * social;
      }
      const acceleration = Math.hypot(ax, ay);
      const limit = Math.min(1, 105 / Math.max(1, acceleration));
      ax *= limit;
      ay *= limit;
      flight.vx += ax * dt;
      flight.vy += ay * dt;
      flight.x += flight.vx * dt;
      flight.y += flight.vy * dt;
      const response = 1 - Math.exp(-dt * 12);
      flight.roll +=
        (Math.max(-0.36, Math.min(0.36, -ax * 0.008 - flight.vx * 0.035)) -
          flight.roll) *
        response;
      flight.pitch +=
        (Math.max(-0.16, Math.min(0.16, ay * 0.005)) - flight.pitch) * response;
      flight.rotor += dt * (145 + Math.hypot(ax, ay) * 0.4);
      flight.spray = desired.spray;
      flight.visible = desired.visible;
    });
    // A small hard core complements anticipatory steering at close passes.
    // Resolve both bodies symmetrically so a worker never tunnels through its
    // partner when a short stroke reverses their relative velocities.
    const [a, b] = this.flights;
    const dx = a.x - b.x,
      dy = a.y - b.y;
    const distance = Math.hypot(dx, dy);
    if (a.visible && b.visible && distance < 0.5 && distance > 1e-6) {
      const nx = dx / distance,
        ny = dy / distance;
      const correction = (0.5 - distance) * 0.5;
      a.x += nx * correction;
      a.y += ny * correction;
      b.x -= nx * correction;
      b.y -= ny * correction;
      const closing =
        Math.min(0, (a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * 0.5;
      a.vx -= nx * closing;
      a.vy -= ny * closing;
      b.vx += nx * closing;
      b.vy += ny * closing;
    }
  }

  deposition(glyph: number, x: number, y: number) {
    let distance = Infinity,
      time = 0,
      sourceX = x,
      sourceY = y,
      drone = 0;
    for (const segment of this.byGlyph[glyph] ?? []) {
      const dx = segment.to.x - segment.from.x,
        dy = segment.to.y - segment.from.y;
      const t = clamp(
        ((x - segment.from.x) * dx + (y - segment.from.y) * dy) /
          (dx * dx + dy * dy)
      );
      const px = segment.from.x + dx * t,
        py = segment.from.y + dy * t;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < distance) {
        distance = d;
        time = segment.start + inverseEase(t, segment.ease) * segment.duration;
        sourceX = px;
        sourceY = py;
        drone = segment.drone;
      }
    }
    return { time, x: sourceX, y: sourceY, drone };
  }
}
