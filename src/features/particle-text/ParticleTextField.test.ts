import { describe, expect, it } from 'vitest';
import type { GlyphSamples } from './glyphAtlas';
import type { TextLayout } from './layout';
import { REST } from './MotionProgramme';
import { ParticleTextField } from './ParticleTextField';
import { DEFAULT_PARTICLE_TEXT_SETTINGS } from './settings';

const GLYPH: GlyphSamples = {
  advance: 1,
  area: 1,
  x: new Float32Array([0.5]),
  y: new Float32Array([-0.5]),
  cdf: new Float32Array([1]),
  cell: 0,
};

function layout(...positions: number[]): TextLayout {
  return {
    glyphs: positions.map((u) => ({ glyph: GLYPH, u, v: 1 })),
    scale: 100,
    offsetY: 0,
    lines: 1,
    baselines: [1],
    inkArea: positions.length,
    caret: { x: 0, y: 0, width: 0, height: 0 },
  };
}

interface FieldState {
  assignment: Int32Array;
  targetU: Float32Array;
  homeU: Float32Array;
  wake: Float32Array;
  ballisticWake: Float32Array;
  edit: Uint8Array;
  editTempo: number;
}

function setup(...positions: number[]): {
  field: ParticleTextField;
  state: FieldState;
} {
  const field = new ParticleTextField(20);
  field.setBounds(-100, -100, 500, 200);
  field.setPlacement(100, 0);
  field.setCount(20);
  field.setLayout(layout(...positions));
  return { field, state: field as unknown as FieldState };
}

const settings = {
  ...DEFAULT_PARTICLE_TEXT_SETTINGS,
  attraction: 120,
  damping: 1,
  settle: 5,
  cohesion: 0,
  turbulence: 0,
  churn: 0,
  burst: 5,
  burstSpan: 0.9,
  editGlide: 0.2,
};

describe('ParticleTextField projectile response', () => {
  it('lets a touched cluster arrive late and recover without changing the lettering', () => {
    const { field, state } = setup(0, 2);
    const control = setup(0, 2).field;
    field.step(1 / 60, settings, 100, REST);
    control.step(1 / 60, settings, 100, REST);
    const target = { x: 0, y: 0 };
    field.aimAt(0, target);
    const homes = state.homeU.slice();
    field.lingerAfterTouch(target.x, target.y);
    for (let i = 0; i < 30; i++) {
      field.step(1 / 60, settings, 100, REST);
      control.step(1 / 60, settings, 100, REST);
    }
    expect(
      Math.max(
        ...field.data.map((value, i) => Math.abs(value - control.data[i]))
      )
    ).toBeGreaterThan(1);
    expect(state.homeU).toEqual(homes);
    for (let i = 0; i < 600; i++) {
      field.step(1 / 60, settings, 100, REST);
      control.step(1 / 60, settings, 100, REST);
    }
    expect(
      Math.max(
        ...field.data.map((value, i) => Math.abs(value - control.data[i]))
      )
    ).toBeLessThan(0.25);
    expect(state.homeU).toEqual(homes);
  });
  it('transfers local momentum without teleporting particles or changing their homes', () => {
    const { field, state } = setup(0, 2);
    const control = setup(0, 2).field;
    const view = { ...REST, yaw: 0.2, pitch: -0.12 };
    field.step(1 / 60, settings, 100, view);
    control.step(1 / 60, settings, 100, view);
    const before = field.data.slice();
    const homes = state.homeU.slice();
    const target = { x: 0, y: 0 };
    expect(field.aimAt(0, target)).toBe(true);
    const hit = field.repelInk(
      { x: target.x - 25, y: target.y },
      { x: target.x + 25, y: target.y },
      18,
      18000,
      1 / 60
    );
    expect(hit).toBeGreaterThan(0);
    expect(field.data).toEqual(before);
    expect(state.homeU).toEqual(homes);
    expect(Math.max(...state.ballisticWake)).toBeGreaterThan(0);
    field.step(1 / 60, settings, 100, view);
    control.step(1 / 60, settings, 100, view);
    expect(field.data[0] - control.data[0]).toBeGreaterThan(0.1);
    const far = Array.from(state.assignment).findIndex((glyph) => glyph === 1);
    expect(field.data[far * 4]).toBeCloseTo(control.data[far * 4], 3);
    for (let i = 0; i < 600; i++) field.step(1 / 60, settings, 100, view);
    expect(Array.from(field.data).every(Number.isFinite)).toBe(true);
    expect(Math.max(...state.ballisticWake)).toBeLessThan(1e-5);
    expect(state.homeU).toEqual(homes);
  });
});

