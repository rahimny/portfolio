import type { InkPoint } from '../particle-text/inkContact';

export interface LandingActor extends InkPoint {
  vx: number;
  vy: number;
  held: boolean;
  visible: boolean;
}

/** Contact needs a settled visitor; crossing the zone at speed does not land. */
export class LandingZone {
  point: InkPoint | null = null;
  occupied = false;
  private dwell = 0;
  onArrive: (() => void) | null = null;

  set(point: InkPoint | null) {
    this.point = point;
    if (!point) this.reset();
  }

  reset() {
    this.occupied = false;
    this.dwell = 0;
  }

  advance(dt: number, actor: LandingActor) {
    const near =
      this.point &&
      actor.visible &&
      !actor.held &&
      Math.hypot(actor.x - this.point.x, actor.y - this.point.y) < 24 &&
      Math.hypot(actor.vx, actor.vy) < 24;
    if (!near) {
      this.reset();
      return false;
    }
    this.dwell += dt;
    if (!this.occupied && this.dwell >= 0.25) {
      this.occupied = true;
      this.onArrive?.();
      return true;
    }
    return false;
  }
}
