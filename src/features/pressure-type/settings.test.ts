import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MATERIALS,
  materialName,
  readSettings,
} from './settings';
import { updateNormals } from './normals';

describe('studio settings and surface normals', () => {
  it('rejects malformed saved values and bounds all numeric tuning', () => {
    const result = readSettings({
      color: 'url(bad)',
      roughness: -100,
      exposure: NaN,
      tether: Infinity,
      softness: 400,
      unknown: true,
    });
    expect(result.color).toBe(DEFAULT_SETTINGS.color);
    expect(result.roughness).toBe(0.08);
    expect(result.exposure).toBe(DEFAULT_SETTINGS.exposure);
    expect(result.tether).toBe(DEFAULT_SETTINGS.tether);
    expect(result.softness).toBe(1.5);
    expect(result).not.toHaveProperty('unknown');
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips a tuned look and identifies presets truthfully', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...MATERIALS.Mercury,
      exposure: 1.2,
    };
    expect(readSettings(JSON.parse(JSON.stringify(settings)))).toEqual(
      settings
    );
    expect(materialName(settings)).toBe('Mercury');
    expect(materialName({ ...settings, roughness: 0.35 })).toBe('Custom');
  });
  it('writes oriented unit normals and keeps degenerate vertices finite', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 2, 2]);
    const normals = new Float32Array(positions.length);
    updateNormals(positions, new Uint16Array([0, 1, 2, 3, 3, 3]), normals);
    expect([...normals]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
  });
});
