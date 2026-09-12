import { describe, expect, it } from 'vitest';
import { buildScore, DEFAULT_SETTINGS, presetPath, type Stamp } from './model';
import { Performer, type PlaybackRate } from './performer';
import { DEFAULT_STROKE_STYLE, styleScore } from './stroke-style';

const source = () => buildScore(presetPath('line'), DEFAULT_SETTINGS);
describe('can technique controls', () => {
  it('keeps the centreline and lifts while changing entry/exit envelopes', () => {
    const original = source();
    for (const placement of ['entry', 'exit', 'both'] as const) {
      const score = styleScore(original, DEFAULT_SETTINGS, {
        ...DEFAULT_STROKE_STYLE,
        placement,
      });
      const paint = score.motions.filter((m) => m.valve);
      expect(paint[0].from.distance).toBeCloseTo(
        DEFAULT_SETTINGS.distance +
          (placement === 'exit' ? 0 : DEFAULT_STROKE_STYLE.reach)
      );
      expect(paint.at(-1)!.to.distance).toBeCloseTo(
        DEFAULT_SETTINGS.distance +
          (placement === 'entry' ? 0 : DEFAULT_STROKE_STYLE.reach)
      );
      for (let i = 0; i < score.motions.length; i++) {
        expect(score.motions[i].from.x).toBe(original.motions[i].from.x);
        expect(score.motions[i].to.y).toBe(original.motions[i].to.y);
        if (i) expect(score.motions[i].from).toEqual(score.motions[i - 1].to);
      }
    }
    expect(original).toEqual(source());
  });
  it('switches flares off, preserves holds and rejects invalid envelopes', () => {
    const clean = styleScore(source(), DEFAULT_SETTINGS, {
      ...DEFAULT_STROKE_STYLE,
      reach: 0,
    });
    expect(
      clean.motions
        .filter((m) => m.valve)
        .every(
          (m) =>
            m.from.distance === DEFAULT_SETTINGS.distance &&
            m.to.distance === DEFAULT_SETTINGS.distance &&
            m.valve === 1
        )
    ).toBe(true);
    const hold = styleScore(
      buildScore(presetPath('hold'), DEFAULT_SETTINGS),
      DEFAULT_SETTINGS,
      DEFAULT_STROKE_STYLE
    );
    expect(hold.motions.every((m) => Number.isFinite(m.to.distance))).toBe(
      true
    );
    expect(() =>
      styleScore(source(), DEFAULT_SETTINGS, {
        ...DEFAULT_STROKE_STYLE,
        span: NaN,
      })
    ).toThrow();
  });
  it('performs identical nozzle deposits at every playback rate and frame cadence', () => {
    const run = (rate: PlaybackRate, hz: number) => {
      const performer = new Performer(
        styleScore(source(), DEFAULT_SETTINGS, {
          ...DEFAULT_STROKE_STYLE,
          placement: 'both',
        }),
        'fine'
      );
      const stamps: Stamp[] = [];
      let frames = 0;
      while (!performer.complete && frames++ < 120 * hz)
        performer.advance(
          1 / hz,
          (stamp) => stamps.push(stamp),
          undefined,
          undefined,
          rate
        );
      expect(performer.complete).toBe(true);
      return { stamps, frames };
    };
    const baseline = run(1, 60);
    for (const rate of [1, 2, 4, 8] as const)
      for (const hz of [30, 60, 120]) {
        const result = run(rate, hz);
        expect(result.stamps).toEqual(baseline.stamps);
        expect(result.frames / hz).toBeCloseTo(baseline.frames / 60 / rate, 0);
      }
  });
});
