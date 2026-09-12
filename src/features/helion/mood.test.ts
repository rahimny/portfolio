import { expect, it } from 'vitest';
import { fieldMood } from './mood';
import { createMissile, stepSwarm, SHELL_FREQUENCY } from './dynamics';
import { createShell } from './model';
it('phrases calm, gathering, attack and recovery, with a gesture override', () => {
  expect([0, 9, 18, 25].map((t) => fieldMood(t, 0).name)).toEqual([
    'Breathing',
    'Gathering',
    'Frenzy',
    'Settling',
  ]);
  expect(fieldMood(2, 0.5).name).toBe('Gathering');
  expect(fieldMood(2, 0, 7).name).toBe('Frenzy');
  expect(fieldMood(29, 0).name).toBe('Breathing');
});
it('keeps a coordinated swarm finite and outside the shell through phase changes', () => {
  const cells = createShell(SHELL_FREQUENCY);
  const missiles = Array.from({ length: 4 }, (_, id) =>
    createMissile(id, cells)
  );
  let nearest = Infinity,
    fastest = 0,
    finite = true;
  for (let frame = 0; frame < 1800; frame++)
    missiles.forEach((m, id) => {
      stepSwarm(
        m,
        id,
        cells,
        1 / 120,
        frame / 120,
        frame < 900 ? 3.9 : 3.25,
        frame < 900 ? 0.32 : 1.4,
        null
      );
      nearest = Math.min(nearest, Math.hypot(...m.position));
      fastest = Math.max(fastest, Math.hypot(...m.velocity));
      finite &&= m.position.every(Number.isFinite);
    });
  expect(nearest).toBeGreaterThanOrEqual(2.649);
  expect(fastest).toBeLessThanOrEqual(8.001);
  expect(finite).toBe(true);
});
