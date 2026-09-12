import type { SignalGraph } from './signals';
export interface PulseField {
  positions: Float32Array;
  edges: Uint32Array;
  distances: Float32Array;
  origins: Float32Array;
}
const SOURCE_POINTS = [
  [510, 520],
  [500, 110],
  [260, 815],
  [880, 460],
];
/** Shortest path distance is a monotonic phase coordinate, independent of fps. */
export function graphDistances(
  graph: SignalGraph,
  source: number
): Float32Array {
  const count = graph.positions.length / 2,
    distance = new Float32Array(count);
  distance.fill(Infinity);
  distance[source] = 0;
  const heap: { node: number; distance: number }[] = [
    { node: source, distance: 0 },
  ];
  const push = (item: { node: number; distance: number }) => {
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (heap[p].distance <= item.distance) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const result = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].distance < heap[child].distance
        )
          child++;
        if (heap[child].distance >= last.distance) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return result;
  };
  while (heap.length) {
    const current = pop();
    if (current.distance > distance[current.node] + 0.001) continue;
    for (
      let i = graph.offsets[current.node];
      i < graph.offsets[current.node + 1];
      i++
    ) {
      const node = graph.neighbours[i],
        p = graph.positions;
      const next =
        current.distance +
        Math.hypot(
          p[node * 2] - p[current.node * 2],
          p[node * 2 + 1] - p[current.node * 2 + 1]
        );
      if (next < distance[node]) {
        distance[node] = next;
        push({ node, distance: distance[node] });
      }
    }
  }
  return distance;
}
export function makePulseField(graph: SignalGraph): PulseField {
  const count = graph.positions.length / 2,
    distances = new Float32Array(count * 4),
    origins = new Float32Array(8),
    edges: number[] = [];
  SOURCE_POINTS.forEach(([x, y], source) => {
    let nearest = 0,
      best = Infinity;
    for (let i = 0; i < count; i++) {
      const d =
        (graph.positions[i * 2] - x) ** 2 +
        (graph.positions[i * 2 + 1] - y) ** 2;
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    origins[source * 2] = graph.positions[nearest * 2];
    origins[source * 2 + 1] = graph.positions[nearest * 2 + 1];
    const field = graphDistances(graph, nearest);
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(field[i]))
        throw new Error(`Disconnected filament component at vertex ${i}.`);
      distances[i * 4 + source] = field[i];
    }
  });
  for (let i = 0; i < count; i++)
    for (let j = graph.offsets[i]; j < graph.offsets[i + 1]; j++) {
      const n = graph.neighbours[j];
      if (i < n) edges.push(i, n);
    }
  return {
    positions: graph.positions,
    edges: new Uint32Array(edges),
    distances,
    origins,
  };
}
export function encodePulseField(field: PulseField): ArrayBuffer {
  const header = new Uint32Array([
    0x50554c53,
    1,
    field.positions.length / 2,
    field.edges.length / 2,
  ]);
  const bytes = new Uint8Array(
    16 +
      32 +
      field.positions.byteLength +
      field.edges.byteLength +
      field.distances.byteLength
  );
  let offset = 0;
  for (const data of [
    header,
    field.origins,
    field.positions,
    field.edges,
    field.distances,
  ]) {
    bytes.set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      offset
    );
    offset += data.byteLength;
  }
  return bytes.buffer;
}
export function decodePulseField(buffer: ArrayBuffer): PulseField {
  if (buffer.byteLength < 48) throw new Error('Invalid pulse field.');
  const header = new Uint32Array(buffer, 0, 4),
    n = header[2],
    e = header[3];
  if (
    header[0] !== 0x50554c53 ||
    header[1] !== 1 ||
    n < 2 ||
    n > 100000 ||
    e > 1000000 ||
    buffer.byteLength !== 48 + n * 24 + e * 8
  )
    throw new Error('Invalid pulse field.');
  const origins = new Float32Array(buffer, 16, 8),
    positions = new Float32Array(buffer, 48, n * 2),
    edges = new Uint32Array(buffer, 48 + n * 8, e * 2),
    distances = new Float32Array(buffer, 48 + n * 8 + e * 8, n * 4);
  for (const values of [origins, positions, distances])
    for (const p of values)
      if (!Number.isFinite(p)) throw new Error('Invalid pulse coordinate.');
  for (const index of edges)
    if (index >= n) throw new Error('Invalid pulse link.');
  return { origins, positions, edges, distances };
}
