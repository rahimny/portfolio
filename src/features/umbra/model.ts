export const SIZE = 36;
export const CELLS = SIZE ** 3;
export const VERSION = 'umbra-cpu-1';
export type Light = { azimuth: number; elevation: number };
export interface Field {
  seed: number;
  tick: number;
  light: Light;
  matter: Uint8Array;
  substrate: Uint8Array;
  age: Uint16Array;
  persistence: Int16Array;
  resource: Uint8Array;
}
export const index = (x: number, y: number, z: number) =>
  x + SIZE * (y + SIZE * z);
export function noise(seed: number, i: number) {
  let h = Math.imul(seed ^ i, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function direction(light: Light): [number, number, number] {
  const a = (light.azimuth * Math.PI) / 180;
  const e = (light.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}
export function createField(seed = 1, mature = true): Field {
  const field: Field = {
    seed,
    tick: 0,
    light: { azimuth: -22, elevation: 22 },
    matter: new Uint8Array(CELLS),
    substrate: new Uint8Array(CELLS),
    age: new Uint16Array(CELLS),
    persistence: new Int16Array(CELLS),
    resource: new Uint8Array(CELLS),
  };
  const width = 10 + noise(seed, 2) * 3;
  const height = 10 + noise(seed, 3) * 3;
  const depth = 8 + noise(seed, 4) * 5;
  const lean = (noise(seed, 5) - 0.5) * 0.45;
  for (let z = 2; z < SIZE - 2; z++)
    for (let y = 2; y < SIZE - 2; y++)
      for (let x = 2; x < SIZE - 2; x++) {
        const i = index(x, y, z);
        const pz = z - SIZE / 2;
        const px = x - SIZE / 2 - pz * lean;
        const py = y - SIZE / 2;
        const angle = Math.atan2(py / height, px / width);
        const ripple = Math.sin(angle * 3 + seed + pz * 0.12) * 0.065;
        const radius = Math.hypot(px / width, py / height);
        const rib =
          0.5 +
          0.5 * Math.cos(pz * (1.05 + noise(seed, 7) * 0.2) + angle * 0.65);
        const outer = 0.88 + rib * 0.15 + ripple;
        const inner = 0.58 + ripple + 0.07 * Math.sin(pz * 0.3 + seed);
        const within = Math.abs(pz) < depth && radius < outer && radius > inner;
        // Seeded ribs are the substrate, not a claim that accretion alone makes architecture.
        if (within && (rib > 0.48 || radius > outer - 0.08)) {
          field.matter[i] = 1;
          field.substrate[i] = 1;
          field.age[i] = 120;
        }
        field.resource[i] = 1 + Math.floor(noise(seed, i + 90) * 3);
      }
  if (mature) for (let t = 0; t < 24; t++) step(field);
  return field;
}
export function sheltered(
  matter: Uint8Array,
  x: number,
  y: number,
  z: number,
  light: Light
): boolean {
  const d = direction(light);
  // Start beyond the queried cell; march in world space, independent of the camera.
  for (let t = 1.15; t < SIZE * 1.8; t += 0.55) {
    const px = Math.round(x + d[0] * t),
      py = Math.round(y + d[1] * t),
      pz = Math.round(z + d[2] * t);
    if (px < 0 || py < 0 || pz < 0 || px >= SIZE || py >= SIZE || pz >= SIZE)
      return false;
    if (matter[index(px, py, pz)]) return true;
  }
  return false;
}
export function step(field: Field) {
  const current = field.matter;
  const next = current.slice();
  let grown = 0,
    eroded = 0;
  for (let z = 2; z < SIZE - 2; z++)
    for (let y = 2; y < SIZE - 2; y++)
      for (let x = 2; x < SIZE - 2; x++) {
        const i = index(x, y, z);
        const neighbours =
          current[i - 1] +
          current[i + 1] +
          current[i - SIZE] +
          current[i + SIZE] +
          current[i - SIZE * SIZE] +
          current[i + SIZE * SIZE];
        if (current[i]) field.age[i] = Math.min(65535, field.age[i] + 1);
        if (neighbours === 0 || neighbours === 6) {
          field.persistence[i] = 0;
          continue;
        }
        const shade = sheltered(current, x, y, z, field.light);
        const before = field.persistence[i];
        field.persistence[i] = shade
          ? Math.min(120, Math.max(0, before) + 1)
          : Math.max(-120, Math.min(0, before) - 1);
        const chance = noise(field.seed + field.tick * 719, i);
        // Competition and finite per-cell resource keep the frontier sparse and bounded.
        const ribPreference =
          0.45 + 0.55 * Math.pow(Math.cos((z - SIZE / 2) * 0.9), 2);
        if (
          !current[i] &&
          neighbours >= 2 &&
          neighbours <= 4 &&
          shade &&
          field.persistence[i] >= 4 &&
          field.resource[i] &&
          chance < 0.055 * ribPreference
        ) {
          next[i] = 1;
          field.resource[i]--;
          field.age[i] = 0;
          field.persistence[i] = 0;
          grown++;
        } else if (
          current[i] &&
          !field.substrate[i] &&
          !shade &&
          field.persistence[i] <= -16 &&
          chance < 0.13
        ) {
          next[i] = 0;
          field.age[i] = 0;
          field.persistence[i] = 0;
          eroded++;
        }
      }
  field.matter = next;
  field.tick++;
  return { grown, eroded };
}
export function snapshot(field: Field) {
  return {
    version: VERSION,
    size: SIZE,
    seed: field.seed,
    tick: field.tick,
    light: { ...field.light },
    matter: Array.from(field.matter),
    substrate: Array.from(field.substrate),
    age: Array.from(field.age),
    persistence: Array.from(field.persistence),
    resource: Array.from(field.resource),
  };
}
export function restore(value: unknown): Field {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid UMBRA state.');
  const v = value as Record<string, unknown>;
  if (
    v.version !== VERSION ||
    v.size !== SIZE ||
    !Number.isInteger(v.seed) ||
    Number(v.seed) < 1 ||
    Number(v.seed) > 999999 ||
    !Number.isSafeInteger(v.tick) ||
    Number(v.tick) < 0
  )
    throw new Error('Unsupported UMBRA state.');
  const light = v.light as Light | undefined;
  if (
    !light ||
    !Number.isFinite(light.azimuth) ||
    Math.abs(light.azimuth) > 180 ||
    !Number.isFinite(light.elevation) ||
    light.elevation < 5 ||
    light.elevation > 85
  )
    throw new Error('Invalid light settings.');
  for (const [key, low, high] of [
    ['matter', 0, 1],
    ['substrate', 0, 1],
    ['age', 0, 65535],
    ['persistence', -120, 120],
    ['resource', 0, 3],
  ] as const) {
    const values = v[key];
    if (
      !Array.isArray(values) ||
      values.length !== CELLS ||
      values.some((n) => !Number.isInteger(n) || n < low || n > high)
    )
      throw new Error(`Invalid ${key} field.`);
  }
  const field: Field = {
    seed: Number(v.seed),
    tick: Number(v.tick),
    light: { ...light },
    matter: new Uint8Array(v.matter as number[]),
    substrate: new Uint8Array(v.substrate as number[]),
    age: new Uint16Array(v.age as number[]),
    persistence: new Int16Array(v.persistence as number[]),
    resource: new Uint8Array(v.resource as number[]),
  };
  for (let i = 0; i < CELLS; i++)
    if (field.substrate[i] && !field.matter[i])
      throw new Error('Missing substrate.');
  return field;
}
