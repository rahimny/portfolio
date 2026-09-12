import { describe, expect, it } from 'vitest';
import { IsofieldState } from './IsofieldState';

describe('homepage field state', () => {
  it('carries a bounded impact into the field, then lets the pulse decay', () => {
    const state = new IsofieldState();
    state.excite({ x: 1.5, y: -1, strength: 1, serial: 1 });
    expect(state.targetX).toBe(1);
    expect(state.targetY).toBe(1);
    for (let i = 0; i < 900; i++) state.step(1 / 60, true);
    expect(state.impulse).toBe(0);
    expect(state.arrival).toBe(1);
    expect(state.focusX).toBeCloseTo(1);
  });
  it('supports a discrete response with a frozen clock', () => {
    const state = new IsofieldState();
    state.excite();
    state.step(0, false, true);
    expect(state.time).toBe(8);
    expect(state.impulseAge).toBe(0.55);
    expect(state.arrival).toBe(1);
  });
  it('pauses at the current growth and wave phase without snapping to another moment', () => {
    const state = new IsofieldState();
    state.excite();
    for (let i = 0; i < 15; i++) state.step(1 / 60, true);
    const held = [state.time, state.arrival, state.impulseAge];
    state.step(0, false);
    expect([state.time, state.arrival, state.impulseAge]).toEqual(held);
  });
});
