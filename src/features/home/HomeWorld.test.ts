import { describe, expect, it, vi } from 'vitest';
import { HomeWorld, type WorldInk } from './HomeWorld';
import { LandingZone } from './LandingZone';
import type { TextLayout } from '../particle-text/layout';

const layout: TextLayout = {
  glyphs: ['R', 'N'].map((char, word) => ({
    char,
    word,
    u: word * 2,
    v: 1,
    glyph: {
      advance: 1,
      area: 1,
      cell: 0,
      x: new Float32Array([0, 1]),
      y: new Float32Array([-1, 0]),
      cdf: new Float32Array([1, 2]),
    },
  })),
  scale: 80,
  offsetY: 0,
  lines: 1,
  baselines: [1],
  inkArea: 2,
  caret: { x: 0, y: 0, width: 0, height: 1 },
};
function setup() {
  const ink: WorldInk = {
    beginWriting: vi.fn(),
    burstWriting: vi.fn(),
    write: vi.fn(),
    finishWriting: vi.fn(),
    cancelWriting: vi.fn(),
    clearProjectileWake: vi.fn(),
    aimAt: () => false,
    repelInk: vi.fn(() => 100),
  };
  const world = new HomeWorld(ink);
  world.resize(640, 200, 80, 0);
  return { world, ink };
}
const advance = (world: HomeWorld, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) world.advance(1 / 120);
};

