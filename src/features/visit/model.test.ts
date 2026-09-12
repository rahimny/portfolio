import { describe, expect, it } from 'vitest';
import { addVisit, readVisits, visitReceipt } from './model';

describe('session visit record', () => {
  it('rejects malformed storage and removed slugs while preserving first-visit order', () => {
    const valid = new Set(['ordinal', 'filament']);
    expect(readVisits('{', valid)).toEqual([]);
    expect(readVisits('{}', valid)).toEqual([]);
    expect(
      readVisits('["ordinal",null,"old","filament","ordinal"]', valid)
    ).toEqual(['ordinal', 'filament']);
    const visits = ['ordinal'];
    expect(addVisit(visits, 'ordinal')).toBe(visits);
    expect(addVisit(visits, 'filament')).toEqual(['ordinal', 'filament']);
  });
  it('makes an independent, escaped receipt in discovery order', () => {
    const svg = visitReceipt([
      { edition: 18, title: 'Ordinal' },
      { edition: 26, title: 'A < B & C' },
    ]);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('A &lt; B &amp; C');
    expect(svg.indexOf('Ordinal')).toBeLessThan(svg.indexOf('A &lt;'));
    expect(svg).not.toContain('href=');
  });
});
