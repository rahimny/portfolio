const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const step = (current: number, target: number, rate: number, dt: number) => {
  const next = current + (target - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - target) < 0.0005 ? target : next;
};

/** Page-space presence shared by two independently hosted renderers. No clock. */
export class HomeEncounterSpace {
  readonly drone = { x: 0, y: 0, visible: false };
  readonly nereid = { x: 0, y: 0, radius: 1, visible: false };
  proximity = 0;
  side = 0;
  private listener: (() => void) | null = null;

  subscribe(listener: () => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  updateDrone(x: number, y: number, visible: boolean) {
    this.drone.x = x;
    this.drone.y = y;
    this.drone.visible = visible;
    this.update();
  }

  updateNereid(x: number, y: number, radius: number, visible: boolean) {
    this.nereid.x = x;
    this.nereid.y = y;
    this.nereid.radius = radius;
    this.nereid.visible = visible;
    this.update();
  }

  private update() {
    const { drone, nereid } = this;
    const distance = Math.hypot(drone.x - nereid.x, drone.y - nereid.y);
    const proximity =
      drone.visible && nereid.visible
        ? clamp(1 - distance / Math.max(1, nereid.radius), 0, 1)
        : 0;
    const side = clamp(
      (drone.x - nereid.x) / Math.max(1, nereid.radius),
      -1,
      1
    );
    // Ignore subpixel changes and distant flight; Nereid retains on-demand idle.
    if (
      Math.abs(proximity - this.proximity) > 0.015 ||
      (proximity === 0 && this.proximity !== 0) ||
      (proximity > 0 && Math.abs(side - this.side) > 0.025)
    ) {
      this.proximity = proximity;
      this.side = side;
      this.listener?.();
    }
  }
}

/** A slow acknowledgement, not a second swimming simulation. */
export class NereidGreeting {
  amount = 0;
  turn = 0;
  moving = false;

  advance(dt: number, proximity: number, side: number) {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
    this.amount = step(
      this.amount,
      proximity,
      proximity > this.amount ? 1.8 : 1.1,
      dt
    );
    this.turn = step(this.turn, side * proximity, 1.5, dt);
    this.moving = this.amount !== proximity || this.turn !== side * proximity;
  }
}
