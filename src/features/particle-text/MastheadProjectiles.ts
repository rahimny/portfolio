import { pursuitCurl, pursuitResponse, pursuitSpeed } from '../helion/pursuit';
import type { InkPoint } from './inkContact';
import { MastheadTarget } from './MastheadTarget';

export interface ProjectileInk {
  repelInk(
    from: InkPoint,
    to: InkPoint,
    radius: number,
    force: number,
    dt: number
  ): number;
}
export const PROJECTILE_CAPACITY = 12;
export const SEEKER_CAPACITY = 6;
export const TRAIL_SAMPLES = 56;

export interface InkProjectile extends InkPoint {
  active: boolean;
  kind: 'bullet' | 'seeker';
  vx: number;
  vy: number;
  age: number;
  tailAge: number;
  passed: boolean;
  seekingPuck: boolean;
  targetX: number;
  targetY: number;
  history: Float32Array;
  cursor: number;
  samples: number;
  trailDebt: number;
}

/** Bounded projectiles, shared pursuit, no renderer and no first-contact retirement. */
export class MastheadProjectiles {
  readonly puck = new MastheadTarget();
  readonly items: InkProjectile[] = Array.from(
    { length: PROJECTILE_CAPACITY },
    (_, i) => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      active: false,
      kind: i < SEEKER_CAPACITY ? 'seeker' : 'bullet',
      age: 0,
      tailAge: 10,
      passed: false,
      seekingPuck: false,
      targetX: 0,
      targetY: 0,
      history: new Float32Array(TRAIL_SAMPLES * 2),
      cursor: 0,
      samples: 0,
      trailDebt: 0,
    })
  );
  readonly reticle = { x: 0, y: 0, age: 10 };
  private readonly from = { x: 0, y: 0 };
  private readonly next = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private em = 1;
  private cooldown = 0;
  launched = 0;
  affected = 0;

  resize(width: number, height: number, em: number) {
    this.width = width;
    this.height = height;
    this.em = em;
    this.puck.resize(width, height);
    this.clear();
    this.launched = 0;
    this.affected = 0;
  }

  get canLaunch() {
    if (this.cooldown > 0) return false;
    let free = 0;
    for (let i = 0; i < SEEKER_CAPACITY; i++) if (!this.items[i].active) free++;
    return free >= 3;
  }
  get active() {
    return (
      this.reticle.age < 1.5 ||
      this.items.some((p) => p.active || p.tailAge < 0.3)
    );
  }

  clear() {
    this.puck.reset();
    for (const p of this.items) {
      p.active = false;
      p.tailAge = 10;
      p.samples = 0;
    }
    this.reticle.age = 10;
    this.cooldown = 0;
  }

  private launch(
    p: InkProjectile,
    x: number,
    y: number,
    vx: number,
    vy: number
  ) {
    Object.assign(p, {
      x,
      y,
      vx,
      vy,
      age: 0,
      tailAge: 0,
      passed: false,
      seekingPuck: false,
      active: true,
      samples: 1,
      cursor: 0,
      trailDebt: 0,
    });
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      p.history[i * 2] = x;
      p.history[i * 2 + 1] = y;
    }
  }

  fire(from: InkPoint, dx: number, dy: number) {
    const p = this.items.find((p) => p.kind === 'bullet' && !p.active);
    if (p)
      this.launch(p, from.x, from.y, dx * this.em * 7.5, dy * this.em * 7.5);
  }

  sendSeekers(target: InkPoint, seekingPuck = false): boolean {
    if (!this.canLaunch) return false;
    this.cooldown = 0.85;
    Object.assign(this.reticle, target, { age: 0 });
    let slot = 0;
    for (let i = 0; i < SEEKER_CAPACITY && slot < 3; i++) {
      const p = this.items[i];
      if (p.active) continue;
      const left = slot !== 1;
      const x = left ? -this.em * 0.2 : this.width + this.em * 0.2;
      const y = this.height * [0.25, 0.65, 1.02][slot];
      this.launch(
        p,
        x,
        y,
        (left ? 1 : -1) * this.em * 1.4,
        (slot === 2 ? -1 : 1) * this.em * 2.5
      );
      p.targetX = target.x;
      p.targetY = target.y;
      p.seekingPuck = seekingPuck;
      slot++;
      this.launched++;
    }
    return true;
  }

  advance(delta: number, ink: ProjectileInk) {
    const dt = Math.min(0.05, Math.max(0, delta));
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.reticle.age += dt;
    this.puck.advance(dt);
    for (let id = 0; id < this.items.length; id++) {
      const p = this.items[id];
      if (!p.active) {
        p.tailAge += dt;
        continue;
      }
      this.from.x = p.x;
      this.from.y = p.y;
      const steps = Math.max(1, Math.ceil(dt * 120));
      const h = dt / steps;
      for (let step = 0; step < steps; step++) {
        p.age += h;
        if (p.seekingPuck) {
          p.targetX = this.puck.x;
          p.targetY = this.puck.y;
        }
        if (p.kind === 'seeker' && !p.passed) {
          const dx = p.targetX - p.x,
            dy = p.targetY - p.y;
          const distance = Math.hypot(dx, dy);
          if (!p.seekingPuck && distance < this.em * 0.18) p.passed = true;
          else {
            const nx = dx / Math.max(0.001, distance),
              ny = dy / Math.max(0.001, distance);
            const curl = pursuitCurl(p.age, distance / this.em, id);
            const speed = pursuitSpeed(p.age, 1) * this.em;
            const ease = pursuitResponse(p.age, h);
            p.vx += ((nx - ny * curl) * speed - p.vx) * ease;
            p.vy += ((ny + nx * curl) * speed - p.vy) * ease;
          }
        }
        const nextX = p.x + p.vx * h;
        const nextY = p.y + p.vy * h;
        this.next.x = nextX;
        this.next.y = nextY;
        const hit =
          p.seekingPuck && this.puck.contact(p, this.next, p.vx, p.vy);
        p.x = nextX;
        p.y = nextY;
        p.trailDebt += h;
        if (p.trailDebt >= 1 / 90) {
          p.trailDebt %= 1 / 90;
          p.cursor = (p.cursor + 1) % TRAIL_SAMPLES;
          p.history[p.cursor * 2] = p.x;
          p.history[p.cursor * 2 + 1] = p.y;
          p.samples = Math.min(TRAIL_SAMPLES, p.samples + 1);
        }
        if (hit) {
          p.active = false;
          p.tailAge = 0;
          break;
        }
      }
      const seeker = p.kind === 'seeker';
      this.affected += ink.repelInk(
        this.from,
        p,
        this.em * (seeker ? 0.27 : 0.18),
        this.em * (seeker ? 210 : 180),
        dt
      );
      const margin = this.em * 0.8;
      if (
        p.age > (seeker ? 3.8 : 1.6) ||
        (p.age > 0.3 &&
          (p.x < -margin ||
            p.x > this.width + margin ||
            p.y < -margin ||
            p.y > this.height + margin))
      ) {
        p.active = false;
        p.tailAge = 0;
      }
    }
  }
}
