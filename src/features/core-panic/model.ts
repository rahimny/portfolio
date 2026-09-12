import { pursuitCurl, pursuitResponse } from '../helion/pursuit';

export const STEP = 1 / 120;
export const KNOT_COUNT = 5;
export const SHOT_COOLDOWN = 0.18;
export const MAX_CHARGE = 1.28;
export const FOLLOWUP_WINDOW = 2.4;
export type Phase = 'idle' | 'playing' | 'paused' | 'over';
export type Vec3 = [number, number, number];
export interface Knot {
  slot: number;
  generation: number;
  state: 'active' | 'targeted' | 'collapsing' | 'empty';
  born: number;
  lifetime: number;
  resolved: number;
  link: number;
  position: Vec3;
  exposedUntil: number;
  pull: Vec3;
  wounded: boolean;
}
export interface Missile {
  active: boolean;
  target: number;
  generation: number;
  age: number;
  phase: number;
  position: Vec3;
  previous: Vec3;
  velocity: Vec3;
  destination: Vec3;
  leader: boolean;
  penetrates: boolean;
  required: number;
  power: number;
}
export interface GameEvent {
  type: 'shot' | 'hit' | 'chain' | 'rupture' | 'breach' | 'blocked' | 'graze';
  position: Vec3;
  points: number;
  power: number;
}
export interface Game {
  phase: Phase;
  time: number;
  pressure: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  ruptures: number;
  shots: number;
  cooldown: number;
  nextSpawn: number;
  serial: number;
  selected: number;
  accumulator: number;
  gathering: boolean;
  charge: number;
  gatherAngle: number;
  blocked: number;
  followups: number;
  knots: Knot[];
  missiles: Missile[];
  events: GameEvent[];
}
export const growth = (game: Game, knot: Knot): number =>
  Math.min(1, Math.max(0, (game.time - knot.born) / knot.lifetime));
export const multiplier = (combo: number): number =>
  Math.min(5, 1 + Math.floor(combo / 4));
export const targetable = (knot: Knot): boolean => knot.state === 'active';

export const salvoSize = (game: Game): number =>
  Math.min(6, 2 + Math.floor((game.charge + 1e-8) / 0.32));
export function opening(game: Game, knot: Knot): number {
  if (knot.exposedUntil > game.time) return 1;
  const period = Math.max(2.9, 3.8 - game.time * 0.005);
  return Math.max(
    0,
    Math.sin((game.time / period + knot.slot * 0.17) * Math.PI * 2)
  );
}
export const isOpen = (game: Game, knot: Knot): boolean =>
  opening(game, knot) >= 0.65;
export function gatherPosition(game: Game, index: number): Vec3 {
  const a = game.gatherAngle + (index * Math.PI) / 3;
  const r = 2.03 + Math.sin(a * 2) * 0.05;
  return [
    Math.cos(a) * r,
    Math.sin(a) * r * 0.86,
    0.8 + Math.sin(a + 0.9) * 0.95,
  ];
}
export function beginGather(game: Game): boolean {
  if (game.phase !== 'playing' || game.gathering || game.cooldown > 0)
    return false;
  game.gathering = true;
  game.charge = 0;
  return true;
}
export function cancelGather(game: Game): void {
  game.gathering = false;
  game.charge = 0;
}
export function releaseGather(game: Game): boolean {
  if (!game.gathering) return false;
  const launched = fire(game, game.selected, salvoSize(game));
  cancelGather(game);
  return launched;
}

