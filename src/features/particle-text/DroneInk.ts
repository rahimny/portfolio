/** Contact-dependent dirt and one quiet ink return, on the flight clock. */
export class DroneInk {
  dirt = 0;
  age = -1;
  cleanings = 0;
  origin = { x: 0, y: 0 };
  private released = -1;
  private handled = false;

  grab() {
    this.handled = true;
    this.released = -1;
    this.age = -1;
  }
  release(cancel: boolean) {
    this.released = cancel ? -1 : 0;
    if (cancel) {
      this.handled = false;
      this.dirt = 0;
      this.age = -1;
    }
  }
  collect(contacts: number, dt: number, x: number, y: number, speed: number) {
    if (
      !this.handled ||
      contacts <= 0 ||
      dt <= 0 ||
      !Number.isFinite(contacts + dt + x + y + speed) ||
      this.age >= 0
    )
      return;
    this.origin.x = x;
    this.origin.y = y;
    this.dirt = Math.min(
      1,
      this.dirt +
        Math.min(1, contacts / 100) * Math.min(dt, 0.1) * (1 + speed / 150)
    );
  }
  advance(dt: number, speed: number) {
    if (this.released >= 0) this.released += dt;
    if (
      this.age < 0 &&
      this.dirt > 0.025 &&
      this.released > 0.7 &&
      speed < 35
    ) {
      this.age = 0;
      this.cleanings++;
    }
    if (this.age < 0) return;
    this.age += dt;
    if (this.age > 1.15) {
      this.age = -1;
      this.dirt = 0;
      this.released = -1;
      this.handled = false;
    }
  }
}
