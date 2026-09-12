import { describe, expect, it } from 'vitest';
import { sweptExposure } from './inkContact';
import { MastheadProjectiles, SEEKER_CAPACITY } from './MastheadProjectiles';

const setup = () => {
  const flights = new MastheadProjectiles();
  flights.resize(900, 300, 160);
  return flights;
};
const ink = { repelInk: () => 1 };

describe('swept repulsion', () => {
  it('measures time in a radius without tunnelling or inflating long-frame forces', () => {
    const whole = sweptExposure(45, 4, 100, 10);
    let split = 0;
    for (let x = 0; x < 100; x += 5)
      split += sweptExposure(45 - x, 4, 5, 10) / 20;
    expect(whole).toBeCloseTo(split, 12);
    expect(whole).toBeGreaterThan(0);
    expect(sweptExposure(45, 11, 100, 10)).toBe(0);
    expect(sweptExposure(45, 0, 0, 10)).toBe(0);
  });
  it('passes every cluster along a bullet ray and retires outside the field', () => {
    const flights = setup();
    const clusters = [100, 250, 500];
    const touched = new Set<number>();
    flights.fire({ x: 0, y: 100 }, 1, 0);
    const bullet = flights.items.find((p) => p.active)!;
    for (let i = 0; i < 120; i++)
      flights.advance(1 / 60, {
        repelInk: (from, to) => {
          clusters.forEach((x) => {
            if (from.x <= x && to.x >= x) touched.add(x);
          });
          return 100;
        },
      });
    expect([...touched]).toEqual(clusters);
    expect(bullet.x).toBeGreaterThan(900);
    expect(flights.active).toBe(false);
  });
});

describe('masthead seekers', () => {
  it.each([20, 30, 60, 120])(
    'converges, passes through and expires at %i fps',
    (fps) => {
      const flights = setup();
      flights.sendSeekers({ x: 450, y: 140 });
      const passed = new Set<number>();
      for (let i = 0; i < fps * 5; i++) {
        flights.advance(1 / fps, ink);
        flights.items.forEach((p, id) => {
          if (p.passed) passed.add(id);
        });
      }
      expect(passed.size).toBe(3);
      expect(flights.active).toBe(false);
      expect(flights.items.every((p) => Number.isFinite(p.x + p.y))).toBe(true);
    }
  );
  it.each([
    [390, 240, 70],
    [1440, 340, 160],
  ])('reaches edge and centre targets in a %ipx stage', (width, height, em) => {
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [width * 0.5, height * 0.5],
      [0, height],
      [width, height],
    ]) {
      const flights = new MastheadProjectiles();
      flights.resize(width, height, em);
      flights.sendSeekers({ x, y });
      for (let i = 0; i < 600; i++) flights.advance(1 / 120, ink);
      expect(flights.items.filter((p) => p.passed).length).toBe(3);
      expect(flights.active).toBe(false);
    }
  });
  it('bounds rapid volleys and clears flight and trails on resize', () => {
    const flights = setup();
    expect(flights.sendSeekers({ x: 450, y: 140 })).toBe(true);
    expect(flights.reticle.age).toBe(0);
    expect(flights.sendSeekers({ x: 450, y: 140 })).toBe(false);
    for (let i = 0; i < 600; i++) {
      flights.sendSeekers({ x: 450, y: 140 });
      flights.advance(1 / 60, ink);
      expect(flights.items.filter((p) => p.active).length).toBeLessThanOrEqual(
        SEEKER_CAPACITY
      );
    }
    flights.resize(390, 200, 70);
    expect(flights.active).toBe(false);
    expect(flights.launched).toBe(0);
    expect(flights.canLaunch).toBe(true);
  });
});
