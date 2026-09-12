import { signedVolume, type MembraneMesh } from './mesh';
import { separateLetters } from './contacts';
import { BalloonMotion, BurstMotion } from './motion';
import { STEP } from './constants';
import { readSettings, type PressureSettings } from './settings';
export { STEP } from './constants';

export const SUBSTEPS = 3;
export const STROKE_AIR = 0.125;
const DT = STEP / SUBSTEPS;

export class PressureBody {
  readonly mesh: MembraneMesh;
  readonly positions: Float32Array;
  readonly rest: Float32Array;
  readonly velocity: Float32Array;
  private readonly previous: Float32Array;
  private readonly gradient: Float32Array;
  private readonly curvature: Float32Array;
  private readonly restCurvature: Float32Array;
  private readonly degree: Uint16Array;
  readonly restVolume: number;
  volume: number;
  air = 0;
  targetAir = 0;
  maxSpeed = 0;
  readonly motion = new BalloonMotion();
  readonly burst: BurstMotion;
  readonly worldPositions: Float32Array;
  readonly centerX: number;
  private readonly frameCenter = new Float64Array(3);
  private readonly worldCenter = new Float64Array(3);
  private frameCosine = 1;
  private frameSine = 0;
  private readonly restCenter = new Float32Array(3);
  private readonly hops: Int16Array;
  private readonly queue: Uint16Array;
  private readonly neighbourOffsets: Uint32Array;
  private readonly neighbours: Uint16Array;
  hits = 0;
  readonly settings: PressureSettings;
  private readonly pressWeights: Float32Array;
  private readonly pressDepths: Float32Array;
  pressing = false;

  constructor(mesh: MembraneMesh, offsetX = 0, settings = readSettings(null)) {
    this.mesh = mesh;
    this.settings = settings;
    this.pressWeights = new Float32Array(mesh.positions.length / 3);
    this.pressDepths = new Float32Array(mesh.positions.length / 3);
    this.burst = new BurstMotion(mesh);
    this.centerX = offsetX;
    this.worldPositions = new Float32Array(mesh.positions.length);
    const count = mesh.positions.length / 3;
    this.hops = new Int16Array(count);
    this.queue = new Uint16Array(count);
    this.neighbourOffsets = new Uint32Array(count + 1);
    for (const vertex of mesh.edges) this.neighbourOffsets[vertex + 1]++;
    for (let i = 1; i <= count; i++)
      this.neighbourOffsets[i] += this.neighbourOffsets[i - 1];
    this.neighbours = new Uint16Array(mesh.edges.length);
    const cursors = this.neighbourOffsets.slice();
    for (let i = 0; i < mesh.edges.length; i += 2) {
      const a = mesh.edges[i],
        b = mesh.edges[i + 1];
      this.neighbours[cursors[a]++] = b;
      this.neighbours[cursors[b]++] = a;
    }
    this.positions = mesh.positions.slice();
    for (let i = 0; i < this.positions.length; i += 3)
      this.positions[i] += offsetX;
    this.rest = this.positions.slice();
    for (let i = 0; i < this.rest.length; i++)
      this.restCenter[i % 3] += this.rest[i] / (this.rest.length / 3);
    this.velocity = new Float32Array(this.positions.length);
    this.previous = new Float32Array(this.positions.length);
    this.gradient = new Float32Array(this.positions.length);
    this.curvature = new Float32Array(this.positions.length);
    this.degree = new Uint16Array(this.positions.length / 3);
    for (const vertex of mesh.edges) this.degree[vertex]++;
    this.measureCurvature();
    this.restCurvature = this.curvature.slice();
    this.restVolume = signedVolume(this.positions, mesh.triangles);
    if (!(this.restVolume > 0))
      throw new Error('Pressure requires an outward-facing closed membrane');
    this.volume = this.restVolume;
  }

  reset() {
    this.positions.set(this.rest);
    this.velocity.fill(0);
    this.air = this.targetAir = this.maxSpeed = 0;
    this.volume = this.restVolume;
    this.motion.reset();
    this.burst.reset();
    this.hits = 0;
    this.releasePress();
  }

