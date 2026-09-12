import { describe, expect, it } from 'vitest';
import {
  RATIO_SYSTEMS,
  describeArc,
  generateFocalBlocks,
  rayToBounds,
} from './model';

const ratios = RATIO_SYSTEMS[0].values;

describe('Swiss Grid model', () => {
  it('generates deterministic, non-overlapping shapes inside the grid', () => {
    const input = [4, 8, 12, 2307, 52, 42, 12, ratios] as const;
    const shapes = generateFocalBlocks(...input);

    expect(generateFocalBlocks(...input)).toEqual(shapes);
    expect(shapes[0]?.tone).toBe('accent');

    const occupied = new Set<string>();
    for (const shape of shapes) {
      expect(shape.column).toBeGreaterThanOrEqual(0);
      expect(shape.row).toBeGreaterThanOrEqual(0);
      expect(shape.column + shape.columnSpan).toBeLessThanOrEqual(input[0]);
      expect(shape.row + shape.rowSpan).toBeLessThanOrEqual(input[1]);

      for (let row = shape.row; row < shape.row + shape.rowSpan; row += 1) {
        for (
          let column = shape.column;
          column < shape.column + shape.columnSpan;
          column += 1
        ) {
          const cell = `${column}:${row}`;
          expect(occupied.has(cell)).toBe(false);
          occupied.add(cell);
        }
      }
    }
  });

  it('changes the composition when the seed changes', () => {
    const first = generateFocalBlocks(6, 8, 14, 1000, 50, 50, 12, ratios);
    const second = generateFocalBlocks(6, 8, 14, 1001, 50, 50, 12, ratios);

    expect(second).not.toEqual(first);
  });

  it('describes arcs and projects rays to the artboard boundary', () => {
    expect(describeArc(50, 50, 25, 0, 180)).toBe('M 50 75 A 25 25 0 0 0 50 25');
    expect(rayToBounds(50, 50, 0, 0, 0, 100, 100)).toEqual({
      x: 100,
      y: 50,
    });
    expect(rayToBounds(50, 50, 90, 0, 0, 100, 100)).toEqual({
      x: 50,
      y: 100,
    });
  });
});
