import { describe, expect, it } from 'vitest';
import { HomeWatcher, type WatcherTarget } from './HomeWatcher';
import { actorViewport } from './actorViewport';

function setup(width = 1000) {
  const watcher = new HomeWatcher();
  watcher.enabled = watcher.visible = true;
  watcher.resize(width, 400, 120);
  return watcher;
}
function advance(
  watcher: HomeWatcher,
  target: WatcherTarget,
  seconds: number,
  walking = true,
  hz = 60
) {
  for (let i = 0; i < seconds * hz; i++)
    watcher.advance(1 / hz, target, walking);
}

describe('homepage watcher', () => {
  it('scurries in from outside the page and absorbs a reversal through its suspension', () => {
    const watcher = setup();
    watcher.enter();
    expect(watcher.x).toBeLessThan(0);
    const target = { x: 800, y: 100, visible: true };
    advance(watcher, target, 0.3, false);
    expect(watcher.velocity).toBeGreaterThan(watcher.scale * 2);
    expect(watcher.roll).toBeLessThan(-0.08);
    advance(watcher, target, 7, false);
    expect(watcher.entering).toBe(false);
    expect(watcher.x).toBeCloseTo(300, 0);
    expect(watcher.steps).toBeGreaterThan(8);
    advance(watcher, target, 0.4);
    const velocity = watcher.velocity;
    target.x = 100;
    watcher.advance(1 / 60, target, true);
    expect(watcher.velocity).toBeGreaterThan(0);
    expect(watcher.velocity).toBeLessThan(velocity);
    advance(watcher, target, 0.8);
    expect(watcher.velocity).toBeLessThan(0);
    expect(watcher.roll).toBeGreaterThan(0);
  });

  it('keeps links reachable through repeated scurrying, braking and close passes', () => {
    const watcher = setup(350);
    watcher.enter();
    const target = { x: 350, y: 390, visible: true };
    for (let frame = 0; frame < 2400; frame++) {
      target.x = Math.floor(frame / 120) % 2 ? 0 : 350;
      watcher.advance(1 / 60, target, true);
      for (let i = 0; i < 8; i++) {
        const j = i * 12,
          p = watcher.joints;
        expect(
          Math.hypot(p[j + 3] - p[j], p[j + 4] - p[j + 1], p[j + 5] - p[j + 2])
        ).toBeCloseTo(1.5, 5);
        expect(
          Math.hypot(
            p[j + 6] - p[j + 3],
            p[j + 7] - p[j + 4],
            p[j + 8] - p[j + 5]
          )
        ).toBeCloseTo(1.85, 5);
      }
    }
  });

  it('looks before walking and stays planted during the opening performance', () => {
    const watcher = setup();
    const x = watcher.x;
    const target = { x: 800, y: 100, visible: true };
    advance(watcher, target, 2, false);
    expect(watcher.x).toBe(x);
    expect(watcher.steps).toBe(0);
    expect(watcher.headYaw).toBeGreaterThan(0.3);
    advance(watcher, target, 0.2);
    expect(watcher.x).toBeGreaterThan(x);
    expect(watcher.x).toBeLessThan(x + 20);
  });

  it('keeps four feet fixed in world space through a swing, with rigid long links', () => {
    const watcher = setup();
    const originalX = watcher.x;
    const originalFeet = watcher.feet.slice();
    advance(watcher, { x: 700, y: 100, visible: true }, 0.2);
    let supporters = 0;
    for (let i = 0; i < 8; i++) {
      if (watcher.feet[i * 3 + 1] === 0) {
        supporters++;
        expect(watcher.x + watcher.feet[i * 3] * watcher.scale).toBeCloseTo(
          originalX + originalFeet[i * 3] * watcher.scale,
          6
        );
      }
      const j = i * 12;
      const p = watcher.joints;
      expect(
        Math.hypot(p[j + 3] - p[j], p[j + 4] - p[j + 1], p[j + 5] - p[j + 2])
      ).toBeCloseTo(1.5, 6);
      expect(
        Math.hypot(
          p[j + 6] - p[j + 3],
          p[j + 7] - p[j + 4],
          p[j + 8] - p[j + 5]
        )
      ).toBeCloseTo(1.85, 6);
    }
    expect(supporters).toBe(4);
  });

  it('settles completely, including uploads, despite a small drone hover', () => {
    const watcher = setup();
    const target = { x: 650, y: 110, visible: true };
    advance(watcher, target, 25);
    const revision = watcher.revision;
    const steps = watcher.steps;
    for (let i = 0; i < 600; i++) {
      target.y = 110 + Math.sin(i / 10) * 2;
      watcher.advance(1 / 60, target, true);
    }
    expect(watcher.moving).toBe(false);
    expect(watcher.revision).toBe(revision);
    expect(watcher.steps).toBe(steps);
  });

  it('settles after a close, low target at either edge of the phone strip', () => {
    for (const x of [48, 180, 300]) {
      const watcher = setup(350);
      const target = { x, y: 340, visible: true };
      advance(watcher, target, 20);
      const revision = watcher.revision;
      advance(watcher, target, 3);
      expect(watcher.revision).toBe(revision);
    }
  });

  it('uses the same gait at 30 and 120 Hz and stays inside the phone strip', () => {
    const low = setup(280),
      high = setup(280);
    const target = { x: 10000, y: -10000, visible: true };
    advance(low, target, 8, true, 30);
    advance(high, target, 8, true, 120);
    expect(low.x).toBeCloseTo(high.x, 6);
    expect(low.steps).toBe(high.steps);
    expect(low.x - low.scale * 3.1).toBeGreaterThanOrEqual(0);
    expect(low.x + low.scale * 3.1).toBeLessThanOrEqual(180);
    expect([...low.joints].every(Number.isFinite)).toBe(true);
  });

  it('finishes a lifted foot on cancellation and freezes when disabled', () => {
    const watcher = setup();
    const target = { x: 800, y: 110, visible: true };
    advance(watcher, target, 0.2);
    target.visible = false;
    advance(watcher, target, 2);
    expect(watcher.moving).toBe(false);
    for (let i = 0; i < 8; i++)
      expect(watcher.feet[i * 3 + 1]).toBeLessThan(1e-10);
    watcher.enabled = false;
    const revision = watcher.revision;
    advance(watcher, target, 5);
    expect(watcher.revision).toBe(revision);
    watcher.resize(350, 500, 120);
    expect(watcher.steps).toBe(0);
    expect(watcher.floor).toBe(500);
  });
});

describe('masthead backing buffer', () => {
  it('does not grow with the Nereid scroll stage or high-DPR screens', () => {
    for (const width of [320, 390, 1440, 3840]) {
      for (const modest of [true, false]) {
        const view = actorViewport(width, 16000, 100, 5000, 900, 4, modest);
        expect(view.height).toBe(1100);
        expect(width * view.height * view.ratio ** 2).toBeLessThanOrEqual(
          (modest ? 900000 : 1500000) + 0.001
        );
        expect(view.top).toBe(4800);
        expect(Math.max(width, view.height) * view.ratio).toBeLessThanOrEqual(
          4096
        );
      }
    }
  });
});