export function knotPosition(slot: number, time: number): Vec3 {
  const angle = (slot * Math.PI * 2) / KNOT_COUNT + time * 0.13 + 0.35;
  const radius = 0.9 + Math.sin(time * 0.23 + slot * 1.7) * 0.12;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return [x, y, Math.sqrt(1.82 * 1.82 - x * x - y * y)];
}
export function createGame(): Game {
  const game: Game = {
    phase: 'idle',
    time: 0,
    pressure: 12,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    ruptures: 0,
    shots: 0,
    cooldown: 0,
    nextSpawn: 1.7,
    serial: 0,
    selected: 0,
    accumulator: 0,
    gathering: false,
    charge: 0,
    gatherAngle: 0,
    blocked: 0,
    followups: 0,
    events: [],
    knots: Array.from({ length: KNOT_COUNT }, (_, slot) => ({
      slot,
      generation: 0,
      state: 'empty',
      born: 0,
      lifetime: 7,
      resolved: -100,
      link: -1,
      position: knotPosition(slot, 0),
      exposedUntil: -100,
      pull: [0, 0, 0],
      wounded: false,
    })),
    missiles: Array.from({ length: 18 }, () => ({
      active: false,
      target: -1,
      generation: -1,
      age: 0,
      phase: 0,
      position: [0, 0, 0],
      previous: [0, 0, 0],
      velocity: [0, 0, 0],
      destination: [0, 0, 0],
      leader: false,
      penetrates: false,
      required: 2,
      power: 0,
    })),
  };
  for (const slot of [0, 2, 3]) spawn(game, game.knots[slot]);
  game.knots.forEach((knot) => {
    knot.link = -1;
  });
  game.knots[0].born = -3.8;
  game.knots[2].born = -1.8;
  game.knots[0].link = 2;
  game.knots[2].link = 0;
  return game;
}
export function startGame(game: Game): void {
  Object.assign(game, createGame(), { phase: 'playing' });
}
function spawn(game: Game, knot: Knot): void {
  knot.generation = ++game.serial;
  knot.state = 'active';
  knot.born = game.time;
  knot.lifetime = Math.max(3.2, 7 - game.time * 0.028);
  knot.link = -1;
  knot.exposedUntil = -100;
  knot.pull = [0, 0, 0];
  knot.wounded = false;
  knot.position = knotPosition(knot.slot, game.time);
  if (game.serial % 3 === 0) {
    const other = game.knots.find(
      (k) => k !== knot && targetable(k) && k.link === -1
    );
    if (other) {
      knot.link = other.slot;
      other.link = knot.slot;
    }
  }
}
function unlink(game: Game, knot: Knot): void {
  const other = game.knots[knot.link];
  if (other?.link === knot.slot) other.link = -1;
  knot.link = -1;
}
export function selectKnot(game: Game, direction: number): void {
  for (let i = 1; i <= KNOT_COUNT; i++) {
    const slot = (game.selected + direction * i + KNOT_COUNT * 2) % KNOT_COUNT;
    if (targetable(game.knots[slot])) {
      game.selected = slot;
      return;
    }
  }
}
export function nearestKnot(
  game: Game,
  x: number,
  y: number,
  reach = 0.42
): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  let distance = reach,
    selected = -1;
  for (const knot of game.knots) {
    if (!targetable(knot)) continue;
    const d = Math.hypot(knot.position[0] - x, knot.position[1] - y);
    if (d < distance) {
      distance = d;
      selected = knot.slot;
    }
  }
  return selected;
}
export function fire(game: Game, slot = game.selected, count = 2): boolean {
  const knot = game.knots[slot];
  if (
    game.phase !== 'playing' ||
    game.cooldown > 0 ||
    !knot ||
    !targetable(knot) ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 6
  )
    return false;
  const available = game.missiles.filter((m) => !m.active).slice(0, count);
  if (available.length !== count) return false;
  game.selected = slot;
  game.shots++;
  game.cooldown = SHOT_COOLDOWN;
  knot.state = 'targeted';
  const penetrates = isOpen(game, knot);
  available.forEach((m, i) => {
    const orbit = gatherPosition(game, i);
    const a = game.gatherAngle + (i * Math.PI) / 3;
    Object.assign(m, {
      active: true,
      target: slot,
      generation: knot.generation,
      age: -i * 0.055,
      phase: i * 2.1 + game.shots * 0.7,
      leader: i === 0,
      penetrates,
      required: growth(game, knot) >= 0.65 && !knot.wounded ? 4 : 2,
      power: count,
      position: [...orbit],
      previous: [...orbit],
      velocity: [-Math.sin(a) * 5, Math.cos(a) * 4, -0.3],
      destination: [...knot.position],
    });
  });
  game.events.push({
    type: 'shot',
    position: [...knot.position],
    points: 0,
    power: count / 6,
  });
  return true;
}
function collapse(game: Game, knot: Knot, chained = false, power = 2): void {
  if (knot.state !== 'active' && knot.state !== 'targeted') return;
  const partner = game.knots[knot.link];
  const ripe = growth(game, knot) >= 0.55;
  knot.state = 'collapsing';
  knot.resolved = game.time;
  unlink(game, knot);
  if (knot.exposedUntil > game.time && !chained) game.followups++;
  game.hits++;
  game.combo++;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const points =
    (ripe ? 200 : 100) * multiplier(game.combo) * (chained ? 2 : 1);
  game.score += points;
  game.pressure = Math.max(0, game.pressure - (chained ? 10 : 6));
  game.events.push({
    type: chained ? 'chain' : 'hit',
    position: [...knot.position],
    points,
    power: ripe || chained ? 1 : 0.7,
  });
  for (const other of game.knots) {
    if (!targetable(other)) continue;
    const distance = Math.hypot(
      ...other.position.map((v, i) => v - knot.position[i])
    );
    if (distance < 1.5) {
      other.exposedUntil = game.time + FOLLOWUP_WINDOW;
      other.pull = other.position.map(
        (v, i) => (knot.position[i] - v) * 0.26
      ) as Vec3;
    }
  }
  if (ripe && power >= 4 && !chained && partner && targetable(partner))
    collapse(game, partner, true, power);
}
function step(game: Game): void {
  game.time += STEP;
  game.cooldown = Math.max(0, game.cooldown - STEP);
  if (game.gathering) game.charge = Math.min(MAX_CHARGE, game.charge + STEP);
  game.gatherAngle += STEP * (2.2 + game.charge * 1.2);
  for (const knot of game.knots) {
    if (knot.state === 'active' || knot.state === 'targeted') {
      const remaining =
        Math.max(0, knot.exposedUntil - game.time) / FOLLOWUP_WINDOW;
      const pull = Math.sin(remaining * Math.PI);
      knot.position = knotPosition(knot.slot, game.time).map(
        (v, i) => v + knot.pull[i] * pull
      ) as Vec3;
    }
    if (knot.state === 'collapsing' && game.time - knot.resolved > 1.1)
      knot.state = 'empty';
  }
  // Reuse Helion's damped pursuit and decaying curl. The committed slot and
  // generation prevent a late missile from hitting a newly spawned knot.
  for (const m of game.missiles) {
    if (!m.active) continue;
    m.age += STEP;
    if (m.age < 0) continue;
    const knot = game.knots[m.target];
    if (knot.generation === m.generation && knot.state === 'targeted')
      m.destination = [...knot.position];
    const d = m.destination.map((v, i) => v - m.position[i]) as Vec3;
    const length = Math.hypot(...d);
    const curl =
      pursuitCurl(m.age, length, m.phase) * (m.age < 0.45 ? 1.7 : 0.35);
    const speed = 7.5 + m.age * 5;
    const response = pursuitResponse(m.age + 1.8, STEP);
    for (let i = 0; i < 3; i++) {
      const tangent =
        i === 0 ? -d[1] : i === 1 ? d[0] : Math.sin(m.phase) * length * 0.25;
      const desired =
        ((d[i] + tangent * curl) / Math.max(0.001, length)) * speed;
      m.velocity[i] += (desired - m.velocity[i]) * response;
      m.previous[i] = m.position[i];
      m.position[i] += m.velocity[i] * STEP;
      if (m.age > 0.65)
        m.position[i] +=
          (m.destination[i] - m.position[i]) * (1 - Math.exp(-STEP * 15));
    }
    const segment = m.position.map((v, i) => v - m.previous[i]);
    const segmentLength = segment.reduce((s, v) => s + v * v, 0);
    const projection = Math.max(
      0,
      Math.min(
        1,
        m.destination.reduce(
          (s, v, i) => s + (v - m.previous[i]) * segment[i],
          0
        ) / Math.max(1e-8, segmentLength)
      )
    );
    const separation = Math.hypot(
      ...m.destination.map(
        (v, i) => v - m.previous[i] - projection * segment[i]
      )
    );
    if (separation < 0.19) {
      m.active = false;
      if (
        m.leader &&
        knot.generation === m.generation &&
        knot.state === 'targeted'
      ) {
        if (!m.penetrates) {
          knot.state = 'active';
          game.blocked++;
          game.combo = 0;
          game.pressure = Math.min(100, game.pressure + 7);
          game.events.push({
            type: 'blocked',
            position: [...knot.position],
            points: 0,
            power: 0.25,
          });
        } else if (m.power < m.required && !knot.wounded) {
          knot.state = 'active';
          knot.wounded = true;
          knot.exposedUntil = game.time + FOLLOWUP_WINDOW;
          game.events.push({
            type: 'graze',
            position: [...knot.position],
            points: 0,
            power: 0.4,
          });
        } else collapse(game, knot, false, m.power);
      }
    }
  }
  for (const knot of game.knots) {
    if (knot.state !== 'active' && knot.state !== 'targeted') continue;
    game.pressure += STEP * (0.1 + growth(game, knot) * 0.32);
    if (growth(game, knot) >= 1) {
      knot.state = 'collapsing';
      knot.resolved = game.time;
      unlink(game, knot);
      game.ruptures++;
      game.combo = 0;
      game.pressure = Math.min(100, game.pressure + 23);
      game.events.push({
        type: 'rupture',
        position: [...knot.position],
        points: 0,
        power: 1,
      });
    }
  }
  if (game.time >= game.nextSpawn) {
    const empty = game.knots.find((k) => k.state === 'empty');
    if (empty) spawn(game, empty);
    game.nextSpawn = game.time + Math.max(0.55, 1.8 - game.time * 0.012);
  }
  if (game.pressure >= 100) {
    game.pressure = 100;
    game.phase = 'over';
    cancelGather(game);
    game.events.push({
      type: 'breach',
      position: [0, 0, 0],
      points: 0,
      power: 1,
    });
  }
}
export function advanceGame(game: Game, elapsed: number): void {
  if (game.phase !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0)
    return;
  game.accumulator += Math.min(0.1, elapsed);
  while (game.accumulator + 1e-9 >= STEP && game.phase === 'playing') {
    game.accumulator -= STEP;
    step(game);
  }
}
