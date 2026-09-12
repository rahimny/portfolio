export type NereidView = 'specimen' | 'anatomy' | 'lattice';
export const LIMBS = 8;
export const LATTICE_ROWS = 34;
export const LATTICE_COLUMNS = 6;

export function clampSeparation(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** A tapered, curling centreline, shared by the lattice, tendons and collars. */
export function tentaclePoint(
  t: number,
  index: number
): [number, number, number] {
  const angle = (index / LIMBS) * Math.PI * 2;
  const curl = Math.sin(t * Math.PI * 1.35 + index * 0.6) * t * t;
  const radius =
    2.02 + Math.sin(t * Math.PI * 0.92) * (0.8 + (index % 3) * 0.18);
  return [
    Math.cos(angle) * radius + Math.sin(angle) * curl * 1.2,
    0.85 - t * (5.5 + Math.sin(index * 2) * 0.45),
    Math.sin(angle) * radius - Math.cos(angle) * curl * 1.2,
  ];
}

/** Pointy hexagons tile a cylindrical UV sheet, then follow the limb frame. */
export function hexCell(row: number, column: number): [number, number][] {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = Math.PI / 6 + (corner * Math.PI) / 3;
    return [
      (column + (row % 2) * 0.5 + Math.cos(angle) / Math.sqrt(3)) /
        LATTICE_COLUMNS,
      (row + (Math.sin(angle) * 2) / 3 + 0.7) / (LATTICE_ROWS + 1.4),
    ];
  });
}
