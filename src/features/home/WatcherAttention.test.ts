import { expect, it } from 'vitest';
import { WatcherAttention } from './WatcherAttention';

it('notices a second writer, double-takes and returns to calm single-target attention', () => {
  const attention = new WatcherAttention();
  const first = { x: 100, y: 100, visible: true };
  const second = { x: 500, y: 180, visible: false };
  attention.advance(0.016, first, second);
  expect(attention.focus).toBe(0);
  second.visible = true;
  attention.advance(0.016, first, second);
  expect(attention.focus).toBe(1);
  expect(attention.startled).toBe(1);
  for (let i = 0; i < 30; i++) attention.advance(1 / 60, first, second);
  expect(attention.focus).toBe(0);
  expect(attention.confused).toBeGreaterThan(0.35);
  expect(attention.startled).toBe(0);
  for (let i = 0; i < 90; i++) attention.advance(1 / 60, first, second);
  expect(attention.switches).toBeGreaterThanOrEqual(3);
  second.visible = false;
  for (let i = 0; i < 120; i++) attention.advance(1 / 60, first, second);
  expect(attention.focus).toBe(0);
  expect(attention.confused).toBe(0);
  expect(attention.snap).toBe(0);
  attention.reset();
  expect(attention.switches).toBe(0);
});

it('reacts to a clear crossing once, without flinching at tiny positional jitter', () => {
  const attention = new WatcherAttention();
  const first = { x: 100, y: 100, visible: true };
  const second = { x: 500, y: 100, visible: true };
  for (let i = 0; i < 120; i++) attention.advance(1 / 60, first, second);
  first.x = 600;
  attention.advance(1 / 60, first, second);
  expect(attention.startled).toBe(0.65);
  for (let i = 0; i < 60; i++) {
    first.x = 500 + Math.sin(i) * 5;
    attention.advance(1 / 60, first, second);
  }
  expect(attention.startled).toBe(0);
});
