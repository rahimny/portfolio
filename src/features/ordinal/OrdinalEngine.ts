/**
 * The field on a canvas, with its ruler, its accent and its artefact.
 *
 * No React below this line. The page owns controls and copy; this owns the grid,
 * the clock, the input and the export.
 *
 * ## Why canvas rather than SVG text
 *
 * The original builds one `<text>` element per row and rewrites `textContent`
 * every frame. That is fine for forty rows and gives selectable text for free,
 * but it re-lays-out a text run per row per frame, and it cannot tint a single
 * cell without a `<tspan>` per character. A canvas draws a row as one string and
 * over-draws only the handful of cells the viewer has touched. The selectable
 * copy is kept anyway, as a hidden `<pre>` the page owns — which is also the
 * artefact, so it costs nothing to keep.
 *
 * ## Why 42 ms
 *
 * The original gates on `e - R < 42`, about 24 fps, and it is right. A monospace
 * field redrawn at 60 fps reads as noise; at 24 it reads as a mechanism
 * advancing. The simulation runs at that same fixed rate with no interpolation
 * between steps, because the output is discrete — interpolating a glyph that is
 * about to be rounded to an integer codepoint buys nothing.
 */

import {
  buildRamp,
  measureCoverage,
  rampString,
  rankCorrelation,
  type Ramp,
} from './ramp';
import { corpusSource, wrapCorpus, wrapLines } from './corpus';
import { OrdinalField } from './field';
import {
  moodByName,
  ordinalMood,
  type OrdinalMood,
  type OrdinalMoodName,
} from './mood';

/** The gate from the original, kept deliberately. */
const FRAME_MS = 42;
/** Raster size the coverage is measured at; matches `glyphAtlas`. */
const RASTER_EM = 96;
/** Cells the pointer stirs. */
const POINTER_RADIUS = 3.2;
const POINTER_STRENGTH = 0.75;

export interface OrdinalStatus {
  ready: boolean;
  error: string | null;
  columns: number;
  rows: number;
  /** Lines the corpus itself occupies at this width, before it tiles. */
  corpusLines: number;
  mood: OrdinalMoodName;
  moodNote: string;
  moodOverride: OrdinalMoodName | null;
  /** The blend actually in force, after any override. */
  metric: number;
  metricOverride: number | null;
  band: readonly [number, number];
  paused: boolean;
  reduced: boolean;
  showRuler: boolean;
  tick: number;
  seed: number;
  agitation: number;
  resolved: number;
  /** Spearman ρ between the two orderings of the table. */
  correlation: number;
  /** The ink-ordered ramp, for the figure on the page. */
  ramp: string;
  stepMs: number;
}

export interface OrdinalEngineOptions {
  reduced?: boolean;
  seed?: number;
}

function css(element: HTMLElement, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim();
}

