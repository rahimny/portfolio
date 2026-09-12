export const COLUMNS = 96;
export const ROWS = 28;
export const COUNT = COLUMNS * ROWS;
export const TURN = (Math.PI * 2) / 3;
export const MESSAGES = [
  'STAY CURIOUS.',
  'MAKE SOME NOISE.',
  'CHANGE IS GOOD.',
];

/** The wave travels over four-connected neighbours; the motors remain independent. */
export class ShutterField {
  readonly angles = new Float32Array(COUNT);
  readonly velocities = new Float32Array(COUNT);
  readonly targets = new Float32Array(COUNT);
  readonly reached = new Uint8Array(COUNT);
  face = 0;
  private frontier: number[] = [];
  private propagationTime = 0;

  transmit(face: number, x = 0, y = ROWS / 2): void {
    this.face = Math.max(0, Math.min(2, Math.round(face)));
    this.reached.fill(0);
    this.frontier = [this.index(x, y)];
    this.reached[this.frontier[0]] = 1;
    this.propagationTime = 0;
    this.address(this.frontier[0]);
  }

  private index(x: number, y: number): number {
    return (
      Math.max(0, Math.min(ROWS - 1, Math.floor(y))) * COLUMNS +
      Math.max(0, Math.min(COLUMNS - 1, Math.floor(x)))
    );
  }

  private address(i: number): void {
    const base = -this.face * TURN;
    this.targets[i] =
      base + Math.round((this.angles[i] - base) / (Math.PI * 2)) * Math.PI * 2;
  }

  disturb(x: number, y: number, force = 1): void {
    for (
      let row = Math.max(0, Math.floor(y - 4));
      row < Math.min(ROWS, y + 5);
      row++
    ) {
      for (
        let col = Math.max(0, Math.floor(x - 4));
        col < Math.min(COLUMNS, x + 5);
        col++
      ) {
        const distance = Math.hypot(col - x, row - y);
        if (distance > 4.5) continue;
        this.velocities[row * COLUMNS + col] +=
          Math.cos(((distance / 4.5) * Math.PI) / 2) * force * 13;
      }
    }
  }

  step(dt: number): boolean {
    this.propagationTime += dt;
    while (this.frontier.length && this.propagationTime >= 0.018) {
      this.propagationTime -= 0.018;
      const next: number[] = [];
      const visit = (i: number) => {
        if (this.reached[i]) return;
        this.reached[i] = 1;
        this.address(i);
        next.push(i);
      };
      for (const i of this.frontier) {
        const x = i % COLUMNS;
        if (x > 0) visit(i - 1);
        if (x < COLUMNS - 1) visit(i + 1);
        if (i >= COLUMNS) visit(i - COLUMNS);
        if (i < COUNT - COLUMNS) visit(i + COLUMNS);
      }
      this.frontier = next;
    }
    let active = this.frontier.length > 0;
    for (let i = 0; i < COUNT; i++) {
      const difference = this.targets[i] - this.angles[i];
      if (
        Math.abs(difference) < 0.0002 &&
        Math.abs(this.velocities[i]) < 0.002
      ) {
        this.angles[i] = this.targets[i];
        this.velocities[i] = 0;
        continue;
      }
      this.velocities[i] += (difference * 115 - this.velocities[i] * 15) * dt;
      this.angles[i] += this.velocities[i] * dt;
      active = true;
    }
    return active;
  }

  settle(): void {
    this.frontier = [];
    for (let i = 0; i < COUNT; i++) this.address(i);
    this.angles.set(this.targets);
    this.velocities.fill(0);
    this.reached.fill(1);
  }
}
