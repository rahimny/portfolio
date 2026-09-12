import { describe, it, expect } from 'vitest';
import { OrdinalField } from './field';
import { buildRamp, CODE_COUNT, FIRST_CODE, LAST_CODE } from './ramp';
import { toAscii, wrapCorpus, wrapLines, corpusSource } from './corpus';
import { MOOD_NAMES, moodByName, ordinalMood, PHRASE_SECONDS } from './mood';

function ramp() {
  const coverage = new Float32Array(CODE_COUNT);
  for (let i = 0; i < CODE_COUNT; i++) {
    coverage[i] =
      i === 0 ? 0 : 0.5 + 0.5 * Math.sin((FIRST_CODE + i) * 2.399963);
  }
  return buildRamp(coverage);
}

function field(columns = 24, rows = 8, seed = 7) {
  const corpus = wrapCorpus(
    'grown not drawn ordinal study eighteen',
    columns,
    rows
  );
  return new OrdinalField({ columns, rows, seed, corpus, ramp: ramp() });
}

describe('corpus', () => {
  it('folds the prose down to characters the field can hold', () => {
    const text = toAscii('Suture — “grown”, not drawn · μ ≈ 1.2 café');
    for (const character of text) {
      const code = character.charCodeAt(0);
      expect(code).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(code).toBeLessThanOrEqual(LAST_CODE);
    }
    expect(text).toContain('"grown"');
    expect(text).toContain('cafe');
    expect(text).toContain('u'); // mu, folded rather than dropped
  });

  it('folds the real index without losing any study', () => {
    const source = corpusSource();
    for (const character of source) {
      const code = character.charCodeAt(0);
      expect(code).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(code).toBeLessThanOrEqual(LAST_CODE);
    }
    expect(source).toContain('ORDINAL');
    expect(source).toContain('FILAMENT');
  });

  it('pads every line to the full width so every cell has a target', () => {
    const lines = wrapCorpus(corpusSource(), 40, 30);
    expect(lines).toHaveLength(30);
    for (const line of lines) expect(line).toHaveLength(40);
  });

  it('never overflows the column count, even on words wider than the grid', () => {
    for (const line of wrapLines(
      'short supercalifragilisticexpialidocious x',
      8
    ))
      expect(line.length).toBeLessThanOrEqual(8);
  });

  it('tiles the corpus when the grid is taller than the text', () => {
    const lines = wrapCorpus('one two', 12, 9);
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe(lines[2]); // one content line plus one blank, repeating
  });
});

describe('mood', () => {
  it('plays every named state within one phrase', () => {
    const seen = new Set<string>();
    for (let t = 0; t < PHRASE_SECONDS; t += 0.25)
      seen.add(ordinalMood(t, 0).name);
    expect([...seen].sort()).toEqual([...MOOD_NAMES].sort());
  });

  it('refuses to settle while the field is still visibly moving', () => {
    expect(ordinalMood(2, 0).name).toBe('Breathing');
    expect(ordinalMood(2, 0.4).name).toBe('Gathering');
  });

  it('gives every mood a band inside the printable range', () => {
    for (const name of MOOD_NAMES) {
      const [low, high] = moodByName(name).band;
      expect(low).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(high).toBeLessThanOrEqual(LAST_CODE);
      expect(high).toBeGreaterThan(low);
    }
  });
});

