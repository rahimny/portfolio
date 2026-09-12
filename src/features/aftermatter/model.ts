/** A deterministic cellular sandbox. Y increases upwards; each cell moves once per tick. */
export const M = {
  Empty: 0,
  Sand: 1,
  Water: 2,
  Fire: 3,
  Oil: 4,
  Powder: 5,
  Wood: 6,
  Seed: 7,
  Plant: 8,
  Lava: 9,
  Stone: 10,
  Steam: 11,
  Acid: 12,
  Ice: 13,
  Smoke: 14,
} as const;
export type Material = (typeof M)[keyof typeof M];
export type Tool = Material | 'vortex';
export const MATERIALS = [
  {
    id: M.Sand,
    name: 'Sand',
    color: 'rgb(232, 184, 102)',
    hint: 'Falls, piles up and sinks through water.',
  },
  {
    id: M.Water,
    name: 'Water',
    color: 'rgb(74, 174, 237)',
    hint: 'Flows, extinguishes fire and cools lava into stone.',
  },
  {
    id: M.Fire,
    name: 'Fire',
    color: 'rgb(255, 114, 53)',
    hint: 'Ignites oil, wood and powder. Try a tiny spark.',
  },
  {
    id: M.Powder,
    name: 'Powder',
    color: 'rgb(191, 162, 219)',
    hint: 'Lay a trail. Add fire. Watch the chain travel.',
  },
  {
    id: M.Oil,
    name: 'Oil',
    color: 'rgb(184, 150, 79)',
    hint: 'Floats on water. Burns slowly and spreads fire.',
  },
  {
    id: M.Wood,
    name: 'Wood',
    color: 'rgb(167, 119, 83)',
    hint: 'Draw a bridge, a wall or a fuse. It burns.',
  },
  {
    id: M.Seed,
    name: 'Seed',
    color: 'rgb(181, 220, 106)',
    hint: 'Add water to grow a branching green canopy.',
  },
  {
    id: M.Lava,
    name: 'Lava',
    color: 'rgb(255, 83, 39)',
    hint: 'Molten rock. Add water to build new land.',
  },
  {
    id: M.Acid,
    name: 'Acid',
    color: 'rgb(213, 241, 69)',
    hint: 'Eats through solid material, spending itself as it goes.',
  },
  {
    id: M.Ice,
    name: 'Ice',
    color: 'rgb(169, 220, 237)',
    hint: 'Build frozen structures. Heat melts them into water.',
  },
  {
    id: M.Stone,
    name: 'Stone',
    color: 'rgb(155, 167, 185)',
    hint: 'Permanent structure. Shape the path of your reactions.',
  },
] as const;
export type SceneName = 'Terrarium' | 'Chain reaction' | 'Volcanic' | 'Empty';
export const SCENES: SceneName[] = [
  'Terrarium',
  'Chain reaction',
  'Volcanic',
  'Empty',
];
export type Discovery =
  | 'Combustion'
  | 'Chain reaction'
  | 'New land'
  | 'Germination'
  | 'Melting'
  | 'Corrosion';
export const DISCOVERIES: Discovery[] = [
  'Combustion',
  'Chain reaction',
  'New land',
  'Germination',
  'Melting',
  'Corrosion',
];
export interface Blast {
  x: number;
  y: number;
  radius: number;
  tick: number;
}
export interface Snapshot {
  version: 1;
  width: number;
  height: number;
  cells: number[];
  life: number[];
  tick: number;
  random: number;
  discoveries: Discovery[];
}
const flammable = (m: number) =>
  m === M.Wood || m === M.Plant || m === M.Oil || m === M.Seed;
const gas = (m: number) => m === M.Fire || m === M.Steam || m === M.Smoke;
const liquid = (m: number) =>
  m === M.Water || m === M.Oil || m === M.Lava || m === M.Acid;
