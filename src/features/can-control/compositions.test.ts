import { describe, expect, it } from 'vitest';
import {
  ART_SETTINGS,
  artworkPath,
  artworkScore,
  type Artwork,
} from './compositions';
import { validatePath, type Stamp } from './model';
import { Performer } from './performer';

const artworks: Artwork[] = ['hush', 'ribbon', 'contours'];

describe('scored wagon compositions', () => {
  it('preserves stroke breaks, finite envelopes and surface bounds for all artworks', () => {
    for (const artwork of artworks) {
      const path = artworkPath(artwork);
      expect(() => validatePath(path)).not.toThrow();
      const score = artworkScore(artwork, ART_SETTINGS);
      expect(score.motions.filter((m) => !m.valve)).toHaveLength(
        path.length + 1
      );
      expect(
        score.motions.every(
          (m) =>
            m.duration > 0 &&
            m.valve >= 0 &&
            m.valve <= 1 &&
            m.from.distance >= 0.04 &&
            m.from.distance <= 0.8 &&
            m.to.distance >= 0.04 &&
            m.to.distance <= 0.8
        )
      ).toBe(true);
      for (let i = 1; i < score.motions.length; i++)
        expect(score.motions[i].from).toEqual(score.motions[i - 1].to);
      const performer = new Performer(score, ART_SETTINGS.cap);
      let count = 0;
      performer.finish((stamp) => {
        expect(performer.phase).toBe('paint');
        expect(Number.isFinite(stamp.mass) && stamp.mass > 0).toBe(true);
        count++;
      });
      expect(performer.complete).toBe(true);
      expect(performer.time).toBeLessThan(180);
      expect(count).toBeGreaterThan(100);
    }
  });

  it('performs HUSH gesture envelopes identically under 30/60/120 Hz rendering', () => {
    const run = (hz: number) => {
      const performer = new Performer(
        artworkScore('hush', ART_SETTINGS),
        ART_SETTINGS.cap
      );
      const stamps: Stamp[] = [];
      let frames = 0;
      while (!performer.complete && frames++ < hz * 180)
        performer.advance(1 / hz, (stamp) => stamps.push(stamp));
      expect(performer.complete).toBe(true);
      return stamps;
    };
    const a = run(30);
    expect(a).toEqual(run(60));
    expect(a).toEqual(run(120));
    expect(
      Math.max(...a.map((s) => s.radius)) / Math.min(...a.map((s) => s.radius))
    ).toBeGreaterThan(1.8);
  });
});
