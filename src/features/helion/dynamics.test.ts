import { expect, it } from 'vitest';
import { createShell } from './model';
import {
  createMissile,
  launchMissile,
  stepMissile,
  shellContact,
  nearestTile,
  kickCamera,
  stepCamera,
  SHELL_FREQUENCY,
  FIXED_STEP,
  type CameraResponse,
} from './dynamics';
const cells = createShell(SHELL_FREQUENCY);
it('addresses a closed 492-cell shell', () => {
  expect(cells).toHaveLength(492);
  for (let i = 0; i < cells.length; i++)
    expect(nearestTile(cells[i].centre, cells)).toBe(i);
});
it('catches a fast crossing and ignores a near miss', () => {
  expect(shellContact([0, 0, 6], [0, 0, -6])).toEqual([0, 0, 1]);
  expect(shellContact([4, 0, 6], [4, 0, -6])).toBeNull();
});
it('seeks and makes a finite tile contact with bounded history', () => {
  for (let id = 0; id < 9; id++) {
    const m = createMissile(id, cells);
    launchMissile(m, id, cells, id * 47, 1.5);
    let contact = null;
    for (let i = 0; i < 600 && !contact; i++) {
      contact = stepMissile(m, id, cells, FIXED_STEP, null);
      expect(m.position.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...m.velocity)).toBeLessThan(8);
      expect(m.samples).toBeLessThanOrEqual(100);
    }
    expect(contact).not.toBeNull();
    expect(contact!.direction).toEqual(cells[contact!.tile].centre);
  }
});
it('camera recoil is bounded and settles without drift', () => {
  const c: CameraResponse = {
    offset: [0, 0, 0],
    velocity: [0, 0, 0],
    trauma: 0,
  };
  for (let i = 0; i < 100; i++) {
    kickCamera(c, [0.5, 0.2, 1], 1);
    stepCamera(c, 1 / 60);
    expect(Math.hypot(...c.offset)).toBeLessThan(0.4);
  }
  for (let i = 0; i < 300; i++) stepCamera(c, 1 / 60);
  expect(Math.hypot(...c.offset)).toBeLessThan(0.00001);
  expect(c.trauma).toBe(0);
});
it('one-shot missiles retire instead of respawning', () => {
  const m = createMissile(8, cells);
  launchMissile(m, 8, cells, 120);
  for (let i = 0; i < 1000; i++) stepMissile(m, 8, cells, FIXED_STEP, null);
  expect(m.active).toBe(false);
  expect(m.generation).toBe(1);
});
