import {
  v,
  sub,
  length,
  add,
  mul,
  clamp,
  type Vec3,
} from '../scene-interactions/math';
import {
  type ImpactTarget,
  type LocalImpact,
  type Proxy,
} from '../scene-interactions/world';
import { ACTIONS } from './actor';
export class InkTarget implements ImpactTarget {
  readonly id = 'ink';
  readonly actions = ACTIONS;
  visible = true;
  position = v(1.65, 0.65, 0);
  anchor = v();
  readonly proxies: Proxy[] = [];
  readonly home: Vec3[] = [];
  readonly points: Vec3[] = [];
  readonly velocity: Vec3[] = [];
  readonly heat: number[] = [];
  constructor() {
    const letters = [
      ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
      ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
      ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    ];
    letters.forEach((rows, g) =>
      rows.forEach((row, y) =>
        [...row].forEach((cell, x) => {
          if (cell !== '1') return;
          const c = v((g * 6 + x - 8) * 0.14, (3 - y) * 0.14, 0);
          this.proxies.push({
            kind: 'box',
            min: add(c, v(-0.07, -0.07, -0.1)),
            max: add(c, v(0.07, 0.07, 0.1)),
          });
          for (let j = 0; j < 5; j++)
            for (let i = 0; i < 5; i++) {
              const n = this.home.length,
                p = add(
                  c,
                  v(
                    (i - 2) * 0.027 + Math.sin(n * 17) * 0.006,
                    (j - 2) * 0.027 + Math.cos(n * 13) * 0.006,
                    Math.sin(n * 7) * 0.012
                  )
                );
              this.home.push(p);
              this.points.push({ ...p });
              this.velocity.push(v());
              this.heat.push(0);
            }
        })
      )
    );
    this.anchor = { ...this.home[Math.floor(this.home.length * 0.46)] };
  }
  receiveImpact(impact: LocalImpact): 'applied' {
    this.points.forEach((p, i) => {
      const distance = length(sub(p, impact.point));
      if (distance > impact.radius) return;
      const falloff = Math.pow(1 - distance / impact.radius, 2),
        radial = sub(p, impact.point);
      const spray = v(radial.x * 8, radial.y * 12, 1.5 + Math.sin(i * 4) * 1.1);
      this.velocity[i] = add(
        this.velocity[i],
        mul(add(impact.deltaVelocity, spray), falloff)
      );
      this.heat[i] = clamp(this.heat[i] + falloff * 2);
    });
    return 'applied';
  }
  step(dt: number): void {
    const damping = Math.exp(-4.1 * dt),
      cooling = Math.exp(-1.7 * dt);
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i],
        h = this.home[i],
        velocity = this.velocity[i],
        spring = 20 * (1 - this.heat[i] * 0.65) * dt;
      velocity.x = (velocity.x + (h.x - p.x) * spring) * damping;
      velocity.y = (velocity.y + (h.y - p.y) * spring) * damping;
      velocity.z = (velocity.z + (h.z - p.z) * spring) * damping;
      p.x += velocity.x * dt;
      p.y += velocity.y * dt;
      p.z += velocity.z * dt;
      this.heat[i] *= cooling;
    }
  }
}
export class PuckTarget implements ImpactTarget {
  readonly id = 'puck';
  readonly actions = ACTIONS;
  visible = true;
  readonly home = v(1.7, -1.15, 0);
  position = { ...this.home };
  anchor = v();
  readonly proxies: Proxy[] = [{ kind: 'sphere', centre: v(), radius: 0.36 }];
  velocity = v();
  heat = 0;
  heldBy: 'visitor' | null = null;
  returning = false;
  completedReturns = 0;
  impactAge = 10;
  impactPoint = v();
  private returnOrigin = v();
  readonly handling = this;
  readonly stamps: { x: number; y: number; angle: number; pressure: number }[] =
    [];
  strikeHome(contact: Vec3): void {
    if (this.heldBy) return;
    this.returning = true;
    this.returnOrigin = { ...this.position };
    this.impactPoint = { ...contact };
    this.impactAge = 0;
    this.heat = 1;
    this.velocity = v();
  }
  cancelReturn(): void {
    this.returning = false;
    this.velocity = v();
  }
  move(point: Vec3): void {
    if (this.heldBy === 'visitor' && length(sub(point, this.position)) > 0.01)
      this.rotationAngle = Math.atan2(
        point.y - this.position.y,
        point.x - this.position.x
      );
    this.cancelReturn();
    this.position = { ...point };
    this.velocity = v();
  }
  stamp(pressure = 0.7): void {
    if (this.stamps.length >= 256) return;
    this.stamps.push({
      x: this.position.x,
      y: this.position.y,
      angle: this.rotationAngle,
      pressure,
    });
  }
  release(): void {
    this.heldBy = null;
    this.velocity = v();
  }
  rotationAngle = 0;
  receiveImpact(impact: LocalImpact): 'applied' {
    if (this.heldBy) return 'applied';
    this.cancelReturn();
    this.velocity = add(this.velocity, impact.deltaVelocity);
    this.heat = 1;
    return 'applied';
  }
  step(dt: number): void {
    this.impactAge += dt;
    if (this.heldBy) return;
    if (this.returning) {
      // Three 120 Hz ticks of impact hold, then a fast launch with a small damped overshoot.
      const t = Math.max(0, this.impactAge - 0.033);
      const displacement = mul(
        sub(this.returnOrigin, this.home),
        Math.exp(-9 * t) * Math.cos(7 * t)
      );
      const next = add(this.home, displacement);
      this.velocity = mul(sub(next, this.position), 1 / dt);
      this.position = next;
      if (t >= 0.85) {
        this.position = { ...this.home };
        this.velocity = v();
        this.returning = false;
        this.completedReturns++;
        this.stamp(0.85);
      }
    } else {
      this.velocity = mul(this.velocity, Math.exp(-5 * dt));
      this.position = add(this.position, mul(this.velocity, dt));
    }
    this.position.x = clamp(this.position.x, -3.15, 3.15);
    this.position.y = clamp(this.position.y, -1.7, 1.6);
    this.position.z *= Math.exp(-8 * dt);
    this.rotationAngle += length(this.velocity) * dt;
    this.heat *= Math.exp(-2 * dt);
  }
}
