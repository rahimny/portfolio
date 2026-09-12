import { describe, expect, it } from 'vitest';
import { MastheadDrone } from '../particle-text/MastheadDrone';

function setup() {
  const drone = new MastheadDrone(350, 240, { x: 175, y: 180 });
  drone.roaming.resize(350, 240);
  drone.roaming.enabled = true;
  drone.hover();
  return drone;
}
function advance(drone: MastheadDrone, seconds: number) {
  for (let i = 0; i < seconds * 120; i++) drone.advance(1 / 120);
}

describe('homepage free flight', () => {
  it('drifts through varied paths within the masthead, even with a distant landing target', () => {
    const drone = setup();
    drone.setTravelHeight(12000);
    let minX = Infinity,
      maxX = -Infinity,
      maxSpeed = 0,
      maxAcceleration = 0;
    for (let i = 0; i < 120 * 120; i++) {
      const vx = drone.vx,
        vy = drone.vy;
      drone.advance(1 / 120);
      minX = Math.min(minX, drone.x);
      maxX = Math.max(maxX, drone.x);
      maxSpeed = Math.max(maxSpeed, Math.hypot(drone.vx, drone.vy));
      maxAcceleration = Math.max(
        maxAcceleration,
        Math.hypot(drone.vx - vx, drone.vy - vy) * 120
      );
      expect(drone.x).toBeGreaterThan(60);
      expect(drone.x).toBeLessThan(290);
      expect(drone.y).toBeGreaterThan(40);
      expect(drone.y).toBeLessThan(275);
    }
    expect(maxX - minX).toBeGreaterThan(90);
    expect(maxSpeed).toBeLessThan(45);
    expect(maxAcceleration).toBeLessThan(85);
  });

  it('hands control to dragging immediately, waits after release, and never overrides docking', () => {
    const drone = setup();
    advance(drone, 8);
    expect(drone.roaming.active).toBe(true);
    drone.grab();
    drone.move(100, 100);
    advance(drone, 1);
    expect(drone.roaming.active).toBe(false);
    expect(drone.x).toBeCloseTo(100, 0);
    drone.release();
    advance(drone, 3);
    expect(drone.roaming.active).toBe(false);
    advance(drone, 3);
    expect(drone.roaming.active).toBe(true);
    drone.setTravelHeight(1000);
    drone.land({ x: 200, y: 800 });
    advance(drone, 6);
    expect(drone.roaming.active).toBe(false);
    expect(drone.x).toBeCloseTo(200, 1);
    expect(drone.y).toBeCloseTo(800, 1);
  });
});
