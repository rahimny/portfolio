import type { TargetImpact } from '../particle-text/MastheadTarget';

/** A retained moment survives leaving its viewport; hidden time is not simulated. */
export class IsofieldState {
  time = 8;
  seed = 1;
  height = 1.15;
  arrival = 0;
  focusX = 0;
  focusY = 0;
  targetX = 0;
  targetY = 0;
  impulse = 0;
  impulseAge = 0;
  impulseX = 0;
  impulseY = 0;
  paused = false;
  pulses = 0;
  private pendingImpulse = false;
  invalidate?: () => void;

  focus(x: number, y: number) {
    this.targetX = Math.max(-1, Math.min(1, x));
    this.targetY = Math.max(-1, Math.min(1, y));
    this.invalidate?.();
  }
  excite(impact?: TargetImpact) {
    if (impact) this.focus(impact.x * 2 - 1, 1 - impact.y * 2);
    this.impulseX = this.targetX * 0.62;
    this.impulseY = this.targetY * 0.62;
    this.impulse = 1;
    this.impulseAge = 0;
    this.pulses++;
    this.pendingImpulse = true;
    this.invalidate?.();
  }
  step(dt: number, moving: boolean, reduced = false) {
    if (!moving) {
      this.focusX = this.targetX;
      this.focusY = this.targetY;
      if (reduced) this.arrival = 1;
      if (this.pendingImpulse) this.impulseAge = 0.55;
      this.pendingImpulse = false;
      return;
    }
    this.pendingImpulse = false;
    const delta = Math.min(0.05, Math.max(0, dt));
    this.time += delta;
    this.arrival = Math.min(1, this.arrival + delta / 2.2);
    this.focusX += (this.targetX - this.focusX) * (1 - Math.exp(-delta * 4));
    this.focusY += (this.targetY - this.focusY) * (1 - Math.exp(-delta * 4));
    this.impulseAge += delta;
    this.impulse *= Math.exp(-delta * 0.9);
    if (this.impulse < 0.002) this.impulse = 0;
  }
}
