import { describe, expect, it } from 'vitest';
import {
  CHAIN_NODES,
  coreClearance,
  DEFAULT_SWIM,
  pulseAt,
  sanitiseSwim,
  SwimmingModel,
} from './swimming';

function advance(model: SwimmingModel, seconds: number, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) model.advance(1 / fps);
}

describe('Nereid swimming mechanics', () => {
  it('contracts faster than it recovers and has an explicit quiet glide', () => {
    expect(pulseAt(0, 0.25).activation).toBe(0);
    expect(pulseAt(0.225, 0.25).activation).toBeCloseTo(1);
    expect(pulseAt(0.65, 0.25).stage).toBe('Recover');
    expect(pulseAt(0.9, 0.25)).toEqual({ activation: 0, stage: 'Glide' });
    expect(pulseAt(1, 0.25)).toEqual(pulseAt(0, 0.25));
  });
  it('replays the same physical state at 30, 60 and 120 rendering Hz', () => {
    const models = [30, 60, 120].map((fps) => {
      const m = new SwimmingModel();
      advance(m, 5, fps);
      return m;
    });
    expect(models[0].steps).toBe(600);
    for (const m of models.slice(1)) {
      expect(m.chains[0].positions).toEqual(models[0].chains[0].positions);
      expect(m.phase).toBe(models[0].phase);
    }
  });
  it.each([0, 1])(
    'bounds flexible chains at stiffness extreme %s, preserving length and anchors',
    (flexibility) => {
      const m = new SwimmingModel({
        flexibility,
        current: 1,
        turbulence: 1,
        stroke: 0.32,
        frequency: 1.2,
      });
      advance(m, 12);
      let maxError = 0;
      for (const chain of m.chains) {
        expect([...chain.positions].every(Number.isFinite)).toBe(true);
        expect(chain.positions[0]).toBeCloseTo(chain.rest[0] * m.rootScale, 10);
        expect(chain.positions[2]).toBeCloseTo(chain.rest[2] * m.rootScale, 10);
        expect(chain.positions[1]).toBeCloseTo(m.rootHeight, 10);
        for (let i = 2; i < CHAIN_NODES; i++)
          expect(
            Math.hypot(chain.positions[i * 3], chain.positions[i * 3 + 2])
          ).toBeGreaterThanOrEqual(
            coreClearance(chain.positions[i * 3 + 1]) - 1e-8
          );
        for (let i = 0; i < CHAIN_NODES - 1; i++) {
          const a = i * 3,
            b = a + 3;
          const length = Math.hypot(
            chain.positions[b] - chain.positions[a],
            chain.positions[b + 1] - chain.positions[a + 1],
            chain.positions[b + 2] - chain.positions[a + 2]
          );
          maxError = Math.max(
            maxError,
            Math.abs(length / chain.lengths[i] - 1)
          );
        }
      }
      expect(maxError).toBeLessThan(0.055);
      expect(m.distance).toBeGreaterThan(0);
    }
  );
  it('makes current and flexibility change the actual tendril geometry', () => {
    const calm = new SwimmingModel({ current: 0, turbulence: 0, stroke: 0 });
    const flow = new SwimmingModel({
      current: 1,
      turbulence: 0,
      stroke: 0,
      flexibility: 1,
    });
    const stiff = new SwimmingModel({
      current: 1,
      turbulence: 0,
      stroke: 0,
      flexibility: 0,
    });
    for (const m of [calm, flow, stiff]) advance(m, 8);
    expect(
      flow.chains[0].positions[96] - calm.chains[0].positions[96]
    ).toBeGreaterThan(0.2);
    expect(flow.chains[0].positions[96]).toBeGreaterThan(
      stiff.chains[0].positions[96]
    );
  });
  it('has passive margin lag and retains forward speed during the glide', () => {
    const m = new SwimmingModel();
    let lag = 0,
      glideSpeed = 0;
    for (let i = 0; i < 600; i++) {
      m.advance(1 / 120);
      lag = Math.max(lag, Math.abs(m.bell - m.margin));
      if (m.stage === 'Glide') glideSpeed = Math.max(glideSpeed, m.speed);
    }
    expect(lag).toBeGreaterThan(0.1);
    expect(glideSpeed).toBeGreaterThan(0.02);
  });
  it('carries a delayed stroke into the free rod and keeps travelling through recovery', () => {
    const m = new SwimmingModel({ current: 0, turbulence: 0 });
    advance(m, 8);
    const nodes = [0, 8, 16, 32];
    const min = nodes.map(() => Infinity),
      max = nodes.map(() => -Infinity);
    const phaseAtMin = nodes.map(() => 0);
    let slowest = Infinity,
      fastest = 0;
    for (let i = 0; i < Math.ceil(120 / DEFAULT_SWIM.frequency); i++) {
      const previousDistance = m.distance;
      m.advance(1 / 120);
      expect(m.distance).toBeGreaterThan(previousDistance);
      slowest = Math.min(slowest, m.speed);
      fastest = Math.max(fastest, m.speed);
      nodes.forEach((node, k) => {
        const p = m.chains[0].positions;
        const radius = Math.hypot(p[node * 3], p[node * 3 + 2]);
        if (radius < min[k]) {
          min[k] = radius;
          phaseAtMin[k] = m.phase;
        }
        max[k] = Math.max(max[k], radius);
      });
    }
    expect(max[2] - min[2]).toBeGreaterThan(0.3);
    expect(max[3] - min[3]).toBeGreaterThan(0.45);
    const lag = (phaseAtMin[1] - phaseAtMin[0] + 1) % 1;
    expect(lag).toBeGreaterThan(0.05);
    expect(lag).toBeLessThan(0.45);
    expect(slowest / fastest).toBeGreaterThan(0.35);
  });
  it('sanitises controls and resets without accumulating hidden time', () => {
    expect(sanitiseSwim({ stroke: NaN, current: 50 }).stroke).toBe(
      DEFAULT_SWIM.stroke
    );
    expect(sanitiseSwim({ current: 50 }).current).toBe(1);
    const m = new SwimmingModel();
    m.advance(999);
    expect(m.steps).toBe(12);
    m.advance(NaN);
    expect(m.steps).toBe(12);
    m.reset();
    expect(m.steps).toBe(0);
    expect(m.chains[0].positions).toEqual(m.chains[0].rest);
  });
});
