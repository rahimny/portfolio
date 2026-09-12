import type { HomeWorld } from '../home/HomeWorld';

/** Browser-only presentation of model state. Never schedules or advances it. */
export class MastheadDomBridge {
  droneHost: HTMLElement | null = null;
  private targetHost: HTMLElement | null = null;
  private readonly world: HomeWorld;
  constructor(world: HomeWorld) {
    this.world = world;
  }
  setTargetHost(host: HTMLElement | null) {
    this.targetHost = host;
    this.world.projectiles.puck.enabled = !!host;
  }
  update() {
    const { drone, projectiles } = this.world;
    if (this.droneHost) {
      const host = this.droneHost;
      host.hidden = !this.world.droneReady;
      host.style.transform = `translate(${drone.x}px, ${drone.y}px) translate(-50%, -50%)`;
      host.dataset.held = String(drone.held);
      host.dataset.owner = drone.owner;
      host.dataset.mood = this.world.characters.mood;
      host.dataset.encounters = String(this.world.characters.encounters);
      host.dataset.watching = this.world.characters.watching;
      host.dataset.roaming = String(
        drone.roaming.enabled && drone.roaming.active
      );
      host.dataset.affected = String(drone.affected);
      host.dataset.dirt = drone.ink.dirt.toFixed(3);
      host.dataset.cleanings = String(drone.ink.cleanings);
      host.dataset.cleaning = String(drone.ink.age >= 0);
      host.setAttribute('aria-pressed', String(drone.held));
    }
    if (this.targetHost) {
      const host = this.targetHost;
      const puck = projectiles.puck;
      host.style.setProperty('--puck-x', `${puck.offsetX}px`);
      host.style.setProperty('--puck-y', `${puck.offsetY}px`);
      host.style.setProperty(
        '--puck-squash',
        String(1 - puck.compression * 0.25)
      );
      host.style.setProperty('--puck-hit', String(puck.compression));
      host.dataset.hits = String(puck.hits);
      host.dataset.echoes = String(puck.echoes);
    }
  }
  dispose() {
    this.droneHost = this.targetHost = null;
  }
}
