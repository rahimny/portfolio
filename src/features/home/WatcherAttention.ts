import type { WatcherTarget } from './HomeWatcher';

/** Optical attention has its own rhythm; the body does not chase every glance. */
export class WatcherAttention {
  focus = 0;
  startled = 0;
  confused = 0;
  snap = 0;
  switches = 0;
  private both = false;
  private hold = 0;
  private order = 0;
  private cooldown = 0;

  reset() {
    this.focus = this.startled = this.confused = this.snap = this.switches = 0;
    this.both = false;
    this.hold = this.order = this.cooldown = 0;
  }

  advance(delta: number, first: WatcherTarget, second: WatcherTarget) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
    this.startled = Math.max(0, this.startled - dt * 2.2);
    this.snap = Math.max(0, this.snap - dt * 5);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const both = first.visible && second.visible;
    if (!both) {
      this.focus = first.visible ? 0 : 1;
      this.confused = Math.max(0, this.confused - dt * 1.5);
      this.both = false;
      this.hold = 0;
      return;
    }
    const difference = first.x - second.x;
    const order =
      Math.abs(difference) > 50 ? Math.sign(difference) : this.order;
    const crossed =
      this.order !== 0 && order !== this.order && this.cooldown === 0;
    this.order = order;
    this.hold -= dt;
    if (!this.both || crossed) {
      this.startled = this.both ? 0.65 : 1;
      this.confused = 1;
      this.cooldown = 1.6;
      this.hold = 0;
    }
    if (this.hold <= 0) {
      this.focus = 1 - this.focus;
      this.switches++;
      this.snap = 1;
      // A brief look-back punctuates longer inspections instead of a metronome.
      this.hold =
        this.switches % 3 === 1
          ? 0.34
          : 0.8 + ((this.switches * 0.61803398875) % 1) * 0.7;
    }
    this.confused = Math.max(0.35, this.confused - dt * 0.65);
    this.both = true;
  }
}
