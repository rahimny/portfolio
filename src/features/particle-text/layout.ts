import {
  glyphSamples,
  pickInk,
  type FontMetrics,
  type GlyphSamples,
} from './glyphAtlas';

/**
 * Sets the string in the box the heading already occupies.
 *
 * Two things make this worth writing rather than reading back off the DOM.
 *
 * **The box never changes size.** The reserved height is the one the real
 * `<h1>` claims for the name, and anything typed is scaled down to fit inside
 * it rather than being allowed to add a line. A masthead that reflows the page
 * on every keystroke would move the content below it.
 *
 * **Coordinates have to be stable per character.** Appending a letter must leave
 * every earlier letter's pen position bit-for-bit identical, or the particles
 * already sitting in those letters are handed new targets and the whole word
 * sets off travelling. Left-aligned pen positions accumulated one glyph at a
 * time give that for free; a browser layout read back through `Range` rects
 * does not, because centring and justification move everything.
 */

export interface PlacedGlyph {
  char?: string;
  /** Word identity survives wrapping, for coordinated writing jobs. */
  word?: number;
  glyph: GlyphSamples;
  /** Pen point, em, from the left edge of the block. */
  u: number;
  /** Baseline, em, from the top of the first line box. */
  v: number;
}

export interface CaretRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Positions come out in em, not pixels.
 *
 * A block that has been shrunk to fit changes size the moment a character makes
 * it too wide, and re-deriving pixel targets from the new size sets every
 * particle in the text travelling at once — one keystroke, and the whole word
 * dissolves in flight. Keeping the layout in em and easing `scale` and
 * `offsetY` toward their new values over a few frames means a refit is the
 * block breathing rather than the block scattering. The scale and offset stay
 * separate from glyph targets so refitting preserves particle assignments.
 */
export interface TextLayout {
  glyphs: PlacedGlyph[];
  /** CSS px per em wanted — the CSS size, or less if the text had to fit. */
  scale: number;
  /** CSS px the block is pushed down by to sit centred in the reserved box. */
  offsetY: number;
  lines: number;
  /**
   * Baseline of each line, em from the top of the first line box.
   *
   * The vessel rules these across its full width, so the type reads as sitting
   * on a sheet rather than floating in one. They come from the layout rather
   * than from the box because they belong to the *type* — a refit slides them
   * with the block, on the same eased placement the ink and the caret ride.
   */
  baselines: number[];
  /** Total ink, em². Point size is solved from this and the eased scale. */
  inkArea: number;
  /** In em, save for `offsetY`, which the caller adds after scaling. */
  caret: CaretRect;
}

export interface LayoutStyle {
  font: string;
  metrics: FontMetrics;
  /** CSS px. The size the heading is set at; the ceiling for `scale`. */
  fontSize: number;
  /** Line box height as a multiple of the font size. */
  lineHeight: number;
  /** Letter spacing in em, applied after every character as CSS does. */
  tracking: number;
  boxWidth: number;
  boxHeight: number;
  maxLines: number;
}

/** Below a quarter of the set size the masthead has stopped being a masthead. */
const MIN_SCALE_RATIO = 0.25;

interface Line {
  chars: string[];
  width: number;
}

function advanceOf(font: string, char: string, tracking: number): number {
  return glyphSamples(font, char).advance + tracking;
}

/**
 * Greedy wrap at spaces, in em. Words are never broken: a word too long for the
 * box is left overflowing and the caller shrinks the scale until it is not.
 */
function wrap(
  font: string,
  text: string,
  tracking: number,
  limit: number
): Line[] {
  const lines: Line[] = [];
  let chars: string[] = [];
  let width = 0;
  let wordStart = 0;
  let wordWidth = 0;

  const push = () => {
    // Trailing spaces do not count toward the measured width, exactly as they
    // do not in CSS — otherwise a line ending in a space wraps one word early.
    let end = chars.length;
    let measured = width;
    while (end > 0 && chars[end - 1] === ' ') {
      measured -= advanceOf(font, ' ', tracking);
      end--;
    }
    lines.push({ chars, width: Math.max(0, measured - tracking) });
  };

  for (const char of Array.from(text)) {
    if (char === '\n') {
      push();
      chars = [];
      width = 0;
      wordStart = 0;
      wordWidth = 0;
      continue;
    }

    const advance = advanceOf(font, char, tracking);

    if (char === ' ') {
      chars.push(char);
      width += advance;
      wordStart = chars.length;
      wordWidth = 0;
      continue;
    }

    // Break before the word that overflows, not after the character that does:
    // splitting mid-word is what makes wrapped type read as a bug.
    if (width + advance > limit && wordStart > 0) {
      const carried = chars.slice(wordStart);
      chars = chars.slice(0, wordStart);
      width -= wordWidth;
      push();
      chars = carried;
      width = wordWidth;
      wordStart = 0;
    }

    chars.push(char);
    width += advance;
    wordWidth += advance;
  }

  push();
  return lines;
}

function fits(lines: Line[], limit: number, maxLines: number): boolean {
  if (lines.length > maxLines) return false;
  for (const line of lines) {
    if (line.width > limit) return false;
  }
  return true;
}

