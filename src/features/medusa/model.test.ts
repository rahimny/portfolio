import { DEFAULT_SETTINGS } from './settings';
import { describe, expect, it } from 'vitest';
import {
  CHAINS,
  GROWTH_END,
  NODES,
  MedusaMotion,
  bellPoint,
  createAnatomy,
  createPaintSamples,
  pulse,
} from './model';

describe('painted jellyfish', () => {
  it('grows from crown to trailing tips and completes every mark', () => {
    const samples = createPaintSamples(createAnatomy(1289));
    let crown = Infinity,
      tip = 0;
    for (let i = 0; i < samples.count; i++) {
      const kind = samples.binding[i * 4],
        along = samples.binding[i * 4 + 1];
      const birth = samples.growth[i * 2],
        duration = samples.growth[i * 2 + 1];
      expect(birth).toBeGreaterThanOrEqual(0);
      expect(duration).toBeGreaterThan(0);
      expect(birth + duration).toBeLessThanOrEqual(GROWTH_END);
      if (kind === 0 && along < 0.2) crown = Math.min(crown, birth);
      if (kind === 2 && along > 0.95) tip = Math.max(tip, birth);
    }
    expect(crown).toBeLessThan(0.25);
    expect(tip).toBeGreaterThan(4);
  });

  it('keeps brush dimensions independent of bell scalloping', () => {
    const flat = createPaintSamples(
      createAnatomy(1289, { ...DEFAULT_SETTINGS, scallop: 0 })
    );
    const frilled = createPaintSamples(
      createAnatomy(1289, { ...DEFAULT_SETTINGS, scallop: 0.16 })
    );
    expect(flat.shape).toEqual(frilled.shape);
  });
  it('lays distinct round stipples without inheriting oil-track clustering', () => {
    const oil = createPaintSamples(createAnatomy(1289));
    const dots = createPaintSamples(
      createAnatomy(1289, { ...DEFAULT_SETTINGS, brushStyle: 2 })
    );
    expect(dots.count).toBeLessThan(oil.count);
    for (let i = 0; i < dots.count; i++) {
      expect(dots.shape[i * 4]).toBe(dots.shape[i * 4 + 1]);
      expect(dots.shape[i * 4]).toBeGreaterThan(0);
    }
    // First oil track shares an azimuth; stipples occupy independent surface sites.
    expect(dots.binding[2]).not.toBe(dots.binding[6]);
  });

  it('reproduces anatomical attachment coordinates from a seed', () => {
    const first = createPaintSamples(createAnatomy(1289));
    const second = createPaintSamples(createAnatomy(1289));
    expect(first.binding).toEqual(second.binding);
    expect(first.shape).toEqual(second.shape);
    expect(first.count).toBeLessThan(40_000);
    expect(createPaintSamples(createAnatomy(923)).binding).not.toEqual(
      first.binding
    );
    expect([...first.binding, ...first.shape].every(Number.isFinite)).toBe(
      true
    );
  });

  it('keeps physics independent of render frame rate and ignores invalid time', () => {
    const fast = new MedusaMotion(createAnatomy(1289));
    const slow = new MedusaMotion(createAnatomy(1289));
    for (let i = 0; i < 240; i++) fast.advance(1 / 120);
    for (let i = 0; i < 60; i++) slow.advance(1 / 30);
    expect(slow.positions).toEqual(fast.positions);
    const before = slow.positions.slice();
    slow.advance(Number.NaN);
    slow.advance(-1);
    slow.advance(0);
    expect(slow.positions).toEqual(before);
  });

  it('keeps the roots on the contracting bell and chain lengths bounded under a strong current', () => {
    const model = new MedusaMotion(createAnatomy(19));
    model.current = 0.8;
    model.impulse = 1.2;
    for (let i = 0; i < 180; i++) model.advance(1 / 30);
    const root = new Float32Array(3);
    let maxStretch = 0;
    for (let chain = 0; chain < CHAINS; chain++) {
      bellPoint(
        root,
        0,
        chain < 4 ? 0.4 : 1.53,
        model.anatomy.angles[chain],
        model.anatomy,
        model.time
      );
      const start = chain * NODES * 4;
      expect([...model.positions.slice(start, start + 3)]).toEqual([...root]);
      for (let j = 2; j < NODES; j++) {
        const k = start + j * 4;
        const length = Math.hypot(
          model.positions[k] - model.positions[k - 4],
          model.positions[k + 1] - model.positions[k - 3],
          model.positions[k + 2] - model.positions[k - 2]
        );
        maxStretch = Math.max(
          maxStretch,
          length / (model.anatomy.lengths[chain] / (NODES - 1))
        );
      }
    }
    expect(maxStretch).toBeLessThan(1.12);
    expect([...model.positions].every(Number.isFinite)).toBe(true);
    expect(Math.max(...model.positions.map(Math.abs))).toBeLessThan(10);
  });

  it('carries an impulse into free tentacles while retaining attachment, then dissipates it', () => {
    const quiet = new MedusaMotion(createAnatomy(22));
    const disturbed = new MedusaMotion(createAnatomy(22));
    disturbed.impulse = 1.2;
    for (let i = 0; i < 60; i++) {
      quiet.advance(1 / 30);
      disturbed.advance(1 / 30);
    }
    const tip = (NODES - 1) * 4;
    expect(disturbed.positions[tip] - quiet.positions[tip]).toBeGreaterThan(
      0.1
    );
    expect(disturbed.positions[0]).toBe(quiet.positions[0]);
    expect(disturbed.impulse).toBeLessThan(0.12);
    expect(pulse(0)).toBe(0);
    expect(pulse(0.22 / 0.28)).toBeCloseTo(1);
    expect(pulse(0.9 / 0.28)).toBe(0);
  });
});
