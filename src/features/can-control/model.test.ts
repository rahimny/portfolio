import { describe, expect, it } from 'vitest';
import {
  buildScore,
  DEFAULT_SETTINGS,
  footprint,
  PaintField,
  presetPath,
  Programme,
  resample,
  STEP,
  sweep,
  validatePath,
  WALL,
  type Stamp,
} from './model';

const origin = { x: 1.6, y: 1.2, distance: 0.12 };

describe('can-control paths and timing', () => {
  it('preserves corner vertices, lifts and degenerate stationary holds', () => {
    const corner = { x: 1.6, y: 0.8 };
    const stroke = [{ x: 0.7, y: 0.8 }, corner, { x: 1.6, y: 1.6 }];
    expect(resample(stroke)).toContainEqual(corner);
    const score = buildScore(
      [
        stroke,
        [
          { x: 2.4, y: 0.5 },
          { x: 2.4, y: 0.5 },
        ],
      ],
      DEFAULT_SETTINGS
    );
    expect(score.motions.filter((m) => m.valve === 0)).toHaveLength(3);
    expect(
      score.motions.some(
        (m) =>
          m.valve === 1 &&
          m.from.x === m.to.x &&
          m.from.y === m.to.y &&
          m.duration === 0.9
      )
    ).toBe(true);
    expect(
      score.motions.every((m) => m.duration > 0 && Number.isFinite(m.duration))
    ).toBe(true);
  });

  it('produces the same trajectory and paint events at 30, 60 and 120 Hz', () => {
    const score = buildScore(
      presetPath('specimen'),
      DEFAULT_SETTINGS,
      'follow',
      true
    );
    const run = (hz: number) => {
      const programme = new Programme(score, 'fine');
      const stamps: Stamp[] = [];
      for (let i = 0; i < hz * 3; i++)
        programme.advance(1 / hz, (stamp) => stamps.push(stamp));
      return { pose: programme.pose, time: programme.time, stamps };
    };
    const baseline = run(120);
    expect(run(30)).toEqual(baseline);
    expect(run(60)).toEqual(baseline);
  });

  it('emits nothing during valve-off repositioning and parks with the valve closed', () => {
    const score = buildScore(presetPath('line'), DEFAULT_SETTINGS);
    const programme = new Programme(score, 'fine');
    let mass = 0;
    for (let i = 0; i < 60; i++)
      programme.advance(STEP, (s) => {
        mass += s.mass;
      });
    expect(mass).toBe(0);
    programme.finish((s) => {
      mass += s.mass;
    });
    const paintingTime = score.motions
      .filter((m) => m.valve)
      .reduce((sum, m) => sum + m.duration, 0);
    expect(mass).toBeCloseTo(paintingTime * 0.0022, 10);
    expect(programme.valve).toBe(0);
    expect(programme.complete).toBe(true);
  });

  it('moves a flare along the wall as it pulls away', () => {
    const score = buildScore(presetPath('flare'), DEFAULT_SETTINGS, 'flare');
    const paint = score.motions.filter((m) => m.valve);
    expect(paint[paint.length - 1].to.distance).toBeCloseTo(0.78);
    expect(paint[paint.length - 1].to.x - paint[0].from.x).toBeGreaterThan(1.5);
  });

  it('rejects empty, non-finite, excessive and off-wall paths', () => {
    expect(() => validatePath([])).toThrow();
    expect(() => validatePath([[]])).toThrow();
    expect(() => validatePath([[{ x: NaN, y: 1 }]])).toThrow();
    expect(() => validatePath([[{ x: 4, y: 1 }]])).toThrow();
    expect(() =>
      validatePath([Array.from({ length: 4097 }, () => ({ x: 1, y: 1 }))])
    ).toThrow();
    expect(() =>
      buildScore(presetPath('line'), { ...DEFAULT_SETTINGS, speed: 0 })
    ).toThrow();
  });
});

describe('paint conservation and continuity', () => {
  it('spreads frontal mass over a larger area at increased distance', () => {
    const close = new PaintField(512, 384),
      far = new PaintField(512, 384);
    close.deposit({ ...origin, radius: footprint(0.08), mass: 0.002 });
    far.deposit({ ...origin, radius: footprint(0.7), mass: 0.002 });
    expect(close.mass).toBeCloseTo(0.002, 9);
    expect(far.mass).toBeCloseTo(close.mass, 9);
    expect(
      Math.max(...far.density.subarray(190 * 512, 194 * 512))
    ).toBeLessThan(Math.max(...close.density.subarray(190 * 512, 194 * 512)));
    expect(far.density.filter((d) => d > 0).length).toBeGreaterThan(
      close.density.filter((d) => d > 0).length * 10
    );
  });

  it('keeps total deposited mass invariant under sweep subdivision', () => {
    for (const spacing of [0.5, 0.2, 0.07]) {
      const field = new PaintField(256, 192);
      sweep(
        { ...origin, x: 0.5 },
        { ...origin, x: 2.7 },
        0.003,
        'fine',
        field.deposit,
        spacing
      );
      expect(field.mass).toBeCloseTo(0.003, 9);
    }
  });

  it('leaves a continuous centreline through a fast sweep', () => {
    const field = new PaintField(512, 384);
    sweep(
      { ...origin, x: 0.5, distance: 0.04 },
      { ...origin, x: 2.7, distance: 0.04 },
      0.002,
      'fine',
      field.deposit
    );
    const row = Math.floor((origin.y / WALL.height) * field.height);
    for (
      let x = Math.ceil((0.52 / WALL.width) * field.width);
      x < Math.floor((2.68 / WALL.width) * field.width);
      x++
    )
      expect(field.density[row * field.width + x]).toBeGreaterThan(0);
  });

  it('accumulates stationary holds and layered passes without creating off-wall mass', () => {
    const field = new PaintField(256, 192);
    const stamp = { ...origin, radius: 0.06, mass: 0.003 };
    field.deposit(stamp);
    const first = field.density.slice();
    field.deposit(stamp);
    expect(field.mass).toBeCloseTo(0.006, 9);
    expect(field.density.every((v, i) => v === first[i] * 2)).toBe(true);
    field.clear();
    field.deposit({ ...stamp, x: 0 });
    expect(field.mass).toBeCloseTo(0.0015, 8);
    expect(field.density.every(Number.isFinite)).toBe(true);
  });
});
