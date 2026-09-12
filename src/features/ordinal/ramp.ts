/**
 * The two orderings of printable ASCII.
 *
 * Every ASCII renderer needs a map from "how dark should this cell be" to "which
 * character". The universal answer is a ramp string copied from somewhere —
 * `" .:-=+*#%@"` and its longer cousins — which is a claim about a font nobody
 * measured, in a weight nobody checked.
 *
 * There is already a coverage sampler in this repository: `glyphAtlas`
 * rasterises a character at a fixed em size and integrates its alpha channel to
 * get ink area, because the masthead needs to scatter particles in proportion to
 * it. The same number, sorted, **is** the ramp — derived from the face the page
 * actually ships, at the weight it actually ships, with no table to go stale.
 *
 * That gives the study its subject. Codepoints carry two orderings and they
 * disagree:
 *
 * - **Ordinal** — 32 space, 33–47 punctuation, 48–57 digits, 65–90 capitals,
 *   97–122 lowercase. This is the order a value diffusing through the table
 *   moves along, and it is where the table's structure lives.
 * - **Ink** — actual coverage. `.` (46) is nearly empty, `@` (64) is nearly
 *   solid, `W` (87) is solid, `l` (108) is a stick. Not monotone, not close.
 *
 * Diffusion that is smooth in ordinal space is violent in ink space, and the
 * reverse. `rankCorrelation` measures how far apart the two are; the field
 * simulation crossfades between diffusing in one and diffusing in the other.
 */

import { glyphSamples } from '../particle-text/glyphAtlas';

/** Space. The lightest printable character and the field's floor. */
export const FIRST_CODE = 32;
/** Tilde. The last printable ASCII character and the field's ceiling. */
export const LAST_CODE = 126;
/** Distance between the ends — the divisor for every normalisation here. */
export const CODE_SPAN = LAST_CODE - FIRST_CODE;
export const CODE_COUNT = CODE_SPAN + 1;

export interface Ramp {
  /** Ink coverage per codepoint index, normalised so the heaviest glyph is 1. */
  readonly ink: Float32Array;
  /** Codepoints ordered lightest to heaviest. This is the ramp. */
  readonly byInk: Uint8Array;
  /** Position of each codepoint index within `byInk`, normalised to 0..1. */
  readonly rank: Float32Array;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Ink area for every printable character, in em².
 *
 * Browser only — `glyphSamples` needs a 2D context. Kept separate from
 * `buildRamp` so the ordering logic can be tested against fixed coverage
 * without a DOM.
 */
export function measureCoverage(font: string): Float32Array {
  const coverage = new Float32Array(CODE_COUNT);
  for (let i = 0; i < CODE_COUNT; i++) {
    coverage[i] = glyphSamples(font, String.fromCharCode(FIRST_CODE + i)).area;
  }
  return coverage;
}

/**
 * Sort measured coverage into a ramp.
 *
 * Ties break on codepoint so the result is stable: two glyphs that measure
 * identically keep table order between them, and the same font always produces
 * the same ramp.
 */
export function buildRamp(coverage: ArrayLike<number>): Ramp {
  if (coverage.length !== CODE_COUNT) {
    throw new Error(
      `Coverage needs ${CODE_COUNT} entries, one per printable character; got ${coverage.length}`
    );
  }

  let heaviest = 0;
  for (let i = 0; i < CODE_COUNT; i++) {
    if (coverage[i] > heaviest) heaviest = coverage[i];
  }
  // Every glyph measuring zero means the raster never ran — no 2D context, or a
  // font that has not loaded. A ramp built from that would put the whole table
  // in codepoint order and quietly claim the two orderings agree, which is the
  // one wrong answer this file exists to avoid.
  if (heaviest <= 0) {
    throw new Error(
      'No glyph in the set carried any ink; the ramp is unusable'
    );
  }

  const ink = new Float32Array(CODE_COUNT);
  for (let i = 0; i < CODE_COUNT; i++) ink[i] = coverage[i] / heaviest;

  const order = Array.from({ length: CODE_COUNT }, (_, i) => i).sort(
    (a, b) => ink[a] - ink[b] || a - b
  );

  const byInk = new Uint8Array(CODE_COUNT);
  const rank = new Float32Array(CODE_COUNT);
  for (let k = 0; k < CODE_COUNT; k++) {
    byInk[k] = FIRST_CODE + order[k];
    rank[order[k]] = k / CODE_SPAN;
  }

  return { ink, byInk, rank };
}

/** The ramp as a string, lightest first — the figure on the page. */
export function rampString(ramp: Ramp): string {
  return String.fromCharCode(...ramp.byInk);
}

/** Printable ASCII in codepoint order, for the figure that sits beside it. */
export function ordinalString(): string {
  let out = '';
  for (let i = 0; i < CODE_COUNT; i++)
    out += String.fromCharCode(FIRST_CODE + i);
  return out;
}

/* ------------------------------------------------------------ metric spaces */

/*
 * Four functions, two invertible maps. Both send a codepoint to 0..1 and back,
 * and the field runs the same advection kernel in each before blending the two
 * results. On integer codepoints the round trip is exact in both directions,
 * which is what makes the blend meaningful: at `metric` 0 the field is diffusing
 * the table, at 1 it is diffusing tone, and nothing is lost at either end.
 */

/** Codepoint to its position in the table. */
export function ordinalOf(code: number): number {
  return clamp((code - FIRST_CODE) / CODE_SPAN, 0, 1);
}

/** Back again. */
export function codeFromOrdinal(value: number): number {
  return FIRST_CODE + clamp(value, 0, 1) * CODE_SPAN;
}

/**
 * Codepoint to its position in the ink ordering.
 *
 * Exact on integers, which is the only place callers should use it: the ink
 * ordering is a permutation of the table, so the interpolation between two
 * adjacent codepoints has no meaning — `A` and `B` sit next to each other in the
 * table and nowhere near each other by weight. This map is not monotone, and
 * that is the entire point of the study.
 */
export function inkRankOf(ramp: Ramp, code: number): number {
  const position = clamp(code - FIRST_CODE, 0, CODE_SPAN);
  const low = Math.floor(position);
  const high = Math.min(low + 1, CODE_SPAN);
  const fraction = position - low;
  return ramp.rank[low] * (1 - fraction) + ramp.rank[high] * fraction;
}

/**
 * Back again, through the sorted table rather than through `rank`.
 *
 * Unlike the forward map this one *is* meaningful between its samples: two
 * codepoints adjacent in `byInk` are adjacent in weight, so a rank that has been
 * moved by diffusion lands between two characters of similar tone.
 */
export function codeFromInkRank(ramp: Ramp, value: number): number {
  const position = clamp(value, 0, 1) * CODE_SPAN;
  const low = Math.floor(position);
  const high = Math.min(low + 1, CODE_SPAN);
  const fraction = position - low;
  return ramp.byInk[low] * (1 - fraction) + ramp.byInk[high] * fraction;
}

/**
 * Spearman's ρ between the two orderings.
 *
 * Both are permutations of 0…94 with no ties, so the shortcut form applies. One
 * number for the page to print: 1 would mean the ASCII table is already sorted
 * by weight and the study has nothing to say.
 */
export function rankCorrelation(ramp: Ramp): number {
  let sumSquaredDifference = 0;
  for (let i = 0; i < CODE_COUNT; i++) {
    const difference = i - ramp.rank[i] * CODE_SPAN;
    sumSquaredDifference += difference * difference;
  }
  const n = CODE_COUNT;
  return 1 - (6 * sumSquaredDifference) / (n * (n * n - 1));
}
