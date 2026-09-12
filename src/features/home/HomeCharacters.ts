import type { HomeWorld } from './HomeWorld';
import type { WatcherExpression } from './HomeWatcher';

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** One attention arbiter. Gestures follow encounters, never independent timers. */
export class HomeCharacters {
  mood:
    | 'roaming'
    | 'approaching'
    | 'inspecting'
    | 'leaving'
    | 'yielding'
    | 'visiting' = 'roaming';
  encounters = 0;
  readonly gaze = { x: 0, y: 0, visible: false };
  readonly expression: WatcherExpression = {
    focus: 0,
    startled: 0,
    confused: 0,
    snap: 0,
    withdraw: 0,
  };
  watching: 'drone' | 'writers' | 'hand' | 'target' = 'drone';
  private elapsed = 0;
  private cooldown = 5;
  private armed = true;
  private side = 1;
  private destinationX = 0;
  private destinationY = 0;
  private hand: HomeWorld['hand'] = null;
  private shots = 0;
  private lookTime = 0;
  private alarm = 0;
  private impactTime = 0;
  private impactX = 0;
  private impactY = 0;

  reset() {
    this.mood = 'roaming';
    this.encounters = 0;
    this.elapsed = this.lookTime = this.alarm = this.impactTime = 0;
    this.cooldown = 5;
    this.armed = true;
    this.hand = null;
    this.shots = 0;
  }

  noticeImpact(x: number, y: number) {
    this.impactX = x;
    this.impactY = y;
    this.impactTime = 1.1;
    this.alarm = Math.max(this.alarm, 0.4);
  }

  private guide(world: HomeWorld, x: number, y: number, speed = 42) {
    const drone = world.drone;
    if (!drone.guide.active) {
      drone.guide.x = drone.x;
      drone.guide.y = drone.y;
      drone.guide.active = true;
    }
    this.destinationX = clamp(
      x,
      drone.size * 0.65,
      world.width - drone.size * 0.65
    );
    this.destinationY = clamp(y, 30, world.height + 24);
    drone.guide.speed = speed;
  }

  private release(world: HomeWorld) {
    if (world.drone.guide.active) {
      world.drone.guide.active = false;
      world.drone.roaming.restart(0.6);
    }
    this.mood = 'roaming';
    this.elapsed = 0;
  }

