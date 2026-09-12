import { SurfaceField, type Deposit } from './field';
export type SurfaceConfig = {
  width: number;
  height: number;
  resolution: readonly [number, number];
  wetResolution: readonly [number, number];
  gravity: readonly [number, number];
  permanentFraction: number;
  spreading: number;
  dryingRate: number;
};
export const WALL_SURFACE: SurfaceConfig = {
  width: 3.2,
  height: 2.4,
  resolution: [1024, 768],
  wetResolution: [256, 192],
  gravity: [0, -1],
  permanentFraction: 0.65,
  spreading: 0,
  dryingRate: 1,
};
export const FLOOR_SURFACE: SurfaceConfig = {
  width: 6.4,
  height: 6.4,
  resolution: [1024, 1024],
  wetResolution: [192, 192],
  gravity: [0, 0],
  permanentFraction: 0.22,
  spreading: 0.12,
  dryingRate: 0.3,
};
const STEP = 1 / 120;

export type PaintSnapshot = {
  film: Float32Array;
  mobile: Float32Array;
  solvent: Float32Array;
  settled: Float32Array;
};

/** A permanent fine film and a conservative, coarser wet reservoir. Density is
 * pigment per square metre throughout; solvent is an independent wet-load unit. */
export class SurfacePaint {
  filmVersion = 0;
  surfaceVersion = 0;
  readonly config: SurfaceConfig;
  readonly film: SurfaceField;
  readonly width: number;
  readonly height: number;
  readonly density: Float32Array;
  readonly wetWidth: number;
  readonly wetHeight: number;
  private readonly mobile: SurfaceField;
  private readonly solvent: SurfaceField;
  private readonly settled: Float32Array;
  readonly surface: Float32Array;
  private readonly pigmentDelta: Float32Array;
  private readonly solventDelta: Float32Array;
  private readonly retention: Float32Array;
  private active = new Set<number>();
  constructor(config: SurfaceConfig = WALL_SURFACE) {
    this.config = config;
    this.film = new SurfaceField(
      ...config.resolution,
      config.width,
      config.height
    );
    this.width = this.film.width;
    this.height = this.film.height;
    this.density = this.film.density;
    [this.wetWidth, this.wetHeight] = config.wetResolution;
    this.mobile = new SurfaceField(
      this.wetWidth,
      this.wetHeight,
      config.width,
      config.height
    );
    this.solvent = new SurfaceField(
      this.wetWidth,
      this.wetHeight,
      config.width,
      config.height
    );
    this.settled = new Float32Array(this.wetWidth * this.wetHeight);
    this.surface = new Float32Array(this.settled.length * 4);
    this.pigmentDelta = new Float32Array(this.settled.length);
    this.solventDelta = new Float32Array(this.settled.length);
    this.retention = Float32Array.from(this.settled, (_, i) => {
      const x = i % this.wetWidth,
        y = Math.floor(i / this.wetWidth);
      const n = Math.sin(x * 127.1 + Math.floor(y / 12) * 311.7) * 43758.5453;
      return 0.075 + (n - Math.floor(n)) * 0.09;
    });
  }

  isWet = () => this.active.size > 0;

