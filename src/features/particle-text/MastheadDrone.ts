import type { InkPoint } from './inkContact';
import { DroneInk } from './DroneInk';
import { DRONE_SPEED } from './DroneWriting';
import { DroneRoaming } from '../home/DroneRoaming';

const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));

/** A retained writer in heading-local CSS pixels. No DOM, clock or GPU ownership. */
export class MastheadDrone {
  owner: 'writing' | 'hover' | 'drag' | 'landing' | 'landed' = 'hover';
  visible = true;
  spray = false;
  size = 100;
  depth = 40;
  readonly nozzle = { x: 0, y: 0 };
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  roll = 0;
  pitch = 0;
  rotor = 0;
  time = 0;
  held = false;
  affected = 0;
  readonly ink = new DroneInk();
  readonly roaming = new DroneRoaming();
  readonly guide = { active: false, x: 0, y: 0, speed: 42 };
  readonly look = { active: false, x: 0, y: 0 };
  gazeYaw = 0;
  gazePitch = 0;
  readonly previous: InkPoint;
  private target: InkPoint;
  private offset = { x: 0, y: 0 };
  private coast = 0;
  private accumulator = 0;
  private width = 1;
  private height = 1;
  private margin = 40;
  private returning = false;

  constructor(width: number, height: number, position?: InkPoint) {
    this.x = position?.x ?? width * 0.7;
    this.y = position?.y ?? height + 24;
    this.target = { x: this.x, y: this.y };
    this.previous = { ...this.target };
    this.resize(width, height);
  }

  hover() {
    this.roaming.restart();
    this.owner = 'hover';
    this.spray = false;
    this.target.x = clamp(this.x, this.margin, this.width - this.margin);
    this.target.y = clamp(this.y, 16, this.height + 38);
    this.previous.x = this.x;
    this.previous.y = this.y;
    this.returning = true;
    this.held = false;
    this.coast = this.accumulator = 0;
  }

  land(point: InkPoint) {
    this.release(true);
    this.owner = 'landing';
    this.target.x = point.x;
    this.target.y = point.y;
    this.returning = true;
  }

  resize(width: number, height: number) {
    this.returning = false;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.margin = Math.min(48, this.width / 4);
    this.release(true);
    this.constrain();
    this.target.x = this.x;
    this.target.y = this.y;
    this.previous.x = this.x;
    this.previous.y = this.y;
  }

  setTravelHeight(height: number) {
    this.height = Math.max(1, height);
    if (this.y > this.height + 38) this.hover();
  }

  get disturbsInk() {
    return this.held || this.coast > 0;
  }

  grab(x = this.x, y = this.y) {
    this.guide.active = this.look.active = false;
    this.roaming.restart(4);
    this.owner = 'drag';
    this.ink.grab();
    this.held = true;
    this.coast = 0;
    this.offset.x = this.x - x;
    this.offset.y = this.y - y;
    this.target.x = this.x;
    this.target.y = this.y;
  }

  move(x: number, y: number) {
    if (!this.held || !Number.isFinite(x + y)) return;
    this.target.x = clamp(
      x + this.offset.x,
      this.margin,
      this.width - this.margin
    );
    this.target.y = clamp(y + this.offset.y, 16, this.height + 38);
  }

  nudge(dx: number, dy: number) {
    if (!this.held) this.grab();
    this.offset.x = this.offset.y = 0;
    this.move(this.target.x + dx, this.target.y + dy);
  }

  release(cancel = false) {
    this.guide.active = this.look.active = false;
    this.roaming.restart(4);
    this.owner = 'hover';
    this.ink.release(cancel);
    this.held = false;
    this.coast = cancel ? 0 : 0.42;
    if (cancel) this.vx = this.vy = 0;
    this.target.x = this.x;
    this.target.y = this.y;
  }

  advance(dt: number) {
    if (this.owner === 'writing') return;
    this.previous.x = this.x;
    this.previous.y = this.y;
    this.accumulator += Number.isFinite(dt)
      ? clamp(dt * DRONE_SPEED, 0, 0.1)
      : 0;
    const step = 1 / 120;
    while (this.accumulator + 1e-9 >= step) {
      this.accumulator -= step;
      this.time += step;
      this.ink.advance(step, Math.hypot(this.vx, this.vy));
      this.coast = Math.max(0, this.coast - step);
      const drifting = !this.held && this.coast > 0;
      if (
        !this.held &&
        !drifting &&
        !this.returning &&
        this.owner === 'hover' &&
        !this.guide.active &&
        this.ink.age < 0
      ) {
        this.roaming.advance(step / DRONE_SPEED, this.x, this.y);
        if (this.roaming.enabled && this.roaming.active) {
          this.target.x = this.roaming.x;
          this.target.y = this.roaming.y;
        }
      }
      const autonomous =
        (this.guide.active || (this.roaming.enabled && this.roaming.active)) &&
        this.owner === 'hover';
      if (
        this.guide.active &&
        this.owner === 'hover' &&
        !this.held &&
        !drifting
      ) {
        this.target.x = this.guide.x;
        this.target.y = this.guide.y;
      }
      const stiffness = this.held ? 220 : drifting ? 0 : autonomous ? 14 : 34;
      const damping = this.held ? 24 : drifting ? 3.5 : autonomous ? 8 : 10;
      const hover =
        this.held ||
        drifting ||
        this.owner === 'landing' ||
        this.owner === 'landed'
          ? 0
          : Math.sin(this.time * 1.8) * 2;
      const ax = (this.target.x - this.x) * stiffness - this.vx * damping;
      const ay =
        (this.target.y + hover - this.y) * stiffness - this.vy * damping;
      this.vx += ax * step;
      this.vy += ay * step;
      const limit = Math.min(
        1,
        900 / Math.max(1, Math.hypot(this.vx, this.vy))
      );
      this.vx *= limit;
      this.vy *= limit;
      this.x += this.vx * step;
      this.y += this.vy * step;
      if (
        this.returning &&
        this.x >= this.margin &&
        this.x <= this.width - this.margin &&
        this.y >= 16 &&
        this.y <= this.height + 38
      )
        this.returning = false;
      if (!this.returning) this.constrain();
      if (drifting) {
        this.target.x = this.x;
        this.target.y = this.y;
      }
      const response = 1 - Math.exp(-step * 9);
      const looking = this.look.active && !this.held && this.owner === 'hover';
      this.gazeYaw +=
        ((looking
          ? clamp((this.look.x - this.x) / this.size, -1, 1) * 0.55
          : 0) -
          this.gazeYaw) *
        response;
      this.gazePitch +=
        ((looking
          ? clamp((this.look.y - this.y) / this.size, -1, 1) * 0.3
          : 0) -
          this.gazePitch) *
        response;
      this.roll +=
        (clamp(-this.vx * 0.0016 - ax * 0.000035, -0.5, 0.5) - this.roll) *
        response;
      this.pitch += (clamp(this.vy * 0.001, -0.3, 0.3) - this.pitch) * response;
      this.rotor +=
        step * (35 + Math.min(45, Math.hypot(this.vx, this.vy) * 0.08));
    }
  }

  private constrain() {
    const x = clamp(this.x, this.margin, this.width - this.margin);
    const y = clamp(this.y, 16, this.height + 38);
    if (x !== this.x) this.vx *= -0.15;
    if (y !== this.y) this.vy *= -0.15;
    this.x = x;
    this.y = y;
  }
}
