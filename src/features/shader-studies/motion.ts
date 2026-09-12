/** Mutable state lives per mounted study, never in a shared shader definition. */
export class StudyMotion {
  readonly target: Record<string, number>;
  readonly current: Record<string, number>;
  time = 8;
  seed = 1;
  speed = 1;
  playing = true;
  focus = { x: 0, y: 0 };
  focusTarget = { x: 0, y: 0 };
  private settling = false;

  readonly defaults: Readonly<Record<string, number>>;

  constructor(defaults: Readonly<Record<string, number>>) {
    this.defaults = defaults;
    this.target = { ...defaults };
    this.current = { ...defaults };
  }

  step(delta: number, immediate = false): void {
    const dt = Number.isFinite(delta) ? Math.min(0.05, Math.max(0, delta)) : 0;
    if (this.playing) this.time += dt * this.speed;
    const follow = immediate ? 1 : -Math.expm1(-dt * 9);
    this.settling = false;
    const approach = (value: number, target: number) => {
      const next = value + (target - value) * follow;
      if (Math.abs(next - target) < 0.0001) return target;
      this.settling = true;
      return next;
    };
    for (const key of Object.keys(this.target)) {
      this.current[key] = approach(this.current[key], this.target[key]);
    }
    this.focus.x = approach(this.focus.x, this.focusTarget.x);
    this.focus.y = approach(this.focus.y, this.focusTarget.y);
  }

  needsFrame(): boolean {
    return (this.playing && this.speed > 0) || this.settling;
  }

  reset(): void {
    Object.assign(this.target, this.defaults);
    this.time = 8;
    this.seed = 1;
    this.focusTarget.x = 0;
    this.focusTarget.y = 0;
  }
}
