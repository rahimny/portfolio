import { pose, socket, aimHand, type HandPose } from '../autonomous-hand/rig';
import { PoseMotion, minimumJerk } from '../autonomous-hand/motion';
import { axis, v } from '../scene-interactions/math';
import type { InkPoint } from './inkContact';

export interface HandInk {
  aimAt(fraction: number, destination: InkPoint): boolean;
}

export interface HandProjectiles {
  fire(from: InkPoint, dx: number, dy: number): void;
  sendSeekers(target: InkPoint): boolean;
}

export const HAND_APPEAR = 2.25;
const FIRST_SHOT = HAND_APPEAR + 0.85;
const SHOT_COUNT = 9;
const shotTime = (index: number) =>
  FIRST_SHOT + Math.floor(index / 3) * 2.25 + (index % 3) * 0.3;
const DEPART = shotTime(SHOT_COUNT - 1) + 1.6;

interface Companion extends InkPoint {
  visible: boolean;
  size: number;
}

export function companionInRay(
  from: InkPoint,
  target: InkPoint,
  companion: Companion
) {
  if (!companion.visible) return false;
  const dx = target.x - from.x,
    dy = target.y - from.y;
  const length = dx * dx + dy * dy;
  if (length < 1) return false;
  const t =
    ((companion.x - from.x) * dx + (companion.y - from.y) * dy) / length;
  return (
    t > 0 &&
    t < 1 &&
    Math.hypot(companion.x - from.x - dx * t, companion.y - from.y - dy * t) <
      companion.size * 0.7
  );
}

/** One finite visit. All positions at the ink boundary are heading-local CSS px. */
export class MastheadHand {
  readonly motion = new PoseMotion(pose('open'));
  readonly target: InkPoint = { x: 0, y: 0 };
  readonly muzzle = { x: 0, y: 0, dx: 0, dy: 0, age: 10 };
  time = 0;
  shots = 0;
  waitingForCompanion = false;
  scale = 1;
  private width = 1;
  private height = 1;
  private acquired = -1;
  private cancelled = false;
  private sentSeekers = false;
  private readonly open = pose('open');
  private readonly gun = pose('gun');
  private readonly desired: HandPose = pose('open');
  private reactionOnly = false;
  private lastShot = -10;
  private readonly candidate = { x: 0, y: 0 };
  private readonly shoulder = { x: 0, y: 0 };

  static reaction(width: number, height: number, em: number) {
    const hand = new MastheadHand(width, height, em);
    hand.reactionOnly = true;
    return hand;
  }

  constructor(width: number, height: number, em: number) {
    this.resize(width, height, em);
    this.updatePose(0);
    Object.assign(this.motion.value.root, this.desired.root);
    Object.assign(this.motion.value.rotation, this.desired.rotation);
  }

  resize(width: number, height: number, em: number) {
    this.width = width;
    this.height = height;
    this.scale = Math.max(23, Math.min(67, em * 0.38, width * 0.12));
  }

  get done() {
    return (
      this.cancelled || this.time >= (this.reactionOnly ? 2.8 : DEPART + 1.8)
    );
  }
  get reveal() {
    if (this.done) return 0;
    if (this.reactionOnly)
      return (
        minimumJerk(this.time / 0.4) * (1 - minimumJerk((this.time - 2) / 0.8))
      );
    return (
      minimumJerk(this.time / HAND_APPEAR) *
      (1 - minimumJerk((this.time - DEPART) / 1.8))
    );
  }
  get phase() {
    if (this.reactionOnly && !this.done) return 'reacting';
    return this.done
      ? 'done'
      : this.time < HAND_APPEAR
        ? 'arriving'
        : this.time >= DEPART
          ? 'departing'
          : 'shooting';
  }
  cancel() {
    this.cancelled = true;
  }

