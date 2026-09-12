import { STEP } from './constants';
import type { MembraneMesh } from './mesh';
import type { PressureSettings } from './settings';

/** Bounded body motion coupled to the deformable skin by impacts and contact. */
export class BalloonMotion {
  readonly offset = new Float32Array(3);
  readonly velocity = new Float32Array(3);
  angle = 0;
  spin = 0;
  private speed = 0;
  grabbing = false;
  readonly grabTarget = new Float32Array(2);

  reset() {
    this.offset.fill(0);
    this.velocity.fill(0);
    this.angle = this.spin = 0;
    this.speed = 0;
    this.grabbing = false;
  }

  hit(x: number, y: number) {
    this.velocity[0] = Math.max(
      -1.5,
      Math.min(1.5, this.velocity[0] + x * 0.7)
    );
    this.velocity[1] = Math.max(-1.5, Math.min(1.5, this.velocity[1] + 0.35));
    this.velocity[2] = Math.max(-0.8, this.velocity[2] - 0.35);
    this.spin = Math.max(-1.5, Math.min(1.5, this.spin + x * 1.5 - y * 0.2));
  }

  step(air: number, helium: boolean, settings: PressureSettings) {
    // A normalised buoyancy model: displaced volume supplies lift against skin weight.
    const lift = helium
      ? Math.max(0, 3.6 * settings.lift * Math.min(air, 1) - 0.4)
      : 0;
    this.speed = 0;
    for (let axis = 0; axis < 3; axis++) {
      const previous = this.offset[axis];
      const force =
        (axis === 1 ? lift : 0) -
        this.offset[axis] * settings.tether +
        (this.grabbing && axis < 2
          ? (this.grabTarget[axis] - this.offset[axis]) * 55
          : 0);
      this.velocity[axis] =
        (this.velocity[axis] + force * STEP) *
        Math.exp(-(this.grabbing ? 7 : settings.drag) * STEP);
      this.offset[axis] += this.velocity[axis] * STEP;
      const limit = axis === 2 ? 0.18 : 0.6;
      if (Math.abs(this.offset[axis]) > limit) {
        this.offset[axis] = Math.sign(this.offset[axis]) * limit;
        this.velocity[axis] *= -0.2;
      }
      this.speed = Math.max(
        this.speed,
        Math.abs(this.offset[axis] - previous) / STEP
      );
    }
    this.spin =
      (this.spin - this.angle * 8 * STEP) *
      Math.exp(-(this.grabbing ? 7 : settings.drag) * STEP);
    this.angle += this.spin * STEP;
  }

  get settled() {
    // Contact impulses can balance the tether while the body is stationary.
    return Math.max(this.speed, Math.abs(this.spin)) < 0.002;
  }
}

export const FRAGMENTS = 6;

/** Fixed-size tear remnants. Their lifetime and work are bounded independently of input. */
export class BurstMotion {
  readonly positions = new Float32Array(FRAGMENTS * 3);
  readonly velocities = new Float32Array(FRAGMENTS * 3);
  readonly angles = new Float32Array(FRAGMENTS);
  readonly floors = new Float32Array(FRAGMENTS).fill(-0.75);
  age = 0;
  active = false;
  private readonly sectors: Uint8Array;
  private readonly triangles: Uint16Array;
  private readonly centers = new Float32Array(FRAGMENTS * 3);
  private readonly counts = new Uint32Array(FRAGMENTS);

  constructor(mesh: MembraneMesh) {
    this.triangles = mesh.triangles;
    this.sectors = new Uint8Array(mesh.triangles.length / 3);
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      let x = 0,
        y = 0;
      for (let j = 0; j < 3; j++) {
        const vertex = mesh.triangles[t + j] * 3;
        x += mesh.positions[vertex];
        y += mesh.positions[vertex + 1];
      }
      const sector = Math.min(
        FRAGMENTS - 1,
        Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * FRAGMENTS)
      );
      this.sectors[t / 3] = sector;
      this.counts[sector] += 3;
    }
  }

  start(surface: Float32Array) {
    this.active = true;
    this.age = 0;
    this.positions.fill(0);
    this.angles.fill(0);
    this.centers.fill(0);
    for (let t = 0; t < this.triangles.length; t++) {
      const sector = this.sectors[Math.floor(t / 3)];
      const vertex = this.triangles[t] * 3;
      for (let axis = 0; axis < 3; axis++)
        this.centers[sector * 3 + axis] +=
          surface[vertex + axis] / this.counts[sector];
    }
    this.floors.fill(-Infinity);
    for (let t = 0; t < this.triangles.length; t++) {
      const sector = this.sectors[Math.floor(t / 3)],
        n = sector * 3;
      const vertex = this.triangles[t] * 3;
      const radius = Math.hypot(
        surface[vertex] - this.centers[n],
        surface[vertex + 1] - this.centers[n + 1]
      );
      this.floors[sector] = Math.max(
        this.floors[sector],
        -0.95 - this.centers[n + 1] + radius * 0.45
      );
    }
    for (let i = 0; i < FRAGMENTS; i++)
      if (!this.counts[i]) this.floors[i] = -0.75;
    for (let i = 0; i < FRAGMENTS; i++) {
      const angle = -Math.PI + ((i + 0.5) / FRAGMENTS) * Math.PI * 2;
      this.velocities[i * 3] = Math.cos(angle) * 1.2;
      this.velocities[i * 3 + 1] = Math.sin(angle) * 1.8 + 0.7;
      this.velocities[i * 3 + 2] = 0.25 + (i % 2) * 0.3;
    }
  }

  step() {
    if (!this.active || this.age >= 3) return;
    this.age += STEP;
    for (let i = 0; i < FRAGMENTS; i++) {
      const n = i * 3;
      this.velocities[n + 1] -= 3.5 * STEP;
      for (let axis = 0; axis < 3; axis++) {
        this.velocities[n + axis] *= Math.exp(-2.8 * STEP);
        this.positions[n + axis] += this.velocities[n + axis] * STEP;
      }
      if (this.positions[n + 1] < this.floors[i]) {
        this.positions[n + 1] = this.floors[i];
        this.velocities[n + 1] = Math.abs(this.velocities[n + 1]) * 0.12;
      }
      this.angles[i] += (i % 2 ? 1 : -1) * Math.exp(-this.age * 2) * STEP * 3;
    }
  }

  reset() {
    this.active = false;
    this.age = 0;
    this.positions.fill(0);
    this.velocities.fill(0);
    this.angles.fill(0);
    this.floors.fill(-0.75);
  }
}