export function layoutText(text: string, style: LayoutStyle): TextLayout {
  const {
    font,
    metrics,
    fontSize,
    lineHeight,
    tracking,
    boxWidth,
    boxHeight,
    maxLines,
  } = style;

  // Largest scale at which the string still fits the reserved box, by bisection.
  // The box is fixed, so there is one monotone fit predicate to search.
  let scale = fontSize;
  let lines = wrap(font, text, tracking, boxWidth / scale);

  if (!fits(lines, boxWidth / scale, maxLines)) {
    let lo = fontSize * MIN_SCALE_RATIO;
    let hi = fontSize;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) * 0.5;
      if (
        fits(
          wrap(font, text, tracking, boxWidth / mid),
          boxWidth / mid,
          maxLines
        )
      )
        lo = mid;
      else hi = mid;
    }
    scale = lo;
    lines = wrap(font, text, tracking, boxWidth / scale);
  }

  const contentHeight = metrics.ascent + metrics.descent;
  // CSS puts half the leading above the text and half below; with the masthead's
  // 0.82 line-height the leading is negative and the first line's ink reaches
  // above its box, which is why the canvas is drawn with an overdraw margin.
  const halfLeading = (lineHeight - contentHeight) * 0.5;

  // Centred in the reserved box. When the text is the name at its set size this
  // is exactly zero, so the particles land on the heading they replaced; when it
  // is shorter or has been scaled down, centring reads as deliberate where
  // top-alignment reads as a block that failed to fill.
  const offsetY = (boxHeight - lines.length * lineHeight * scale) * 0.5;

  const glyphs: PlacedGlyph[] = [];
  const baselines: number[] = [];
  let inkArea = 0;
  let caretU = 0;
  let caretLine = 0;
  let word = 0;

  lines.forEach((line, index) => {
    const baseline = index * lineHeight + halfLeading + metrics.ascent;
    baselines.push(baseline);
    let pen = 0;

    for (const char of line.chars) {
      const glyph = glyphSamples(font, char);
      if (glyph.area > 0) {
        glyphs.push({ char, word, glyph, u: pen, v: baseline });
        inkArea += glyph.area;
      }
      pen += glyph.advance + tracking;
      if (char === ' ') word++;
    }
    word++;

    if (index === lines.length - 1) {
      caretU = Math.max(0, pen - tracking);
      caretLine = index;
    }
  });

  const caretBaseline = caretLine * lineHeight + halfLeading + metrics.ascent;
  const caretWidth = 0.055;

  return {
    glyphs,
    scale,
    offsetY,
    lines: lines.length,
    baselines,
    inkArea,
    caret: {
      // A gap wide enough to read as a separate mark. The masthead's tracking
      // is -0.045em, so the pen position after the last letter sits *inside* its
      // ink and a caret placed there would touch the stem.
      x: Math.min(caretU + 0.1, Math.max(0, boxWidth / scale - caretWidth)),
      y: caretBaseline - metrics.capHeight,
      width: caretWidth,
      height: metrics.capHeight,
    },
  };
}

/**
 * Where the ink is, as a coarse blurred occupancy map in normalised box space.
 *
 * Built for the organic pointer, which needs to know which parts of its box are
 * a word and which are paper. The blur is the whole trick: sharp occupancy has
 * a gradient only on the letterforms, which is the one place a wandering
 * pointer does not need to be told where to go. Blurred over roughly a third of
 * the box, every point in it slopes toward the nearest ink, and the map stays
 * far too soft to resolve a stem — so it biases where the path looks without
 * ever pinning it to a letter.
 *
 * Runs on a rebuild, never on a frame.
 */
export function inkOccupancy(
  layout: TextLayout,
  boxWidth: number,
  boxHeight: number,
  cols: number,
  rows: number
): Float32Array {
  const grid = new Float32Array(cols * rows);
  const { scale, offsetY } = layout;
  const invW = cols / Math.max(1, boxWidth);
  const invH = rows / Math.max(1, boxHeight);

  for (const placed of layout.glyphs) {
    const { x, y } = placed.glyph;
    // Every fourth raster pixel. The grid is 64 cells across a whole masthead;
    // sampling it at full resolution buys nothing and costs a keystroke.
    for (let i = 0; i < x.length; i += 4) {
      const px = (placed.u + x[i]) * scale * invW;
      const py = ((placed.v + y[i]) * scale + offsetY) * invH;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      grid[cy * cols + cx] += 1;
    }
  }

  blur(grid, cols, rows, Math.max(3, Math.round(cols / 10)));

  let peak = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > peak) peak = grid[i];
  if (peak > 0) for (let i = 0; i < grid.length; i++) grid[i] /= peak;
  return grid;
}

/** Three box passes, which is a Gaussian to the accuracy this needs. */
function blur(
  grid: Float32Array,
  cols: number,
  rows: number,
  radius: number
): void {
  const scratch = new Float32Array(grid.length);
  const span = radius * 2 + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum += grid[row + Math.min(cols - 1, Math.max(0, x + k))];
        }
        scratch[row + x] = sum / span;
      }
    }
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum += scratch[Math.min(rows - 1, Math.max(0, y + k)) * cols + x];
        }
        grid[y * cols + x] = sum / span;
      }
    }
  }
}

export { pickInk };