  advance(
    dt: number,
    ink: HandInk,
    projectiles: HandProjectiles,
    companion?: Companion
  ) {
    if (this.done) return;
    // Cap work after suspension; the host already pauses offscreen and hidden.
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    this.muzzle.age += dt;
    if (this.reactionOnly) {
      const p = this.desired;
      p.joints = this.open.joints;
      Object.assign(
        p.root,
        v(
          (this.width - this.scale * 1.5) / this.scale,
          -(this.height - this.scale * 0.35) / this.scale,
          0
        )
      );
      p.rotation = axis(v(0, 0, 1), -0.35 + Math.sin(this.time * 3) * 0.16);
      this.motion.step(p, dt, false);
      return;
    }
    if (this.shots < SHOT_COUNT) {
      // Track live ink through the damped pose. Fired projectiles retain their ray.
      if (
        ink.aimAt((0.21 + Math.floor(this.shots / 3) * 0.31) % 1, this.target)
      )
        this.acquired = this.shots;
      this.shoulder.x = this.motion.value.root.x * this.scale;
      this.shoulder.y = -this.motion.value.root.y * this.scale;
      if (
        companion &&
        companionInRay(this.shoulder, this.target, companion) &&
        ink.aimAt(
          (0.4 + Math.floor(this.shots / 3) * 0.31) % 1,
          this.candidate
        ) &&
        !companionInRay(this.shoulder, this.candidate, companion)
      ) {
        this.target.x = this.candidate.x;
        this.target.y = this.candidate.y;
      }
    }
    this.updatePose(dt);
    const tip = socket(this.motion.value);
    this.shoulder.x = tip.position.x * this.scale;
    this.shoulder.y = -tip.position.y * this.scale;
    const reach = Math.hypot(
      this.target.x - this.shoulder.x,
      this.target.y - this.shoulder.y
    );
    const rayLength = Math.hypot(tip.direction.x, tip.direction.y) || 1;
    this.candidate.x = this.shoulder.x + (tip.direction.x / rayLength) * reach;
    this.candidate.y = this.shoulder.y - (tip.direction.y / rayLength) * reach;
    this.waitingForCompanion =
      !!companion && companionInRay(this.shoulder, this.candidate, companion);
    if (
      this.shots < SHOT_COUNT &&
      this.acquired === this.shots &&
      this.time >= shotTime(this.shots) &&
      this.time - this.lastShot >= 0.28 &&
      this.time < DEPART &&
      !this.waitingForCompanion
    ) {
      const norm = Math.hypot(tip.direction.x, tip.direction.y) || 1;
      Object.assign(this.muzzle, {
        x: tip.position.x * this.scale,
        y: -tip.position.y * this.scale,
        dx: tip.direction.x / norm,
        dy: -tip.direction.y / norm,
        age: 0,
      });
      projectiles.fire(this.muzzle, this.muzzle.dx, this.muzzle.dy);
      this.shots++;
      this.lastShot = this.time;
      this.motion.rootVelocity.x -= tip.direction.x * 5;
      this.motion.rootVelocity.y -= tip.direction.y * 5;
    }
    if (!this.sentSeekers && this.time > shotTime(SHOT_COUNT - 1) + 0.5) {
      this.sentSeekers = projectiles.sendSeekers(this.target);
    }
  }

  private updatePose(dt: number) {
    const s = this.scale;
    // Lower right clear space beside the shorter last line, including on phones.
    const root = v(
      (this.width - s * 0.95 + Math.sin(this.time * 0.8) * s * 0.025) / s,
      -(this.height - s * 0.45 + Math.sin(this.time * 1.2) * s * 0.04) / s,
      0
    );
    const p = this.desired;
    Object.assign(p.root, root);
    p.joints = this.gun.joints;
    aimHand(p, v(this.target.x / s, -this.target.y / s), 0.25);
    const prepare = minimumJerk((this.time - HAND_APPEAR + 0.25) / 0.75);
    if (prepare === 0) p.rotation = axis(v(0, 0, 1), 0.45);
    p.joints = prepare > 0 ? this.gun.joints : this.open.joints;
    this.motion.step(p, dt, prepare > 0);
  }
}
