import { describe, expect, it, vi } from 'vitest';
import { HomeWorld, type WorldInk } from './HomeWorld';
import { HomeEncounterSpace, NereidGreeting } from './HomeEncounterSpace';
import { MastheadHand } from '../particle-text/MastheadHand';

function setup(width = 1000) {
  const ink: WorldInk = {
    beginWriting() {},
    burstWriting() {},
    write() {},
    finishWriting() {},
    cancelWriting() {},
    clearProjectileWake() {},
    repelInk: () => 0,
    aimAt: (_, point) => {
      point.x = width * 0.3;
      point.y = 80;
      return true;
    },
  };
  const world = new HomeWorld(ink);
  world.resize(width, 240, 85, 0);
  world.active = true;
  world.watcher.enabled = world.watcher.visible = true;
  world.watcher.resize(width, 350, 120);
  world.drone.visible = true;
  world.drone.x = world.watcher.x + 90;
  world.drone.y = 210;
  world.drone.hover();
  return world;
}
const advance = (world: HomeWorld, seconds: number, hz = 60) => {
  for (let i = 0; i < seconds * hz; i++) world.advance(1 / hz);
};

describe('the homepage cast', () => {
  it.each([350, 1000])(
    'meets, inspects and departs at width %i without clipping or constant repetition',
    (width) => {
      const world = setup(width);
      const moods = new Set<string>();
      let maxSpeed = 0;
      for (let i = 0; i < 120 * 60; i++) {
        world.advance(1 / 60);
        moods.add(world.characters.mood);
        maxSpeed = Math.max(
          maxSpeed,
          Math.hypot(world.drone.vx, world.drone.vy)
        );
        expect(world.drone.x).toBeGreaterThanOrEqual(40);
        expect(world.drone.x).toBeLessThanOrEqual(width - 40);
        expect(
          Number.isFinite(world.watcher.balance + world.drone.gazeYaw)
        ).toBe(true);
      }
      expect(moods).toContain('approaching');
      expect(moods).toContain('inspecting');
      expect(moods).toContain('leaving');
      expect(world.characters.encounters).toBeGreaterThan(0);
      expect(world.characters.encounters).toBeLessThanOrEqual(3);
      expect(maxSpeed).toBeLessThan(90);
    }
  );

  it('gives dragging and docking priority over an encounter, and clears it on replay/disable', () => {
    const world = setup();
    for (let i = 0; i < 3600 && world.characters.mood !== 'approaching'; i++)
      world.advance(1 / 60);
    expect(world.drone.guide.active).toBe(true);
    world.grabDrone();
    world.moveDrone(150, 80);
    advance(world, 1);
    expect(world.drone.guide.active).toBe(false);
    expect(world.drone.look.active).toBe(false);
    expect(world.drone.x).toBeCloseTo(150, 0);
    world.setLanding({ x: 500, y: 800 });
    world.releaseDrone();
    world.landDrone();
    advance(world, 7);
    expect(world.drone.owner).toBe('landed');
    expect(world.drone.y).toBeCloseTo(800, 0);
    world.setEnabled(false);
    expect(world.characters.encounters).toBe(0);
  });

  it('makes room for the hand, notices a burst and returns to its own interests', () => {
    const world = setup();
    world.hand = new MastheadHand(world.width, world.height, world.scale);
    advance(world, 4);
    expect(world.characters.mood).toBe('yielding');
    expect(world.drone.guide.active).toBe(true);
    expect(world.hand!.shots).toBeGreaterThan(0);
    expect(world.characters.watching).toBe('hand');
    expect(world.drone.x).toBeLessThan(world.width * 0.5);
    advance(world, 13);
    expect(world.hand).toBeNull();
    expect(world.characters.mood).not.toBe('yielding');
  });

  it('sleeps the masthead encounter outside its viewport', () => {
    const world = setup();
    world.watcher.inView = false;
    advance(world, 30);
    expect(world.characters.encounters).toBe(0);
    expect(world.drone.guide.active).toBe(false);
    expect(world.drone.roaming.active).toBe(false);
  });
});

describe('Nereid recognises a nearby visitor', () => {
  it('does not wake for distant flight; responds, settles and unsubscribes cleanly', () => {
    const space = new HomeEncounterSpace();
    const wake = vi.fn();
    const unsubscribe = space.subscribe(wake);
    space.updateNereid(500, 1500, 300, true);
    for (let i = 0; i < 200; i++) space.updateDrone(i, 100, true);
    expect(wake).not.toHaveBeenCalled();
    space.updateDrone(600, 1500, true);
    expect(space.proximity).toBeGreaterThan(0.5);
    expect(wake).toHaveBeenCalledOnce();
    const greeting = new NereidGreeting();
    for (let i = 0; i < 600; i++)
      greeting.advance(1 / 60, space.proximity, space.side);
    expect(greeting.amount).toBeGreaterThan(0.5);
    expect(greeting.turn).toBeGreaterThan(0);
    expect(greeting.moving).toBe(false);
    space.updateDrone(600, 1500, false);
    for (let i = 0; i < 600; i++)
      greeting.advance(1 / 60, space.proximity, space.side);
    expect(greeting.amount).toBe(0);
    expect(greeting.moving).toBe(false);
    unsubscribe();
    wake.mockClear();
    space.updateDrone(600, 1500, true);
    expect(wake).not.toHaveBeenCalled();
  });
});
