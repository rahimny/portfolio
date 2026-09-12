const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** Varied cubic flight paths. The retained drone's spring smooths changes in
 * tangent speed and still owns the physical response and input. */
export class DroneRoaming {
  enabled = false;
  active = false;
  x = 0;
  y = 0;
  private readonly curve = new Float64Array(8);
  private width = 1;
  private height = 1;
  private seed = 9127;
  private time = 0;
  private duration = 1;
  private delay = 2;
  private vx = 0;
  private vy = 0;

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.restart();
  }

  restart(delay = 2) {
    this.active = false;
    this.delay = delay;
    this.vx = this.vy = 0;
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  advance(dt: number, x: number, y: number) {
    if (!this.enabled || !Number.isFinite(dt + x + y) || dt <= 0) return;
    if (!this.active) {
      this.delay -= dt;
      if (this.delay > 0) return;
      this.x = x;
      this.y = y;
      this.begin();
      this.active = true;
    }
    this.time += Math.min(dt, 0.05);
    if (this.time >= this.duration) {
      this.x = this.curve[6];
      this.y = this.curve[7];
      this.vx = (3 * (this.curve[6] - this.curve[4])) / this.duration;
      this.vy = (3 * (this.curve[7] - this.curve[5])) / this.duration;
      this.begin();
    }
    const t = this.time / this.duration,
      u = 1 - t,
      p = this.curve;
    this.x =
      u ** 3 * p[0] +
      3 * u * u * t * p[2] +
      3 * u * t * t * p[4] +
      t ** 3 * p[6];
    this.y =
      u ** 3 * p[1] +
      3 * u * u * t * p[3] +
      3 * u * t * t * p[5] +
      t ** 3 * p[7];
  }

  private begin() {
    const margin = Math.min(85, this.width * 0.23);
    const left = margin,
      right = Math.max(left, this.width - margin);
    const top = Math.min(60, this.height * 0.28),
      bottom = this.height + 20;
    const endX = left + this.random() * (right - left);
    const endY = top + this.random() * (bottom - top);
    const distance = Math.hypot(endX - this.x, endY - this.y);
    this.duration = Math.max(6, distance / (17 + this.random() * 7));
    const angle = this.random() * Math.PI * 2;
    const handle = Math.min(75, Math.max(20, distance * 0.25));
    const p = this.curve;
    p[0] = this.x;
    p[1] = this.y;
    p[2] = clamp(this.x + (this.vx * this.duration) / 3, left, right);
    p[3] = clamp(this.y + (this.vy * this.duration) / 3, top, bottom);
    p[4] = clamp(endX - Math.cos(angle) * handle, left, right);
    p[5] = clamp(endY - Math.sin(angle) * handle, top, bottom);
    p[6] = endX;
    p[7] = endY;
    this.time = 0;
  }
}
