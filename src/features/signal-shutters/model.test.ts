import { describe, expect, it } from 'vitest';
import { COLUMNS, COUNT, ShutterField, TURN } from './model';

describe('shutter transmission', () => {
  it('travels through neighbours without wrapping across rows', () => {
    const field = new ShutterField();
    field.transmit(1, COLUMNS - 1, 0);
    field.step(0.02);
    expect(field.reached[COLUMNS - 2]).toBe(1);
    expect(field.reached[COLUMNS]).toBe(0);
    expect(field.reached[COUNT - 1]).toBe(0);
  });

  it('a new transmission supersedes an unfinished wave and reaches every motor', () => {
    const field = new ShutterField();
    field.transmit(1);
    for (let i = 0; i < 30; i++) field.step(1 / 120);
    field.transmit(2, COLUMNS - 1, 12);
    for (let i = 0; i < 700; i++) field.step(1 / 120);
    for (const angle of field.angles) {
      expect(Math.cos(angle + 2 * TURN)).toBeCloseTo(1, 5);
    }
    expect(field.step(1 / 120)).toBe(false);
  });

  it('a local disturbance is bounded and returns to the printed face', () => {
    const field = new ShutterField();
    field.disturb(40, 12);
    expect(field.velocities[12 * COLUMNS + 40]).toBeGreaterThan(0);
    expect(field.velocities[0]).toBe(0);
    for (let i = 0; i < 500; i++) field.step(1 / 120);
    expect(Math.max(...field.angles.map(Math.abs))).toBeLessThan(0.001);
    expect(field.step(1 / 120)).toBe(false);
  });
});