describe('homepage world', () => {
  it('leaves finished type intact during autonomous exploration', () => {
    const { world, ink } = setup();
    world.watcher.enabled = world.watcher.visible = true;
    world.watcher.resize(640, 320, 120);
    world.start(layout);
    world.skip();
    advance(world, 40);
    expect(world.drone.roaming.active).toBe(true);
    expect(ink.repelInk).not.toHaveBeenCalled();
    world.grabDrone();
    world.moveDrone(150, 80);
    advance(world, 0.3);
    expect(ink.repelInk).toHaveBeenCalled();
  });
  it('updates a landing zone without retiring independent projectile flights', () => {
    const { world } = setup();
    world.start(layout);
    advance(world, world.writing!.duration + 0.01);
    world.grabDrone();
    world.releaseDrone();
    expect(world.sendSeekers(200, 100)).toBe(true);
    const active = world.projectiles.items.filter((item) => item.active);
    world.setLanding({ x: 400, y: 500 });
    expect(world.projectiles.items.filter((item) => item.active)).toEqual(
      active
    );
    expect(active.length).toBeGreaterThan(0);
  });
  it('keeps a requested landing when an inactive gesture is cancelled', () => {
    const { world } = setup();
    world.start(layout);
    advance(world, world.writing!.duration + 0.01);
    world.setLanding({ x: 450, y: 450 });
    expect(world.landDrone()).toBe(true);
    world.releaseDrone(true);
    expect(world.drone.owner).toBe('landing');
    advance(world, 5);
    expect(world.drone.owner).toBe('landed');
    world.releaseDrone(true);
    expect(world.drone.owner).toBe('landed');
    world.grabDrone();
    world.releaseDrone(true);
    expect(world.drone.held).toBe(false);
    expect(world.drone.owner).toBe('hover');
  });
  it('keeps actor identity through writing, hover, dragging and replay', () => {
    const { world, ink } = setup();
    const actor = world.drone;
    world.start(layout);
    expect(actor.owner).toBe('writing');
    expect(world.droneReady).toBe(false);
    const score = world.writing!;
    advance(world, score.duration + 0.01);
    expect(world.drone).toBe(actor);
    expect(actor.owner).toBe('hover');
    expect(actor.visible).toBe(true);
    expect(world.drones[1].visible).toBe(false);
    expect(ink.finishWriting).toHaveBeenCalledOnce();
    const rotor = actor.rotor;
    world.grabDrone();
    world.moveDrone(200, 80);
    advance(world, 0.2);
    expect(actor.owner).toBe('drag');
    expect(actor.rotor).toBeGreaterThan(rotor);
    expect(ink.repelInk).toHaveBeenCalled();
    expect(actor.ink.dirt).toBeGreaterThan(0);
    world.releaseDrone();
    expect(actor.owner).toBe('hover');
    world.start(layout);
    expect(world.drone).toBe(actor);
    expect(actor.owner).toBe('writing');
    expect(actor.ink.dirt).toBe(0);
  });

  it('does not allow two controllers to advance the same actor', () => {
    const { world } = setup();
    world.start(layout);
    world.advance(0.05);
    const { x, y, rotor } = world.drone;
    world.drone.advance(0.05);
    expect({
      x: world.drone.x,
      y: world.drone.y,
      rotor: world.drone.rotor,
    }).toEqual({ x, y, rotor });
    world.skip();
    const pose = {
      x: world.drone.x,
      y: world.drone.y,
      rotor: world.drone.rotor,
    };
    expect(world.drone.owner).toBe('writing');
    expect(pose).toEqual({ x, y, rotor });
    world.skip();
    advance(world, 1.7);
    expect(world.drone.owner).toBe('hover');
    expect(world.hand).toBeNull();
    expect(world.droneReady).toBe(true);
  });

  it('lands through a registered capability, and permits pickup afterwards', () => {
    const { world } = setup();
    world.setLanding({ x: 450, y: 450 });
    world.resize(640, 200, 80, 0);
    world.start(layout);
    advance(world, world.writing!.duration + 0.01);
    const arrive = vi.fn();
    world.landing.onArrive = arrive;
    expect(world.landDrone()).toBe(true);
    advance(world, 5);
    expect(arrive).toHaveBeenCalledOnce();
    expect(world.drone.owner).toBe('landed');
    expect(world.drone.y).toBeCloseTo(450, 1);
    world.grabDrone();
    world.moveDrone(100, 100);
    advance(world, 0.5);
    expect(world.drone.owner).toBe('drag');
    expect(world.landing.occupied).toBe(false);
  });

  it('cancels ownership on disable/resize and disposes callbacks once', () => {
    const { world, ink } = setup();
    world.start(layout);
    world.advance(0.05);
    world.skip();
    world.grabDrone();
    world.resize(320, 180, 60, 0);
    expect(world.drone.held).toBe(false);
    world.setEnabled(false);
    const x = world.drone.x;
    advance(world, 2);
    expect(world.drone.x).toBe(x);
    expect(world.droneReady).toBe(false);
    world.dispose();
    const count = vi.mocked(ink.clearProjectileWake).mock.calls.length;
    world.dispose();
    world.advance(0.05);
    expect(ink.clearProjectileWake).toHaveBeenCalledTimes(count);
    expect(world.start(layout)).toBe(false);
    expect(world.drone.visible).toBe(false);
    expect(world.projectiles.puck.onImpact).toBeUndefined();
  });

  it('requires settled unheld contact and rearms only after leaving', () => {
    const zone = new LandingZone();
    zone.set({ x: 100, y: 100 });
    const arrive = vi.fn();
    zone.onArrive = arrive;
    const actor = {
      x: 100,
      y: 100,
      vx: 500,
      vy: 0,
      held: false,
      visible: true,
    };
    zone.advance(1, actor);
    actor.vx = 0;
    actor.held = true;
    zone.advance(1, actor);
    expect(arrive).not.toHaveBeenCalled();
    actor.held = false;
    zone.advance(0.2, actor);
    expect(arrive).not.toHaveBeenCalled();
    zone.advance(0.1, actor);
    zone.advance(1, actor);
    expect(arrive).toHaveBeenCalledOnce();
    actor.x = 200;
    zone.advance(0.1, actor);
    actor.x = 100;
    zone.advance(0.3, actor);
    expect(arrive).toHaveBeenCalledTimes(2);
  });
});
