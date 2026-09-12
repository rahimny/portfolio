import type { InkPoint } from './inkContact';

export interface TargetImpact {
  x: number;
  y: number;
  strength: number;
  serial: number;
}

/** One spring-mounted puck. Contact is swept; a retired seeker cannot hit twice. */
export class MastheadTarget {
  x = 0;
  y = 0;
  radius = 27;
  offsetX = 0;
  offsetY = 0;
  compression = 0;
  hits = 0;
  echoes = 0;
  enabled = false;
  private vx = 0;
  private vy = 0;
  private homeX = 0;
  private homeY = 0;
  private width = 1;
  onImpact?: (impact: TargetImpact) => void;

  resize(width: number, height: number) {
    this.width = width;
    this.homeX = width - 44;
    this.homeY = height + 56;
    this.reset();
  }

  reset() {
    this.offsetX = this.offsetY = this.vx = this.vy = this.compression = 0;
    this.x = this.homeX;
    this.y = this.homeY;
  }

  get moving() {
    return (
      this.compression > 0.002 ||
      Math.hypot(this.offsetX, this.offsetY, this.vx, this.vy) > 0.02
    );
  }

  echo() {
    this.echoes++;
    this.vx -= 35;
    this.vy -= 20;
    this.compression = 0.8;
  }

  contact(from: InkPoint, to: InkPoint, vx: number, vy: number): boolean {
    if (!this.enabled) return false;
    const dx = to.x - from.x,
      dy = to.y - from.y;
    const distance = dx * dx + dy * dy;
    const t = distance
      ? Math.max(
          0,
          Math.min(
            1,
            ((this.x - from.x) * dx + (this.y - from.y) * dy) / distance
          )
        )
      : 0;
    if (
      Math.hypot(from.x + dx * t - this.x, from.y + dy * t - this.y) >
      this.radius
    )
      return false;
    const speed = Math.hypot(vx, vy) || 1;
    this.vx += (vx / speed) * 95;
    this.vy += (vy / speed) * 75;
    this.compression = 1;
    this.hits++;
    this.onImpact?.({
      x: this.x / this.width,
      y: 0.5 + (vy / speed) * 0.25,
      strength: 1,
      serial: this.hits,
    });
    return true;
  }

  advance(delta: number) {
    const dt = Math.min(0.05, Math.max(0, delta));
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (-this.offsetX * 95 - this.vx * 10) * h;
      this.vy += (-this.offsetY * 95 - this.vy * 10) * h;
      this.offsetX = Math.max(-14, Math.min(14, this.offsetX + this.vx * h));
      this.offsetY = Math.max(-12, Math.min(12, this.offsetY + this.vy * h));
      this.compression *= Math.exp(-h * 5);
    }
    this.x = this.homeX + this.offsetX;
    this.y = this.homeY + this.offsetY;
  }
}
