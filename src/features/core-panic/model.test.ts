import { describe, expect, it } from 'vitest';
import {
  advanceGame,
  beginGather,
  cancelGather,
  createGame,
  fire,
  gatherPosition,
  isOpen,
  MAX_CHARGE,
  nearestKnot,
  opening,
  releaseGather,
  salvoSize,
  selectKnot,
  startGame,
} from './model';
function run(game: ReturnType<typeof createGame>, seconds: number, fps = 120) {
  for (let i = 0; i < Math.round(seconds * fps); i++)
    advanceGame(game, 1 / fps);
}
function playing() {
  const game = createGame();
  startGame(game);
  return game;
}
function expose(game: ReturnType<typeof createGame>, slot = 0) {
  game.knots[slot].exposedUntil = game.time + 2.4;
}

describe('Core Panic gathered salvos', () => {
  it('gathers two to six missiles without firing and launches from their orbit on release', () => {
    const game = playing();
    beginGather(game);
    run(game, 0.8);
    expect(game.shots).toBe(0);
    expect(salvoSize(game)).toBe(4);
    const orbit = gatherPosition(game, 0);
    expect(releaseGather(game)).toBe(true);
    expect(game.missiles.filter((m) => m.active)).toHaveLength(4);
    expect(game.missiles[0].position).toEqual(orbit);
    expect(game.gathering).toBe(false);
    expect(game.score).toBe(0);
    run(game, 1.7);
    expect(game.hits).toBe(2);
    expect(game.score).toBeGreaterThan(200);
  });
  it('caps charge and cancels it without leaving missiles or queued releases', () => {
    const game = playing();
    beginGather(game);
    run(game, 2);
    expect(game.charge).toBe(MAX_CHARGE);
    expect(salvoSize(game)).toBe(6);
    cancelGather(game);
    expect(releaseGather(game)).toBe(false);
    expect(game.shots).toBe(0);
    expect(game.missiles.every((m) => !m.active)).toBe(true);
  });
  it('judges the aperture at release even if it opens before contact', () => {
    const game = playing();
    expect(isOpen(game, game.knots[0])).toBe(false);
    fire(game, 0, 4);
    run(game, 1.5);
    expect(game.blocked).toBe(1);
    expect(game.hits).toBe(0);
    expect(game.knots[0].state).toBe('active');
    expect(game.pressure).toBeGreaterThan(19);
  });
  it('honours an open release after the aperture closes during flight', () => {
    const game = playing();
    game.knots[0].exposedUntil = 0.01;
    expect(fire(game, 0, 4)).toBe(true);
    run(game, 1.6);
    expect(game.hits).toBe(2);
    expect(game.blocked).toBe(0);
    expect(game.events.filter((e) => e.type === 'chain')).toHaveLength(1);
  });
  it('cracks a swollen knot with a small salvo and lets the follow-up finish it', () => {
    const game = playing();
    game.knots[0].born = -4.6;
    game.knots[0].lifetime = 9;
    expose(game);
    run(game, 1.3);
    expose(game);
    fire(game, 0, 2);
    run(game, 1.5);
    expect(game.knots[0].wounded).toBe(true);
    expect(game.hits).toBe(0);
    expect(isOpen(game, game.knots[0])).toBe(true);
    fire(game, 0, 2);
    run(game, 1.5);
    expect(game.hits).toBe(1);
    expect(game.followups).toBe(1);
  });
  it('pulls nearby knots and holds them open for a bounded follow-up opportunity', () => {
    const game = playing();
    expose(game, 3);
    fire(game, 3, 4);
    run(game, 1.25);
    const nearby = game.knots[2];
    expect(nearby.exposedUntil).toBeGreaterThan(game.time);
    expect(opening(game, nearby)).toBe(1);
    expect(Math.hypot(...nearby.pull)).toBeGreaterThan(0);
    fire(game, 2, 4);
    run(game, 1.25);
    expect(game.followups).toBeGreaterThan(0);
  });
  it('keeps knots vulnerable to rupture while a salvo is travelling', () => {
    const game = playing(),
      knot = game.knots[3];
    knot.born = -knot.lifetime + 0.02;
    expose(game, 3);
    fire(game, 3, 6);
    run(game, 1.6);
    expect(game.ruptures).toBe(1);
    expect(game.hits).toBe(0);
  });
  it('does not let late followers damage a reused target slot', () => {
    const game = playing();
    expose(game, 3);
    fire(game, 3, 6);
    game.knots[3].generation++;
    game.knots[3].state = 'active';
    run(game, 1.8);
    expect(game.hits).toBe(0);
    expect(game.blocked).toBe(0);
  });
  it('rejects duplicate launches, invalid salvo sizes and unavailable target selection', () => {
    const game = playing();
    const knot = game.knots[0];
    expect(nearestKnot(game, knot.position[0] + 0.2, knot.position[1])).toBe(0);
    expect(nearestKnot(game, NaN, 0)).toBe(-1);
    expect(fire(game, 0, 100)).toBe(false);
    fire(game, 0, 2);
    expect(fire(game, 0, 4)).toBe(false);
    expect(fire(game, 3, 4)).toBe(false);
    selectKnot(game, 1);
    expect(game.selected).toBe(2);
  });
  it('has the same timing, pursuit and outcomes at 30 and 120 fps', () => {
    const a = playing(),
      b = playing();
    for (const game of [a, b]) beginGather(game);
    run(a, 0.8, 30);
    run(b, 0.8, 120);
    releaseGather(a);
    releaseGather(b);
    run(a, 2, 30);
    run(b, 2, 120);
    expect({ ...a, accumulator: 0 }).toEqual({ ...b, accumulator: 0 });
    expect(a.hits).toBe(2);
  });
  it('freezes pause, rejects invalid deltas and resets all charge and flight state', () => {
    const game = playing();
    beginGather(game);
    run(game, 0.4);
    cancelGather(game);
    game.phase = 'paused';
    const before = structuredClone(game);
    run(game, 3);
    advanceGame(game, NaN);
    expect(game).toEqual(before);
    expect(beginGather(game)).toBe(false);
    startGame(game);
    expect(game.charge).toBe(0);
    expect(game.gathering).toBe(false);
    expect(game.events).toHaveLength(0);
  });
  it('ends an unattended run once and cancels a held charge', () => {
    const game = playing();
    beginGather(game);
    run(game, 45);
    expect(game.phase).toBe('over');
    expect(game.pressure).toBe(100);
    expect(game.gathering).toBe(false);
    expect(game.events.filter((e) => e.type === 'breach')).toHaveLength(1);
    expect(releaseGather(game)).toBe(false);
  });
});
