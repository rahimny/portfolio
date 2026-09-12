import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildSignalGraph,
  encodeSignalGraph,
  decodeSignalGraph,
} from './signals';
import {
  graphDistances,
  makePulseField,
  encodePulseField,
  decodePulseField,
} from './pulses';
const square = new Float32Array([
  0, 0, 20, 0, 20, 0, 20, 20, 20, 20, 0, 20, 0, 20, 0, 0, 0, 0, 20, 20,
]);
const asset = (name: string) => {
  const bytes = readFileSync(
    new URL(`../../../public/filament/${name}.bin`, import.meta.url)
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
};
describe('filament travelling wavefronts', () => {
  it('round-trips fibre adjacency and rejects malformed assets', () => {
    const graph = buildSignalGraph(square),
      encoded = encodeSignalGraph(graph);
    expect(decodeSignalGraph(encoded)).toEqual(graph);
    expect(() => decodeSignalGraph(new ArrayBuffer(4))).toThrow();
    new Uint32Array(encoded, 0, 4)[2] = 99999999;
    expect(() => decodeSignalGraph(encoded)).toThrow();
  });
  it('uses shortest fibre distance, including diagonal shortcuts', () => {
    const distances = graphDistances(buildSignalGraph(square), 0);
    expect(Array.from(distances)).toEqual([
      0,
      20,
      Math.fround(Math.sqrt(800)),
      20,
    ]);
  });
  it('bridges nearby disconnected colonies to allow a front to escape', () => {
    const graph = buildSignalGraph(
      new Float32Array([0, 0, 20, 0, 40, 0, 60, 0])
    );
    expect(Array.from(graphDistances(graph, 0))).toEqual([0, 20, 40, 60]);
  });
  it('round-trips pulse fields and rejects invalid distance data', () => {
    const field = makePulseField(buildSignalGraph(square)),
      encoded = encodePulseField(field);
    expect(decodePulseField(encoded)).toEqual(field);
    new Float32Array(encoded)[encoded.byteLength / 4 - 1] = NaN;
    expect(() => decodePulseField(encoded)).toThrow();
  });
  it('reaches every shipped junction and preserves continuous phase along every fibre', () => {
    const graph = decodeSignalGraph(asset('routes'));
    const field = decodePulseField(asset('pulses'));
    expect(field.positions).toEqual(graph.positions);
    expect(field.positions.length / 2).toBeGreaterThan(20000);
    expect(makePulseField(graph)).toEqual(field);
    let maxDistance = 0;
    for (const d of field.distances) {
      if (!Number.isFinite(d) || d < 0) throw new Error('Unreachable junction');
      maxDistance = Math.max(d, maxDistance);
    }
    expect(maxDistance).toBeGreaterThan(1000);
    expect(maxDistance).toBeLessThan(760 * 4.5);
    for (let i = 0; i < field.edges.length; i += 2) {
      const a = field.edges[i],
        b = field.edges[i + 1];
      const length = Math.hypot(
        field.positions[a * 2] - field.positions[b * 2],
        field.positions[a * 2 + 1] - field.positions[b * 2 + 1]
      );
      for (let s = 0; s < 4; s++) {
        if (
          Math.abs(field.distances[a * 4 + s] - field.distances[b * 4 + s]) >
          length + 0.005
        )
          throw new Error('Discontinuous wave arrival at an edge endpoint');
      }
    }
  });
});
