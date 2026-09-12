import { REST } from './MotionProgramme';
import { DEFAULT_PARTICLE_TEXT_SETTINGS } from './settings';
import { describe, expect, it } from 'vitest';
import { DroneWriting, DRONE_SPEED } from './DroneWriting';
import { LETTER_STROKES } from './letterStrokes';
import type { TextLayout } from './layout';
import { ParticleTextField, STRIDE } from './ParticleTextField';

function layout(text = 'A', scale = 100): TextLayout {
  const glyph = {
    advance: 1,
    area: 1,
    x: new Float32Array([0, 1, 0.3, 0.5, 0.7]),
    y: new Float32Array([-1, 0, -0.41, -0.94, -0.41]),
    cdf: new Float32Array([1, 2, 3, 4, 5]),
    cell: 0,
  };
  return {
    glyphs: [...text].map((char, i) => ({
      char,
      glyph,
      u: i % 4,
      v: Math.floor(i / 4) + 1,
    })),
    scale,
    offsetY: 0,
    lines: Math.ceil(text.length / 4),
    baselines: [1, 2, 3, 4],
    inkArea: text.length,
    caret: { x: 0, y: 0, width: 0, height: 1 },
  };
}

describe('drone handwriting score', () => {
  it('lets departing pilots leave on a late skip without returning to spray again', () => {
    const score = new DroneWriting(layout('RAHIMNEALYAKOOB'), 500, true);
    score.advance((score.paintEnd + 0.2) / DRONE_SPEED);
    const tracks = score.tracks.map((track) => [...track]);
    const duration = score.duration;
    expect(score.skip()).toBe(false);
    expect(score.burstStart).not.toBeNull();
    expect(score.tracks).toEqual(tracks);
    expect(score.duration).toBe(duration);
  });

  it('skips from the live pose, sprays briefly and completes without restarting on repeated clicks', () => {
    for (const elapsed of [0, 0.5, 3, 6]) {
      const score = new DroneWriting(layout('RAHIMNEALYAKOOB'), 500, true);
      score.advance(elapsed);
      const before = score.flights.map((flight) => ({ ...flight }));
      expect(score.skip()).toBe(true);
      expect(score.flights).toEqual(before);
      const end = score.duration;
      expect(score.skip()).toBe(false);
      expect(score.duration).toBe(end);
      score.advance(0.4);
      expect(score.flights.every((flight) => flight.spray)).toBe(true);
      expect(score.done).toBe(false);
      score.advance(1.3);
      expect(score.done).toBe(true);
      expect(score.flights[0].visible).toBe(true);
      expect(score.flights[1].x).toBeGreaterThan(5.3);
      expect(score.flights.every((flight) => !flight.spray)).toBe(true);
      expect(
        score.flights.every((flight) => Number.isFinite(flight.x + flight.y))
      ).toBe(true);
    }
  });

  it('emits missing ink through the burst without moving deposited ink or revealing it all on click', () => {
    const l = layout('RAHIMNEALYAKOOB');
    const score = new DroneWriting(l, 500, true);
    const field = new ParticleTextField(600);
    field.setBounds(-100, -100, 600, 500);
    field.setPlacement(100, 0);
    field.setCount(600);
    field.setLayout(l);
    field.beginWriting(score);
    score.advance(1);
    field.write(score.time, score.flights);
    const before = field.data.slice();
    score.skip();
    field.burstWriting(score);
    field.write(score.time, score.flights);
    expect(field.data).toEqual(before);
    score.advance(0.45);
    field.write(score.time, score.flights);
    const visible = (data: Float32Array) =>
      Array.from({ length: field.count }, (_, p) => data[p * STRIDE]).filter(
        (x) => x > -1000
      ).length;
    expect(visible(field.data)).toBeGreaterThan(visible(before));
    expect(visible(field.data)).toBeLessThan(field.count);
    score.advance((score.duration - score.time) / DRONE_SPEED);
    field.write(score.time, score.flights);
    expect(visible(field.data)).toBe(field.count);
    const emitted = field.data.slice();
    field.finishWriting();
    expect(field.data).toEqual(emitted);
  });

  it('keeps the retained writer visible while its partner finishes departing', () => {
    const l = layout('RAHIMNEALYAKOOB');
    l.glyphs.forEach((glyph, i) => {
      glyph.word = i < 5 ? 0 : i < 9 ? 1 : 2;
    });
    const score = new DroneWriting(l, 500, true);
    score.advance(score.paintEnd);
    while (!score.done) {
      score.advance(1 / 120);
      expect(score.flights[0].visible).toBe(true);
    }
    score.cancelled = true;
    expect(score.sample().visible).toBe(false);
  });

  it('writes A bottom-left to apex to bottom-right, then lifts to draw the crossbar', () => {
    const score = new DroneWriting(layout(), 500);
    const paint = score.byGlyph[0];
    expect(paint).toHaveLength(3);
    expect(paint[0].from.y).toBeGreaterThan(paint[0].to.y);
    expect(paint[0].from.x).toBeLessThan(paint[0].to.x);
    expect(paint[1].to.y).toBeGreaterThan(paint[1].from.y);
    expect(paint[1].to.x).toBeGreaterThan(paint[1].from.x);
    expect(paint[2].from.y).toBe(paint[2].to.y);
    const between = (paint[1].start + paint[1].duration + paint[2].start) / 2;
    expect(score.sample(between).spray).toBe(false);
    expect(paint[2].from.x).toBeLessThan(paint[2].to.x);
  });

  it('keeps release and nozzle progress together through eased strokes', () => {
    const score = new DroneWriting(layout('RAHIMNEALYAKOOB'), 500);
    for (let g = 0; g < score.byGlyph.length; g++) {
      for (const segment of score.byGlyph[g]) {
        const birth = score.deposition(
          g,
          (segment.from.x + segment.to.x) / 2,
          (segment.from.y + segment.to.y) / 2
        );
        const nozzle = score.sample(birth.time, birth.drone);
        expect(nozzle.spray).toBe(true);
        expect(nozzle.x).toBeCloseTo(birth.x, 3);
        expect(nozzle.y).toBeCloseTo(birth.y, 3);
      }
    }
  });

  it('keeps timing independent of responsive pixel size and paints all capitals', () => {
    const text = Object.keys(LETTER_STROKES).join('');
    const a = new DroneWriting(layout(text, 100), 500);
    const b = new DroneWriting(layout(text, 50), 250);
    expect(a.segments).toEqual(b.segments);
    expect(a.byGlyph).toHaveLength(26);
    expect(a.sample(0).spray).toBe(false);
    a.advance(a.duration);
    expect(a.done).toBe(true);
    expect(a.sample().spray).toBe(false);
  });

  it('does not lose a stroke when frames are coarse', () => {
    const a = new DroneWriting(layout(), 500),
      b = new DroneWriting(layout(), 500);
    for (let i = 0; i < 180; i++) a.advance(1 / 60 / DRONE_SPEED);
    for (let i = 0; i < 60; i++) b.advance(1 / 20 / DRONE_SPEED);
    expect(a.time).toBeCloseTo(b.time, 8);
    expect(a.sample().x).toBeCloseTo(b.sample().x, 8);
    expect(a.flights[0].x).toBeCloseTo(b.flights[0].x, 6);
    expect(a.flights[0].y).toBeCloseTo(b.flights[0].y, 6);
  });

  it('completes when the last frame leaves a substep-sized rounding remainder', () => {
    const score = new DroneWriting(layout('RAHIMNEALYAKOOB'), 500);
    score.advance(score.duration - 5e-9);
    score.advance(1 / 60);
    expect(score.done).toBe(true);
    expect(score.time).toBe(score.duration);
  });

  it('shares remaining letters without duplicate work and waits for both workers before leaving', () => {
    const l = layout('RAHIMNEALYAKOOB');
    l.glyphs.forEach((glyph, i) => {
      glyph.word = i < 5 ? 0 : i < 9 ? 1 : 2;
      glyph.u = i < 9 ? i + (i >= 5 ? 0.4 : 0) : i - 9;
      glyph.v = i < 9 ? 1 : 2.1;
    });
    const score = new DroneWriting(l, 1100);
    expect(score.jobs).toHaveLength(4);
    expect(
      score.jobs.flatMap((job) => job.glyphs).sort((a, b) => a - b)
    ).toEqual(l.glyphs.map((_, i) => i));
    expect(score.jobs[0].drone).not.toBe(score.jobs[1].drone);
    expect(score.jobs[1].start).toBeLessThan(score.jobs[0].end);
    const nextWorker = score.jobs[0].end < score.jobs[1].end ? 0 : 1;
    expect(score.jobs[2].drone).toBe(nextWorker);
    expect(score.jobs[3].drone).not.toBe(score.jobs[2].drone);
    for (const track of score.tracks) {
      expect(track[track.length - 1].start).toBeGreaterThan(score.paintEnd);
    }
  });

  it('flies with bounded drift and separation rather than sitting on the stroke', () => {
    const score = new DroneWriting(layout('RAHIMNEALYAKOOB'), 500);
    let maxDeviation = 0;
    let closest = Infinity;
    for (let i = 0; i < Math.ceil(score.duration * 120); i++) {
      score.advance(1 / 120);
      score.flights.forEach((flight, id) => {
        if (!flight.spray) return;
        const ideal = score.sample(score.time, id);
        maxDeviation = Math.max(
          maxDeviation,
          Math.hypot(flight.x - ideal.x, flight.y - ideal.y)
        );
        expect(
          [flight.x, flight.y, flight.vx, flight.vy].every(Number.isFinite)
        ).toBe(true);
      });
      if (score.flights.every((flight) => flight.visible))
        closest = Math.min(
          closest,
          Math.hypot(
            score.flights[0].x - score.flights[1].x,
            score.flights[0].y - score.flights[1].y
          )
        );
    }
    expect(maxDeviation).toBeGreaterThan(0.05);
    expect(maxDeviation).toBeLessThan(0.7);
    expect(closest).toBeGreaterThan(0.49);
  });

  it('keeps deposited ink moving and responds to the pointer before writing finishes', () => {
    const l = layout('AAAA');
    const score = new DroneWriting(l, 500);
    const create = () => {
      const field = new ParticleTextField(200);
      field.setBounds(-100, -100, 500, 200);
      field.setPlacement(100, 0);
      field.setCount(200);
      field.setLayout(l);
      field.beginWriting(score);
      return field;
    };
    const ink = create(),
      touched = create();
    const firstLetterEnd = score.byGlyph[0][score.byGlyph[0].length - 1];
    const time = firstLetterEnd.start + firstLetterEnd.duration + 0.15;
    ink.write(time);
    touched.write(time);
    const index = Array.from({ length: ink.count }, (_, i) => i).find(
      (i) => ink.data[i * STRIDE] > -1000
    )!;
    expect(index).toBeDefined();
    const initial = ink.data.slice(index * STRIDE, index * STRIDE + 2);
    touched.setPointer(initial[0] + 2, initial[1] + 2, 180, 40);
    for (let i = 0; i < 12; i++) {
      ink.write(time);
      touched.write(time);
      ink.step(1 / 60, DEFAULT_PARTICLE_TEXT_SETTINGS, 100, REST);
      touched.step(1 / 60, DEFAULT_PARTICLE_TEXT_SETTINGS, 100, REST);
    }
    expect(Math.abs(ink.data[index * STRIDE] - initial[0])).toBeGreaterThan(
      0.2
    );
    expect(
      Math.abs(touched.data[index * STRIDE] - ink.data[index * STRIDE])
    ).toBeGreaterThan(0.5);
    const visible = Array.from(
      { length: ink.count },
      (_, i) => ink.data[i * STRIDE]
    ).filter((x) => x > -1000).length;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(ink.count);
  });

  it('writes the restored name instead of targets left over from edited text', () => {
    const field = new ParticleTextField(100);
    field.setBounds(0, 0, 500, 200);
    field.setPlacement(100, 0);
    field.setCount(100);
    field.setLayout(layout('AAAA'));
    const restored = layout('A');
    field.setLayout(restored);
    const score = new DroneWriting(restored, 500);
    field.beginWriting(score);
    field.write(score.paintEnd + 0.2);
    for (let i = 0; i < field.count; i++) {
      expect(field.data[i * STRIDE]).toBeGreaterThanOrEqual(-1e-5);
      expect(field.data[i * STRIDE]).toBeLessThanOrEqual(100 + 1e-5);
    }
  });

  it('clears graph forces before a writing replay takes over', () => {
    const l = layout();
    const field = new ParticleTextField(100);
    field.setBounds(0, 0, 500, 200);
    field.setPlacement(100, 0);
    field.setCount(100);
    field.setLayout(l);
    field.setGraphMode(true);
    field.step(0.05, DEFAULT_PARTICLE_TEXT_SETTINGS, 100, REST);
    expect(field.graphBlend).toBeGreaterThan(0);
    field.beginWriting(new DroneWriting(l, 500));
    expect(field.graphBlend).toBe(0);
  });

  it('keeps ink absent before the nozzle arrives and restores all particles on interruption', () => {
    const l = layout();
    const field = new ParticleTextField(100);
    field.setBounds(0, 0, 500, 200);
    field.setPlacement(100, 0);
    field.setCount(100);
    field.setLayout(l);
    const score = new DroneWriting(l, 500);
    const visible = () =>
      Array.from(
        { length: field.count },
        (_, i) => field.data[i * STRIDE]
      ).filter((x) => x > -1000).length;
    field.beginWriting(score);
    field.write(0);
    expect(visible()).toBe(0);
    field.write(score.paintEnd + 0.2);
    expect(visible()).toBe(100);
    expect([...field.data].every(Number.isFinite)).toBe(true);
    field.beginWriting(score);
    field.write(0);
    field.cancelWriting();
    expect(visible()).toBe(100);
  });
});
