export interface FlowFieldOptions {
  /** Number of field samples across the effect's width. */
  gridSize?: number;
  /** Radius of the pointer's influence, in CSS pixels. */
  radius?: number;
  /** Amount of pointer velocity transferred into the field. */
  impulse?: number;
  /** Velocity retained per 60 Hz frame. */
  relaxation?: number;
}

const NEUTRAL_CHANNEL = 128;
const FRAME_DURATION = 1000 / 60;

/**
 * A small, renderer-agnostic vector field.
 *
 * Values are kept in a float buffer for simulation and packed into an RGBA8
 * texture for the GPU. RGBA8 keeps linear filtering available without relying
 * on optional floating-point texture extensions.
 */
export class FlowField {
  private gridSize = 84;
  private radius = 110;
  private impulse = 0.72;
  private relaxation = 0.9;

  private width = 1;
  private height = 1;
  private columns = 1;
  private rows = 1;
  private vectors = new Float32Array(2);
  private pixels = new Uint8Array([
    NEUTRAL_CHANNEL,
    NEUTRAL_CHANNEL,
    NEUTRAL_CHANNEL,
    255,
  ]);
  private currentEnergy = 0;

  constructor(options: FlowFieldOptions = {}) {
    this.configure(options);
  }

  public configure(options: FlowFieldOptions): void {
    this.gridSize = options.gridSize ?? this.gridSize;
    this.radius = options.radius ?? this.radius;
    this.impulse = options.impulse ?? this.impulse;
    this.relaxation = options.relaxation ?? this.relaxation;
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.columns = Math.max(2, Math.round(this.gridSize));
    const cellSize = this.width / this.columns;
    this.rows = Math.max(2, Math.ceil(this.height / cellSize));
    this.vectors = new Float32Array(this.columns * this.rows * 2);
    this.pixels = new Uint8Array(this.columns * this.rows * 4);
    this.currentEnergy = 0;
    this.packTexture();
  }

  public addImpulse(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number
  ): void {
    const speed = Math.hypot(velocityX, velocityY);
    if (speed < 0.05) return;

    const cellWidth = this.width / this.columns;
    const cellHeight = this.height / this.rows;
    const minColumn = Math.max(0, Math.floor((x - this.radius) / cellWidth));
    const maxColumn = Math.min(
      this.columns - 1,
      Math.ceil((x + this.radius) / cellWidth)
    );
    const minRow = Math.max(0, Math.floor((y - this.radius) / cellHeight));
    const maxRow = Math.min(
      this.rows - 1,
      Math.ceil((y + this.radius) / cellHeight)
    );

    // Pointer events can arrive at very different rates. Normalising the
    // velocity prevents a single delayed event from tearing the whole heading.
    const velocityScale = 1 / Math.max(28, speed);
    const normalisedX = velocityX * velocityScale;
    const normalisedY = velocityY * velocityScale;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const sampleX = (column + 0.5) * cellWidth;
        const sampleY = (row + 0.5) * cellHeight;
        const distance = Math.hypot(sampleX - x, sampleY - y);
        if (distance >= this.radius) continue;

        const proximity = 1 - distance / this.radius;
        const falloff = proximity * proximity * (3 - 2 * proximity);
        const index = (row * this.columns + column) * 2;

        this.vectors[index] = this.clampVector(
          this.vectors[index] + normalisedX * this.impulse * falloff
        );
        this.vectors[index + 1] = this.clampVector(
          this.vectors[index + 1] + normalisedY * this.impulse * falloff
        );
      }
    }

    this.currentEnergy = Math.max(this.currentEnergy, Math.min(1, speed / 28));
  }

  public step(deltaTime: number): void {
    const frameAdjustedRelaxation = Math.pow(
      this.relaxation,
      Math.min(deltaTime, 50) / FRAME_DURATION
    );
    let energy = 0;

    for (let index = 0; index < this.vectors.length; index += 1) {
      const value = this.vectors[index] * frameAdjustedRelaxation;
      this.vectors[index] = Math.abs(value) < 0.0005 ? 0 : value;
      energy = Math.max(energy, Math.abs(this.vectors[index]));
    }

    this.currentEnergy = energy;
    this.packTexture();
  }

  public get textureWidth(): number {
    return this.columns;
  }

  public get textureHeight(): number {
    return this.rows;
  }

  public get textureData(): Uint8Array {
    return this.pixels;
  }

  public get energy(): number {
    return this.currentEnergy;
  }

  private packTexture(): void {
    for (let index = 0; index < this.columns * this.rows; index += 1) {
      const vectorIndex = index * 2;
      const pixelIndex = index * 4;

      this.pixels[pixelIndex] = this.packChannel(this.vectors[vectorIndex]);
      this.pixels[pixelIndex + 1] = this.packChannel(
        this.vectors[vectorIndex + 1]
      );
      this.pixels[pixelIndex + 2] = NEUTRAL_CHANNEL;
      this.pixels[pixelIndex + 3] = 255;
    }
  }

  private packChannel(value: number): number {
    return Math.round(this.clampVector(value) * 127 + NEUTRAL_CHANNEL);
  }

  private clampVector(value: number): number {
    return Math.max(-1, Math.min(1, value));
  }
}
