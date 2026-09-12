import { describe, expect, it } from 'vitest';
import { DroneInk } from './DroneInk';
const advance = (ink: DroneInk, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) ink.advance(1 / 120, 0);
};

describe('the drone cleans ink after contact', () => {
  it('never cleans a dry drone, waits for release and only returns the ink once', () => {
    const ink = new DroneInk();
    ink.release(false);
    advance(ink, 3);
    expect(ink.cleanings).toBe(0);
    ink.grab();
    ink.collect(100, 0.1, 40, 50, 200);
    advance(ink, 2);
    expect(ink.cleanings).toBe(0);
    ink.release(false);
    advance(ink, 1);
    expect(ink.age).toBeGreaterThan(0);
    advance(ink, 3);
    expect(ink.cleanings).toBe(1);
    expect(ink.dirt).toBe(0);
  });
  it('allows reacquisition and cancellation without a delayed gesture', () => {
    const ink = new DroneInk();
    ink.grab();
    ink.collect(100, 0.1, 40, 50, 200);
    ink.release(false);
    advance(ink, 1);
    ink.grab();
    expect(ink.age).toBe(-1);
    expect(ink.dirt).toBeGreaterThan(0);
    ink.release(true);
    advance(ink, 3);
    expect(ink.dirt).toBe(0);
    expect(ink.cleanings).toBe(1);
  });
  it('lets faster passes accumulate more dirt without exceeding the pool', () => {
    const gentle = new DroneInk(),
      fast = new DroneInk();
    gentle.grab();
    fast.grab();
    gentle.collect(100, 0.1, 40, 50, 20);
    fast.collect(100, 0.1, 40, 50, 700);
    expect(fast.dirt).toBeGreaterThan(gentle.dirt);
    for (let i = 0; i < 100; i++) fast.collect(1000, 0.1, 40, 50, 700);
    expect(fast.dirt).toBe(1);
    expect(fast.origin).toEqual({ x: 40, y: 50 });
  });
  it('collects during release momentum, but ignores untouched autonomous flight', () => {
    const ink = new DroneInk();
    ink.collect(100, 0.1, 40, 50, 200);
    expect(ink.dirt).toBe(0);
    ink.grab();
    ink.release(false);
    ink.collect(100, 0.1, 40, 50, 200);
    expect(ink.dirt).toBeGreaterThan(0);
    advance(ink, 3);
    expect(ink.cleanings).toBe(1);
  });
});