describe('OrdinalField', () => {
  it('only ever holds printable characters, however hard it is driven', () => {
    const f = field();
    const frenzy = moodByName('Frenzy');
    for (let n = 0; n < 200; n++) {
      if (n % 7 === 0) f.excite(n % f.columns, n % f.rows, 4, 1);
      f.step(frenzy);
    }
    for (let i = 0; i < f.size; i++) {
      expect(f.code[i]).toBeGreaterThanOrEqual(FIRST_CODE);
      expect(f.code[i]).toBeLessThanOrEqual(LAST_CODE);
      expect(Number.isFinite(f.code[i])).toBe(true);
    }
    const lines = f.glyphs();
    expect(lines).toHaveLength(f.rows);
    for (const line of lines) expect(line).toHaveLength(f.columns);
  });

  it('resolves onto the corpus exactly when it is left calm', () => {
    const f = field();
    // Left calm means no nucleation. The field opens fully dissolved, so this
    // is the whole arc: noise in, the index out.
    const calm = { ...moodByName('Breathing'), excite: 0 };
    expect(f.resolved()).toBeLessThan(0.05);
    for (let n = 0; n < 120; n++) f.step(calm);
    expect(f.resolved()).toBe(1);
  });

  it('resolves ink before it clears the gaps around it', () => {
    // The original dilates its logo mask by one column either side so the space
    // inside a letterform morphs with the strokes. Here the same effect comes
    // from pulling gaps more weakly than ink, and it is what makes words appear
    // as blocks rather than as disconnected columns.
    const f = field();
    const calm = { ...moodByName('Breathing'), excite: 0 };
    for (let n = 0; n < 45; n++) f.step(calm);

    let inkResolved = 0;
    let inkTotal = 0;
    let gapResolved = 0;
    let gapTotal = 0;
    for (let i = 0; i < f.size; i++) {
      const hit = Math.round(f.code[i]) === f.target[i] ? 1 : 0;
      if (f.target[i] === 32) {
        gapTotal++;
        gapResolved += hit;
      } else {
        inkTotal++;
        inkResolved += hit;
      }
    }
    expect(inkResolved / inkTotal).toBe(1);
    expect(gapResolved / gapTotal).toBeLessThan(1);
  });

  it('destroys what it had resolved when a wave passes', () => {
    const f = field();
    const calm = { ...moodByName('Breathing'), excite: 0 };
    for (let n = 0; n < 120; n++) f.step(calm);
    const settled = f.resolved();

    const frenzy = moodByName('Frenzy');
    for (let n = 0; n < 60; n++) f.step(frenzy);
    expect(f.resolved()).toBeLessThan(settled);
  });

  it('is deterministic from its seed', () => {
    const gathering = moodByName('Gathering');
    const a = field(20, 6, 42);
    const b = field(20, 6, 42);
    for (let n = 0; n < 80; n++) {
      a.step(gathering);
      b.step(gathering);
    }
    expect(a.glyphs()).toEqual(b.glyphs());

    const c = field(20, 6, 43);
    for (let n = 0; n < 80; n++) c.step(gathering);
    expect(c.glyphs()).not.toEqual(a.glyphs());
  });

  it('keeps the excitable medium bounded', () => {
    const f = field();
    const frenzy = moodByName('Frenzy');
    for (let n = 0; n < 300; n++) f.step(frenzy);
    for (let i = 0; i < f.size; i++) {
      expect(f.energy[i]).toBeGreaterThanOrEqual(0);
      expect(f.energy[i]).toBeLessThanOrEqual(1);
    }
    expect(f.agitation()).toBeGreaterThan(0);
    expect(f.agitation()).toBeLessThanOrEqual(1);
  });

  it('marks an injected character as touched and then lets it go', () => {
    const f = field();
    f.inject(3, 4, 'Q'.charCodeAt(0));
    expect(f.glyphs()[4][3]).toBe('Q');
    expect(f.heat[4 * f.columns + 3]).toBeCloseTo(1, 6);

    // Around five seconds at 24 fps: long enough to be watched being eaten,
    // short enough that the field is not permanently marked.
    const gathering = moodByName('Gathering');
    for (let n = 0; n < 120; n++) f.step(gathering);
    expect(f.heat[4 * f.columns + 3]).toBeLessThan(0.01);
  });

  it('holds the mood vocabulary where the field is dissolved', () => {
    const f = field(32, 12, 3);
    const breathing = moodByName('Breathing');
    const [low, high] = breathing.band;
    // Fully dissolve the field, then let the band claim it without letting the
    // corpus pull anything back.
    for (let y = 0; y < f.rows; y++)
      for (let x = 0; x < f.columns; x++) f.excite(x, y, 1, 1);
    for (let n = 0; n < 30; n++) f.step({ ...breathing, pull: 0, excite: 0 });

    let inBand = 0;
    for (let i = 0; i < f.size; i++) {
      if (f.energy[i] < 0.5) continue;
      if (f.code[i] >= low - 1 && f.code[i] <= high + 1) inBand++;
    }
    let dissolved = 0;
    for (let i = 0; i < f.size; i++) if (f.energy[i] >= 0.5) dissolved++;
    expect(dissolved).toBeGreaterThan(0);
    expect(inBand / dissolved).toBeGreaterThan(0.9);
  });

  it('re-targets on resize without disturbing what is on screen', () => {
    const f = field(24, 8);
    const before = f.glyphs();
    f.setCorpus(wrapCorpus('a different index entirely', 24, 8));
    expect(f.glyphs()).toEqual(before);
    expect(String.fromCharCode(f.target[0])).toBe('a');
  });
});
