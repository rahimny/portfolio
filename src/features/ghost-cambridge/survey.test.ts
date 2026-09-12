import { describe, expect, it } from 'vitest';
import {
  decodeSurvey,
  tileForPoint,
  nearestTiles,
  clipSegment,
  acquisitionOffset,
  type Survey,
} from './survey';

const survey: Survey = {
  version: 1,
  count: 1,
  cropCount: 1,
  sourceFile: 'test.laz',
  attribution: '',
  bounds: [544000, 258000, 545000, 259000],
  minimum: [544000, 258000, 4],
  origin: [544500, 258500, 4],
  scale: [0.02, 0.02, 0.01],
  heightRange: [4, 40],
};
function fixture() {
  const buffer = new ArrayBuffer(16),
    view = new DataView(buffer);
  view.setUint32(0, 0x47434231, false);
  view.setUint32(4, 1, true);
  view.setUint16(8, 30000, true);
  view.setUint16(10, 35000, true);
  view.setUint16(12, 2300, true);
  view.setUint8(14, 255);
  view.setUint8(15, 5);
  return buffer;
}
describe('survey coordinates', () => {
  it('preserves handedness, centimetre heights and return attributes', () => {
    const data = decodeSurvey(fixture(), survey);
    expect(data.positions[0]).toBe(1);
    expect(data.positions[1]).toBeCloseTo(0.23);
    expect(data.positions[2]).toBe(-2);
    expect(data.intensities[0]).toBe(1);
    expect(data.classifications[0]).toBe(5);
  });
  it('rejects truncated, wrong-version and non-finite datasets', () => {
    expect(() => decodeSurvey(fixture().slice(0, 12), survey)).toThrow();
    expect(() => decodeSurvey(fixture(), { ...survey, version: 2 })).toThrow();
    expect(() =>
      decodeSurvey(fixture(), { ...survey, origin: [NaN, 0, 0] })
    ).toThrow();
  });
});

describe('detail and geographic alignment', () => {
  it('decodes recorded time, ground-relative height and pulse return order', () => {
    const buffer = new ArrayBuffer(24),
      view = new DataView(buffer);
    view.setUint32(0, 0x47434232, false);
    view.setUint32(4, 1, true);
    view.setUint16(8, 30000, true);
    view.setUint16(10, 35000, true);
    view.setUint16(12, 2300, true);
    view.setUint8(14, 128);
    view.setUint8(15, 6);
    view.setUint32(16, 105000, true);
    view.setUint16(20, 1750, true);
    view.setUint8(22, 0x21);
    const data = decodeSurvey(buffer, {
      ...survey,
      version: 2,
      gpsRange: [1000, 1110],
      acquisitionSegments: [
        [0, 10],
        [100, 110],
      ],
    });
    expect(data.positions[1]).toBeCloseTo(0.23);
    expect(data.heights[0]).toBeCloseTo(17.5);
    expect(data.acquisition[0]).toBeCloseTo(0.75);
    expect(data.returns[0]).toBe(1);
  });
  it('assigns seam points consistently and chooses at most four detail tiles', () => {
    const tiled = {
      ...survey,
      tileSize: 230,
      tileColumns: 5,
      tiles: Array.from({ length: 25 }, (_, id) => ({
        id,
        count: 10,
        file: `${id}.bin`,
        bounds: [
          544000 + (id % 5) * 230,
          258000 + Math.floor(id / 5) * 230,
          544230 + (id % 5) * 230,
          258230 + Math.floor(id / 5) * 230,
        ] as [number, number, number, number],
      })),
    };
    expect(tileForPoint(544230, 258000, tiled)).toBe(1);
    expect(tileForPoint(544229.98, 258000, tiled)).toBe(0);
    expect(nearestTiles(544115, 258115, tiled).map((tile) => tile.id)).toEqual([
      0, 1, 5, 6,
    ]);
  });
  it('clips map linework without inventing crop-edge segments', () => {
    expect(clipSegment([-2, 5], [12, 5], [0, 0, 10, 10])).toEqual([
      [0, 5],
      [10, 5],
    ]);
    expect(clipSegment([-2, -1], [12, -1], [0, 0, 10, 10])).toBeNull();
  });
  it('skips flight gaps while retaining recorded elapsed time', () => {
    const timed = {
      ...survey,
      acquisitionSegments: [
        [0, 10],
        [100, 110],
      ] as [number, number][],
    };
    expect(acquisitionOffset(0.25, timed)).toBe(5);
    expect(acquisitionOffset(0.75, timed)).toBe(105);
    expect(acquisitionOffset(1, timed)).toBe(110);
  });
});
