import { describe, expect, it } from 'vitest';
import { FlowField } from './FlowField';

describe('FlowField', () => {
  it('creates a neutral texture with dimensions derived from its grid', () => {
    const field = new FlowField({ gridSize: 10 });
    field.resize(100, 50);

    expect(field.textureWidth).toBe(10);
    expect(field.textureHeight).toBe(5);
    expect(field.textureData).toHaveLength(10 * 5 * 4);

    for (let index = 0; index < field.textureData.length; index += 4) {
      expect(Array.from(field.textureData.slice(index, index + 4))).toEqual([
        128, 128, 128, 255,
      ]);
    }
  });

  it('records a pointer impulse and settles back to neutral', () => {
    const field = new FlowField({
      gridSize: 10,
      radius: 40,
      impulse: 1,
      relaxation: 0.5,
    });
    field.resize(100, 100);
    field.addImpulse(50, 50, 20, -10);

    expect(field.energy).toBeGreaterThan(0);

    field.step(1000 / 60);
    expect(
      Array.from(field.textureData).some(
        (channel, index) => index % 4 < 2 && channel !== 128
      )
    ).toBe(true);

    for (let frame = 0; frame < 20; frame += 1) {
      field.step(1000 / 60);
    }

    expect(field.energy).toBe(0);
  });

  it('ignores negligible pointer movement', () => {
    const field = new FlowField();
    field.resize(100, 100);
    field.addImpulse(50, 50, 0.01, 0.01);

    expect(field.energy).toBe(0);
  });
});
