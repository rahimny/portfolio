export interface MembraneMesh {
  positions: Float32Array;
  triangles: Uint16Array;
  edges: Uint16Array;
  restLengths: Float32Array;
}

/** A closed, two-sided membrane made from a small binary glyph mask. */
export function membraneFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  cell: number
): MembraneMesh {
  if (width < 1 || height < 1 || mask.length !== width * height)
    throw new Error('Invalid membrane mask');
  const vertices = new Map<number, number>();
  const xy: number[] = [];
  const faces: number[] = [];
  const vertex = (x: number, y: number) => {
    const key = y * (width + 1) + x;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const index = xy.length / 2;
    vertices.set(key, index);
    xy.push((x - width / 2) * cell, (height / 2 - y) * cell);
    return index;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const a = vertex(x, y),
        b = vertex(x + 1, y);
      const c = vertex(x + 1, y + 1),
        d = vertex(x, y + 1);
      // Alternating diagonals avoid giving the whole word one shear direction.
      if ((x + y) % 2) faces.push(a, d, b, b, d, c);
      else faces.push(a, d, c, a, c, b);
    }
  }
  const count = xy.length / 2;
  if (!count || count * 2 > 65535)
    throw new Error('Membrane exceeds vertex budget');
  const boundary = new Map<string, [number, number]>();
  for (let i = 0; i < faces.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = faces[i + j],
        b = faces[i + ((j + 1) % 3)];
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, [a, b]);
    }
  }
  const neighbours = new Map<number, number[]>();
  for (const [a, b] of boundary.values()) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }
  // Remove raster stair steps once at construction, never in the physics loop.
  for (let pass = 0; pass < 4; pass++) {
    const copy = xy.slice();
    for (const [a, adjacent] of neighbours) {
      if (adjacent.length !== 2)
        throw new Error('Glyph boundary is not manifold');
      for (let axis = 0; axis < 2; axis++)
        xy[a * 2 + axis] =
          copy[a * 2 + axis] * 0.5 +
          (copy[adjacent[0] * 2 + axis] + copy[adjacent[1] * 2 + axis]) * 0.25;
    }
  }
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    for (let side = 0; side < 2; side++) {
      const at = (i + side * count) * 3;
      positions[at] = xy[i * 2];
      positions[at + 1] = xy[i * 2 + 1];
      positions[at + 2] = side === 0 ? 0.018 : -0.018;
    }
  }
  const triangles = faces.slice();
  for (let i = 0; i < faces.length; i += 3)
    triangles.push(
      faces[i] + count,
      faces[i + 2] + count,
      faces[i + 1] + count
    );
  for (const [a, b] of boundary.values())
    triangles.push(b, a, a + count, b, a + count, b + count);
  const edges: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < triangles.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = triangles[i + j],
        b = triangles[i + ((j + 1) % 3)];
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(a, b);
    }
  }
  const restLengths = new Float32Array(edges.length / 2);
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i] * 3,
      b = edges[i + 1] * 3;
    restLengths[i / 2] = Math.hypot(
      positions[a] - positions[b],
      positions[a + 1] - positions[b + 1],
      positions[a + 2] - positions[b + 2]
    );
  }
  return {
    positions,
    triangles: new Uint16Array(triangles),
    edges: new Uint16Array(edges),
    restLengths,
  };
}

export function signedVolume(
  positions: Float32Array,
  triangles: Uint16Array
): number {
  let volume = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3,
      b = triangles[i + 1] * 3,
      c = triangles[i + 2] * 3;
    volume +=
      positions[a] *
        (positions[b + 1] * positions[c + 2] -
          positions[b + 2] * positions[c + 1]) +
      positions[a + 1] *
        (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
      positions[a + 2] *
        (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return volume / 6;
}
