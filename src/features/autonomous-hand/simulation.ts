import { InteractionWorld } from '../scene-interactions/world';
import { v, length, sub, clamp, type Vec3 } from '../scene-interactions/math';
import { GESTURES, type ActorCommand } from './commands';
import { HandActor, type Personality } from './actor';
import { InkTarget, PuckTarget } from './materials';
export const STEP = 1 / 120;
export const MAX_TICKS = 120 * 60 * 30;
export type Input =
  | { kind: 'puck'; phase: 'begin' | 'move' | 'end'; x: number; y: number }
  | { kind: 'command'; command: ActorCommand }
  | { kind: 'auto'; value: boolean }
  | { kind: 'personality'; value: Personality };
export interface Tape {
  version: 5;
  seed: number;
  ticks: number;
  inputs: { tick: number; input: Input }[];
}
export class HandSimulation {
  readonly world = new InteractionWorld();
  readonly actor: HandActor;
  readonly ink = new InkTarget();
  readonly puck = new PuckTarget();
  readonly tape: Tape;
  tick = 0;
  paused = false;
  private accumulator = 0;
  private disposed = false;
  private dragOrigin: Vec3 = v();
  private disturbed = false;
  private inputCount = 0;
  constructor(seed = 15926) {
    this.actor = new HandActor(this.world, seed);
    this.world.register(this.ink);
    this.world.register(this.puck);
    this.tape = { version: 5, seed, ticks: 0, inputs: [] };
  }
  input(input: Input, record = true): string {
    if (this.disposed) return 'unavailable';
    if (this.tick >= MAX_TICKS)
      return 'Recording limit reached. Reset to continue.';
    if (record && this.tape.inputs.length >= 12000)
      return 'Recording limit reached. Save the record and reset.';
    let result = 'accepted';
    if (input.kind === 'puck') {
      if (![input.x, input.y].every(Number.isFinite))
        return 'Invalid puck position';
      const point = v(
        clamp(input.x, -3.15, 3.15),
        clamp(input.y, -1.7, 1.6),
        0
      );
      if (input.phase === 'begin') {
        if (this.puck.heldBy === 'visitor') return 'busy';
        if (this.actor.command?.action === 'return')
          this.actor.cancel('interrupted');
        this.dragOrigin = { ...this.puck.position };
        this.disturbed = false;
        this.puck.cancelReturn();
        this.puck.heldBy = 'visitor';
        this.puck.velocity = v();
      } else if (this.puck.heldBy !== 'visitor') return 'unavailable';
      if (input.phase !== 'begin') {
        this.puck.move(point);
        if (!this.disturbed && length(sub(point, this.dragOrigin)) > 0.12) {
          this.disturbed = true;
          this.actor.disturb();
        }
      }
      if (input.phase === 'end') {
        if (this.disturbed) this.puck.stamp(0.5 + this.actor.agitation * 0.25);
        this.puck.release();
      }
    }
    if (input.kind === 'command') result = this.actor.request(input.command);
    if (input.kind === 'auto') this.actor.automatic = input.value;
    if (input.kind === 'personality') this.actor.setPersonality(input.value);
    if (result === 'accepted') {
      this.inputCount++;
      if (record)
        this.tape.inputs.push({
          tick: this.tick,
          input: structuredClone(input),
        });
      if (this.inputCount === 12000) this.puck.release();
    }
    return result;
  }
  step(): void {
    if (this.disposed || this.paused || this.tick >= MAX_TICKS) return;
    this.actor.step(STEP);
    this.world.step(STEP, this.actor.time);
    if (this.inputCount >= 12000) this.puck.release();
    this.ink.step(STEP);
    this.puck.step(STEP);
    this.tick++;
    this.tape.ticks = this.tick;
    if (this.tick >= MAX_TICKS) this.paused = true;
  }
  advance(dt: number): void {
    if (this.paused || this.disposed || !Number.isFinite(dt)) return;
    this.accumulator += Math.max(0, Math.min(0.1, dt));
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count++ < 12) {
      this.step();
      this.accumulator -= STEP;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.actor.dispose();
    this.puck.release();
    this.world.dispose();
  }
}
export function parseTape(raw: unknown): Tape {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('Choose a hand performance JSON file.');
  const tape = raw as Tape;
  if (
    'version' in raw &&
    (raw.version === 1 ||
      raw.version === 2 ||
      raw.version === 3 ||
      raw.version === 4)
  )
    throw new Error(
      'This record uses the earlier motion model. Save a new performance with the updated hand.'
    );
  if (
    tape.version !== 5 ||
    !Number.isInteger(tape.seed) ||
    tape.seed < 1 ||
    tape.seed > 2147483647 ||
    !Number.isInteger(tape.ticks) ||
    tape.ticks < 0 ||
    tape.ticks > MAX_TICKS ||
    !Array.isArray(tape.inputs) ||
    tape.inputs.length > 12000
  )
    throw new Error('Invalid or oversized performance.');
  let previous = -1;
  let dragging = false;
  for (const entry of tape.inputs) {
    if (
      !entry ||
      !Number.isInteger(entry.tick) ||
      entry.tick < previous ||
      entry.tick > tape.ticks ||
      entry.tick < 0
    )
      throw new Error('Invalid performance timing.');
    previous = entry.tick;
    const i = entry.input;
    if (
      !i ||
      !(
        (i.kind === 'puck' &&
          ['begin', 'move', 'end'].includes(i.phase) &&
          [i.x, i.y].every(Number.isFinite) &&
          Math.abs(i.x) <= 3.15 &&
          i.y >= -1.7 &&
          i.y <= 1.6) ||
        (i.kind === 'auto' && typeof i.value === 'boolean') ||
        (i.kind === 'personality' &&
          ['deliberate', 'erratic'].includes(i.value)) ||
        (i.kind === 'command' &&
          i.command &&
          typeof i.command.id === 'string' &&
          i.command.id.length <= 100 &&
          GESTURES.some((g) => g.value === i.command.action) &&
          ['ink', 'puck'].includes(i.command.targetId))
      )
    )
      throw new Error('Invalid performance command.');
    if (i.kind === 'puck') {
      if (i.phase === 'begin' ? dragging : !dragging)
        throw new Error('Invalid puck drag sequence.');
      dragging = i.phase !== 'end';
    }
  }
  if (dragging)
    throw new Error('This record ends with an unfinished puck drag.');
  return structuredClone(tape);
}
