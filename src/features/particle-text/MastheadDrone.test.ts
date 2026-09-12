import { describe, expect, it } from 'vitest';
import { MastheadDrone } from './MastheadDrone';

const advance = (drone: MastheadDrone, seconds: number, hz = 60) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) drone.advance(1 / hz);
};

describe('retained masthead drone', () => {
  it('switches to hover without snapping an out-of-bounds writer into place', () => {
    const drone = new MastheadDrone(390, 200);
    const state = {
      x: 280,
      y: 265,
      vx: 12,
      vy: -8,
      roll: 0.2,
      pitch: -0.1,
      rotor: 423,
    };
    Object.assign(drone, state);
    drone.hover();
    for (const key of Object.keys(state) as (keyof typeof state)[])
      expect(drone[key]).toBe(state[key]);
    expect(drone.previous).toEqual({ x: state.x, y: state.y });
    drone.advance(1 / 120);
    expect(Math.abs(drone.y - state.y)).toBeLessThan(1);
    expect(drone.rotor).toBeGreaterThan(state.rotor);
    expect(Math.abs(drone.roll - state.roll)).toBeLessThan(0.03);
    advance(drone, 3);
    expect(drone.y).toBeLessThanOrEqual(238);
  });

  it('preserves the picked-up offset and moves smoothly without teleporting', () => {
    const drone = new MastheadDrone(1000, 350, { x: 600, y: 300 });
    drone.grab(620, 310);
    drone.move(320, 110);
    expect(drone.x).toBe(600);
    advance(drone, 1);
    expect(drone.x).toBeCloseTo(300, 0);
    expect(drone.y).toBeCloseTo(100, 0);
  });

  it('coasts on release then settles near its released trajectory', () => {
    const drone = new MastheadDrone(1000, 350, { x: 200, y: 200 });
    drone.grab();
    drone.move(700, 200);
    advance(drone, 0.2);
    const released = drone.x;
    drone.release();
    advance(drone, 2);
    expect(drone.x).toBeGreaterThan(released);
    expect(Math.abs(drone.vx)).toBeLessThan(1);
    expect(drone.held).toBe(false);
  });

  it('gives the same flight across different render rates', () => {
    const run = (hz: number) => {
      const drone = new MastheadDrone(1000, 400);
      drone.grab();
      drone.move(200, 130);
      advance(drone, 1, hz);
      drone.release();
      advance(drone, 1, hz);
      return drone;
    };
    const reference = run(120);
    for (const hz of [20, 30, 60]) {
      const drone = run(hz);
      expect(drone.x).toBeCloseTo(reference.x, 6);
      expect(drone.y).toBeCloseTo(reference.y, 6);
    }
  });

  it('cancels a grab and safely refits into a narrow viewport', () => {
    const drone = new MastheadDrone(1200, 450);
    drone.grab();
    drone.move(100000, -100000);
    advance(drone, 0.2);
    drone.resize(280, 220);
    expect(drone.held).toBe(false);
    expect(Math.abs(drone.vx)).toBe(0);
    advance(drone, 2);
    expect(drone.x).toBeLessThanOrEqual(232);
    expect(drone.y).toBeGreaterThanOrEqual(16);
    drone.advance(NaN);
    expect(Number.isFinite(drone.x + drone.y)).toBe(true);
  });

  it('supports repeated keyboard nudges and a cancelled release without throwing', () => {
    const drone = new MastheadDrone(1000, 350, { x: 400, y: 200 });
    drone.nudge(24, 0);
    drone.nudge(24, 0);
    advance(drone, 1);
    expect(drone.x).toBeCloseTo(448, 0);
    drone.release(true);
    expect(drone.vx).toBe(0);
    expect(drone.held).toBe(false);
  });
});
