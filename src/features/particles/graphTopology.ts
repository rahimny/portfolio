export const GRAPH_TOPOLOGIES = [
  'small-world',
  'ring',
  'grid',
  'scale-free',
] as const;

export type GraphTopologyKind = (typeof GRAPH_TOPOLOGIES)[number];

export const GRAPH_TOPOLOGY_LABELS: Record<GraphTopologyKind, string> = {
  'small-world': 'Small world',
  ring: 'Ring',
  grid: 'Grid',
  'scale-free': 'Scale free',
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Build a sparse, deterministic topology over global particle indices.
 * Allocation is confined to formation changes; the returned array is uploaded
 * once and then shared by the graph solver and WebGL element buffer.
 */
export function generateGraphTopology(
  nodes: Uint32Array,
  kind: GraphTopologyKind,
  seed = 0x72616869
): Uint32Array {
  const count = nodes.length;
  if (count < 2) return new Uint32Array();

  const pairs: number[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    if (a === b) return;
    const key = edgeKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(nodes[a], nodes[b]);
  };

  if (kind === 'ring' || kind === 'small-world') {
    const rng = random(seed);
    for (let i = 0; i < count; i++) {
      add(i, (i + 1) % count);
      const local = (i + 2) % count;
      if (kind === 'small-world' && rng() < 0.22) {
        let remote = Math.floor(rng() * count);
        if (remote === i || remote === (i + 1) % count) {
          remote = (remote + Math.max(3, Math.floor(count / 3))) % count;
        }
        add(i, remote);
      } else {
        add(i, local);
      }
    }
    return Uint32Array.from(pairs);
  }

  if (kind === 'grid') {
    const columns = Math.max(2, Math.round(Math.sqrt(count * 2)));
    for (let i = 0; i < count; i++) {
      const column = i % columns;
      if (column + 1 < columns && i + 1 < count) add(i, i + 1);
      if (i + columns < count) add(i, i + columns);
    }
    return Uint32Array.from(pairs);
  }

  const rng = random(seed);
  const degree = new Uint32Array(count);
  const initial = Math.min(3, count);
  for (let i = 0; i < initial; i++) {
    add(i, (i + 1) % initial);
    degree[i] += 2;
  }

  for (let node = initial; node < count; node++) {
    const chosen = new Set<number>();
    const links = Math.min(2, node);
    while (chosen.size < links) {
      let total = 0;
      for (let i = 0; i < node; i++) total += degree[i] + 1;
      let pick = rng() * total;
      let target = 0;
      for (; target < node - 1; target++) {
        pick -= degree[target] + 1;
        if (pick <= 0) break;
      }
      chosen.add(target);
    }
    for (const target of chosen) {
      add(node, target);
      degree[node]++;
      degree[target]++;
    }
  }

  return Uint32Array.from(pairs);
}
