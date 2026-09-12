import { describe, it, expect } from 'vitest';
import { HandSimulation, STEP, MAX_TICKS, parseTape } from './simulation';
import { ACTIONS } from './actor';
import { length, sub, v } from '../scene-interactions/math';
import { socket } from './rig';

function run(s: HandSimulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) s.step();
}
function manual() {
  const s = new HandSimulation();
  s.input({ kind: 'auto', value: false });
  return s;
}
describe('hand performance', () => {
  for (const action of ACTIONS)
    for (const targetId of ['ink', 'puck'])
      it(`${action} resolves actual contact with ${targetId}`, () => {
        const s = manual();
        expect(
          s.input({
            kind: 'command',
            command: { id: 'test', action, targetId },
          })
        ).toBe('accepted');
        run(s, 1);
        expect(s.world.results).toHaveLength(0);
        run(s, action === 'shoot' ? 7 : 3);
        expect(s.world.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actionId: 'test',
              targetId,
              kind: 'hit',
            }),
          ])
        );
        if (action === 'shoot') {
          expect(s.actor.shotsFired).toBe(24);
          expect(s.world.results).toHaveLength(24);
        } else
          expect(
            s.actor.events.filter((e) => e.kind === 'release')
          ).toHaveLength(1);
        expect(s.actor.phase).toBe('rest');
        expect(s.actor.outcome).toBe('hit');
        s.dispose();
      });
  it('replays identically across render frame boundaries', () => {
    const a = new HandSimulation(77),
      b = new HandSimulation(77);
    for (let i = 0; i < 600; i++) a.advance(1 / 60);
    for (let i = 0; i < 300; i++) b.advance(1 / 30);
    expect(a.tick).toBe(b.tick);
    expect(a.actor.events).toEqual(b.actor.events);
    expect(a.ink.points).toEqual(b.ink.points);
    expect(a.world.results).toEqual(b.world.results);
  });
  it('records and replays manual commands, modes and deferred personalities', () => {
    const a = manual();
    a.input({
      kind: 'command',
      command: { id: 'one', action: 'shoot', targetId: 'ink' },
    });
    run(a, 0.5);
    a.input({ kind: 'personality', value: 'erratic' });
    expect(a.actor.personality).toBe('deliberate');
    run(a, 8);
    const tape = parseTape(a.tape),
      b = new HandSimulation(tape.seed);
    let index = 0;
    while (b.tick < tape.ticks) {
      while (tape.inputs[index]?.tick === b.tick)
        b.input(tape.inputs[index++].input, false);
      b.step();
    }
    expect(b.actor.events).toEqual(a.actor.events);
    expect(b.ink.points).toEqual(a.ink.points);
    expect(b.actor.personality).toBe('erratic');
  });
  it('launches from the visible socket, then locks flight direction', () => {
    const s = manual();
    s.input({
      kind: 'command',
      command: { id: 'shot', action: 'shoot', targetId: 'ink' },
    });
    while (!s.world.projectiles.length && s.actor.time < 2) s.step();
    const bullet = s.world.projectiles[0];
    expect(bullet).toBeDefined();
    const origin = sub(bullet.position, {
      x: bullet.velocity.x * STEP,
      y: bullet.velocity.y * STEP,
      z: bullet.velocity.z * STEP,
    });
    expect(length(sub(origin, socket(s.actor.pose).position))).toBeLessThan(
      1e-10
    );
    const direction = { ...bullet.velocity };
    s.ink.position = v(20, 20, 20);
    run(s, 2);
    expect(direction).toEqual(bullet.velocity);
    expect(s.world.results.at(-1)?.kind).toBe('miss');
  });
  it('reports missing and unsupported targets and rejects commands while busy', () => {
    const s = manual();
    expect(
      s.input({
        kind: 'command',
        command: { id: 'x', action: 'poke', targetId: 'missing' },
      })
    ).toBe('unavailable');
    s.world.register({
      id: 'silent',
      actions: [],
      visible: true,
      position: v(),
      anchor: v(),
      proxies: [],
      receiveImpact: () => 'ignored',
    });
    expect(
      s.input({
        kind: 'command',
        command: { id: 'x', action: 'poke', targetId: 'silent' },
      })
    ).toBe('unsupported');
    expect(
      s.input({
        kind: 'command',
        command: { id: 'x', action: 'poke', targetId: 'puck' },
      })
    ).toBe('accepted');
    expect(
      s.input({
        kind: 'command',
        command: { id: 'y', action: 'poke', targetId: 'puck' },
      })
    ).toBe('busy');
    s.world.targets.delete('puck');
    run(s, 3);
    expect(s.world.results[0].kind).toBe('target lost');
    expect(s.actor.phase).toBe('rest');
  });
  it('freezes time when paused, bounds catch-up and cancels on repeated disposal', () => {
    const s = manual();
    s.input({
      kind: 'command',
      command: { id: 'x', action: 'shoot', targetId: 'ink' },
    });
    s.paused = true;
    s.advance(30);
    expect(s.tick).toBe(0);
    s.paused = false;
    s.advance(30);
    expect(s.tick).toBe(12);
    s.dispose();
    s.dispose();
    s.advance(1);
    expect(s.world.targets.size).toBe(0);
    expect(s.world.projectiles).toHaveLength(0);
    expect(s.tick).toBe(12);
  });
  it('disturbs local ink and reforms without moving remote particles', () => {
    const s = manual(),
      ink = s.ink,
      far = ink.points.findIndex((p) => length(sub(p, ink.anchor)) > 0.7),
      before = { ...ink.points[far] };
    ink.receiveImpact({
      eventId: 'x',
      actionId: 'x',
      sourceId: 'test',
      targetId: 'ink',
      point: ink.anchor,
      deltaVelocity: v(3, 1, 1),
      radius: 0.35,
      simulationTime: 0,
    });
    run(s, 0.3);
    expect(ink.points[far]).toEqual(before);
    expect(
      Math.max(...ink.points.map((p, i) => length(sub(p, ink.home[i]))))
    ).toBeGreaterThan(0.1);
    run(s, 8);
    expect(
      Math.max(...ink.points.map((p, i) => length(sub(p, ink.home[i]))))
    ).toBeLessThan(0.002);
  });
  it('cancels an in-flight action and emits no later impact', () => {
    const s = manual();
    s.input({
      kind: 'command',
      command: { id: 'cancel', action: 'shoot', targetId: 'ink' },
    });
    while (!s.world.projectiles.length && s.actor.time < 2) s.step();
    expect(s.world.projectiles).toHaveLength(1);
    s.actor.cancel();
    run(s, 3);
    expect(s.world.projectiles).toHaveLength(0);
    expect(s.world.results).toHaveLength(0);
    expect(s.actor.phase).toBe('rest');
  });
  it('ends bounded recordings without silently accepting unrecorded input', () => {
    const s = manual();
    s.tick = MAX_TICKS - 1;
    s.step();
    expect(s.paused).toBe(true);
    s.paused = false;
    s.step();
    expect(s.tick).toBe(MAX_TICKS);
    s.tape.inputs = Array.from({ length: 12000 }, () => ({
      tick: 0,
      input: { kind: 'auto' as const, value: false },
    }));
    expect(s.input({ kind: 'auto', value: true })).toContain('limit');
    expect(s.actor.automatic).toBe(false);
  });
  it('rejects invalid and unbounded replay data', () => {
    expect(() =>
      parseTape({ version: 5, seed: 1, ticks: 1e12, inputs: [] })
    ).toThrow();
    expect(() =>
      parseTape({
        version: 5,
        seed: 1,
        ticks: 10,
        inputs: [{ tick: -1, input: { kind: 'auto', value: true } }],
      })
    ).toThrow();
  });
});
