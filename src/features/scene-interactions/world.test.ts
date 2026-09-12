import { it, expect } from 'vitest';
import { InteractionWorld, sweep, type LocalImpact } from './world';
import { v, axis } from './math';
it('sweeps through thin boxes and resolves the nearest non-piercing target once', () => {
  expect(
    sweep(v(-100, 0, 0), v(100, 0, 0), {
      kind: 'box',
      min: v(-0.001, -1, -1),
      max: v(0.001, 1, 1),
    })
  ).toBeCloseTo(0.499995);
  const world = new InteractionWorld(),
    impacts: LocalImpact[] = [];
  for (const [id, x] of [
    ['far', 3],
    ['near', 1],
  ] as const)
    world.register({
      id,
      position: v(x, 0, 0),
      anchor: v(),
      visible: true,
      actions: ['shoot'],
      proxies: [{ kind: 'sphere', centre: v(), radius: 0.1 }],
      receiveImpact: (i) => {
        impacts.push(i);
        return 'applied';
      },
    });
  world.launch(
    { id: 'x', targetId: 'far', action: 'shoot' },
    v(),
    v(1000, 0, 0)
  );
  world.step(0.1, 0.1);
  world.step(0.1, 0.2);
  expect(impacts).toHaveLength(1);
  expect(impacts[0].targetId).toBe('near');
  expect(world.projectiles).toHaveLength(0);
});
it('converts points, velocity and radius into declared target-local coordinates', () => {
  const world = new InteractionWorld(),
    impacts: LocalImpact[] = [];
  world.register({
    id: 't',
    position: v(4, 0, 0),
    rotation: axis(v(0, 0, 1), Math.PI / 2),
    scale: 2,
    anchor: v(),
    visible: true,
    actions: ['poke'],
    proxies: [{ kind: 'sphere', centre: v(), radius: 1 }],
    receiveImpact: (i) => {
      impacts.push(i);
      return 'applied';
    },
  });
  const command = { id: 'x', targetId: 't', action: 'poke' as const };
  world.contact(command, v(0, 0, 0), v(5, 0, 0), v(4, 0, 0), 1, 0.4);
  world.contact(command, v(0, 0, 0), v(5, 0, 0), v(4, 0, 0), 1, 0.4);
  expect(impacts).toHaveLength(1);
  expect(impacts[0].point.y).toBeCloseTo(1);
  expect(impacts[0].deltaVelocity.y).toBeCloseTo(-2);
  expect(impacts[0].radius).toBe(0.2);
});
it('reports expiry and removal separately from hits', () => {
  const world = new InteractionWorld();
  const unregister = world.register({
    id: 't',
    position: v(10, 0, 0),
    anchor: v(),
    visible: true,
    actions: ['shoot'],
    proxies: [],
    receiveImpact: () => 'ignored',
  });
  world.launch({ id: 'miss', targetId: 't', action: 'shoot' }, v(), v(1, 0, 0));
  world.step(2, 2);
  expect(world.results[0].kind).toBe('miss');
  world.launch({ id: 'lost', targetId: 't', action: 'shoot' }, v(), v(1, 0, 0));
  unregister();
  world.step(0.1, 2.1);
  expect(world.results[1].kind).toBe('target lost');
  world.dispose();
  world.dispose();
});