  advance(dt: number, world: HomeWorld) {
    if (dt <= 0) return;
    const { drone, watcher, attention, hand } = world;
    const expression = this.expression;
    expression.focus = attention.focus;
    expression.startled = attention.startled;
    expression.confused = attention.confused;
    expression.snap = attention.snap;
    expression.withdraw = 0;
    const watched = world.drones[attention.focus];
    this.gaze.x = watched.x;
    this.gaze.y = watched.y;
    this.gaze.visible = watched.visible;
    this.watching = world.writing ? 'writers' : 'drone';
    drone.look.active = false;
    this.alarm = Math.max(0, this.alarm - dt * 1.5);
    this.lookTime = Math.max(0, this.lookTime - dt);
    this.impactTime = Math.max(0, this.impactTime - dt);

    if (hand !== this.hand) {
      this.hand = hand;
      this.shots = 0;
      if (hand) {
        this.lookTime = 1.5;
        this.alarm = 0.65;
      } else if (this.mood === 'yielding') {
        this.release(world);
        this.cooldown = 4;
      }
    }
    if (hand && hand.reveal > 0.2) {
      if (hand.shots !== this.shots) {
        // Only the first shot of a burst warrants another look. Familiarity
        // softens the recoil while the gaze still follows the interruption.
        if (this.shots % 3 === 0) {
          this.lookTime = 0.85;
          this.alarm = this.shots === 0 ? 0.8 : 0.3;
        }
        this.shots = hand.shots;
      }
      if (this.lookTime > 0) {
        this.gaze.x = hand.motion.value.root.x * hand.scale;
        this.gaze.y = -hand.motion.value.root.y * hand.scale;
        this.gaze.visible = true;
        this.watching = 'hand';
        expression.snap = Math.max(expression.snap, this.alarm);
      }
    }
    if (this.impactTime > 0 && hand?.phase !== 'shooting') {
      this.gaze.x = this.impactX;
      this.gaze.y = this.impactY;
      this.gaze.visible = true;
      this.watching = 'target';
      expression.snap = Math.max(expression.snap, this.alarm);
    }
    expression.startled = Math.max(expression.startled, this.alarm);

    const available =
      drone.visible && !world.writing && drone.owner === 'hover';
    if (!available || drone.held) {
      this.release(world);
      this.cooldown = Math.max(this.cooldown, 4);
      return;
    }
    const space = world.encounterSpace;
    if (space && space.proximity > 0.05) {
      this.release(world);
      this.mood = 'visiting';
      drone.look.active = true;
      drone.look.x = space.nereid.x - space.drone.x + drone.x;
      drone.look.y = space.nereid.y - space.drone.y + drone.y;
      this.cooldown = 6;
      return;
    }
    if (!watcher.enabled || !watcher.visible || !watcher.inView) {
      this.release(world);
      return;
    }
    if (hand && hand.reveal > 0.15 && hand.phase !== 'reacting') {
      this.mood = 'yielding';
      this.guide(world, world.width * 0.27, world.height * 0.32, 65);
      drone.look.active = true;
      drone.look.x = hand.motion.value.root.x * hand.scale;
      drone.look.y = -hand.motion.value.root.y * hand.scale;
    } else if (hand?.phase === 'reacting') {
      this.release(world);
      drone.look.active = true;
      drone.look.x = hand.motion.value.root.x * hand.scale;
      drone.look.y = -hand.motion.value.root.y * hand.scale;
    } else if (!hand) {
      if (this.mood === 'visiting') this.release(world);
      this.cooldown = Math.max(0, this.cooldown - dt);
      const distance = Math.hypot(
        drone.x - watcher.x,
        drone.y - (watcher.floor - watcher.scale * 3.1)
      );
      if (distance > watcher.scale * 11) this.armed = true;
      if (
        this.mood === 'roaming' &&
        this.armed &&
        this.cooldown === 0 &&
        drone.roaming.active &&
        !watcher.entering &&
        !watcher.moving &&
        distance < watcher.scale * 9 &&
        drone.y > world.height * 0.25
      ) {
        this.mood = 'approaching';
        this.elapsed = 0;
        this.side = drone.x >= watcher.x ? 1 : -1;
        // Pick the side with actual room, especially on narrow phones.
        if (
          watcher.x + this.side * watcher.scale * 3 >
          world.width - drone.size
        )
          this.side = -1;
        if (watcher.x + this.side * watcher.scale * 3 < drone.size)
          this.side = 1;
        this.guide(
          world,
          watcher.x + this.side * watcher.scale * 3,
          watcher.floor - watcher.scale * 4.7
        );
        this.armed = false;
      }
      if (this.mood === 'approaching' || this.mood === 'inspecting') {
        this.elapsed += dt;
        drone.look.active = true;
        drone.look.x = watcher.x;
        drone.look.y = watcher.floor - watcher.scale * 3.1;
        expression.confused = Math.max(expression.confused, 0.5);
        expression.focus = this.side > 0 ? 1 : 0;
        const near = clamp(1 - distance / (watcher.scale * 7), 0, 1);
        expression.withdraw =
          -this.side * near * (this.encounters ? 0.06 : 0.16);
        if (
          this.mood === 'approaching' &&
          Math.hypot(drone.x - this.destinationX, drone.y - this.destinationY) <
            17
        ) {
          this.mood = 'inspecting';
          this.elapsed = 0;
          this.alarm = this.encounters === 0 ? 0.3 : 0.08;
        }
        if (
          (this.mood === 'inspecting' && this.elapsed > 1.65) ||
          this.elapsed > 10
        ) {
          this.mood = 'leaving';
          this.elapsed = 0;
          this.encounters++;
          this.guide(
            world,
            drone.x + this.side * Math.min(160, world.width * 0.3),
            Math.min(drone.y - 85, world.height * 0.35)
          );
        }
      } else if (this.mood === 'leaving') {
        this.elapsed += dt;
        // A final glance belongs to the departure, not a repeating idle loop.
        drone.look.active = this.elapsed < 0.8;
        drone.look.x = watcher.x;
        drone.look.y = watcher.floor - watcher.scale * 3.1;
        if (this.elapsed > 3.5) {
          this.release(world);
          this.cooldown = 18 + Math.min(3, this.encounters) * 7;
        }
      }
    }
    if (drone.guide.active) {
      const dx = this.destinationX - drone.guide.x;
      const dy = this.destinationY - drone.guide.y;
      const fraction = Math.min(
        1,
        (dt * drone.guide.speed) / Math.max(1, Math.hypot(dx, dy))
      );
      drone.guide.x += dx * fraction;
      drone.guide.y += dy * fraction;
    }
  }

  get keepsWatcherStill() {
    return (
      this.mood === 'approaching' ||
      this.mood === 'inspecting' ||
      this.watching !== 'drone'
    );
  }
}
