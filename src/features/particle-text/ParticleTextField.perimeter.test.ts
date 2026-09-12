import { describe, expect, it } from 'vitest';
import { ParticleTextField } from './ParticleTextField';
import { DEFAULT_PARTICLE_TEXT_SETTINGS } from './settings';
import { REST } from './MotionProgramme';

/**
 * D19's deferred unit: wall impulse accumulated into perimeter segments,
 * decayed, drawn tinted. These exercise the simulation side (geometry and
 * impact accumulation) — the draw path is covered by hand against a real GL
 * context, which vitest's jsdom environment cannot provide.
 */
describe('ParticleTextField perimeter impact', () => {
  it('covers the whole vessel with positive-area segments, none left unassigned', () => {
    const field = new ParticleTextField(8);
    // Wide, short: the masthead's own shape, where a proportional split
    // matters most (most segments should land on the long edges).
    field.setBounds(0, 0, 200, 50);

    expect(Array.from(field.perimeterW).every((w) => w > 0)).toBe(true);
    expect(Array.from(field.perimeterH).every((h) => h > 0)).toBe(true);

    // Every segment sits on one of the four walls: x is either 0 or 200
    // (within its own thickness) or its y is 0 or 50.
    for (let i = 0; i < field.perimeterX.length; i++) {
      const x = field.perimeterX[i];
      const y = field.perimeterY[i];
      const onVerticalWall = x <= 3 || x >= 197;
      const onHorizontalWall = y <= 3 || y >= 47;
      expect(onVerticalWall || onHorizontalWall).toBe(true);
    }
  });

  it('lights a segment when a particle bounces off a wall, and lets it fade once the push stops', () => {
    const field = new ParticleTextField(64);
    field.setBounds(0, 0, 100, 100);
    field.setCount(50);

    const em = 16;
    const dt = 1 / 60;
    const settings = DEFAULT_PARTICLE_TEXT_SETTINGS;

    // A wide, strong repulsor at the centre: every particle gets pushed
    // radially outward, so within a few dozen frames something reaches a
    // wall regardless of where the scatter happened to place it.
    for (let i = 0; i < 200; i++) {
      field.setPointer(50, 50, 0, 0, 1, 0, 20);
      field.step(dt, settings, em, REST);
    }

    const hitIndex = field.perimeterHeat.findIndex((h) => h > 0);
    expect(hitIndex).toBeGreaterThanOrEqual(0);
    const heatAfterHit = field.perimeterHeat[hitIndex];
    expect(heatAfterHit).toBeGreaterThan(0);
    expect(heatAfterHit).toBeLessThanOrEqual(1);

    // Stop pushing and let the field settle; the mark decays rather than
    // staying lit for ever.
    field.clearPointer();
    for (let i = 0; i < 400; i++) {
      field.step(dt, settings, em, REST);
    }
    expect(field.perimeterHeat[hitIndex]).toBeLessThan(heatAfterHit);
  });
});
