import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseRecipe, serializeRecipe } from './settings';
import { createAnatomy, createPaintSamples } from './model';

describe('Medusa recipes', () => {
  it('round trips custom colours, anatomy and motion', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      seed: 4294967295,
      arms: 2,
      ground: DEFAULT_SETTINGS.edge,
      paused: true,
      turbulence: 2.2,
    };
    expect(parseRecipe(JSON.parse(serializeRecipe(settings)))).toEqual(
      settings
    );
  });
  it('rejects invalid input and bounds geometry work', () => {
    expect(() => parseRecipe({ version: 2, settings: {} })).toThrow();
    expect(() =>
      parseRecipe({ version: 1, settings: { width: NaN } })
    ).toThrow();
    expect(() =>
      parseRecipe({ version: 1, settings: { dark: 'invalid' } })
    ).toThrow();
    const settings = parseRecipe({
      version: 1,
      settings: { density: 100, tentacles: 1000, arms: -1, seed: -7 },
    });
    expect(settings).toMatchObject({
      density: 1.5,
      tentacles: 20,
      arms: 0,
      seed: 0,
    });
    const samples = createPaintSamples(
      createAnatomy(1, { ...settings, arms: 4 })
    );
    expect(samples.count).toBeLessThan(54000);
  });
  it('generates only requested anatomy with reproducible density', () => {
    const anatomy = createAnatomy(123, {
      ...DEFAULT_SETTINGS,
      arms: 0,
      tentacles: 0,
      density: 0.25,
      width: 1.5,
    });
    const samples = createPaintSamples(anatomy);
    expect(samples.count).toBe(2660);
    expect(
      Array.from(samples.binding)
        .filter((_, i) => i % 4 === 0)
        .every((kind) => kind === 0)
    ).toBe(true);
    expect(anatomy.width).toBeGreaterThan(3);
  });
});
