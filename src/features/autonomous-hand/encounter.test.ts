import { describe, it, expect } from 'vitest';
import { HandSimulation, STEP, parseTape } from './simulation';
import { socket } from './rig';
import { length, sub } from '../scene-interactions/math';

function run(s: HandSimulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) s.step();
}
function move(s: HandSimulation, x: number, y: number) {
  expect(
    s.input({
      kind: 'puck',
      phase: 'begin',
      x: s.puck.position.x,
      y: s.puck.position.y,
    })
  ).toBe('accepted');
  expect(s.input({ kind: 'puck', phase: 'end', x, y })).toBe('accepted');
}
describe('possessive encounter', () => {
  it('leaves an abandoned puck where the visitor put it and counts gestures, not pointer samples', () => {
    const s = new HandSimulation();
    s.actor.automatic = false;
    s.input({ kind: 'puck', phase: 'begin', x: 1.7, y: -1.15 });
    for (let i = 0; i < 40; i++)
      s.input({ kind: 'puck', phase: 'move', x: 1 - i * 0.04, y: 0 });
    s.input({ kind: 'puck', phase: 'end', x: -0.5, y: 0 });
    run(s, 4);
    expect(s.puck.position.x).toBe(-0.5);
    expect(s.actor.interruptions).toBe(1);
    expect(s.puck.stamps).toHaveLength(1);
    expect(s.puck.heldBy).toBeNull();
  });
  it.each([
    [0, 0],
    [-3.1, 1.5],
    [3.1, -1.6],
    [1.6, 1.5],
  ])('strikes from [%s, %s] promptly, at the rim, and settles home', (x, y) => {
    const s = new HandSimulation();
    move(s, x, y);
    let contactTime = 0;
    for (let i = 0; i < 240; i++) {
      const wasReturning = s.puck.returning;
      s.step();
      if (!contactTime && !s.puck.returning)
        expect(s.puck.position).toEqual({ x, y, z: 0 });
      if (!wasReturning && s.puck.returning) {
        contactTime = s.actor.time;
        expect(
          length(sub(socket(s.actor.pose).position, s.puck.position))
        ).toBeCloseTo(0.36, 5);
      }
      expect(s.puck.heldBy).toBeNull();
    }
    expect(contactTime).toBeGreaterThan(0.35);
    expect(contactTime).toBeLessThan(0.85);
    expect(s.actor.corrections).toBe(1);
    expect(s.puck.position).toEqual(s.puck.home);
    expect(s.puck.stamps).toHaveLength(2);
  });
  it('responds to interference, returns a displaced puck, and calms after quiet', () => {
    const s = new HandSimulation();
    move(s, -0.6, 0.2);
    move(s, 0.5, 0.5);
    const agitated = s.actor.agitation;
    const actions = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      s.step();
      if (s.actor.command) actions.add(s.actor.command.action);
    }
    expect(actions.has('scold')).toBe(true);
    expect(actions.has('return')).toBe(true);
    expect(s.actor.corrections).toBeGreaterThan(0);
    expect(s.actor.agitation).toBeLessThan(agitated);
    expect(length(sub(s.puck.position, s.puck.home))).toBeLessThan(0.16);
  });
  it('lets a visitor catch a returning puck without a stale trajectory or stamp', () => {
    const s = new HandSimulation();
    s.actor.automatic = false;
    move(s, 0, 0);
    s.input({
      kind: 'command',
      command: { id: 'return', action: 'return', targetId: 'puck' },
    });
    while (s.actor.time < 2 && !s.puck.returning) s.step();
    expect(s.puck.returning).toBe(true);
    move(s, -1, 0.7);
    run(s, 6);
    expect(s.puck.position.x).toBe(-1);
    expect(s.puck.heldBy).toBeNull();
    expect(s.actor.corrections).toBe(0);
    expect(s.puck.stamps).toHaveLength(2);
  });
  it('preempts a warning and waits for release before correcting a new disturbance', () => {
    const s = new HandSimulation();
    move(s, 0, 0);
    move(s, -0.5, 0);
    while (s.actor.command?.action !== 'scold' && s.actor.time < 6) s.step();
    expect(s.actor.command?.action).toBe('scold');
    s.input({
      kind: 'puck',
      phase: 'begin',
      x: s.puck.position.x,
      y: s.puck.position.y,
    });
    s.input({ kind: 'puck', phase: 'move', x: -1, y: 0.5 });
    run(s, 1);
    expect(s.puck.position).toEqual({ x: -1, y: 0.5, z: 0 });
    expect(s.puck.returning).toBe(false);
    const releasedAt = s.actor.time;
    s.input({ kind: 'puck', phase: 'end', x: -1, y: 0.5 });
    while (!s.puck.returning && s.actor.time - releasedAt < 1) s.step();
    expect(s.puck.returning).toBe(true);
    expect(s.actor.time - releasedAt).toBeLessThan(0.85);
  });
  it('replays pointer strokes, memory, contact and print marks at identical ticks', () => {
    const a = new HandSimulation(85);
    move(a, -0.5, 0.2);
    run(a, 2);
    move(a, 1, 0.7);
    run(a, 14);
    const tape = parseTape(a.tape),
      b = new HandSimulation(tape.seed);
    let index = 0;
    while (b.tick <= tape.ticks) {
      while (tape.inputs[index]?.tick === b.tick)
        b.input(tape.inputs[index++].input, false);
      if (b.tick === tape.ticks) break;
      b.step();
    }
    expect(b.actor.pose).toEqual(a.actor.pose);
    expect(b.actor.agitation).toBe(a.actor.agitation);
    expect(b.puck.position).toEqual(a.puck.position);
    expect(b.puck.stamps).toEqual(a.puck.stamps);
  });
  it('rejects malformed pointer records and bounds the printed composition', () => {
    const s = new HandSimulation();
    expect(() =>
      parseTape({
        ...s.tape,
        inputs: [
          {
            tick: 0,
            input: { kind: 'puck', phase: 'move', x: Infinity, y: 0 },
          },
        ],
      })
    ).toThrow();
    expect(() =>
      parseTape({
        ...s.tape,
        inputs: [
          { tick: 0, input: { kind: 'puck', phase: 'begin', x: 0, y: 0 } },
        ],
      })
    ).toThrow('unfinished puck drag');
    for (let i = 0; i < 300; i++) s.puck.stamp();
    expect(s.puck.stamps).toHaveLength(256);
    expect(() => parseTape({ ...s.tape, version: 2 })).toThrow(
      'earlier motion model'
    );
    s.dispose();
    s.dispose();
    expect(s.puck.heldBy).toBeNull();
  });
});
