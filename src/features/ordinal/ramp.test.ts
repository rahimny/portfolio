import { describe, it, expect } from 'vitest';
import {
  CODE_COUNT,
  CODE_SPAN,
  FIRST_CODE,
  LAST_CODE,
  buildRamp,
  codeFromInkRank,
  codeFromOrdinal,
  inkRankOf,
  ordinalOf,
  ordinalString,
  rampString,
  rankCorrelation,
} from './ramp';

/**
 * Stand-in coverage. Deliberately *not* monotone in codepoint — a fixture that
 * happened to be sorted would let every assertion here pass against a ramp that
 * did nothing.
 */
function fixture(): Float32Array {
  const coverage = new Float32Array(CODE_COUNT);
  for (let i = 0; i < CODE_COUNT; i++) {
    const code = FIRST_CODE + i;
    if (code === 32) coverage[i] = 0;
    else coverage[i] = 0.5 + 0.5 * Math.sin(code * 2.399963); // golden-angle hash
  }
  return coverage;
}

describe('buildRamp', () => {
  const ramp = buildRamp(fixture());

  it('rejects coverage that is not one entry per printable character', () => {
    expect(() => buildRamp(new Float32Array(10))).toThrow(/95 entries/);
  });

  it('rejects an all-zero measurement rather than inventing an ordering', () => {
    expect(() => buildRamp(new Float32Array(CODE_COUNT))).toThrow(/any ink/i);
  });

  it('orders every printable character exactly once, lightest first', () => {
    expect(ramp.byInk).toHaveLength(CODE_COUNT);
    expect(new Set(ramp.byInk).size).toBe(CODE_COUNT);
    const ink = [...ramp.byInk].map((code) => ramp.ink[code - FIRST_CODE]);
    for (let k = 1; k < ink.length; k++)
      expect(ink[k]).toBeGreaterThanOrEqual(ink[k - 1]);
  });

  it('puts space at the light end, since it carries no ink at all', () => {
    expect(ramp.byInk[0]).toBe(FIRST_CODE);
    expect(rampString(ramp).charAt(0)).toBe(' ');
  });

  it('normalises the heaviest glyph to one', () => {
    expect(Math.max(...ramp.ink)).toBeCloseTo(1, 10);
  });

  it('is stable — the same coverage always gives the same ramp', () => {
    expect(rampString(buildRamp(fixture()))).toBe(rampString(ramp));
  });

  it('breaks ties on codepoint so identical glyphs keep table order', () => {
    const flat = new Float32Array(CODE_COUNT).fill(1);
    expect([...buildRamp(flat).byInk]).toEqual(
      [...ordinalString()].map((c) => c.charCodeAt(0))
    );
  });
});

describe('the two metric spaces', () => {
  const ramp = buildRamp(fixture());

  it('round-trips every integer codepoint through ordinal space', () => {
    for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
      expect(codeFromOrdinal(ordinalOf(code))).toBeCloseTo(code, 6);
    }
  });

  it('round-trips every integer codepoint through ink space', () => {
    for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
      // Ranks are stored as Float32, so the round trip is exact to well inside
      // the half-codepoint that rounding to a glyph actually needs.
      expect(codeFromInkRank(ramp, inkRankOf(ramp, code))).toBeCloseTo(code, 3);
    }
  });

  it('holds both maps inside the printable range at the extremes', () => {
    for (const value of [-1, 0, 0.5, 1, 2]) {
      expect(codeFromOrdinal(value)).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(codeFromOrdinal(value)).toBeLessThanOrEqual(LAST_CODE);
      expect(codeFromInkRank(ramp, value)).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(codeFromInkRank(ramp, value)).toBeLessThanOrEqual(LAST_CODE);
    }
  });

  it('is monotone in ordinal space and not in ink space', () => {
    // The whole study rests on this asymmetry, so it is asserted rather than
    // assumed: a value diffusing smoothly through the table does not move
    // smoothly through tone.
    let ordinalRises = 0;
    let inkFalls = 0;
    for (let code = FIRST_CODE; code < LAST_CODE; code++) {
      if (ordinalOf(code + 1) > ordinalOf(code)) ordinalRises++;
      if (inkRankOf(ramp, code + 1) < inkRankOf(ramp, code)) inkFalls++;
    }
    expect(ordinalRises).toBe(CODE_SPAN);
    expect(inkFalls).toBeGreaterThan(0);
  });
});

describe('rankCorrelation', () => {
  it('is one when the table is already sorted by weight', () => {
    const sorted = new Float32Array(CODE_COUNT);
    for (let i = 0; i < CODE_COUNT; i++) sorted[i] = i + 1;
    expect(rankCorrelation(buildRamp(sorted))).toBeCloseTo(1, 10);
  });

  it('is minus one when weight runs exactly against the table', () => {
    const reversed = new Float32Array(CODE_COUNT);
    for (let i = 0; i < CODE_COUNT; i++) reversed[i] = CODE_COUNT - i;
    expect(rankCorrelation(buildRamp(reversed))).toBeCloseTo(-1, 6);
  });

  it('lands well short of one on coverage that is not sorted', () => {
    expect(Math.abs(rankCorrelation(buildRamp(fixture())))).toBeLessThan(0.5);
  });
});
