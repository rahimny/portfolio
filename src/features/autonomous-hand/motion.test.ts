import { describe, expect, it } from 'vitest';
import { PoseMotion, minimumJerk } from './motion';
import { HandSimulation, STEP, parseTape } from './simulation';
import { EXPRESSIONS } from './commands';
import { pose, socket } from './rig';
import { length, sub, v, type Vec3 } from '../scene-interactions/math';

function tick(s: HandSimulation, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) s.step();
}
describe('expressive motion', () => {
  it('reaches with zero endpoint velocity and acceleration', () => {
    const h = 1e-4;
    expect(minimumJerk(0)).toBe(0);
    expect(minimumJerk(1)).toBe(1);
    expect(minimumJerk(0.5)).toBeCloseTo(0.5);
    expect((minimumJerk(h) - minimumJerk(0)) / h).toBeLessThan(1e-6);
    expect(
      (minimumJerk(2 * h) - 2 * minimumJerk(h) + minimumJerk(0)) / (h * h)
    ).toBeLessThan(0.01);
    expect((minimumJerk(1) - minimumJerk(1 - h)) / h).toBeLessThan(1e-6);
  });
  it('retargets without resetting wrist velocity or teleporting joints', () => {
    const moving = new PoseMotion(pose('open')),
      goal = pose('fist');
    goal.root = v(1, 1, 0);
    for (let i = 0; i < 20; i++) moving.step(goal, STEP, false);
    const before = { ...moving.value.root },
      velocity = { ...moving.rootVelocity };
    const opposite = pose('point');
    opposite.root = v(-3, -2, 0);
    moving.step(opposite, STEP, false);
    expect(length(sub(moving.value.root, before))).toBeLessThan(0.12);
    expect(length(moving.rootVelocity)).toBeGreaterThan(0.1);
    // At an infinitesimal retargeting step, velocity tends to the previous velocity.
    const tiny = new PoseMotion(pose());
    for (let i = 0; i < 20; i++) tiny.step(goal, STEP, false);
    tiny.step(opposite, 1e-7, false);
    expect(length(sub(tiny.rootVelocity, velocity))).toBeLessThan(0.001);
    expect(
      moving.value.joints.every(
        (q) => Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-8
      )
    ).toBe(true);
  });
  for (const action of EXPRESSIONS)
    it(`${action} expresses an opinion without delivering a physical impact`, () => {
      const s = new HandSimulation(22);
      s.actor.automatic = false;
      expect(
        s.input({
          kind: 'command',
          command: { id: 'expression', action, targetId: 'ink' },
        })
      ).toBe('accepted');
      const tips: Vec3[] = [];
      for (let i = 0; i < 720; i++) {
        s.step();
        tips.push(socket(s.actor.pose).position);
      }
      expect(s.actor.phase).toBe('rest');
      expect(s.world.results).toHaveLength(0);
      expect(s.world.projectiles).toHaveLength(0);
      expect(s.actor.events.filter((e) => e.kind === 'complete')).toHaveLength(
        1
      );
      const jumps = tips.slice(1).map((p, i) => length(sub(p, tips[i])));
      expect(Math.max(...jumps)).toBeLessThan(0.13);
    });
  it('forms a closed fist before lifting the warning finger', () => {
    const s = new HandSimulation(15926);
    s.actor.automatic = false;
    s.input({
      kind: 'command',
      command: { id: 'warning', action: 'scold', targetId: 'ink' },
    });
    let closed = 0,
      pointed = 2;
    for (let i = 0; i < 400; i++) {
      s.step();
      const angle =
        2 * Math.acos(Math.min(1, Math.abs(s.actor.pose.joints[1].w)));
      if (s.actor.phase === 'anticipate') closed = Math.max(closed, angle);
      if (
        s.actor.phase === 'act' &&
        s.actor.elapsed > 0.15 &&
        s.actor.elapsed < 0.3
      )
        pointed = Math.min(pointed, angle);
    }
    expect(closed).toBeGreaterThan(1);
    expect(pointed).toBeLessThan(0.3);
  });
  it('follows a successful shot with an opinion about the same subject', () => {
    const s = new HandSimulation(15926);
    const commands = [];
    let previous = '';
    for (let i = 0; i < 1500; i++) {
      s.step();
      const c = s.actor.command;
      if (c && c.id !== previous) {
        commands.push({ ...c });
        previous = c.id;
      }
    }
    expect(commands.slice(0, 2)).toMatchObject([
      { action: 'shoot', targetId: 'ink' },
      { action: 'approve', targetId: 'ink' },
    ]);
  });
  it('keeps expressive replay deterministic and varies timing between seeds', () => {
    const a = new HandSimulation(5),
      b = new HandSimulation(5),
      c = new HandSimulation(67);
    for (const s of [a, b, c]) {
      s.input({ kind: 'auto', value: false });
      s.input({
        kind: 'command',
        command: { id: 'wag', action: 'scold', targetId: 'puck' },
      });
    }
    for (let i = 0; i < 360; i++) a.advance(1 / 60);
    for (let i = 0; i < 180; i++) b.advance(1 / 30);
    tick(c, 6);
    expect(a.actor.events).toEqual(b.actor.events);
    expect(a.actor.pose).toEqual(b.actor.pose);
    expect(a.actor.events).not.toEqual(c.actor.events);
    expect(parseTape(a.tape).version).toBe(5);
    expect(() => parseTape({ ...a.tape, version: 1 })).toThrow(
      'earlier motion model'
    );
  });
  it('keeps particle storage stable across simulation steps', () => {
    const s = new HandSimulation(),
      point = s.ink.points[0],
      velocity = s.ink.velocity[0];
    tick(s, 2);
    expect(s.ink.points[0]).toBe(point);
    expect(s.ink.velocity[0]).toBe(velocity);
  });
});
