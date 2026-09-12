import { describe, expect, it } from 'vitest';
import { MastheadProjectiles } from './MastheadProjectiles';
import { MastheadTarget } from './MastheadTarget';

describe('reactive masthead target', () => {
  it('receives a field echo without creating another impact or feedback loop', () => {
    const target = new MastheadTarget();
    target.resize(350, 220);
    let callbacks = 0;
    target.onImpact = () => callbacks++;
    target.echo();
    expect(target.echoes).toBe(1);
    expect(target.moving).toBe(true);
    for (let i = 0; i < 600; i++) target.advance(1 / 60);
    expect(target.moving).toBe(false);
    expect(callbacks).toBe(0);
    expect(target.hits).toBe(0);
  });
  it.each([20, 30, 60, 120])(
    'receives exactly three impacts and settles at %i Hz',
    (fps) => {
      for (const [width, height, em] of [
        [350, 220, 70],
        [1180, 280, 160],
      ]) {
        const flights = new MastheadProjectiles();
        flights.resize(width, height, em);
        flights.puck.enabled = true;
        const impacts: number[] = [];
        flights.puck.onImpact = (impact) => impacts.push(impact.serial);
        expect(flights.sendSeekers(flights.puck, true)).toBe(true);
        for (let i = 0; i < 12 * fps; i++)
          flights.advance(1 / fps, { repelInk: () => 0 });
        expect(impacts).toEqual([1, 2, 3]);
        expect(flights.active).toBe(false);
        expect(flights.puck.moving).toBe(false);
        expect(flights.puck.offsetX).toBeCloseTo(0, 3);
        expect(flights.puck.offsetY).toBeCloseTo(0, 3);
      }
    }
  );
  it('detects a complete crossing and rejects a nearby miss', () => {
    const target = new MastheadTarget();
    target.resize(350, 220);
    target.enabled = true;
    expect(
      target.contact({ x: 0, y: target.y }, { x: 700, y: target.y }, 900, 0)
    ).toBe(true);
    expect(
      target.contact(
        { x: 0, y: target.y + 30 },
        { x: 700, y: target.y + 30 },
        900,
        0
      )
    ).toBe(false);
  });
  it('does not deliver an impact after cancellation', () => {
    const flights = new MastheadProjectiles();
    flights.resize(1180, 280, 160);
    flights.puck.enabled = true;
    flights.sendSeekers(flights.puck, true);
    flights.clear();
    for (let i = 0; i < 600; i++)
      flights.advance(1 / 60, { repelInk: () => 0 });
    expect(flights.puck.hits).toBe(0);
  });
});