  deposit = (stamp: Deposit) => {
    this.filmVersion++;
    this.surfaceVersion++;
    // These fractions sum to one. Runs redistribute the reservoir rather than
    // adding another visual stroke on top of an unchanged full-mass deposit.
    this.film.deposit({
      ...stamp,
      mass: stamp.mass * this.config.permanentFraction,
    });
    this.mobile.deposit({
      ...stamp,
      mass: stamp.mass * (1 - this.config.permanentFraction),
    });
    this.solvent.deposit(stamp);
    const sx = this.wetWidth / this.config.width;
    const sy = this.wetHeight / this.config.height;
    const x0 = Math.max(0, Math.floor((stamp.x - stamp.radius) * sx - 0.5));
    const x1 = Math.min(
      this.wetWidth - 1,
      Math.ceil((stamp.x + stamp.radius) * sx - 0.5)
    );
    const y0 = Math.max(0, Math.floor((stamp.y - stamp.radius) * sy - 0.5));
    const y1 = Math.min(
      this.wetHeight - 1,
      Math.ceil((stamp.y + stamp.radius) * sy - 0.5)
    );
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.wetWidth + x;
        if (this.solvent.density[i] > 0) this.active.add(i);
        this.pack(i);
      }
    }
  };

  /** Exactly one shared 120 Hz tick, after the nozzle deposits. All transfers
   * are staged so newly received paint cannot travel twice in one tick. */
  step = () => {
    if (!this.active.size) return;
    this.surfaceVersion++;
    const touched = new Set(this.active);
    const wet = this.solvent.density;
    const pigment = this.mobile.density;
    const evaporate = (i: number) => {
      const s = wet[i];
      if (!s) return;
      const evaporated = Math.min(
        s,
        STEP * this.config.dryingRate * (0.035 + s * 0.13)
      );
      const bound = pigment[i] * (evaporated / s);
      pigment[i] -= bound;
      this.settled[i] += bound;
      wet[i] -= evaporated;
    };
    // Levelling reads a consistent field, independent of active-cell insertion order.
    if (this.config.spreading > 0) for (const i of this.active) evaporate(i);
    for (const i of this.active) {
      if (!wet[i]) continue;
      if (this.config.spreading === 0) evaporate(i);
      const excess = Math.max(0, wet[i] - this.retention[i]);
      const x = i % this.wetWidth,
        y = Math.floor(i / this.wetWidth);
      const move = (to: number, fraction: number) => {
        const ds = wet[i] * fraction,
          dp = pigment[i] * fraction;
        this.solventDelta[i] -= ds;
        this.solventDelta[to] += ds;
        this.pigmentDelta[i] -= dp;
        this.pigmentDelta[to] += dp;
        touched.add(to);
      };
      if (this.config.spreading > 0) {
        // Conservative thickness-driven levelling on a flat substrate. Four
        // outgoing fractions are bounded so a cell cannot export more it owns.
        const neighbours = [
          x > 0 ? i - 1 : -1,
          x + 1 < this.wetWidth ? i + 1 : -1,
          y > 0 ? i - this.wetWidth : -1,
          y + 1 < this.wetHeight ? i + this.wetWidth : -1,
        ];
        for (const to of neighbours)
          if (to >= 0 && wet[i] > wet[to]) {
            const gradient = (wet[i] - wet[to]) / Math.max(wet[i], 1e-8);
            move(
              to,
              Math.min(0.06, gradient * this.config.spreading * STEP * 12)
            );
          }
      }
      if (!excess) continue;
      const [gx, gy] = this.config.gravity;
      // Keep the original downward aerosol transport and fixed pore channels.
      if (gx === 0 && gy === -1) {
        if (i < this.wetWidth) continue;
        const speed = Math.min(0.24, 0.025 + Math.sqrt(excess) * 0.11);
        const fraction =
          (Math.min(
            0.35,
            (speed * STEP) / (this.config.height / this.wetHeight)
          ) *
            excess) /
          wet[i];
        const down = i - this.wetWidth;
        let side = down;
        if (x > 0 && this.retention[down - 1] < this.retention[side])
          side = down - 1;
        if (
          x + 1 < this.wetWidth &&
          this.retention[down + 1] < this.retention[side]
        )
          side = down + 1;
        const bend = side === down ? 0 : 0.12;
        move(down, fraction * (1 - bend));
        if (bend) move(side, fraction * bend);
      } else {
        for (const [g, to, valid] of [
          [gx, i + Math.sign(gx), gx > 0 ? x + 1 < this.wetWidth : x > 0],
          [
            gy,
            i + Math.sign(gy) * this.wetWidth,
            gy > 0 ? y + 1 < this.wetHeight : y > 0,
          ],
        ] as const)
          if (g && valid)
            move(to, Math.min(0.12, (Math.abs(g) * STEP * excess) / wet[i]));
      }
    }
    for (const i of touched) {
      wet[i] += this.solventDelta[i];
      pigment[i] += this.pigmentDelta[i];
      this.solventDelta[i] = 0;
      this.pigmentDelta[i] = 0;
      if (wet[i] > 0) this.active.add(i);
      else {
        // Bind any floating-point residue; drying never discards pigment.
        this.settled[i] += pigment[i];
        pigment[i] = 0;
        wet[i] = 0;
        this.active.delete(i);
      }
      this.pack(i);
    }
  };

  private pack(i: number) {
    this.surface[i * 4] = this.mobile.density[i] + this.settled[i];
    this.surface[i * 4 + 1] = this.solvent.density[i];
  }
  clear() {
    this.filmVersion++;
    this.surfaceVersion++;
    this.film.clear();
    this.mobile.clear();
    this.solvent.clear();
    this.settled.fill(0);
    this.surface.fill(0);
    this.active.clear();
  }
  snapshot(): PaintSnapshot {
    return {
      film: this.density.slice(),
      mobile: this.mobile.density.slice(),
      solvent: this.solvent.density.slice(),
      settled: this.settled.slice(),
    };
  }
  restore(snapshot: PaintSnapshot) {
    this.filmVersion++;
    this.surfaceVersion++;
    this.density.set(snapshot.film);
    this.mobile.density.set(snapshot.mobile);
    this.solvent.density.set(snapshot.solvent);
    this.settled.set(snapshot.settled);
    this.active.clear();
    for (let i = 0; i < this.settled.length; i++) {
      if (this.solvent.density[i] > 0) this.active.add(i);
      this.pack(i);
    }
  }
  /** Match the renderer's interpolation when exporting or making thumbnails. */
  pigmentAt(u: number, v: number) {
    const sample = (
      data: Float32Array,
      width: number,
      height: number,
      stride: number
    ) => {
      const x = Math.max(0, Math.min(width - 1, u * width - 0.5));
      const y = Math.max(0, Math.min(height - 1, v * height - 0.5));
      const x0 = Math.floor(x),
        y0 = Math.floor(y);
      const x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1);
      const a =
        data[(y0 * width + x0) * stride] * (1 - (x % 1)) +
        data[(y0 * width + x1) * stride] * (x % 1);
      const b =
        data[(y1 * width + x0) * stride] * (1 - (x % 1)) +
        data[(y1 * width + x1) * stride] * (x % 1);
      return a * (1 - (y % 1)) + b * (y % 1);
    };
    return (
      sample(this.density, this.width, this.height, 1) +
      sample(this.surface, this.wetWidth, this.wetHeight, 4)
    );
  }
  get mass() {
    return (
      this.film.mass +
      this.mobile.mass +
      (this.settled.reduce((sum, d) => sum + d, 0) *
        this.config.width *
        this.config.height) /
        this.settled.length
    );
  }
}
