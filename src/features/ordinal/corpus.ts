/**
 * The field's corpus is the registry: edition numbers, titles and summaries.
 * Fold it to printable ASCII before wrapping it to the simulation grid.
 */

import { studies, editionLabel } from '../lab/registry';
import { FIRST_CODE, LAST_CODE } from './ramp';

/**
 * Typographic characters the prose actually contains, mapped to the ASCII the
 * field can hold. Anything else outside the printable range is dropped rather
 * than guessed at.
 */
const FOLDINGS: Record<string, string> = {
  '—': ' - ', // em dash
  '–': '-', // en dash
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '·': '.', // middle dot
  '×': 'x',
  '°': ' deg',
  '²': '2',
  '³': '3',
  '…': '...',
  ' ': ' ',
  μ: 'u', // mu
};

/** Fold to printable ASCII, then collapse the whitespace the folding leaves. */
export function toAscii(text: string): string {
  let out = '';
  // Decomposing first turns accented letters into a base letter plus a
  // combining mark, so the letter survives and only the mark is dropped.
  for (const character of text.normalize('NFKD')) {
    const folded = FOLDINGS[character];
    if (folded !== undefined) {
      out += folded;
      continue;
    }
    const code = character.charCodeAt(0);
    if (character.length === 1 && code >= FIRST_CODE && code <= LAST_CODE) {
      out += character;
    } else if (/\s/.test(character)) {
      out += ' ';
    }
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** The index as one run of text, newest study first. */
export function corpusSource(): string {
  return studies
    .map(
      (study) =>
        `${editionLabel(study.edition)} ${study.title.toUpperCase()} ${study.summary}`
    )
    .map(toAscii)
    .join('  ');
}

/**
 * Greedy wrap to a fixed column count, every line padded to full width.
 *
 * Ragged lines would make the grid ragged, and a cell with no character behind
 * it has no corpus target to be pulled back to. Padding to width means every
 * cell in the field has somewhere to resolve to, including the ones inside the
 * gaps between words.
 */
export function wrapLines(text: string, columns: number): string[] {
  if (columns < 1) return [];

  const lines: string[] = [];
  let line = '';

  const push = () => {
    lines.push(line.padEnd(columns, ' '));
    line = '';
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    let remaining = word;
    // A word longer than the grid is wide is broken rather than allowed to
    // overflow; at narrow widths that is most of the longer words.
    while (remaining.length > columns) {
      if (line) push();
      lines.push(remaining.slice(0, columns));
      remaining = remaining.slice(columns);
    }
    if (!line) line = remaining;
    else if (line.length + 1 + remaining.length <= columns)
      line += ` ${remaining}`;
    else {
      push();
      line = remaining;
    }
  }
  if (line) push();

  return lines;
}

/**
 * The wrapped corpus, tiled to exactly `rows` lines.
 *
 * The grid is nearly always taller than the corpus, so it repeats. A blank line
 * between passes keeps the seam from reading as a sentence that stopped making
 * sense. The readout prints both numbers rather than implying the grid was
 * sized by the text.
 */
export function wrapCorpus(
  text: string,
  columns: number,
  rows: number
): string[] {
  if (columns < 1 || rows < 1) return [];

  const lines = wrapLines(text, columns);
  const blank = ' '.repeat(columns);
  const block = lines.length ? [...lines, blank] : [blank];

  const filled: string[] = [];
  while (filled.length < rows) filled.push(block[filled.length % block.length]);
  return filled;
}
