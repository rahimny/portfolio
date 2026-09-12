import { describe, expect, it } from 'vitest';
import { GRAPH_TOPOLOGIES, generateGraphTopology } from './graphTopology';

const nodes = Uint32Array.from({ length: 96 }, (_, i) => i * 3 + 1);

describe('generateGraphTopology', () => {
  for (const kind of GRAPH_TOPOLOGIES) {
    it(`builds a valid deterministic ${kind} graph`, () => {
      const first = generateGraphTopology(nodes, kind, 42);
      const second = generateGraphTopology(nodes, kind, 42);
      expect(first).toEqual(second);
      expect(first.length % 2).toBe(0);
      expect(first.length).toBeGreaterThan(0);

      const allowed = new Set(nodes);
      const seen = new Set<string>();
      for (let i = 0; i < first.length; i += 2) {
        const a = first[i];
        const b = first[i + 1];
        expect(allowed.has(a)).toBe(true);
        expect(allowed.has(b)).toBe(true);
        expect(a).not.toBe(b);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  }
});
