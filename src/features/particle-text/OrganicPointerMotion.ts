import { createNoise2D } from 'simplex-noise';

export interface OrganicPointerSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  influence: number;
  depth: number;
  yaw: number;
  pitch: number;
}

/**
 * A coarse map of where the ink actually is, in normalised heading-box space.
 *
 * Blurred hard on purpose. A sharp occupancy map has no gradient anywhere the
 * pointer is not already on a letter, which is precisely where it needs one;
 * blurred, every point in the box slopes toward the nearest ink, so the bias
 * has reach without the path ever locking onto a stem.
 */
export interface InkField {
  weight: Float32Array;
  cols: number;
  rows: number;
}

export const INK_COLS = 64;
export const INK_ROWS = 16;

/**
 * A quiet, self-propelled pointer for the masthead.
 *
 * Pixel Flow's idle movement works because it feeds the simulation through the
 * same input path as a mouse. This keeps that property, but replaces the list
 * of gesture presets with a particle travelling through an evolving curl
 * field. Curl is important here: it turns and folds without converging on a
 * point, so the path feels curious rather than target-seeking or looped.
 *
 * Positions live in normalised heading space. That makes the gesture keep its
 * character when the name changes size, while speed is converted to pixels at
 * the edge where it enters the particle field.
 *
 * ## Why there is an ink field
 *
 * The first version roamed the heading's *layout box* and pulled weakly toward
 * its centre. Measured over a minute of the real masthead, that put it over
 * blank paper 23% of the time — "Rahim Neal" fills 727 px of a 972 px box, so
 * the top right corner is a dead zone the curl was free to spend five seconds
 * in at a stretch. An automatic gesture that is stirring nothing for a quarter
 * of its life reads as broken rather than as quiet. The curl still decides
 * where the path goes; the ink field decides where it goes *looking*.
 */
export class OrganicPointerMotion {
  private readonly noise = createNoise2D();
  private width = 1;
  private height = 1;
  private ink: InkField | null = null;
  private x = 0.46;
  private y = 0.48;
  private vx = 0;
  private vy = 0;
  private time = Math.random() * 200;
  private quiet = 0;
  private influence = 0;

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  public setInk(ink: InkField | null): void {
    this.ink = ink;
  }

  /** The reader always owns the field immediately. */
  public suspend(x?: number, y?: number): void {
    if (x !== undefined)
      this.x = Math.max(0.08, Math.min(0.92, x / this.width));
    if (y !== undefined) this.y = Math.max(0.1, Math.min(0.9, y / this.height));
    this.quiet = 0;
    this.influence = 0;
    this.vx = 0;
    this.vy = 0;
  }

  /** Bilinear sample of the blurred occupancy, in normalised box space. */
  private inkAt(x: number, y: number): number {
    const field = this.ink;
    if (!field) return 0;
    const { weight, cols, rows } = field;
    const u = Math.min(cols - 1.001, Math.max(0, x * cols - 0.5));
    const v = Math.min(rows - 1.001, Math.max(0, y * rows - 0.5));
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const i = y0 * cols + x0;
    const a = weight[i];
    const b = weight[i + 1];
    const c = weight[i + cols];
    const d = weight[i + cols + 1];
    return (
      a * (1 - fx) * (1 - fy) +
      b * fx * (1 - fy) +
      c * (1 - fx) * fy +
      d * fx * fy
    );
  }

