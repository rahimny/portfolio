import { describe, expect, it } from 'vitest';
import { membraneFromMask, signedVolume } from './mesh';
import { PressureBody, PressureWorld } from './model';
import { readSettings } from './settings';
import { separateLetters, CONTACT_DISTANCE } from './contacts';

const block = (x = 0) =>
  new PressureBody(
    membraneFromMask(new Uint8Array(8 * 18).fill(1), 8, 18, 0.075),
    x
  );
const advance = (world: PressureWorld, count: number) => {
  for (let i = 0; i < count; i++) world.step();
};

describe('Pressure Type membranes', () => {
  it('closes both faces and a counter with consistently oriented edges', () => {
    const mask = new Uint8Array(10 * 14).fill(1);
    for (let y = 3; y < 11; y++)
      for (let x = 3; x < 7; x++) mask[y * 10 + x] = 0;
    const mesh = membraneFromMask(mask, 10, 14, 0.1);
    const edges = new Map<string, number[]>();
    for (let i = 0; i < mesh.triangles.length; i += 3)
      for (let j = 0; j < 3; j++) {
        const a = mesh.triangles[i + j],
          b = mesh.triangles[i + ((j + 1) % 3)];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        edges.set(key, [...(edges.get(key) ?? []), a < b ? 1 : -1]);
      }
    for (const directions of edges.values()) {
      expect(directions).toHaveLength(2);
      expect(directions[0] + directions[1]).toBe(0);
    }
    const original = signedVolume(mesh.positions, mesh.triangles);
    const translated = mesh.positions.slice();
    for (let i = 0; i < translated.length; i += 3) {
      translated[i] += 4;
      translated[i + 1] -= 3;
    }
    expect(original).toBeGreaterThan(0);
    expect(signedVolume(translated, mesh.triangles)).toBeCloseTo(original, 5);
  });
  it('inflates, holds finite bounded geometry and deflates after repeated pumping', () => {
    const body = block(),
      world = new PressureWorld([body]);
    for (let i = 0; i < 8; i++) world.pump();
    expect(world.air).toBe(1);
    expect(world.strokes).toBe(8);
    advance(world, 600);
    const inflated = body.volume;
    expect(inflated).toBeGreaterThan(body.restVolume * 3);
    expect([...body.positions].every(Number.isFinite)).toBe(true);
    world.venting = true;
    advance(world, 1000);
    expect(world.air).toBe(0);
    expect(body.volume).toBeLessThan(inflated * 0.3);
    expect(world.settled).toBe(true);
    world.reset();
    expect(body.positions).toEqual(body.rest);
    expect(world.strokes).toBe(0);
  });
  it('resolves contacts between two letters and leaves separated letters alone', () => {
    const a = block(-0.32),
      b = block(0.32),
      bounds = new Float32Array(4);
    const before = a.positions.slice();
    expect(separateLetters([a, b], bounds)).toBeGreaterThan(0);
    expect(a.positions).not.toEqual(before);
    const distant = block(2),
      unchanged = distant.positions.slice();
    expect(separateLetters([a, distant], bounds)).toBe(0);
    expect(distant.positions).toEqual(unchanged);
    expect(CONTACT_DISTANCE).toBeGreaterThan(0);
  });
  it('bounds repeated hits, couples recoil and settles after release', () => {
    const body = block(),
      world = new PressureWorld([body]);
    world.pump();
    advance(world, 300);
    const before = body.positions.slice();
    for (let i = 0; i < 100; i++) body.hit(0.1, 0.1, 0.4);
    expect(Math.max(...body.velocity.map(Math.abs))).toBeLessThanOrEqual(7);
    advance(world, 8);
    expect(body.positions).not.toEqual(before);
    expect(body.motion.offset[2]).toBeLessThan(0);
    advance(world, 1400);
    expect([...body.positions].every(Number.isFinite)).toBe(true);
    expect(world.settled).toBe(true);
  });
  it('lifts under buoyancy, bursts once when overfilled and resets every subsystem', () => {
    const body = block(),
      world = new PressureWorld([body]);
    for (let i = 0; i < 8; i++) world.pump();
    world.helium = true;
    advance(world, 1000);
    expect(body.motion.offset[1]).toBeGreaterThan(0.25);
    expect(world.settled).toBe(true);
    for (let i = 0; i < 30; i++) world.pump();
    expect(world.air).toBeLessThanOrEqual(1.5);
    advance(world, 500);
    expect(body.burst.active).toBe(true);
    expect(world.air).toBe(0);
    expect(world.settled).toBe(true);
    const stopped = body.burst.positions.slice();
    advance(world, 100);
    expect(body.burst.positions).toEqual(stopped);
    world.reset();
    expect(body.burst.active).toBe(false);
    expect(body.motion.offset).toEqual(new Float32Array(3));
    expect(world.helium).toBe(false);
  });
  it('replays the same pump and valve inputs deterministically', () => {
    const a = new PressureWorld([block()]),
      b = new PressureWorld([block()]);
    for (const world of [a, b]) {
      world.pump();
      advance(world, 40);
      world.pump();
      advance(world, 100);
      world.venting = true;
      advance(world, 60);
    }
    expect(a.bodies[0].positions).toEqual(b.bodies[0].positions);
  });

  it('keeps a local hit on its connected front-surface neighbourhood', () => {
    const body = block();
    body.air = body.targetAir = 0.5;
    expect(body.hit(0, 0, 0.3)).toBe(true);
    let affected = 0;
    for (let i = 2; i < body.velocity.length; i += 3) {
      if (body.velocity[i] === 0) continue;
      affected++;
      expect(body.positions[i]).toBeGreaterThan(0);
    }
    expect(affected).toBeGreaterThan(1);
    expect(affected).toBeLessThan(body.positions.length / 6);
  });

  it('allows a knock to rupture only the overfilled letter and ignores further hits', () => {
    const a = block(-1),
      b = block(1);
    a.air = a.targetAir = 1.125;
    b.air = b.targetAir = 0.5;
    expect(a.hit(-1, 0, 0.3)).toBe(true);
    expect(a.burst.active).toBe(true);
    expect(b.burst.active).toBe(false);
    expect(a.hit(-1, 0, 0.3)).toBe(false);
    expect(a.hits).toBe(1);
    expect(a.targetAir).toBe(0);
  });

  it('extracts a world frame without injecting motion into the local membrane', () => {
    const body = block(0.7);
    body.motion.offset.set([0.1, 0.25, -0.08]);
    body.motion.angle = 0.3;
    const before = body.positions.slice();
    body.toWorld();
    expect(body.positions).toEqual(before);
    for (let i = 0; i < body.positions.length; i += 27) {
      const local = body.localPoint(
        body.worldPositions[i],
        body.worldPositions[i + 1],
        body.worldPositions[i + 2]
      );
      for (let axis = 0; axis < 3; axis++)
        expect(local[axis]).toBeCloseTo(before[i + axis], 5);
    }
    body.applyContact();
    for (let i = 0; i < before.length; i++)
      expect(body.positions[i]).toBeCloseTo(before[i], 5);
  });

  it('holds a dent, follows a bounded grab and settles after cancellation', () => {
    const body = block(),
      world = new PressureWorld([body]);
    for (let i = 0; i < 5; i++) world.pump();
    advance(world, 500);
    const before = body.positions.slice();
    expect(body.press(0, 0, 0.5)).toBe(true);
    body.motion.grabbing = true;
    body.motion.grabTarget.set([0.4, 0.3]);
    advance(world, 80);
    expect(body.positions).not.toEqual(before);
    expect(body.motion.offset[0]).toBeGreaterThan(0.1);
    expect(world.settled).toBe(false);
    body.releasePress();
    advance(world, 1600);
    expect(world.settled).toBe(true);
    expect([...body.positions].every(Number.isFinite)).toBe(true);
  });
  it.each([
    { softness: 0.8, fairing: 0.3, tether: 12, drag: 5, lift: 0.5 },
    { softness: 1.5, fairing: 0.2, tether: 6, drag: 2, lift: 1.3 },
  ])(
    'stays bounded and recovers at response-control extremes: %j',
    (settings) => {
      const body = new PressureBody(
        membraneFromMask(new Uint8Array(8 * 18).fill(1), 8, 18, 0.075),
        0,
        readSettings(settings)
      );
      const world = new PressureWorld([body]);
      for (let i = 0; i < 8; i++) world.pump();
      world.helium = true;
      advance(world, 1200);
      expect(
        [...body.positions, ...body.motion.offset].every(Number.isFinite)
      ).toBe(true);
      expect(world.settled).toBe(true);
      body.press(0, 0, 0.5);
      body.motion.grabbing = true;
      body.motion.grabTarget.set([0.55, -0.55]);
      advance(world, 60);
      body.releasePress();
      advance(world, 1800);
      expect(world.settled).toBe(true);
    }
  );
});