  hit(x: number, y: number, z: number) {
    if (this.burst.active || this.air < 0.02) return false;
    this.hits++;
    if (this.air > 1.08) {
      this.rupture();
      return true;
    }
    this.visitSurface(x, y, z, (vertex, hop) => {
      const impulse =
        (-5 * this.settings.hitStrength * (1 - hop / 5) ** 2) /
        (1 + this.air * 0.5);
      this.velocity[vertex * 3 + 2] = Math.max(
        -7,
        this.velocity[vertex * 3 + 2] + impulse
      );
    });
    this.motion.hit(x - this.centerX, y);
    return true;
  }

  private visitSurface(
    x: number,
    y: number,
    z: number,
    visit: (vertex: number, hop: number) => void
  ) {
    let nearest = 0,
      distance = Infinity;
    for (let i = 0; i < this.positions.length; i += 3) {
      const d =
        (this.positions[i] - x) ** 2 +
        (this.positions[i + 1] - y) ** 2 +
        (this.positions[i + 2] - z) ** 2;
      if (d < distance) {
        distance = d;
        nearest = i / 3;
      }
    }
    this.hops.fill(-1);
    this.hops[nearest] = 0;
    this.queue[0] = nearest;
    let end = 1;
    for (let q = 0; q < end; q++) {
      const vertex = this.queue[q],
        hop = this.hops[vertex];
      visit(vertex, hop);
      if (hop >= 4) continue;
      for (
        let n = this.neighbourOffsets[vertex];
        n < this.neighbourOffsets[vertex + 1];
        n++
      ) {
        const next = this.neighbours[n];
        if (this.hops[next] !== -1) continue;
        this.hops[next] = hop + 1;
        this.queue[end++] = next;
      }
    }
  }

  press(x: number, y: number, z: number) {
    if (this.burst.active || this.air < 0.02) return false;
    this.pressWeights.fill(0);
    this.visitSurface(x, y, z, (vertex, hop) => {
      this.pressWeights[vertex] = (1 - hop / 5) ** 2;
      this.pressDepths[vertex] = this.positions[vertex * 3 + 2];
    });
    this.pressing = true;
    return true;
  }

  releasePress() {
    this.pressing = false;
    this.pressWeights.fill(0);
    this.motion.grabbing = false;
  }

  rupture() {
    if (this.burst.active) return;
    this.releasePress();
    this.toWorld();
    this.burst.start(this.worldPositions);
    this.air = this.targetAir = 0;
    this.velocity.fill(0);
    this.maxSpeed = 0;
  }

