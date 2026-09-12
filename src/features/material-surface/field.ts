export type Deposit = {
  x: number;
  y: number;
  radius: number;
  mass: number;
  distance?: number;
  minorRadius?: number;
  angle?: number;
};

export class SurfaceField {
  readonly width: number;
  readonly height: number;
  readonly density: Float32Array;
  readonly metresWide: number;
  readonly metresHigh: number;
  constructor(width = 1024, height = 768, metresWide = 3.2, metresHigh = 2.4) {
    this.metresWide = metresWide;
    this.metresHigh = metresHigh;
    this.width = width;
    this.height = height;
    this.density = new Float32Array(width * height);
  }
  clear() {
    this.density.fill(0);
  }
  deposit = (stamp: Deposit) => {
    const sx = this.width / this.metresWide,
      sy = this.height / this.metresHigh;
    const cx = stamp.x * sx - 0.5,
      cy = stamp.y * sy - 0.5;
    const minor = stamp.minorRadius ?? stamp.radius;
    const angle = stamp.angle ?? 0;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    const rx = Math.max(stamp.radius, minor) * sx,
      ry = Math.max(stamp.radius, minor) * sy;
    const x0 = Math.floor(cx - rx),
      x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry),
      y1 = Math.ceil(cy + ry);
    const kernel = (x: number, y: number) => {
      const dx = (x - cx) / sx,
        dy = (y - cy) / sy;
      const r2 =
        stamp.minorRadius === undefined
          ? ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
          : ((dx * cosine + dy * sine) / stamp.radius) ** 2 +
            ((-dx * sine + dy * cosine) / minor) ** 2;
      return r2 >= 1 ? 0 : Math.exp(-r2 * 9) * (1 - r2) + 0.065 * (1 - r2) ** 2;
    };
    // Normalise over the whole footprint, including pixels beyond the wall.
    // Edge clipping loses mass; subdivision and standoff cannot create it.
    let sum = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) sum += kernel(x, y);
    if (!sum) return;
    const scale = (stamp.mass * sx * sy) / sum;
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) {
        this.density[y * this.width + x] += kernel(x, y) * scale;
      }
    }
  };
  get mass() {
    return (
      (this.density.reduce((sum, d) => sum + d, 0) *
        this.metresWide *
        this.metresHigh) /
      this.density.length
    );
  }
}
