import { describe, expect, it } from 'vitest';
import { blastPixelation } from './effects';

describe('blast raster accent', () => {
  it('reserves pixelation for the breakup phase of strong hits', () => {
    for (const age of [-1, 0, 0.14, 0.42, 1, Infinity, NaN])
      expect(blastPixelation(age, 2)).toBe(0);
    expect(blastPixelation(0.28, 0.8)).toBe(0);
    expect(blastPixelation(0.28, 2)).toBeCloseTo(1);
    expect(blastPixelation(0.28, 1.2)).toBeLessThan(1);
    expect(blastPixelation(0.28, NaN)).toBe(0);
  });
});
