import {
  DroneWriting,
  type WritingFlight,
} from '../particle-text/DroneWriting';
import { MastheadDrone } from '../particle-text/MastheadDrone';
import {
  HAND_APPEAR,
  MastheadHand,
  type HandInk,
} from '../particle-text/MastheadHand';
import {
  MastheadProjectiles,
  type ProjectileInk,
} from '../particle-text/MastheadProjectiles';
import type { TextLayout } from '../particle-text/layout';
import type { InkPoint } from '../particle-text/inkContact';
import type { TargetImpact } from '../particle-text/MastheadTarget';
import { droneSize, writeDronePose } from '../particle-text/dronePose';
import { LandingZone } from './LandingZone';
import { HomeWatcher } from './HomeWatcher';
import { WatcherAttention } from './WatcherAttention';
import { HomeCharacters } from './HomeCharacters';
import type { HomeEncounterSpace } from './HomeEncounterSpace';

export interface WorldInk extends HandInk, ProjectileInk {
  beginWriting(score: DroneWriting): void;
  burstWriting(score: DroneWriting): void;
  write(time: number, flights: readonly WritingFlight[]): void;
  finishWriting(): void;
  cancelWriting(): void;
  clearProjectileWake(): void;
}

/** No DOM, renderer or RAF. The host supplies time; views only read this state. */
export class HomeWorld {
  readonly drones = [new MastheadDrone(1, 1), new MastheadDrone(1, 1)];
  readonly projectiles = new MastheadProjectiles();
  readonly landing = new LandingZone();
  readonly watcher = new HomeWatcher();
  readonly attention = new WatcherAttention();
  readonly characters = new HomeCharacters();
  encounterSpace: HomeEncounterSpace | null = null;
  writing: DroneWriting | null = null;
  hand: MastheadHand | null = null;
  enabled = true;
  active = false;
  width = 1;
  height = 1;
  scale = 100;
  offsetY = 0;
  onChange: (() => void) | null = null;
  onImpact: ((impact: TargetImpact) => void) | null = null;
  private disposed = false;
  private readonly ink: WorldInk;
  private readonly aim = { x: 0, y: 0 };

  constructor(ink: WorldInk) {
    this.ink = ink;
    this.drones.forEach((drone) => {
      drone.visible = false;
    });
    this.projectiles.puck.onImpact = (impact) => {
      this.characters.noticeImpact(
        this.projectiles.puck.x,
        this.projectiles.puck.y
      );
      this.react();
      this.onImpact?.(impact);
    };
  }

  get drone() {
    return this.drones[0];
  }
  get performing() {
    return !!this.writing || !!this.hand;
  }
  get droneReady() {
    return this.active && this.enabled && !this.writing && this.drone.visible;
  }
  get seekerAvailable() {
    return this.active && this.enabled && !this.writing;
  }
  get seekerReady() {
    return (
      this.seekerAvailable &&
      (!this.hand ||
        this.hand.phase === 'reacting' ||
        this.hand.time >= HAND_APPEAR) &&
      this.projectiles.canLaunch
    );
  }
  get extent() {
    return Math.max(this.height, (this.landing.point?.y ?? 0) + 24);
  }

  resize(width: number, height: number, scale: number, offsetY: number) {
    this.characters.reset();
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.offsetY = offsetY;
    this.projectiles.resize(width, height, scale);
    this.drones.forEach((drone, id) => {
      const writing = drone.owner === 'writing';
      drone.resize(width, this.extent);
      drone.size = droneSize(scale, id);
      drone.roaming.resize(width, height);
      if (writing) drone.owner = 'writing';
    });
    this.landing.reset();
    this.ink.clearProjectileWake();
  }

  setLanding(point: InkPoint | null) {
    this.landing.set(point);
    this.drones.forEach((drone) => drone.setTravelHeight(this.extent));
    if (
      point &&
      (this.drone.owner === 'landing' || this.drone.owner === 'landed')
    )
      this.drone.land(point);
  }

  start(layout: TextLayout) {
    if (this.disposed) return false;
    this.interrupt();
    try {
      this.writing = new DroneWriting(layout, this.width, true);
    } catch {
      return false;
    }
    this.active = true;
    this.watcher.enter();
    this.attention.reset();
    this.characters.reset();
    this.watcher.visible = this.watcher.enabled;
    this.scale = layout.scale;
    this.offsetY = layout.offsetY;
    this.drones.forEach((drone) => {
      drone.release(true);
      drone.owner = 'writing';
      drone.visible = false;
    });
    this.ink.beginWriting(this.writing);
    this.projectWriting();
    this.onChange?.();
    return true;
  }

  private projectWriting() {
    const score = this.writing;
    if (!score) return;
    this.drones.forEach((drone, id) =>
      writeDronePose(
        drone,
        score.flights[id],
        this.scale,
        this.offsetY,
        score.time,
        id
      )
    );
    if (
      score.time > score.paintEnd &&
      !this.drone.spray &&
      this.drones[1].visible
    ) {
      const t = Math.min(1, (score.time - score.paintEnd) / 0.65);
      const turn = Math.max(
        -1,
        Math.min(
          1,
          (this.drones[1].x - this.drone.x) / Math.max(1, this.scale * 2)
        )
      );
      // The lingering writer watches its efficient partner leave once the ink
      // is finished; the nozzle remains exact throughout every paint stroke.
      this.drone.gazeYaw = turn * t * t * (3 - 2 * t) * 0.45;
    }
  }