describe('ParticleTextField edit flow', () => {
  it('holds donor particles in the existing text until an insertion wave reaches them', () => {
    const { field, state } = setup(0);

    field.setLayout(layout(0, 2));

    const moved = Array.from(state.assignment).findIndex(
      (glyph) => glyph === 1
    );
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(state.edit[moved]).toBe(1);
    expect(state.targetU[moved]).toBeCloseTo(0.5);
    expect(state.homeU[moved]).toBeCloseTo(2.5);
    expect(state.wake[moved]).toBeLessThan(0);

    field.step(0.05, settings, 100, REST);
    expect(state.targetU[moved]).toBeCloseTo(0.5);

    for (let i = 0; i < 7; i++) field.step(0.05, settings, 100, REST);
    expect(state.targetU[moved]).toBeGreaterThan(0.5);
    expect(state.targetU[moved]).toBeLessThan(state.homeU[moved]);
  });

  it('delays deletion routes by recipient distance instead of pulling left immediately', () => {
    const { field, state } = setup(0, 2);

    field.setLayout(layout(0));

    const moved = Array.from(state.edit).findIndex((editing) => editing === 1);
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(state.assignment[moved]).toBe(0);
    expect(state.targetU[moved]).toBeCloseTo(2.5);
    expect(state.homeU[moved]).toBeCloseTo(0.5);
    expect(state.wake[moved]).toBeLessThan(-0.2);

    field.step(0.05, settings, 100, REST);
    expect(state.targetU[moved]).toBeCloseTo(2.5);
  });

  it('uses curl to bend the spring route away from a straight chord', () => {
    const direct = setup(0);
    const curled = setup(0);
    direct.field.setLayout(layout(0, 2));
    curled.field.setLayout(layout(0, 2));

    for (let i = 0; i < 14; i++) {
      direct.field.step(0.05, { ...settings, editCurl: 0 }, 100, REST);
      curled.field.step(0.05, { ...settings, editCurl: 1.35 }, 100, REST);
    }

    let verticalDifference = 0;
    for (let p = 0; p < 20; p++) {
      verticalDifference += Math.abs(
        direct.field.data[p * 4 + 1] - curled.field.data[p * 4 + 1]
      );
    }
    expect(verticalDifference).toBeGreaterThan(1);
  });

  it('accelerates pending routes when edits arrive as a continuous gesture', () => {
    const { field, state } = setup(0);
    field.setLayout(layout(0, 2));
    field.step(0.1, settings, 100, REST);

    field.setLayout(layout(0, 2, 4));

    expect(state.editTempo).toBeGreaterThan(0.8);
    const newest = Array.from(state.assignment).findIndex(
      (glyph) => glyph === 2
    );
    expect(newest).toBeGreaterThanOrEqual(0);
    expect(state.wake[newest]).toBeGreaterThan(-0.1);

    const before = state.targetU[newest];
    field.step(0.1, settings, 100, REST);
    expect(state.targetU[newest]).toBeGreaterThan(before);
  });

  it('applies the same catch-up tempo to repeated deletion', () => {
    const { field, state } = setup(0, 2, 4);
    field.setLayout(layout(0, 2));
    field.step(0.08, settings, 100, REST);

    field.setLayout(layout(0));

    expect(state.editTempo).toBeGreaterThan(0.9);
    const deleting = Array.from(state.edit).findIndex(
      (editing) => editing === 1
    );
    expect(deleting).toBeGreaterThanOrEqual(0);
    expect(state.wake[deleting]).toBeGreaterThan(-0.08);
  });
});