  toWorld() {
    const p = this.positions,
      count = p.length / 3;
    let meanX = 0,
      meanY = 0,
      meanZ = 0;
    for (let i = 0; i < p.length; i += 3) {
      meanX += p[i];
      meanY += p[i + 1];
      meanZ += p[i + 2];
    }
    meanX /= count;
    meanY /= count;
    meanZ /= count;
    this.frameCenter[0] = meanX;
    this.frameCenter[1] = meanY;
    this.frameCenter[2] = meanZ;
    let cosine = 0,
      sine = 0;
    for (let i = 0; i < p.length; i += 3) {
      const rx = this.rest[i] - this.restCenter[0],
        ry = this.rest[i + 1] - this.restCenter[1];
      cosine += rx * (p[i] - meanX) + ry * (p[i + 1] - meanY);
      sine += rx * (p[i + 1] - meanY) - ry * (p[i] - meanX);
    }
    // Extract a moving frame without projecting impulses into the internal solver.
    const angle = this.motion.angle - Math.atan2(sine, cosine);
    const c = (this.frameCosine = Math.cos(angle)),
      s = (this.frameSine = Math.sin(angle));
    const mc = Math.cos(this.motion.angle),
      ms = Math.sin(this.motion.angle);
    const rx = this.restCenter[0] - this.centerX,
      ry = this.restCenter[1],
      o = this.motion.offset;
    this.worldCenter[0] = this.centerX + rx * mc - ry * ms + o[0];
    this.worldCenter[1] = rx * ms + ry * mc + o[1];
    this.worldCenter[2] = this.restCenter[2] + o[2];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] - meanX,
        y = p[i + 1] - meanY;
      this.worldPositions[i] = this.worldCenter[0] + x * c - y * s;
      this.worldPositions[i + 1] = this.worldCenter[1] + x * s + y * c;
      this.worldPositions[i + 2] = this.worldCenter[2] + p[i + 2] - meanZ;
    }
  }

  localPoint(x: number, y: number, z: number): [number, number, number] {
    const dx = x - this.worldCenter[0],
      dy = y - this.worldCenter[1];
    return [
      this.frameCenter[0] + dx * this.frameCosine + dy * this.frameSine,
      this.frameCenter[1] - dx * this.frameSine + dy * this.frameCosine,
      this.frameCenter[2] + z - this.worldCenter[2],
    ];
  }

  applyContact() {
    const c = this.frameCosine,
      s = this.frameSine;
    let dx = 0,
      dy = 0;
    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.worldPositions[i] - this.worldCenter[0],
        y = this.worldPositions[i + 1] - this.worldCenter[1];
      const nextX = this.frameCenter[0] + x * c + y * s,
        nextY = this.frameCenter[1] - x * s + y * c;
      dx += nextX - this.positions[i];
      dy += nextY - this.positions[i + 1];
      this.positions[i] = nextX;
      this.positions[i + 1] = nextY;
      this.positions[i + 2] =
        this.frameCenter[2] + this.worldPositions[i + 2] - this.worldCenter[2];
    }
    const scale = 3 / (this.positions.length * DT);
    this.motion.velocity[0] += (dx * c - dy * s) * scale;
    this.motion.velocity[1] += (dx * s + dy * c) * scale;
  }

  predict() {
    const p = this.positions,
      v = this.velocity;
    this.previous.set(p);
    this.air += (this.targetAir - this.air) * (1 - Math.exp(-7 * DT));
    for (let i = 0; i < p.length; i++) {
      v[i] *= Math.exp(-7 * DT);
      // Soft registration to the original type keeps a highly inflated glyph readable.
      const tether = i % 3 === 2 ? 4 + 16 * (1 - this.air) ** 2 : 80;
      v[i] += (this.rest[i] - p[i]) * tether * DT;
      p[i] += v[i] * DT;
    }
  }

  private measureCurvature() {
    const p = this.positions,
      c = this.curvature,
      edges = this.mesh.edges;
    c.fill(0);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e] * 3,
        b = edges[e + 1] * 3;
      for (let axis = 0; axis < 3; axis++) {
        const delta = p[b + axis] - p[a + axis];
        c[a + axis] += delta;
        c[b + axis] -= delta;
      }
    }
    for (let i = 0; i < c.length; i++) c[i] /= this.degree[Math.floor(i / 3)];
  }

  private constrainDistances(
    edges: Uint16Array,
    lengths: Float32Array,
    softness: number
  ) {
    const p = this.positions;
    const stretch = 1 + Math.min(this.air, 1.1) * 0.06;
    const compliance = softness / (DT * DT);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e] * 3,
        b = edges[e + 1] * 3;
      const x = p[a] - p[b],
        y = p[a + 1] - p[b + 1],
        z = p[a + 2] - p[b + 2];
      const length = Math.sqrt(x * x + y * y + z * z);
      if (length < 1e-8) continue;
      const correction =
        (length - lengths[e / 2] * stretch) / ((2 + compliance) * length);
      p[a] -= x * correction;
      p[b] += x * correction;
      p[a + 1] -= y * correction;
      p[b + 1] += y * correction;
      p[a + 2] -= z * correction;
      p[b + 2] += z * correction;
    }
  }

  constrain() {
    const p = this.positions,
      { edges, restLengths, triangles } = this.mesh;
    this.constrainDistances(
      edges,
      restLengths,
      0.000012 * this.settings.softness
    );
    this.measureCurvature();
    // Fairing regularises raster-scale folds; rest curvature keeps uninflated type crisp.
    for (let i = 0; i < p.length; i++)
      p[i] +=
        this.settings.fairing *
        (this.curvature[i] -
          this.restCurvature[i] * (1 - Math.min(this.air, 1) * 0.98));
    const g = this.gradient;
    g.fill(0);
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3,
        b = triangles[t + 1] * 3,
        c = triangles[t + 2] * 3;
      g[a] += (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) / 6;
      g[a + 1] += (p[b + 2] * p[c] - p[b] * p[c + 2]) / 6;
      g[a + 2] += (p[b] * p[c + 1] - p[b + 1] * p[c]) / 6;
      g[b] += (p[c + 1] * p[a + 2] - p[c + 2] * p[a + 1]) / 6;
      g[b + 1] += (p[c + 2] * p[a] - p[c] * p[a + 2]) / 6;
      g[b + 2] += (p[c] * p[a + 1] - p[c + 1] * p[a]) / 6;
      g[c] += (p[a + 1] * p[b + 2] - p[a + 2] * p[b + 1]) / 6;
      g[c + 1] += (p[a + 2] * p[b] - p[a] * p[b + 2]) / 6;
      g[c + 2] += (p[a] * p[b + 1] - p[a + 1] * p[b]) / 6;
    }
    this.volume = signedVolume(p, triangles);
    let denominator = 0.00000002 / (DT * DT);
    for (let i = 0; i < g.length; i++) denominator += g[i] * g[i];
    const target = this.restVolume * (1 + 15 * Math.min(this.air, 1.12));
    const lambda = (target - this.volume) / denominator;
    for (let i = 0; i < p.length; i++) p[i] += g[i] * lambda;
    if (this.pressing)
      for (let vertex = 0; vertex < this.pressWeights.length; vertex++) {
        const weight = this.pressWeights[vertex];
        if (!weight) continue;
        const z = vertex * 3 + 2;
        const target =
          this.pressDepths[vertex] -
          (0.025 + Math.min(this.air, 1) * 0.11) * weight;
        p[z] += Math.max(
          -0.02,
          Math.min(0.02, (target - p[z]) * weight * 0.18)
        );
      }
  }

  finish() {
    const p = this.positions;
    let speed = 0;
    for (let i = 0; i < p.length; i++) {
      // Bounded displacement also protects against pathological repeated input.
      p[i] = Math.max(this.rest[i] - 0.55, Math.min(this.rest[i] + 0.55, p[i]));
      this.velocity[i] = (p[i] - this.previous[i]) / DT;
      speed = Math.max(speed, Math.abs(this.velocity[i]));
    }
    this.maxSpeed = speed;
    this.volume = signedVolume(p, this.mesh.triangles);
  }
}

