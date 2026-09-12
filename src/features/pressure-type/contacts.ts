import type { PressureBody } from './model';

export const CONTACT_DISTANCE = 0.06;

/** Three-body broad phase followed by pruned surface-point contacts in world space. */
export function separateLetters(
  bodies: readonly PressureBody[],
  bounds: Float32Array,
  worldSpace = false
): number {
  for (let b = 0; b < bodies.length; b++) {
    const p = worldSpace ? bodies[b].worldPositions : bodies[b].positions;
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      low = Math.min(low, p[i]);
      high = Math.max(high, p[i]);
    }
    bounds[b * 2] = low;
    bounds[b * 2 + 1] = high;
  }
  let contacts = 0;
  const radius2 = CONTACT_DISTANCE * CONTACT_DISTANCE;
  for (let a = 0; a < bodies.length - 1; a++) {
    if (bodies[a].burst.active) continue;
    for (let b = a + 1; b < bodies.length; b++) {
      if (
        bodies[b].burst.active ||
        bounds[a * 2 + 1] + CONTACT_DISTANCE < bounds[b * 2] ||
        bounds[b * 2 + 1] + CONTACT_DISTANCE < bounds[a * 2]
      )
        continue;
      const pa = worldSpace ? bodies[a].worldPositions : bodies[a].positions;
      const pb = worldSpace ? bodies[b].worldPositions : bodies[b].positions;
      for (let i = 0; i < pa.length; i += 3) {
        if (
          pa[i] + CONTACT_DISTANCE < bounds[b * 2] ||
          pa[i] - CONTACT_DISTANCE > bounds[b * 2 + 1]
        )
          continue;
        for (let j = 0; j < pb.length; j += 3) {
          const x = pb[j] - pa[i];
          if (Math.abs(x) >= CONTACT_DISTANCE) continue;
          const y = pb[j + 1] - pa[i + 1],
            z = pb[j + 2] - pa[i + 2];
          const d2 = x * x + y * y + z * z;
          if (d2 >= radius2) continue;
          const length = Math.sqrt(d2);
          const amount = Math.min(0.025, (CONTACT_DISTANCE - length) * 0.5);
          const nx = length > 1e-8 ? x / length : 1;
          const ny = length > 1e-8 ? y / length : 0;
          const nz = length > 1e-8 ? z / length : 0;
          pa[i] -= nx * amount;
          pb[j] += nx * amount;
          pa[i + 1] -= ny * amount;
          pb[j + 1] += ny * amount;
          pa[i + 2] -= nz * amount;
          pb[j + 2] += nz * amount;
          contacts++;
        }
      }
    }
  }
  return contacts;
}
