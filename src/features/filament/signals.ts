export interface SignalGraph {
  positions: Float32Array;
  offsets: Uint32Array;
  neighbours: Uint32Array;
}

/** Quantise only for vertex identity; retain the actual fibre coordinates. */
export function buildSignalGraph(edges: Float32Array): SignalGraph {
  const positions: number[] = [],
    adjacency: Set<number>[] = [],
    keys = new Map<string, number>();
  const vertex = (x: number, y: number) => {
    const key = `${Math.round(x * 2)},${Math.round(y * 2)}`;
    let index = keys.get(key);
    if (index === undefined) {
      index = positions.length / 2;
      keys.set(key, index);
      positions.push(x, y);
      adjacency.push(new Set());
    }
    return index;
  };
  for (let i = 0; i < edges.length; i += 4) {
    if (Math.hypot(edges[i + 2] - edges[i], edges[i + 3] - edges[i + 1]) < 1)
      continue;
    const a = vertex(edges[i], edges[i + 1]),
      b = vertex(edges[i + 2], edges[i + 3]);
    if (a !== b) {
      adjacency[a].add(b);
      adjacency[b].add(a);
    }
  }
  // Join nearby endpoints where separately sampled membrane sheets meet.
  // These short junction links sit inside the existing dense fibre field.
  const bins = new Map<string, number[]>(),
    cell = 12;
  for (let i = 0; i < adjacency.length; i++) {
    const x = Math.floor(positions[i * 2] / cell),
      y = Math.floor(positions[i * 2 + 1] / cell),
      key = `${x},${y}`;
    const bin = bins.get(key) ?? [];
    bin.push(i);
    bins.set(key, bin);
  }
  for (let i = 0; i < adjacency.length; i++) {
    if (adjacency[i].size > 1) continue;
    const x = positions[i * 2],
      y = positions[i * 2 + 1],
      cx = Math.floor(x / cell),
      cy = Math.floor(y / cell);
    let nearest = -1,
      distance = 144;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of bins.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (i === j || adjacency[i].has(j)) continue;
          const d =
            (positions[j * 2] - x) ** 2 + (positions[j * 2 + 1] - y) ** 2;
          if (d < distance) {
            distance = d;
            nearest = j;
          }
        }
    if (nearest >= 0) {
      adjacency[i].add(nearest);
      adjacency[nearest].add(i);
    }
  }
  // Connect independently sampled sheets at their closest junctions. A
  // minimum spanning set of short bridges makes distance propagation global.
  const parent = Array.from({ length: adjacency.length }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    a = root(a);
    b = root(b);
    if (a === b) return false;
    parent[b] = a;
    return true;
  };
  adjacency.forEach((set, i) => {
    for (const n of set) join(i, n);
  });
  const candidates: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < adjacency.length; i++) {
    const x = positions[i * 2],
      y = positions[i * 2 + 1],
      cx = Math.floor(x / cell),
      cy = Math.floor(y / cell);
    let nearest = -1,
      distance = 64 * 64;
    for (let dx = -5; dx <= 5; dx++)
      for (let dy = -5; dy <= 5; dy++)
        for (const j of bins.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (root(i) === root(j)) continue;
          const d =
            (positions[j * 2] - x) ** 2 + (positions[j * 2 + 1] - y) ** 2;
          if (d < distance) {
            distance = d;
            nearest = j;
          }
        }
    if (nearest >= 0) candidates.push({ a: i, b: nearest, d: distance });
  }
  candidates.sort((a, b) => a.d - b.d);
  for (const { a, b } of candidates)
    if (join(a, b)) {
      adjacency[a].add(b);
      adjacency[b].add(a);
    }
  const offsets = new Uint32Array(adjacency.length + 1),
    neighbours: number[] = [];
  adjacency.forEach((set, i) => {
    offsets[i] = neighbours.length;
    neighbours.push(...set);
  });
  offsets[adjacency.length] = neighbours.length;
  return {
    positions: new Float32Array(positions),
    offsets,
    neighbours: new Uint32Array(neighbours),
  };
}
export function encodeSignalGraph(graph: SignalGraph): ArrayBuffer {
  const header = new Uint32Array([
    0x46494c41,
    1,
    graph.positions.length,
    graph.neighbours.length,
  ]);
  const bytes = new Uint8Array(
    16 +
      graph.positions.byteLength +
      graph.offsets.byteLength +
      graph.neighbours.byteLength
  );
  let offset = 0;
  for (const data of [
    header,
    graph.positions,
    graph.offsets,
    graph.neighbours,
  ]) {
    bytes.set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      offset
    );
    offset += data.byteLength;
  }
  return bytes.buffer;
}
export function decodeSignalGraph(buffer: ArrayBuffer): SignalGraph {
  if (buffer.byteLength < 16) throw new Error('Invalid filament routes.');
  const h = new Uint32Array(buffer, 0, 4),
    vertices = h[2] / 2;
  if (
    h[0] !== 0x46494c41 ||
    h[1] !== 1 ||
    !Number.isInteger(vertices) ||
    vertices < 2 ||
    vertices > 100000 ||
    h[3] > 1000000 ||
    buffer.byteLength !== 16 + h[2] * 4 + (vertices + 1) * 4 + h[3] * 4
  )
    throw new Error('Invalid filament routes.');
  const positions = new Float32Array(buffer, 16, h[2]),
    offsets = new Uint32Array(buffer, 16 + h[2] * 4, vertices + 1),
    neighbours = new Uint32Array(
      buffer,
      16 + h[2] * 4 + (vertices + 1) * 4,
      h[3]
    );
  if (offsets[0] !== 0 || offsets[vertices] !== neighbours.length)
    throw new Error('Invalid filament route offsets.');
  for (let i = 0; i < vertices; i++)
    if (offsets[i] > offsets[i + 1])
      throw new Error('Invalid filament route offsets.');
  for (const n of neighbours)
    if (n >= vertices) throw new Error('Invalid filament junction.');
  for (const p of positions)
    if (!Number.isFinite(p)) throw new Error('Invalid filament position.');
  return { positions, offsets, neighbours };
}