export class PressureWorld {
  readonly bodies: PressureBody[];
  private readonly bounds: Float32Array;
  contacts = 0;
  strokes = 0;
  tick = 0;
  venting = false;
  helium = false;
  constructor(bodies: PressureBody[]) {
    this.bodies = bodies;
    this.bounds = new Float32Array(bodies.length * 2);
  }
  get air() {
    return this.bodies.reduce((max, body) => Math.max(max, body.targetAir), 0);
  }
  get settled() {
    return (
      !this.venting &&
      this.bodies.every((body) =>
        body.burst.active
          ? body.burst.age >= 3
          : !body.pressing &&
            Math.abs(body.air - body.targetAir) < 0.0002 &&
            body.maxSpeed < 0.008 &&
            body.motion.settled
      )
    );
  }
  pump() {
    this.venting = false;
    if (this.bodies.every((body) => body.burst.active)) return;
    this.strokes++;
    for (const body of this.bodies)
      if (!body.burst.active)
        body.targetAir = Math.min(1.5, body.targetAir + STROKE_AIR);
  }
  reset() {
    this.strokes = this.tick = 0;
    this.venting = false;
    this.helium = false;
    for (const body of this.bodies) body.reset();
  }
  step() {
    this.tick++;
    if (this.venting) {
      for (const body of this.bodies)
        body.targetAir = Math.max(0, body.targetAir - STEP * 0.32);
      if (this.air === 0) this.venting = false;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (!body.burst.active && body.air > body.settings.burstAt + i * 0.025)
        body.rupture();
      if (body.burst.active) body.burst.step();
      else
        body.motion.step(
          Math.max(0, (body.volume / body.restVolume - 1) / 15),
          this.helium,
          body.settings
        );
    }
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const body of this.bodies) {
        if (body.burst.active) continue;
        body.predict();
        body.constrain();
        body.toWorld();
      }
      this.contacts = separateLetters(this.bodies, this.bounds, true);
      for (const body of this.bodies) {
        if (body.burst.active) continue;
        body.applyContact();
        body.finish();
      }
    }
  }
}