export class PowderWorld {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly life: Uint16Array;
  private visited: Uint32Array;
  private randomState = 94721;
  tick = 0;
  discoveries = new Set<Discovery>();
  blasts: Blast[] = [];
  reactions = 0;
  constructor(width = 320, height = 96) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.life = new Uint16Array(width * height);
    this.visited = new Uint32Array(width * height);
  }
  random() {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  index(x: number, y: number) {
    return x + y * this.width;
  }
  inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  at(x: number, y: number): Material {
    return this.inside(x, y)
      ? (this.cells[this.index(x, y)] as Material)
      : M.Stone;
  }
  put(x: number, y: number, material: Material, life?: number) {
    if (!this.inside(x, y)) return;
    const i = this.index(x, y);
    this.cells[i] = material;
    this.life[i] =
      life ??
      (material === M.Fire
        ? 35 + Math.floor(this.random() * 55)
        : material === M.Lava
          ? 1700
          : material === M.Plant
            ? 36
            : material === M.Steam
              ? 210
              : material === M.Smoke
                ? 100
                : 0);
    this.visited[i] = this.tick;
  }
  paint(cx: number, cy: number, radius: number, tool: Tool) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    radius = Math.max(1, Math.min(18, radius));
    if (tool === 'vortex') {
      this.vortex(cx, cy, radius * 4);
      return;
    }
    for (let y = -radius; y <= radius; y++)
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y > radius * radius || !this.inside(cx + x, cy + y))
          continue;
        if (
          tool === M.Empty ||
          this.at(cx + x, cy + y) === M.Empty ||
          (tool === M.Fire && flammable(this.at(cx + x, cy + y)))
        )
          this.put(cx + x, cy + y, tool);
      }
  }
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
    tool: Tool
  ) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let s = 0; s <= steps; s++)
      this.paint(
        x1 + ((x2 - x1) * s) / steps,
        y1 + ((y2 - y1) * s) / steps,
        radius,
        tool
      );
  }
  private discover(d: Discovery) {
    this.discoveries.add(d);
    this.reactions++;
  }
  private swap(a: number, b: number) {
    const m = this.cells[a],
      l = this.life[a];
    this.cells[a] = this.cells[b];
    this.life[a] = this.life[b];
    this.cells[b] = m;
    this.life[b] = l;
    this.visited[a] = this.tick;
    this.visited[b] = this.tick;
  }
  private move(x: number, y: number, nx: number, ny: number, heavy = false) {
    if (!this.inside(nx, ny)) return false;
    const a = this.index(x, y),
      b = this.index(nx, ny),
      target = this.cells[b];
    if (
      target === M.Empty ||
      (heavy && (target === M.Water || target === M.Oil || gas(target))) ||
      (this.cells[a] === M.Water && target === M.Oil)
    ) {
      this.swap(a, b);
      return true;
    }
    return false;
  }
  private vortex(cx: number, cy: number, radius: number) {
    for (let k = 0; k < radius * radius * 3; k++) {
      const x = Math.floor(cx + (this.random() - 0.5) * radius * 2),
        y = Math.floor(cy + (this.random() - 0.5) * radius * 2),
        dx = x - cx,
        dy = y - cy;
      if (!this.inside(x, y) || dx * dx + dy * dy > radius * radius) continue;
      const m = this.at(x, y);
      if (
        m === M.Empty ||
        m === M.Stone ||
        m === M.Wood ||
        m === M.Ice ||
        m === M.Plant
      )
        continue;
      this.move(
        x,
        y,
        x + Math.round((-dy / radius) * 3),
        y + Math.round((dx / radius) * 3 + 1)
      );
    }
  }
  private explode(x: number, y: number) {
    const radius = 9;
    this.discover('Chain reaction');
    this.blasts.push({ x, y, radius, tick: this.tick });
    if (this.blasts.length > 24) this.blasts.shift();
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius || !this.inside(x + dx, y + dy))
          continue;
        const m = this.at(x + dx, y + dy);
        if (m === M.Stone || m === M.Lava) continue;
        if (m === M.Sand || m === M.Water) {
          // Trace the impulse through free cells so a blast cannot throw matter through a wall.
          let nx = x + dx,
            ny = y + dy;
          const distance = Math.max(1, Math.hypot(dx, dy));
          for (let travel = 1; travel <= 6; travel++) {
            const tx = x + dx + Math.round((dx / distance) * travel);
            const ty = y + dy + Math.round((dy / distance) * travel);
            if (tx === x + dx && ty === y + dy) continue;
            if (this.at(tx, ty) !== M.Empty) break;
            nx = tx;
            ny = ty;
          }
          this.move(x + dx, y + dy, nx, ny);
          continue;
        }
        if (m === M.Powder) {
          if (dx * dx + dy * dy < 36)
            this.put(
              x + dx,
              y + dy,
              M.Fire,
              20 + Math.floor(this.random() * 25)
            );
          else this.life[this.index(x + dx, y + dy)] = 1;
          continue;
        }
        if (this.random() < 0.12)
          this.put(x + dx, y + dy, M.Fire, 12 + Math.floor(this.random() * 36));
      }
    this.put(x, y, M.Fire, 50);
  }
  step() {
    this.tick++;
    this.blasts = this.blasts.filter((b) => this.tick - b.tick < 30);
    for (let y = 0; y < this.height; y++)
      for (let scan = 0; scan < this.width; scan++) {
        const x = this.tick % 2 ? scan : this.width - 1 - scan,
          i = this.index(x, y),
          m = this.cells[i];
        if (m === M.Empty || this.visited[i] === this.tick) continue;
        this.visited[i] = this.tick;
        const dir = this.random() < 0.5 ? -1 : 1;
        const neighbours = [
          [x, y - 1],
          [x + dir, y],
          [x - dir, y],
          [x, y + 1],
        ];
        if (m === M.Fire || m === M.Lava) {
          for (const [nx, ny] of neighbours) {
            const n = this.at(nx, ny);
            if (n === M.Water) {
              this.put(nx, ny, M.Steam);
              this.put(x, y, m === M.Lava ? M.Stone : M.Empty);
              if (m === M.Lava) this.discover('New land');
              break;
            }
            if (n === M.Powder) this.life[this.index(nx, ny)] = 1;
            if (flammable(n) && this.random() < 0.12) {
              this.put(nx, ny, M.Fire, n === M.Oil ? 170 : 100);
              this.discover('Combustion');
            }
            if (n === M.Ice) {
              this.put(nx, ny, M.Water);
              this.discover('Melting');
            }
          }
          if (this.cells[i] !== m) continue;
        }
        if (
          m === M.Powder &&
          (this.life[i] > 0 ||
            neighbours.some(
              ([nx, ny]) =>
                this.at(nx, ny) === M.Fire || this.at(nx, ny) === M.Lava
            ))
        ) {
          this.explode(x, y);
          continue;
        }
        if (m === M.Seed) {
          if (neighbours.some(([nx, ny]) => this.at(nx, ny) === M.Water)) {
            this.put(x, y, M.Plant, 42);
            this.discover('Germination');
            continue;
          }
        }
        if (m === M.Plant) {
          if (this.life[i] > 0 && this.tick % 5 === 0) {
            const nx = x + (this.random() < 0.5 ? 0 : dir),
              ny = y + 1;
            if (this.at(nx, ny) === M.Empty || this.at(nx, ny) === M.Water) {
              this.put(nx, ny, M.Plant, this.life[i] - 1);
              if (
                this.random() < 0.19 &&
                this.life[i] > 6 &&
                this.at(x - dir, y + 1) === M.Empty
              )
                this.put(x - dir, y + 1, M.Plant, this.life[i] - 5);
            }
            this.life[i] = 0;
          }
          continue;
        }
        if (m === M.Acid)
          for (const [nx, ny] of neighbours) {
            const n = this.at(nx, ny);
            if (
              this.inside(nx, ny) &&
              n !== M.Empty &&
              n !== M.Acid &&
              !gas(n) &&
              n !== M.Water &&
              this.random() < 0.05
            ) {
              this.put(nx, ny, M.Smoke);
              this.discover('Corrosion');
              if (this.random() < 0.3) this.put(x, y, M.Empty);
              break;
            }
          }
        if (this.cells[i] !== m) continue;
        if (gas(m)) {
          if (this.life[i] > 0) this.life[i]--;
          if (this.life[i] === 0 || y === this.height - 1) {
            this.put(
              x,
              y,
              m === M.Steam && y < this.height - 1
                ? M.Water
                : m === M.Fire && this.random() < 0.25
                  ? M.Smoke
                  : M.Empty
            );
            continue;
          }
          if (this.random() < 0.7) {
            if (this.move(x, y, x + dir, y + 1) || this.move(x, y, x, y + 1))
              continue;
            this.move(x, y, x + dir, y);
          }
          continue;
        }
        if (m === M.Lava) {
          if (this.life[i] > 0) this.life[i]--;
          else {
            this.put(x, y, M.Stone);
            continue;
          }
          if (this.tick % 3 !== 0) continue;
        }
        if (m === M.Stone || m === M.Wood || m === M.Ice) continue;
        if (
          this.move(x, y, x, y - 1, !liquid(m)) ||
          this.move(x, y, x + dir, y - 1, !liquid(m)) ||
          this.move(x, y, x - dir, y - 1, !liquid(m))
        )
          continue;
        if (liquid(m)) {
          const range = m === M.Water ? 5 : m === M.Lava ? 1 : 3;
          for (let d = 1; d <= range; d++) {
            if (this.at(x + dir * d, y) !== M.Empty) break;
            if (d === range || this.at(x + dir * d, y - 1) === M.Empty) {
              this.move(x, y, x + dir * d, y);
              break;
            }
          }
        }
      }
  }
  clear() {
    this.cells.fill(0);
    this.life.fill(0);
    this.visited.fill(0);
    this.tick = 0;
    this.blasts = [];
    this.reactions = 0;
    this.discoveries.clear();
    this.randomState = 94721;
  }
  loadScene(name: SceneName) {
    this.clear();
    if (name === 'Empty') return;
    const w = this.width;
    for (let x = 0; x < w; x++) {
      const floor =
        6 + Math.floor(Math.sin(x * 0.065) * 2 + Math.sin(x * 0.19));
      for (let y = 0; y < floor; y++) this.put(x, y, M.Stone);
    }
    if (name === 'Terrarium') {
      for (let x = 0; x < w; x++) {
        const top =
          13 +
          Math.floor(
            29 * Math.exp(-(((x - w * 0.18) / (w * 0.2)) ** 2)) +
              20 * Math.exp(-(((x - w * 0.89) / (w * 0.16)) ** 2))
          );
        for (let y = 7; y < top; y++) this.put(x, y, M.Sand);
        for (let y = top; y < 25; y++) this.put(x, y, M.Water);
      }
      this.line(w * 0.15, 36, w * 0.15, 66, 2, M.Wood);
      this.line(w * 0.15, 52, w * 0.08, 62, 1, M.Wood);
      this.line(w * 0.15, 57, w * 0.24, 71, 1, M.Wood);
      this.paint(w * 0.08, 65, 10, M.Plant);
      this.paint(w * 0.16, 73, 13, M.Plant);
      this.paint(w * 0.24, 74, 10, M.Plant);
      for (let i = 0; i < this.cells.length; i++)
        if (this.cells[i] === M.Plant) this.life[i] = 0;
      this.line(w * 0.6, 66, w * 0.85, 66, 1, M.Stone);
      this.line(w * 0.63, 69, w * 0.81, 69, 2, M.Powder);
      this.paint(w * 0.69, 77, 6, M.Powder);
      this.line(w * 0.39, 17, w * 0.4, 34, 1, M.Seed);
    } else if (name === 'Chain reaction') {
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = 25 + shelf * 29;
        this.line(18, y, w - 19, y, 1, M.Wood);
        this.line(22, y + 4, w - 23, y + 4, 2, M.Powder);
        for (let x = 28; x < w - 20; x += 30) this.paint(x, y + 9, 5, M.Powder);
      }
      this.line(19, 28, 19, 89, 2, M.Powder);
    } else {
      for (let x = 0; x < w; x++) {
        const top =
          14 + Math.floor(54 * Math.exp(-(((x - w * 0.48) / (w * 0.2)) ** 2)));
        for (let y = 7; y < top; y++) this.put(x, y, M.Stone);
        if (Math.abs(x - w * 0.48) < 11)
          for (let y = 28; y < 70; y++) this.put(x, y, M.Lava);
        if (x > w * 0.72)
          for (let y = 17; y < 44; y++)
            if (this.at(x, y) === M.Empty) this.put(x, y, M.Water);
      }
    }
  }
  snapshot(): Snapshot {
    return {
      version: 1,
      width: this.width,
      height: this.height,
      cells: Array.from(this.cells),
      life: Array.from(this.life),
      tick: this.tick,
      random: this.randomState,
      discoveries: [...this.discoveries],
    };
  }
  restore(value: unknown) {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid chamber file.');
    const s = value as Snapshot;
    if (
      s.version !== 1 ||
      s.width !== this.width ||
      s.height !== this.height ||
      !Array.isArray(s.cells) ||
      s.cells.length !== this.cells.length ||
      !s.cells.every((n) => Number.isInteger(n) && n >= 0 && n <= 14) ||
      !Array.isArray(s.life) ||
      s.life.length !== this.life.length ||
      !s.life.every((n) => Number.isInteger(n) && n >= 0 && n <= 65535) ||
      !Number.isSafeInteger(s.tick) ||
      s.tick < 0 ||
      s.tick > 1e9 ||
      !Number.isInteger(s.random) ||
      s.random < 0 ||
      s.random > 4294967295 ||
      !Array.isArray(s.discoveries) ||
      !s.discoveries.every((d) => DISCOVERIES.includes(d))
    )
      throw new Error('This file is not a compatible Aftermatter chamber.');
    this.cells.set(s.cells);
    this.life.set(s.life);
    this.tick = s.tick;
    this.randomState = s.random;
    this.discoveries = new Set(s.discoveries);
    this.visited.fill(0);
    this.blasts = [];
    this.reactions = 0;
  }
}
