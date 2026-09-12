export type PaletteId = 'signal' | 'inverse' | 'mono' | 'orange';
export type Geometry = 'radial' | 'blocks' | 'hybrid';
export type RatioSystem = 'fibonacci' | 'golden' | 'equal';
export type TextPlacement = 'grid' | 'focus' | 'vertical';
export type TextAlign = 'start' | 'middle' | 'end';
export type MaskMode = 'artboard' | 'field' | 'circle' | 'window';
export type LayerOrder = 'projection' | 'grid' | 'reverse';

export interface Palette {
  id: PaletteId;
  name: string;
  ground: string;
  primary: string;
  accent: string;
  quiet: string;
  guide: string;
}

export interface CompositionShape {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
  kind: 'block' | 'outline' | 'disc' | 'rule';
  tone: 'primary' | 'accent' | 'quiet';
}

interface RatioOption {
  id: RatioSystem;
  name: string;
  values: readonly number[];
}

export const ARTBOARD = { width: 720, height: 900 } as const;

export const PALETTES: readonly Palette[] = [
  {
    id: 'signal',
    name: 'Signal',
    ground: 'var(--paper)',
    primary: 'var(--ink)',
    accent: 'var(--brand)',
    quiet: 'var(--surface-3)',
    guide: 'var(--border-strong)',
  },
  {
    id: 'inverse',
    name: 'Inverse',
    ground: 'var(--ink)',
    primary: 'var(--paper)',
    accent: 'var(--brand)',
    quiet: 'var(--fg-muted)',
    guide: 'var(--on-ink-muted)',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    ground: 'var(--surface)',
    primary: 'var(--ink)',
    accent: 'var(--fg-muted)',
    quiet: 'var(--surface-3)',
    guide: 'var(--border-strong)',
  },
  {
    id: 'orange',
    name: 'Orange',
    ground: 'var(--brand)',
    primary: 'var(--ink)',
    accent: 'var(--paper)',
    quiet: 'var(--brand-hover)',
    guide: 'var(--ink)',
  },
] as const;

export const PRESETS = [
  { label: '8 fields', columns: 2, rows: 4 },
  { label: '20 fields', columns: 4, rows: 5 },
  { label: '32 fields', columns: 4, rows: 8 },
] as const;

export const RATIO_SYSTEMS: readonly RatioOption[] = [
  { id: 'fibonacci', name: 'Fibonacci', values: [1, 2, 3, 5, 8, 13] },
  {
    id: 'golden',
    name: 'Golden',
    values: [1, 1.618, 2.618, 4.236, 6.854, 11.09],
  },
  { id: 'equal', name: 'Equal', values: [1, 2, 3, 4, 5, 6] },
] as const;

export function generateFocalBlocks(
  columns: number,
  rows: number,
  count: number,
  seed: number,
  focusX: number,
  focusY: number,
  spokes: number,
  ratios: readonly number[]
): CompositionShape[] {
  const occupied = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => false)
  );
  const shapes: CompositionShape[] = [];
  const phase = ((seed % 360) * Math.PI) / 180;
  const focusColumn = (focusX / 100) * Math.max(columns - 1, 1);
  const focusRow = (focusY / 100) * Math.max(rows - 1, 1);
  const ratioMax = ratios.at(-1) ?? 1;

  const add = (
    column: number,
    row: number,
    columnSpan: number,
    rowSpan: number,
    kind: CompositionShape['kind'],
    tone: CompositionShape['tone']
  ) => {
    const x2 = Math.min(column + columnSpan, columns);
    const y2 = Math.min(row + rowSpan, rows);
    if (x2 <= column || y2 <= row) return false;

    for (let y = row; y < y2; y += 1) {
      for (let x = column; x < x2; x += 1) {
        if (occupied[y]?.[x]) return false;
      }
    }
    for (let y = row; y < y2; y += 1) {
      for (let x = column; x < x2; x += 1) {
        if (occupied[y]) occupied[y][x] = true;
      }
    }
    shapes.push({
      column,
      row,
      columnSpan: x2 - column,
      rowSpan: y2 - row,
      kind,
      tone,
    });
    return true;
  };

  const centreColumn = Math.max(
    0,
    Math.min(columns - 1, Math.round(focusColumn))
  );
  const centreRow = Math.max(0, Math.min(rows - 1, Math.round(focusRow)));
  add(centreColumn, centreRow, 1, 1, 'block', 'accent');

  const target = Math.min(
    count,
    Math.max(2, Math.floor(columns * rows * 0.52))
  );
  let step = 0;
  while (shapes.length < target && step < target * 12) {
    const ratioIndex = 1 + (step % Math.max(ratios.length - 1, 1));
    const radius = (ratios[ratioIndex] ?? ratioMax) / ratioMax;
    const spoke = (step * 2 + Math.floor(step / ratios.length)) % spokes;
    const theta = phase + (spoke / spokes) * Math.PI * 2;
    const column = Math.max(
      0,
      Math.min(
        columns - 1,
        Math.round(focusColumn + Math.cos(theta) * radius * columns * 0.72)
      )
    );
    const row = Math.max(
      0,
      Math.min(
        rows - 1,
        Math.round(focusRow + Math.sin(theta) * radius * rows * 0.72)
      )
    );
    const spanStep = ratios[(step + seed) % Math.min(3, ratios.length)] ?? 1;
    const longSpan = Math.max(1, Math.min(3, Math.round(spanStep)));
    const horizontal = Math.abs(Math.cos(theta)) >= Math.abs(Math.sin(theta));
    const columnSpan = horizontal ? Math.min(longSpan, columns - column) : 1;
    const rowSpan = horizontal ? 1 : Math.min(longSpan, rows - row);
    const kind: CompositionShape['kind'] =
      step % 5 === 2 ? 'outline' : step % 5 === 4 ? 'rule' : 'block';
    const tone: CompositionShape['tone'] =
      step === 0 ? 'accent' : step % 4 === 3 ? 'quiet' : 'primary';
    add(column, row, columnSpan, rowSpan, kind, tone);
    step += 1;
  }

  return shapes;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarPoint(cx, cy, radius, endAngle);
  const end = polarPoint(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function rayToBounds(
  cx: number,
  cy: number,
  angle: number,
  left: number,
  top: number,
  right: number,
  bottom: number
) {
  const radians = (angle * Math.PI) / 180;
  const vx = Math.cos(radians);
  const vy = Math.sin(radians);
  const candidates: number[] = [];
  if (vx > 0) candidates.push((right - cx) / vx);
  if (vx < 0) candidates.push((left - cx) / vx);
  if (vy > 0) candidates.push((bottom - cy) / vy);
  if (vy < 0) candidates.push((top - cy) / vy);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  return { x: cx + vx * distance, y: cy + vy * distance };
}