export class OrdinalEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly onStatus: (status: OrdinalStatus) => void;

  private ramp: Ramp | null = null;
  private field: OrdinalField | null = null;
  private source = '';

  private fontFamily = 'monospace';
  private fontPx = 12;
  private cellWidth = 8;
  private cellHeight = 16;
  private left = 0;
  private top = 0;

  private frame = 0;
  private lastFrame = 0;
  private started = 0;
  private elapsed = 0;
  private stepMs = 0;

  private paused = false;
  private reduced: boolean;
  private showRuler = true;
  private metricOverride: number | null = null;
  private moodOverride: OrdinalMoodName | null = null;
  private seed: number;
  private mood: OrdinalMood = moodByName('Gathering');

  private pointerDown = false;
  private caret = { column: 0, row: 0 };
  private error: string | null = null;

  private readonly observer: ResizeObserver;
  private readonly abort = new AbortController();

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: OrdinalStatus) => void,
    options: OrdinalEngineOptions = {}
  ) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.reduced = options.reduced ?? false;
    this.seed = options.seed ?? 1;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser gave no 2D canvas context');
    this.context = context;

    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(canvas.parentElement ?? canvas);

    const { signal } = this.abort;
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointercancel', this.onPointerUp, { signal });
    canvas.addEventListener('pointerleave', this.onPointerUp, { signal });
    canvas.addEventListener('keydown', this.onKeyDown, { signal });

    this.start();
  }

  private start(): void {
    try {
      // The face the page is actually set in, read off the canvas so the ramp
      // measures what the viewer is looking at rather than a name held here.
      this.fontFamily =
        css(this.canvas, '--font-mono') ||
        'ui-monospace, SFMono-Regular, Menlo, monospace';
      this.ramp = buildRamp(
        measureCoverage(`400 ${RASTER_EM}px ${this.fontFamily}`)
      );
    } catch (cause) {
      this.error =
        cause instanceof Error
          ? cause.message
          : 'The character ramp could not be measured';
      this.publish();
      return;
    }

    this.source = corpusSource();
    this.layout();
    this.started = performance.now();

    if (this.reduced) this.render();
    else this.frame = requestAnimationFrame(this.loop);
  }

  /* ----------------------------------------------------------------- layout */

  private layout(): void {
    if (!this.ramp) return;

    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth);
    const height = Math.max(
      1,
      parent?.clientHeight ?? this.canvas.clientHeight
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Around 130 columns on a desktop stage, never below 8px, so the glyphs stay
    // readable as glyphs rather than becoming a texture. The grid is honest about
    // its own size in the readout instead of pretending to a fixed resolution.
    this.fontPx = Math.max(8, Math.min(14, Math.round(width / 130)));
    this.context.font = `${this.fontPx}px ${this.fontFamily}`;
    this.cellWidth = this.context.measureText('M').width || this.fontPx * 0.6;
    this.cellHeight = Math.max(this.fontPx + 2, Math.round(this.fontPx * 1.32));

    // Four columns of gutter for the row numbers, one row for the column ruler.
    const gutter = this.showRuler ? this.cellWidth * 4 : this.cellWidth;
    const header = this.showRuler
      ? this.cellHeight * 1.6
      : this.cellHeight * 0.4;
    this.left = gutter;
    this.top = header;

    const columns = Math.max(
      8,
      Math.floor((width - gutter - this.cellWidth) / this.cellWidth)
    );
    const rows = Math.max(
      4,
      Math.floor((height - header - this.cellHeight * 0.5) / this.cellHeight)
    );

    const corpus = wrapCorpus(this.source, columns, rows);

    if (
      this.field &&
      this.field.columns === columns &&
      this.field.rows === rows
    ) {
      this.field.setCorpus(corpus);
    } else {
      this.field = new OrdinalField({
        columns,
        rows,
        seed: this.seed,
        corpus,
        ramp: this.ramp,
      });
      this.caret = { column: 0, row: Math.floor(rows / 2) };
    }

    this.render();
  }

  /* ------------------------------------------------------------------- loop */

  private loop = (now: number): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (document.visibilityState !== 'visible') return;
    if (now - this.lastFrame < FRAME_MS) return;
    this.lastFrame = now;
    if (this.paused) return;
    this.advance(now);
  };

  private advance(now: number): void {
    const field = this.field;
    if (!field) return;

    this.elapsed = (now - this.started) / 1000;
    const base = this.moodOverride
      ? moodByName(this.moodOverride)
      : ordinalMood(this.elapsed, field.agitation());
    this.mood =
      this.metricOverride === null
        ? base
        : { ...base, metric: this.metricOverride };

    const begin = performance.now();
    field.step(this.mood);
    this.stepMs = performance.now() - begin;

    this.render();
  }

  /* ----------------------------------------------------------------- render */

  private render(): void {
    const field = this.field;
    if (!field) {
      this.publish();
      return;
    }

    const ctx = this.context;
    const ground = css(this.canvas, '--bg');
    const ink = css(this.canvas, '--fg');
    const subtle = css(this.canvas, '--fg-subtle');
    const accent = css(this.canvas, '--brand');

    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.font = `${this.fontPx}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const lines = field.glyphs();
    const heat = field.heat;

    if (this.showRuler) this.renderRuler(subtle, field.columns, field.rows);

    // Two passes. The touched cells are punched out of the ink string and drawn
    // again in the accent, because over-drawing orange on black hides nothing —
    // orange is lighter than ink on paper.
    ctx.fillStyle = ink;
    for (let y = 0; y < field.rows; y++) {
      const line = lines[y];
      let drawn = '';
      for (let x = 0; x < field.columns; x++) {
        drawn += heat[y * field.columns + x] > 0.16 ? ' ' : line[x];
      }
      ctx.fillText(drawn, this.left, this.top + y * this.cellHeight);
    }

    ctx.fillStyle = accent;
    for (let y = 0; y < field.rows; y++) {
      const line = lines[y];
      for (let x = 0; x < field.columns; x++) {
        if (heat[y * field.columns + x] <= 0.16) continue;
        ctx.fillText(
          line[x],
          this.left + x * this.cellWidth,
          this.top + y * this.cellHeight
        );
      }
    }

    this.publish();
  }

  /**
   * The grid, measured.
   *
   * A monospace field is the most measurable substrate available — every cell is
   * provably the same size — and leaving that implicit wastes it. Row numbers
   * every five rows and a column index every ten let a viewer count one part
   * against another, which is the test the frame's own geometry has to pass.
   */
  private renderRuler(colour: string, columns: number, rows: number): void {
    const ctx = this.context;
    ctx.fillStyle = colour;

    const ruler = new Array<string>(columns).fill(' ');
    for (let x = 0; x < columns; x += 10) {
      ruler[x] = '|';
      const label = String(x);
      for (let n = 0; n < label.length && x + 1 + n < columns; n++)
        ruler[x + 1 + n] = label[n];
    }
    ctx.fillText(ruler.join(''), this.left, this.top - this.cellHeight);

    for (let y = 0; y < rows; y += 5) {
      const label = String(y).padStart(3, '0');
      ctx.fillText(label, 0, this.top + y * this.cellHeight);
    }
  }

  private publish(): void {
    const field = this.field;
    this.onStatus({
      ready: !!field && !this.error,
      error: this.error,
      columns: field?.columns ?? 0,
      rows: field?.rows ?? 0,
      corpusLines: field ? wrapLines(this.source, field.columns).length : 0,
      mood: this.mood.name,
      moodNote: this.mood.note,
      moodOverride: this.moodOverride,
      metric: this.mood.metric,
      metricOverride: this.metricOverride,
      band: this.mood.band,
      paused: this.paused,
      reduced: this.reduced,
      showRuler: this.showRuler,
      tick: field?.tick ?? 0,
      seed: this.seed,
      agitation: field?.agitation() ?? 0,
      resolved: field?.resolved() ?? 0,
      correlation: this.ramp ? rankCorrelation(this.ramp) : 0,
      ramp: this.ramp ? rampString(this.ramp) : '',
      stepMs: this.stepMs,
    });
  }

  /* ------------------------------------------------------------------ input */

  private cellAt(event: PointerEvent): { column: number; row: number } | null {
    const field = this.field;
    if (!field) return null;
    const rect = this.canvas.getBoundingClientRect();
    const column = Math.floor(
      (event.clientX - rect.left - this.left) / this.cellWidth
    );
    const row = Math.floor(
      (event.clientY - rect.top - this.top) / this.cellHeight
    );
    if (column < 0 || row < 0 || column >= field.columns || row >= field.rows)
      return null;
    return { column, row };
  }

  private onPointerDown = (event: PointerEvent): void => {
    const cell = this.cellAt(event);
    if (!cell) return;
    this.pointerDown = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.caret = cell;
    this.field?.excite(cell.column, cell.row, POINTER_RADIUS, POINTER_STRENGTH);
    if (this.paused || this.reduced) this.render();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    const cell = this.cellAt(event);
    if (!cell) return;
    this.caret = cell;
    this.field?.excite(cell.column, cell.row, POINTER_RADIUS, POINTER_STRENGTH);
    if (this.paused || this.reduced) this.render();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  };

  /**
   * Typing writes into the field, not into the corpus.
   *
   * The injected character is marked as touched and a small wave is raised
   * around it, so the viewer watches their own input being metabolised rather
   * than pinned to the grid. Space is left to the page's own pause shortcut
   * only when the canvas does not have focus.
   */
  private onKeyDown = (event: KeyboardEvent): void => {
    const field = this.field;
    if (!field) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      this.caret.column =
        (this.caret.column + delta + field.columns) % field.columns;
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      this.caret.row = (this.caret.row + delta + field.rows) % field.rows;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.caret.column = 0;
      this.caret.row = (this.caret.row + 1) % field.rows;
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.caret.column =
        (this.caret.column - 1 + field.columns) % field.columns;
      field.inject(this.caret.column, this.caret.row, 32);
      if (this.paused || this.reduced) this.render();
      return;
    }

    if (
      event.key.length !== 1 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    const code = event.key.charCodeAt(0);
    if (code < 32 || code > 126) return;

    event.preventDefault();
    field.inject(this.caret.column, this.caret.row, code);
    this.caret.column = (this.caret.column + 1) % field.columns;
    if (this.paused || this.reduced) this.render();
  };

  /* ---------------------------------------------------------------- control */

  setMetric(value: number | null): void {
    this.metricOverride = value;
    if (value !== null) this.mood = { ...this.mood, metric: value };
    this.render();
  }

  setMoodOverride(name: OrdinalMoodName | null): void {
    this.moodOverride = name;
    if (name) this.mood = moodByName(name);
    this.render();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.render();
  }

  setRuler(show: boolean): void {
    this.showRuler = show;
    this.layout();
  }

  /** One step, for reduced motion and for reading a single frame closely. */
  stepOnce(count = 1): void {
    const field = this.field;
    if (!field) return;
    for (let n = 0; n < count; n++) {
      this.elapsed += FRAME_MS / 1000;
      const base = this.moodOverride
        ? moodByName(this.moodOverride)
        : ordinalMood(this.elapsed, field.agitation());
      this.mood =
        this.metricOverride === null
          ? base
          : { ...base, metric: this.metricOverride };
      field.step(this.mood);
    }
    this.render();
  }

  reset(seed: number = this.seed): void {
    this.seed = seed;
    this.field?.reset(seed);
    this.started = performance.now();
    this.elapsed = 0;
    this.render();
  }

  /* --------------------------------------------------------------- artefact */

  /**
   * The frame as plain text.
   *
   * This is the artefact, and it is the reason the study is worth building: it
   * needs no renderer, no viewer and no format. The header is a spec sheet, so
   * the file states its own edition, seed, grid and ramp — everything needed to
   * know what it is, in the file itself.
   */
  toText(): string {
    const field = this.field;
    if (!field) return '';
    const rule = '-'.repeat(Math.min(field.columns, 96));
    return [
      'ORDINAL / STUDY 018 / rahimny.dev',
      `SEED ${String(this.seed).padStart(4, '0')}  STEP ${String(field.tick).padStart(5, '0')}  MOOD ${this.mood.name.toUpperCase()}`,
      `GRID ${field.columns} x ${field.rows}  ${field.size} CELLS  CORPUS ${wrapLines(this.source, field.columns).length} LINES`,
      `METRIC ${this.mood.metric.toFixed(2)} (0 ORDINAL, 1 INK)  BAND ${this.mood.band[0]}-${this.mood.band[1]}`,
      `RAMP ${this.ramp ? rampString(this.ramp) : ''}`,
      new Date().toISOString(),
      rule,
      ...field.glyphs(),
      rule,
    ].join('\n');
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  saveText(): void {
    const field = this.field;
    if (!field) throw new Error('The field is not running');
    this.download(
      new Blob([this.toText()], { type: 'text/plain;charset=utf-8' }),
      `ordinal-${String(this.seed).padStart(4, '0')}-${String(field.tick).padStart(5, '0')}.txt`
    );
  }

  async copyText(): Promise<void> {
    await navigator.clipboard.writeText(this.toText());
  }

  savePng(): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      this.download(blob, `ordinal-${String(this.seed).padStart(4, '0')}.png`);
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.abort.abort();
  }
}
