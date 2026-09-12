/** Area-weighted smooth normals, directly into the persistent GPU attribute array. */
export function updateNormals(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
  normals: Float32Array
) {
  normals.fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = positions[c] - positions[b],
      uy = positions[c + 1] - positions[b + 1],
      uz = positions[c + 2] - positions[b + 2];
    const vx = positions[a] - positions[b],
      vy = positions[a + 1] - positions[b + 1],
      vz = positions[a + 2] - positions[b + 2];
    const x = uy * vz - uz * vy,
      y = uz * vx - ux * vz,
      z = ux * vy - uy * vx;
    normals[a] += x;
    normals[a + 1] += y;
    normals[a + 2] += z;
    normals[b] += x;
    normals[b + 1] += y;
    normals[b + 2] += z;
    normals[c] += x;
    normals[c + 1] += y;
    normals[c + 2] += z;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length =
      Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2) ||
      1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
}
