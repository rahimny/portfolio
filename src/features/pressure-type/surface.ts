import type { MembraneMesh } from './mesh';

/** One precomputed Loop subdivision stencil; the low-resolution solver stays independent. */
export class MembraneSurface {
  readonly positions: Float32Array;
  readonly triangles: Uint16Array;
  private readonly sourceCount: number;
  private readonly polish: boolean;
  private readonly filtered: Float32Array;
  private readonly scratch: Float32Array;
  private readonly offsets: Uint32Array;
  private readonly sources: Uint16Array;
  private readonly weights: Float32Array;

  constructor(
    mesh: Pick<MembraneMesh, 'positions' | 'triangles'>,
    polish = false
  ) {
    const count = mesh.positions.length / 3;
    this.sourceCount = count;
    this.polish = polish;
    this.filtered = new Float32Array(mesh.positions.length);
    this.scratch = new Float32Array(mesh.positions.length);
    const neighbours = Array.from({ length: count }, () => new Set<number>());
    const edges = new Map<
      string,
      { a: number; b: number; opposite: number[]; index: number }
    >();
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      for (let j = 0; j < 3; j++) {
        const a = mesh.triangles[t + j],
          b = mesh.triangles[t + ((j + 1) % 3)];
        const c = mesh.triangles[t + ((j + 2) % 3)];
        neighbours[a].add(b);
        neighbours[b].add(a);
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        let edge = edges.get(key);
        if (!edge) {
          edge = { a, b, opposite: [], index: count + edges.size };
          edges.set(key, edge);
        }
        edge.opposite.push(c);
      }
    }
    if (count + edges.size > 65535)
      throw new Error('Surface exceeds subdivision budget');
    const sources: number[] = [],
      weights: number[] = [],
      offsets = [0];
    for (let i = 0; i < count; i++) {
      const n = neighbours[i].size;
      const beta = (5 / 8 - (3 / 8 + Math.cos((2 * Math.PI) / n) / 4) ** 2) / n;
      sources.push(i);
      weights.push(1 - n * beta);
      for (const neighbour of neighbours[i]) {
        sources.push(neighbour);
        weights.push(beta);
      }
      offsets.push(sources.length);
    }
    for (const edge of edges.values()) {
      if (edge.opposite.length !== 2)
        throw new Error('Subdivision requires a closed membrane');
      sources.push(edge.a, edge.b, ...edge.opposite);
      weights.push(3 / 8, 3 / 8, 1 / 8, 1 / 8);
      offsets.push(sources.length);
    }
    const midpoint = (a: number, b: number) =>
      edges.get(`${Math.min(a, b)}:${Math.max(a, b)}`)!.index;
    const triangles: number[] = [];
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const a = mesh.triangles[t],
        b = mesh.triangles[t + 1],
        c = mesh.triangles[t + 2];
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    this.positions = new Float32Array((count + edges.size) * 3);
    this.triangles = new Uint16Array(triangles);
    this.offsets = new Uint32Array(offsets);
    this.sources = new Uint16Array(sources);
    this.weights = new Float32Array(weights);
    this.update(mesh.positions);
  }

  update(coarse: Float32Array) {
    if (this.polish) {
      let input = coarse;
      for (let pass = 0; pass < 7; pass++) {
        const output = pass % 2 ? this.scratch : this.filtered;
        for (let v = 0; v < this.sourceCount; v++) {
          let x = 0,
            y = 0,
            z = 0;
          for (let s = this.offsets[v]; s < this.offsets[v + 1]; s++) {
            const n = this.sources[s] * 3,
              weight = this.weights[s];
            x += input[n] * weight;
            y += input[n + 1] * weight;
            z += input[n + 2] * weight;
          }
          output[v * 3] = x;
          output[v * 3 + 1] = y;
          output[v * 3 + 2] = z;
        }
        input = output;
      }
      coarse = this.filtered;
    }
    for (let v = 0; v < this.offsets.length - 1; v++) {
      let x = 0,
        y = 0,
        z = 0;
      for (let s = this.offsets[v]; s < this.offsets[v + 1]; s++) {
        const source = this.sources[s] * 3,
          weight = this.weights[s];
        x += coarse[source] * weight;
        y += coarse[source + 1] * weight;
        z += coarse[source + 2] * weight;
      }
      this.positions[v * 3] = x;
      this.positions[v * 3 + 1] = y;
      this.positions[v * 3 + 2] = z;
    }
  }
}