  public update(
    dt: number,
    enabled: boolean,
    delay: number,
    speed: number,
    strength: number,
    depthAmount: number,
    attention: number
  ): OrganicPointerSample {
    this.time += dt;
    this.quiet = enabled ? this.quiet + dt : 0;

    const targetInfluence = enabled && this.quiet > delay ? strength : 0;
    // Leave faster than it arrives. A real pointer should never have to fight
    // the automatic one, while the return should be too soft to announce itself.
    const influenceEase = targetInfluence > this.influence ? 1.6 : 0.12;
    const influenceBlend = 1 - 1 / (1 + dt / influenceEase);
    this.influence += (targetInfluence - this.influence) * influenceBlend;

    // Curl of a scalar simplex field, sampled with central differences. A
    // second octave changes at a different rate, preventing a closed orbit.
    const scale = 1.9;
    const epsilon = 0.018;
    const tx = this.time * 0.055;
    const ty = this.time * -0.041;
    const potential = (x: number, y: number) =>
      this.noise(x * scale + tx, y * scale + ty) +
      this.noise(
        x * scale * 2.17 - tx * 1.4 + 19.7,
        y * scale * 2.17 + ty * 1.6 - 8.3
      ) *
        0.32;
    const dY =
      (potential(this.x, this.y + epsilon) -
        potential(this.x, this.y - epsilon)) /
      (epsilon * 2);
    const dX =
      (potential(this.x + epsilon, this.y) -
        potential(this.x - epsilon, this.y)) /
      (epsilon * 2);

    // Normalised before anything is added to it. The curl's magnitude wanders
    // by a factor of several between samples, and leaving it in made the ink
    // bias and the walls mean different things at different points of the path.
    const curl = Math.hypot(dY, dX) || 1;
    let dirX = dY / curl;
    let dirY = -dX / curl;

    // Uphill toward ink, from the blurred occupancy. The gradient step is a
    // whole cell wide: any narrower and the bias reads the gaps between stems
    // rather than the shape of the word.
    const gradEpsilon = 1 / INK_COLS;
    const gx =
      (this.inkAt(this.x + gradEpsilon, this.y) -
        this.inkAt(this.x - gradEpsilon, this.y)) *
      0.5;
    const gy =
      (this.inkAt(this.x, this.y + gradEpsilon) -
        this.inkAt(this.x, this.y - gradEpsilon)) *
      0.5;
    const gradient = Math.hypot(gx, gy);
    if (gradient > 1e-5) {
      // Weighted by how little ink is under it: on the word the curl has the
      // path to itself, and the pull only takes over once it has wandered off.
      const lost = 1 - Math.min(1, this.inkAt(this.x, this.y));
      const pull = (attention * lost * lost) / gradient;
      dirX += gx * pull;
      dirY += gy * pull;
    }

    // The walls, which the ink field cannot stand in for: a word that reaches
    // the right edge would otherwise be followed straight out of the box.
    const edgeX =
      this.x < 0.16
        ? (0.16 - this.x) * 8
        : this.x > 0.84
          ? (0.84 - this.x) * 8
          : 0;
    const edgeY =
      this.y < 0.18
        ? (0.18 - this.y) * 8
        : this.y > 0.82
          ? (0.82 - this.y) * 8
          : 0;
    dirX += edgeX;
    dirY += edgeY;

    const length = Math.hypot(dirX, dirY) || 1;
    dirX /= length;
    dirY /= length;

    const breath =
      0.82 +
      Math.sin(this.time * 0.71) * 0.1 +
      this.noise(this.time * 0.08, 41) * 0.08;
    const desiredX = dirX * speed * breath;
    const desiredY = dirY * speed * breath;
    const velocityBlend = 1 - 1 / (1 + dt / 0.75);
    this.vx += (desiredX - this.vx) * velocityBlend;
    this.vy += (desiredY - this.vy) * velocityBlend;
    this.x = Math.max(0.06, Math.min(0.94, this.x + this.vx * dt));
    this.y = Math.max(0.08, Math.min(0.92, this.y + this.vy * dt));

    // A separate slow noise dimension makes the field inhale and exhale in z
    // instead of tying depth mechanically to screen position.
    const depthPhase = this.noise(
      this.time * 0.12 + 73,
      this.x * 0.7 - this.y * 0.5
    );
    const activeFraction = strength > 0 ? this.influence / strength : 0;
    const depth =
      depthAmount * activeFraction * (0.72 + (depthPhase + 1) * 0.2);

    return {
      x: this.x * this.width,
      y: this.y * this.height,
      vx: this.vx * this.width,
      vy: this.vy * this.height,
      influence: this.influence,
      depth,
      yaw: (this.x - 0.5) * depth * 0.7,
      pitch: (0.5 - this.y) * depth * 0.45,
    };
  }
}
