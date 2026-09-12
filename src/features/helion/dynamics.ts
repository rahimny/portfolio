import { cross, dot, normalise, type Cell, type Vec3 } from './model';
import { pursuitCurl, pursuitResponse, pursuitSpeed } from './pursuit';

export const SHELL_FREQUENCY = 7;
export const MISSILE_COUNT = 9;
export const TRAIL_LENGTH = 100;
export const FIXED_STEP = 1 / 120;
export const CONTACT_RADIUS = 2.12;
const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function nearestTile(direction: Vec3, cells: readonly Cell[]): number {
  let best = -Infinity,
    id = 0;
  for (let i = 0; i < cells.length; i++) {
    const score = dot(direction, cells[i].centre);
    if (score > best) {
      best = score;
      id = i;
    }
  }
  return id;
}
/** Earliest contact, so a high-speed step cannot tunnel through the shell. */
export function shellContact(from: Vec3, to: Vec3): Vec3 | null {
  const d = to.map((v, i) => v - from[i]) as Vec3;
  const a = dot(d, d),
    b = 2 * dot(from, d),
    c = dot(from, from) - CONTACT_RADIUS ** 2;
  if (c <= 0) return normalise(from);
  const discriminant = b * b - 4 * a * c;
  if (a < 1e-12 || discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1
    ? normalise(from.map((v, i) => v + d[i] * t) as Vec3)
    : null;
}
export interface Missile {
  position: Vec3;
  velocity: Vec3;
  target: number;
  age: number;
  cooldown: number;
  generation: number;
  active: boolean;
  automatic: boolean;
  power: number;
  history: Float32Array;
  cursor: number;
  samples: number;
}
export interface Contact {
  tile: number;
  direction: Vec3;
  strength: number;
}
export function createMissile(id: number, cells: readonly Cell[]): Missile {
  const missile: Missile = {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    target: 0,
    age: 0,
    cooldown: id < 4 ? id * 0.43 : Infinity,
    generation: 0,
    active: false,
    automatic: id < 4,
    power: 1,
    history: new Float32Array(TRAIL_LENGTH * 3),
    cursor: 0,
    samples: 0,
  };
  if (id < 4)
    launchMissile(
      missile,
      id,
      cells,
      Math.floor(random(id + 3) * cells.length)
    );
  return missile;
}
export function launchMissile(
  m: Missile,
  id: number,
  cells: readonly Cell[],
  tile: number,
  power = 1
): void {
  m.target = tile;
  m.age = 0;
  m.active = true;
  m.cooldown = 0;
  m.power = power;
  m.generation++;
  const n = cells[tile].centre;
  const tangent = normalise(
    cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
  );
  const bitangent = cross(n, tangent),
    angle = random(id * 17 + m.generation) * Math.PI * 2;
  const orbit = tangent.map(
    (v, i) => v * Math.cos(angle) + bitangent[i] * Math.sin(angle)
  ) as Vec3;
  m.position = n.map(
    (v, i) => v * (3.3 + random(id + 9) * 0.8) + orbit[i] * 3.4
  ) as Vec3;
  m.velocity = orbit.map(
    (v, i) => -v * 0.5 + bitangent[i] * (id % 2 ? 1 : -1) * 2.4
  ) as Vec3;
  m.cursor = 0;
  m.samples = 1;
  for (let i = 0; i < TRAIL_LENGTH; i++) m.history.set(m.position, i * 3);
}
export function stepMissile(
  m: Missile,
  id: number,
  cells: readonly Cell[],
  dt: number,
  focus: number | null
): Contact | null {
  if (!m.active) {
    m.cooldown -= dt;
    if (m.automatic && m.cooldown <= 0)
      launchMissile(
        m,
        id,
        cells,
        focus ?? Math.floor(random(id * 37 + m.generation * 23) * cells.length)
      );
    return null;
  }
  m.age += dt;
  if (focus !== null && id < 2 && m.age < 1.1) m.target = focus;
  const target = cells[m.target].centre;
  const delta = target.map(
    (v, i) => v * CONTACT_RADIUS - m.position[i]
  ) as Vec3;
  const distance = Math.hypot(...delta),
    toward = normalise(delta);
  const tangent = normalise(
    cross(toward, [Math.sin(id + 1), 0.7, Math.cos(id + 2)])
  );
  const curl = pursuitCurl(m.age, distance, id);
  const speed = pursuitSpeed(m.age, m.power);
  for (let i = 0; i < 3; i++) {
    const desired = (toward[i] + tangent[i] * curl) * speed;
    m.velocity[i] += (desired - m.velocity[i]) * pursuitResponse(m.age, dt);
  }
  const next = m.position.map((v, i) => v + m.velocity[i] * dt) as Vec3;
  const contact = shellContact(m.position, next);
  m.position = next;
  m.cursor = (m.cursor + 1) % TRAIL_LENGTH;
  m.history.set(next, m.cursor * 3);
  m.samples = Math.min(TRAIL_LENGTH, m.samples + 1);
  if (contact) {
    m.active = false;
    m.cooldown = 0.3 + random(id + m.generation) * 0.7;
    const tile = nearestTile(contact, cells);
    return {
      tile,
      direction: cells[tile].centre,
      strength: 0.6 + m.power * 0.35,
    };
  }
  // A rare missed approach retires cleanly instead of orbiting indefinitely.
  if (m.age > 5 || Math.hypot(...next) > 12) {
    m.active = false;
    m.cooldown = 0.4;
  }
  return null;
}
export interface CameraResponse {
  offset: Vec3;
  velocity: Vec3;
  trauma: number;
}
export function kickCamera(
  camera: CameraResponse,
  direction: Vec3,
  strength: number
): void {
  const power = Math.min(2, Math.max(0, strength));
  for (let i = 0; i < 3; i++) camera.velocity[i] -= direction[i] * power * 0.42;
  camera.trauma = Math.min(0.8, camera.trauma + power * 0.22);
}
export function stepCamera(camera: CameraResponse, dt: number): void {
  // Substeps keep the spring stable during a slow frame.
  const steps = Math.max(1, Math.ceil(dt / FIXED_STEP)),
    h = dt / steps;
  for (let s = 0; s < steps; s++)
    for (let i = 0; i < 3; i++) {
      camera.velocity[i] +=
        (-110 * camera.offset[i] - 15 * camera.velocity[i]) * h;
      camera.offset[i] += camera.velocity[i] * h;
    }
  camera.trauma = Math.max(0, camera.trauma - dt * 1.5);
}

/** Shared rotating axis plus phase-separated slots form a braided pursuit field. */
export function stepSwarm(
  m: Missile,
  id: number,
  cells: readonly Cell[],
  dt: number,
  phase: number,
  radius: number,
  speed: number,
  focus: number | null
): void {
  if (!m.active) launchMissile(m, id, cells, focus ?? m.target);
  m.age = 0;
  if (focus !== null) m.target = focus;
  const angle = phase + id * Math.PI * 0.5;
  const braid = Math.sin(angle * 2 - phase * 0.35) * 0.35;
  const tilt = 0.6 + Math.sin(phase * 0.17) * 0.25;
  const x = Math.cos(angle) * (radius + braid);
  const y = Math.sin(angle) * (radius + braid);
  const goal: Vec3 = [
    x,
    y * Math.cos(tilt),
    y * Math.sin(tilt) + Math.sin(angle * 2 + phase) * 0.35,
  ];
  const tangent: Vec3 = [
    -Math.sin(angle) * radius * speed,
    Math.cos(angle) * radius * speed * Math.cos(tilt),
    Math.cos(angle) * radius * speed * Math.sin(tilt),
  ];
  for (let i = 0; i < 3; i++) {
    const desired = (goal[i] - m.position[i]) * 3.6 + tangent[i];
    m.velocity[i] += (desired - m.velocity[i]) * (1 - Math.exp(-dt * 5));
  }
  const velocity = Math.hypot(...m.velocity);
  if (velocity > 8) for (let i = 0; i < 3; i++) m.velocity[i] *= 8 / velocity;
  for (let i = 0; i < 3; i++) m.position[i] += m.velocity[i] * dt;
  const distance = Math.hypot(...m.position);
  // Orbit transitions cannot pass through the shell when slots change side.
  if (distance < 2.65)
    for (let i = 0; i < 3; i++)
      m.position[i] *= 2.65 / Math.max(0.001, distance);
  m.cursor = (m.cursor + 1) % TRAIL_LENGTH;
  m.history.set(m.position, m.cursor * 3);
  m.samples = Math.min(TRAIL_LENGTH, m.samples + 1);
}
