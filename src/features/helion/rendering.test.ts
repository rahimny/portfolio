import { expect, it } from 'vitest';
import { normaliseRendering, RENDER_PRESETS } from './rendering';
it('bounds artistic controls and replaces non-finite values', () => {
  expect(
    normaliseRendering({
      cel: NaN,
      ink: 2,
      hatch: -1,
      glow: Infinity,
      pixels: 0.3,
    })
  ).toEqual({ cel: 0.85, ink: 1, hatch: 0, glow: 0.12, pixels: 0.3 });
  for (const preset of Object.values(RENDER_PRESETS))
    expect(normaliseRendering(preset)).toEqual(preset);
});