  private finish(hand: boolean) {
    if (!this.writing) return;
    this.ink.finishWriting();
    this.writing = null;
    this.drone.hover();
    this.drone.visible = true;
    this.drones[1].visible = false;
    if (hand) this.hand = new MastheadHand(this.width, this.height, this.scale);
    this.onChange?.();
  }

  skip() {
    if (this.writing?.skip()) this.ink.burstWriting(this.writing);
    this.hand?.cancel();
    this.hand = null;
    this.onChange?.();
  }

  interrupt() {
    this.characters.reset();
    if (this.writing) {
      this.ink.cancelWriting();
      this.writing = null;
      this.drone.hover();
      this.drones[1].visible = false;
    }
    this.drone.release(true);
    this.hand?.cancel();
    this.hand = null;
    this.projectiles.clear();
    this.landing.reset();
    this.ink.clearProjectileWake();
    this.onChange?.();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.interrupt();
    this.onChange?.();
  }

  grabDrone(x?: number, y?: number) {
    if (!this.droneReady) return;
    // Acquiring the actor ends the scripted visit; its own state survives.
    this.hand?.cancel();
    this.hand = null;
    this.projectiles.clear();
    this.landing.reset();
    this.drone.grab(x, y);
    this.onChange?.();
  }
  moveDrone(x: number, y: number) {
    if (this.droneReady) this.drone.move(x, y);
  }
  releaseDrone(cancel = false) {
    // Blur and offscreen cleanup may arrive after a landing was requested.
    // Only an acquired drag belongs to the gesture being released.
    if (!this.drone.held) return;
    this.drone.release(cancel);
  }
  nudgeDrone(dx: number, dy: number) {
    if (!this.drone.held) this.grabDrone();
    if (this.droneReady) this.drone.nudge(dx, dy);
  }
  landDrone() {
    if (!this.droneReady || !this.landing.point) return false;
    this.hand?.cancel();
    this.hand = null;
    this.landing.reset();
    this.drone.land(this.landing.point);
    this.onChange?.();
    return true;
  }

  private react() {
    if (!this.hand && !this.writing && this.active && this.enabled)
      this.hand = MastheadHand.reaction(this.width, this.height, this.scale);
  }
  echo() {
    this.projectiles.puck.echo();
    this.react();
  }
  sendSeekers(x?: number, y?: number) {
    if (!this.seekerReady) return false;
    if (x === undefined || y === undefined) {
      if (!this.ink.aimAt(0.47, this.aim)) return false;
    } else {
      this.aim.x = Math.max(0, Math.min(this.width, x));
      this.aim.y = Math.max(0, Math.min(this.height, y));
    }
    const sent = this.projectiles.sendSeekers(this.aim);
    this.onChange?.();
    return sent;
  }
  launchAtTarget() {
    if (!this.seekerReady || !this.projectiles.puck.enabled) return false;
    const sent = this.projectiles.sendSeekers(this.projectiles.puck, true);
    this.onChange?.();
    return sent;
  }

  advance(delta: number) {
    if (this.disposed || !this.active || !this.enabled) return;
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
    this.attention.advance(dt, this.drone, this.drones[1]);
    this.characters.advance(dt, this);
    if (this.writing) {
      this.writing.advance(dt);
      this.projectWriting();
      this.ink.write(this.writing.time, this.writing.flights);
      if (this.writing.done) this.finish(this.writing.burstStart === null);
    } else {
      this.hand?.advance(dt, this.ink, this.projectiles, this.drone);
      if (this.hand?.done) this.hand = null;
      this.projectiles.advance(dt, this.ink);
      const drone = this.drone;
      drone.roaming.enabled =
        this.watcher.enabled &&
        this.watcher.inView &&
        !this.hand &&
        this.characters.mood !== 'visiting';
      drone.advance(dt);
      const speed = Math.hypot(drone.vx, drone.vy);
      if (drone.visible && drone.disturbsInk && speed > 15) {
        const contacts = this.ink.repelInk(drone.previous, drone, 30, 650, dt);
        drone.affected += contacts;
        drone.ink.collect(contacts, dt, drone.x, drone.y, speed);
      }
      if (this.landing.advance(dt, drone)) {
        drone.land(this.landing.point!);
        drone.owner = 'landed';
      }
    }
    this.watcher.advance(
      dt,
      this.characters.gaze,
      !this.performing &&
        !this.characters.keepsWatcherStill &&
        this.drone.owner !== 'landing' &&
        this.drone.owner !== 'landed',
      this.drone.roaming.active && !this.drone.held,
      this.characters.expression
    );
    this.onChange?.();
  }

  dispose() {
    if (this.disposed) return;
    this.interrupt();
    this.active = false;
    this.watcher.visible = false;
    this.disposed = true;
    this.drones.forEach((drone) => {
      drone.visible = false;
    });
    this.onChange = this.onImpact = this.landing.onArrive = null;
    this.projectiles.puck.onImpact = undefined;
  }
}
