import { BED_Y, LAYERS, PRINT_HEIGHT, type Form, type Contour } from './types';
import { sliceTriangles } from './slicing';
import type { EditionGenome } from './living';
export function generateContours(
  form: Form,
  seed = 1,
  genome?: EditionGenome
): Contour[] {
  if (form === 'terrain') {
    const positions: number[] = [];
    const resolution = 44;
    const vertex = (i: number, j: number) => {
      const x = (i / resolution) * 2 - 1,
        y = (j / resolution) * 2 - 1;
      const r1 = Math.hypot(x - 0.28, y - 0.18),
        r2 = Math.hypot(x + 0.38, y + 0.23);
      const envelope = Math.exp(-(x * x + y * y) * 1.9);
      const height =
        0.06 +
        (0.67 +
          0.22 *
            Math.sin(
              r1 * 10 * (genome?.twist ?? 1) +
                (genome ? genome.phase * Math.PI * 2 : seed * 0.4)
            ) +
          0.18 * Math.cos(r2 * 12 + (genome?.phase ?? 0) * Math.PI) +
          (genome
            ? genome.asymmetry *
              0.35 *
              Math.sin(
                Math.atan2(y, x) * genome.lobes + genome.phase * Math.PI * 2
              )
            : 0)) *
          envelope *
          1.8;
      return [x, y, height];
    };
    for (let i = 0; i < resolution; i++)
      for (let j = 0; j < resolution; j++) {
        const a = vertex(i, j),
          b = vertex(i + 1, j),
          c = vertex(i, j + 1),
          d = vertex(i + 1, j + 1);
        positions.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    for (let i = 0; i < resolution; i++) {
      for (const [a, b] of [
        [vertex(i, 0), vertex(i + 1, 0)],
        [vertex(i, resolution), vertex(i + 1, resolution)],
        [vertex(0, i), vertex(0, i + 1)],
        [vertex(resolution, i), vertex(resolution, i + 1)],
      ]) {
        const lowA = [a[0], a[1], 0],
          lowB = [b[0], b[1], 0];
        positions.push(...a, ...lowA, ...b, ...b, ...lowA, ...lowB);
      }
    }
    positions.push(-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0);
    return sliceTriangles(positions);
  }
  return Array.from({ length: LAYERS }, (_, layer) => {
    const t = layer / (LAYERS - 1);
    return Array.from({ length: 161 }, (_, i) => {
      const a = (i / 160) * Math.PI * 2;
      const twist =
        t * (form === 'ribbon' ? 3.8 : 2.2) * (genome?.twist ?? 1) +
        (genome ? genome.phase * Math.PI * 2 : seed * 0.37);
      let r: number;
      if (form === 'bloom') {
        r =
          (0.63 + 0.27 * Math.sin(t * Math.PI)) *
            (1 + 0.24 * Math.cos((genome?.lobes ?? 5) * a + twist * 3)) +
          0.04 * Math.sin((genome ? genome.lobes * 3 : 15) * a + twist);
      } else if (form === 'ribbon') {
        r =
          (0.71 + 0.15 * Math.cos(t * Math.PI * 3)) *
          (1 + 0.3 * Math.cos((genome?.lobes ?? 3) * a - twist * 2));
      } else {
        r =
          (0.55 + 0.4 * Math.pow(Math.sin(t * Math.PI * 3), 2)) *
          (1 + 0.13 * Math.cos((genome?.lobes ?? 7) * a + twist * 2));
      }
      r *=
        1 +
        (genome?.asymmetry ?? 0) * Math.cos(a + twist) * Math.sin(t * Math.PI);
      return {
        x: r * Math.cos(a) + 0.15 * Math.sin(twist) * t,
        y: BED_Y + 0.025 + t * PRINT_HEIGHT,
        z: r * Math.sin(a) + 0.12 * Math.cos(twist) * t,
      };
    });
  });
}
