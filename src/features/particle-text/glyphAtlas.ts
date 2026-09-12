/**
 * Turns a character into something a particle can be scattered inside.
 *
 * Rasterising the character and treating alpha as a density field preserves
 * the browser's variable font, hinting and weight. A cumulative coverage table
 * supports weighted sampling without a triangulated font asset.
 *
 * Everything here is in **em** — the raster happens once per character at a
 * fixed size and is reused at every display size, so a resize costs nothing.
 */

/** Raster size for the cached mask. Fine enough that the sample grid is invisible. */
const RASTER_EM = 96;
/** Slack around the ink so antialiased edges are not clipped by the bitmap. */
const PAD = 2;
/** Below this the pixel is edge fringe, not ink. */
const ALPHA_FLOOR = 10;

export interface GlyphSamples {
  /** Advance width, em. */
  advance: number;
  /** Total ink, em² — the weight this glyph carries when particles are shared out. */
  area: number;
  /** Ink pixel centres, em, relative to the pen point on the baseline (y down). */
  x: Float32Array;
  y: Float32Array;
  /** Cumulative coverage over those pixels; the last entry is the total. */
  cdf: Float32Array;
  /** One raster pixel in em — the box a sample is jittered within. */
  cell: number;
}

export interface FontMetrics {
  /** All in em. */
  ascent: number;
  descent: number;
  capHeight: number;
}

let context: CanvasRenderingContext2D | null | undefined;

function ctx(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = RASTER_EM * 3;
    canvas.height = RASTER_EM * 3;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  return context;
}

const EMPTY: GlyphSamples = {
  advance: 0,
  area: 0,
  x: new Float32Array(0),
  y: new Float32Array(0),
  cdf: new Float32Array(0),
  cell: 1 / RASTER_EM,
};

/**
 * One cache per font string, so switching weight or family does not have to
 * invalidate anything and the masthead's characters are rasterised exactly once
 * for the life of the page.
 */
const caches = new Map<string, Map<string, GlyphSamples>>();
const metrics = new Map<string, FontMetrics>();

/** The canvas `font` shorthand for a raster at `RASTER_EM`. */
export function rasterFont(weight: string, family: string): string {
  return `${weight} ${RASTER_EM}px ${family}`;
}

export function fontMetrics(font: string): FontMetrics {
  const cached = metrics.get(font);
  if (cached) return cached;

  const c = ctx();
  let result: FontMetrics = { ascent: 0.8, descent: 0.2, capHeight: 0.72 };

  if (c) {
    c.font = font;
    c.textBaseline = 'alphabetic';
    const m = c.measureText('H');
    // fontBoundingBox* is what the browser also uses to build the CSS line box,
    // so half-leading computed from it lands the particles on the same baseline
    // the hidden heading is sitting on.
    const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
    result = {
      ascent: ascent / RASTER_EM,
      descent: descent / RASTER_EM,
      capHeight: (m.actualBoundingBoxAscent || ascent) / RASTER_EM,
    };
  }

  metrics.set(font, result);
  return result;
}

export function glyphSamples(font: string, char: string): GlyphSamples {
  let cache = caches.get(font);
  if (!cache) {
    cache = new Map();
    caches.set(font, cache);
  }
  const cached = cache.get(char);
  if (cached) return cached;

  const result = rasterise(font, char);
  cache.set(char, result);
  return result;
}

function rasterise(font: string, char: string): GlyphSamples {
  const c = ctx();
  if (!c) return EMPTY;

  c.font = font;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';

  const m = c.measureText(char);
  const advance = m.width / RASTER_EM;

  // Whitespace and anything the font has no outline for still advance the pen.
  const inkLeft = m.actualBoundingBoxLeft;
  const inkRight = m.actualBoundingBoxRight;
  const inkAscent = m.actualBoundingBoxAscent;
  const inkDescent = m.actualBoundingBoxDescent;
  if (!(inkRight + inkLeft > 0) || !(inkAscent + inkDescent > 0)) {
    return { ...EMPTY, advance };
  }

  // The pen point inside the bitmap. `actualBoundingBoxLeft` is positive when
  // the ink reaches back past the pen, which is why it is added rather than
  // subtracted here.
  const originX = Math.ceil(inkLeft) + PAD;
  const originY = Math.ceil(inkAscent) + PAD;
  const width = originX + Math.ceil(inkRight) + PAD;
  const height = originY + Math.ceil(inkDescent) + PAD;

  if (
    width < 1 ||
    height < 1 ||
    width > c.canvas.width ||
    height > c.canvas.height
  ) {
    return { ...EMPTY, advance };
  }

  c.clearRect(0, 0, width, height);
  // No fill colour is set on purpose: only the alpha channel is read, so the
  // context default is as good as any and this stays out of the palette guard's
  // way — nothing here is a design colour.
  c.fillText(char, originX, originY);

  const pixels = c.getImageData(0, 0, width, height).data;
  const cell = 1 / RASTER_EM;

  // Two passes: count the ink so the arrays are allocated once, then fill them.
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] >= ALPHA_FLOOR) count++;
  }
  if (count === 0) return { ...EMPTY, advance };

  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const cdf = new Float32Array(count);
  let total = 0;
  let n = 0;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const alpha = pixels[(py * width + px) * 4 + 3];
      if (alpha < ALPHA_FLOOR) continue;
      // Pixel centre, in em, measured from the pen point on the baseline.
      xs[n] = (px + 0.5 - originX) * cell;
      ys[n] = (py + 0.5 - originY) * cell;
      total += alpha / 255;
      cdf[n] = total;
      n++;
    }
  }

  return { advance, area: total * cell * cell, x: xs, y: ys, cdf, cell };
}

/**
 * Index of the ink pixel at cumulative coverage `r`, by binary search.
 *
 * Sampling in proportion to coverage rather than uniformly over the bounding box
 * is what keeps stroke joins and counters at the right density: a rejection
 * sampler would spend most of its tries in the whitespace inside an O.
 */
export function pickInk(glyph: GlyphSamples, r: number): number {
  const cdf = glyph.cdf;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
