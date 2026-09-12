import { describe, expect, it } from 'vitest';
import { buildScore, DEFAULT_SETTINGS, presetPath, STEP, WALL } from './model';
import { Performer } from './performer';
import { WetPaint } from './wet-paint';

function dry(paint: WetPaint) {
  let ticks = 0;
  while (paint.isWet() && ticks++ < 120 * 120) paint.step();
  expect(paint.isWet()).toBe(false);
  return ticks * STEP;
}
function centre(paint: WetPaint) {
  let mass = 0,
    moment = 0;
  for (let i = 0; i < paint.surface.length; i += 4) {
    mass += paint.surface[i];
    moment += paint.surface[i] * (Math.floor(i / 4 / paint.wetWidth) + 0.5);
  }
  return ((moment / mass) * WALL.height) / paint.wetHeight;
}

describe('wet paint', () => {
  it('moves loaded pigment downwards, conserves it, and leaves a permanent dry trace', () => {
    const paint = new WetPaint();
    paint.deposit({
      x: 1.6,
      y: 1.6,
      radius: 0.04,
      mass: 0.003,
    });
    const start = centre(paint);
    expect(paint.mass).toBeCloseTo(0.003, 8);
    const film = paint.density.slice();
    for (let i = 0; i < 120; i++) paint.step();
    const firstSecond = centre(paint);
    for (let i = 0; i < 120; i++) paint.step();
    expect(firstSecond - centre(paint)).toBeLessThan(start - firstSecond);
    const seconds = dry(paint);
    expect(seconds).toBeLessThan(45);
    expect(centre(paint)).toBeLessThan(start - 0.025);
    expect(paint.mass).toBeCloseTo(0.003, 7);
    expect(paint.density).toEqual(film);
    const result = paint.surface.slice();
    for (let i = 0; i < 1200; i++) paint.step();
    expect(paint.surface).toEqual(result);
    expect(paint.surface.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });

  it('does not invent runs below the retention threshold or on an empty wall', () => {
    const paint = new WetPaint();
    paint.step();
    expect(paint.mass).toBe(0);
    expect(paint.isWet()).toBe(false);
    paint.deposit({
      x: 1.6,
      y: 1.2,
      radius: 0.15,
      mass: 0.00001,
    });
    const start = centre(paint);
    dry(paint);
    expect(centre(paint)).toBeCloseTo(start, 7);
    expect(paint.mass).toBeCloseTo(0.00001, 10);
  });

  it('retains bottom-edge pigment, never wraps, and layers onto dried marks', () => {
    const paint = new WetPaint();
    const stamp = {
      x: 0.04,
      y: 0.055,
      radius: 0.025,
      mass: 0.002,
    };
    paint.deposit(stamp);
    dry(paint);
    expect(paint.mass).toBeCloseTo(0.002, 7);
    const film = paint.density.slice();
    paint.deposit(stamp);
    dry(paint);
    expect(paint.mass).toBeCloseTo(0.004, 7);
    expect(paint.density.every((v, i) => v === film[i] * 2)).toBe(true);
    expect(
      paint.surface.slice(paint.wetWidth * 4 * 10).every((v) => v === 0)
    ).toBe(true);
  });

  // Three complete deposition/drying runs share the CPU with other CI tests.
  // Keep the simulated work and equality checks independent of runner speed.
  it('replays nozzle deposition and drying identically at 30, 60 and 120 Hz', () => {
    const run = (hz: number) => {
      const paint = new WetPaint();
      const performer = new Performer(
        buildScore(presetPath('hold'), DEFAULT_SETTINGS),
        'fine'
      );
      let frames = 0;
      while ((!performer.complete || paint.isWet()) && frames++ < hz * 120)
        performer.advance(1 / hz, paint.deposit, paint.step, paint.isWet);
      expect(performer.complete && !paint.isWet()).toBe(true);
      return paint.snapshot();
    };
    const a = run(30),
      b = run(60),
      c = run(120);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  }, 20_000);

  it('restores solvent and mobile pigment so drying can resume', () => {
    const original = new WetPaint();
    original.deposit({
      x: 1.6,
      y: 1.2,
      radius: 0.04,
      mass: 0.003,
    });
    for (let i = 0; i < 120; i++) original.step();
    const restored = new WetPaint();
    restored.restore(original.snapshot());
    expect(restored.surface).toEqual(original.surface);
    dry(original);
    dry(restored);
    expect(restored.mass).toBeCloseTo(original.mass, 9);
    expect(centre(restored)).toBeCloseTo(centre(original), 7);
    restored.clear();
    expect(restored.mass).toBe(0);
    expect(restored.isWet()).toBe(false);
    expect(restored.surface.every((v) => v === 0)).toBe(true);
  });
});
