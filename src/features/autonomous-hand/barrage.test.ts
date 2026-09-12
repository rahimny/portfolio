import { describe, expect, it } from 'vitest';
import { HandSimulation, STEP } from './simulation';
import type { LocalImpact } from '../scene-interactions/world';

describe('finger-gun barrage', () => {
  it.each(['deliberate', 'erratic'] as const)(
    'fires an accelerating, bounded %s volley with unique impacts',
    (personality) => {
      const s = new HandSimulation(15926);
      s.actor.automatic = false;
      s.actor.setPersonality(personality);
      const impacts: LocalImpact[] = [];
      const receive = s.ink.receiveImpact.bind(s.ink);
      s.ink.receiveImpact = (impact) => {
        impacts.push(impact);
        return receive(impact);
      };
      s.input({
        kind: 'command',
        command: { id: 'barrage', action: 'shoot', targetId: 'ink' },
      });
      const times: number[] = [];
      for (let i = 0; i < 1080; i++) {
        const before = s.actor.shotsFired;
        s.step();
        if (s.actor.shotsFired > before) times.push(s.actor.time);
        expect(s.world.projectiles.length).toBeLessThanOrEqual(24);
      }
      expect(times).toHaveLength(personality === 'erratic' ? 30 : 24);
      expect(times[20] - times[19]).toBeLessThan(times[2] - times[1]);
      expect(impacts.length).toBeGreaterThan(8);
      expect(new Set(impacts.map((i) => i.eventId)).size).toBe(impacts.length);
      expect(s.world.projectiles).toHaveLength(0);
      expect(s.actor.phase).toBe('rest');
    }
  );
  it('cuts off a barrage and all its airborne rounds when the visitor interferes', () => {
    const s = new HandSimulation();
    while (s.actor.shotsFired < 12 && s.actor.time < 8) s.step();
    expect(s.actor.shotsFired).toBe(12);
    s.input({ kind: 'puck', phase: 'begin', x: 1.7, y: -1.15 });
    s.input({ kind: 'puck', phase: 'move', x: 0, y: 0 });
    expect(s.world.projectiles).toHaveLength(0);
    const results = s.world.results.length;
    for (let i = 0; i < 120; i++) s.step();
    expect(s.world.results).toHaveLength(results);
    const releasedAt = s.actor.time;
    s.input({ kind: 'puck', phase: 'end', x: 0, y: 0 });
    while (!s.puck.returning && s.actor.time - releasedAt < 1) s.step();
    expect(s.puck.returning).toBe(true);
    expect(s.actor.time - releasedAt).toBeLessThan(0.85);
  });
  it('returns to another performance when left alone', () => {
    const s = new HandSimulation();
    const barrages = new Set<string>();
    for (let i = 0; i < 25 / STEP; i++) {
      s.step();
      if (s.actor.command?.action === 'shoot') barrages.add(s.actor.command.id);
    }
    expect(barrages.size).toBeGreaterThanOrEqual(2);
  });
});
