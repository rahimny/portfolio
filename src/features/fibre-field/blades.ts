export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** One triangle per blade. Randomness is static; deformation stays on the GPU. */
export function createFibreBlades(
  seed: number,
  subdivisions: number,
  options: {
    radius: number;
    accept?: (x: number, z: number) => boolean;
    ground?: (x: number, z: number) => number;
    heightScale?: number;
    widthScale?: number;
  }
) {
  const {
    radius,
    accept = (x, z) => Math.hypot(x, z) <= radius - 0.08,
    ground = () => 0,
    heightScale = 1,
    widthScale = 1,
  } = options;
  const random = seededRandom(seed);
  const roots: number[] = [];
  const shapes: number[] = [];
  const cell = (radius * 2) / subdivisions;
  for (let row = 0; row < subdivisions; row++) {
    for (let column = 0; column < subdivisions; column++) {
      const x = -radius + (column + 0.15 + random() * 0.7) * cell;
      const z = -radius + (row + 0.15 + random() * 0.7) * cell;
      if (!accept(x, z)) continue;
      const clump = 0.5 + 0.5 * Math.sin(x * 1.7 + Math.cos(z * 1.2));
      const height = 0.28 + random() * 0.28 + clump * 0.32;
      const width = 0.025 + random() * 0.018;
      for (const [side, tip] of [
        [-1, 0],
        [1, 0],
        [0.25, 1],
      ]) {
        roots.push(x, ground(x, z), z);
        shapes.push(side, tip, height * heightScale, width * widthScale);
      }
    }
  }
  return {
    positions: new Float32Array(roots),
    shapes: new Float32Array(shapes),
    count: roots.length / 9,
  };
}
