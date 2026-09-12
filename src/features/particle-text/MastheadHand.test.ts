import { describe, expect, it } from 'vitest';
import {
  HAND_APPEAR,
  MastheadHand,
  companionInRay,
  type HandInk,
} from './MastheadHand';
import { MastheadProjectiles } from './MastheadProjectiles';

const ink: HandInk = {
  aimAt: (_, destination) => {
    Object.assign(destination, { x: 220, y: 80 });
    return true;
  },
};
const field = { repelInk: () => 1 };
function setup() {
  const hand = new MastheadHand(900, 300, 160);
  const flights = new MastheadProjectiles();
  flights.resize(900, 300, 160);
  const advance = (dt: number) => {
    hand.advance(dt, ink, flights);
    flights.advance(dt, field);
  };
  return { hand, flights, advance };
}

describe('masthead hand', () => {
  it('waits for a companion to clear its actual firing ray without bunching delayed shots', () => {
    const { hand, flights } = setup();
    const companion = { x: 550, y: 150, size: 200, visible: true };
    for (let i = 0; i < 4 * 60; i++)
      hand.advance(1 / 60, ink, flights, companion);
    expect(hand.waitingForCompanion).toBe(true);
    expect(hand.shots).toBe(0);
    companion.visible = false;
    let previousShot = -10;
    let shots = 0;
    for (let i = 0; i < 14 * 60; i++) {
      hand.advance(1 / 60, ink, flights, companion);
      if (hand.shots !== shots) {
        expect(hand.time - previousShot).toBeGreaterThanOrEqual(0.28);
        previousShot = hand.time;
        shots = hand.shots;
      }
    }
    expect(hand.done).toBe(true);
    expect(shots).toBe(9);
    expect(
      companionInRay(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0, size: 50, visible: true }
      )
    ).toBe(false);
  });
  it('materialises before shooting, demonstrates seekers and completes one bounded visit', () => {
    const { hand, flights, advance } = setup();
    for (let i = 0; i < HAND_APPEAR * 60; i++) advance(1 / 60);
    expect(hand.shots).toBe(0);
    expect(hand.reveal).toBeCloseTo(1);
    for (let i = 0; i < 900; i++) advance(1 / 60);
    expect(hand.shots).toBe(9);
    expect(flights.launched).toBe(3);
    expect(flights.active).toBe(false);
    expect(hand.done).toBe(true);
    expect(hand.reveal).toBe(0);
  });
  it.each([20, 30, 60, 120])(
    'keeps the fingertip ray on target at %i fps',
    (fps) => {
      const { hand, flights, advance } = setup();
      let shots = 0;
      for (let i = 0; i < 16 * fps; i++) {
        advance(1 / fps);
        if (shots !== hand.shots) {
          const { x, y, dx, dy } = hand.muzzle;
          const error = Math.abs((220 - x) * dy - (80 - y) * dx);
          expect(error).toBeLessThan(8);
          shots = hand.shots;
        }
      }
      expect(shots).toBe(9);
      expect(flights.launched).toBe(3);
    }
  );
  it('cannot start another shot after interruption', () => {
    const { hand, flights, advance } = setup();
    while (!hand.shots) advance(1 / 60);
    hand.cancel();
    flights.clear();
    for (let i = 0; i < 600; i++) advance(1 / 60);
    expect(hand.shots).toBe(1);
    expect(flights.active).toBe(false);
    expect(hand.reveal).toBe(0);
  });
});
