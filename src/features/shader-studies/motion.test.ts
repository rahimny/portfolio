import { describe, expect, it } from 'vitest';
import { StudyMotion } from './motion';

describe('study playback and composition', () => {
  it('keeps mounts independent and settles controls while time is paused', () => {
    const a = new StudyMotion({ tension: 0.5 });
    const b = new StudyMotion({ tension: 0.5 });
    a.playing = false;
    a.target.tension = 1;
    a.focusTarget.x = 0.8;
    for (let i = 0; i < 150; i++) a.step(1 / 60);
    expect(a.time).toBe(8);
    expect(a.current.tension).toBe(1);
    expect(a.focus.x).toBe(0.8);
    expect(a.needsFrame()).toBe(false);
    expect(b.current.tension).toBe(0.5);
  });

  it('settles equivalently at different frame rates', () => {
    const a = new StudyMotion({ tension: 0 });
    const b = new StudyMotion({ tension: 0 });
    a.target.tension = b.target.tension = 1;
    for (let i = 0; i < 15; i++) a.step(1 / 30);
    for (let i = 0; i < 60; i++) b.step(1 / 120);
    expect(a.current.tension).toBeCloseTo(b.current.tension, 10);
    expect(a.time).toBeCloseTo(b.time, 10);
  });

  it('draws reduced-motion edits immediately and then sleeps', () => {
    const state = new StudyMotion({ tension: 0 });
    state.playing = false;
    state.target.tension = 0.9;
    state.focusTarget.y = -0.5;
    state.step(0, true);
    expect(state.current.tension).toBe(0.9);
    expect(state.focus.y).toBe(-0.5);
    expect(state.needsFrame()).toBe(false);
  });

  it('bounds long frames, ignores invalid deltas and restores the edition', () => {
    const state = new StudyMotion({ tension: 0.4 });
    state.step(10);
    expect(state.time).toBe(8.05);
    state.step(NaN);
    expect(state.time).toBe(8.05);
    state.target.tension = 0.9;
    state.seed = 42;
    state.reset();
    state.playing = false;
    state.step(0, true);
    expect(state.current.tension).toBe(0.4);
    expect(state.seed).toBe(1);
    expect(state.time).toBe(8);
  });
});
