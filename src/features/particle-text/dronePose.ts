import { FLIGHT, rotate } from '../can-control/performer';
import { WRITING_NOZZLE_OFFSET, type WritingFlight } from './DroneWriting';
import type { MastheadDrone } from './MastheadDrone';

export const droneSize = (scale: number, id: number) =>
  Math.max(57, Math.min(135, scale * (id ? 0.78 : 0.86)));

/** Shared rig geometry, projected without asking a renderer for its transform. */
export function writeDronePose(
  actor: MastheadDrone,
  flight: WritingFlight,
  scale: number,
  offsetY: number,
  time: number,
  id: number
) {
  actor.size = droneSize(scale, id);
  actor.gazeYaw = actor.gazePitch = 0;
  actor.depth = 40 + id * 5;
  actor.roll = flight.roll;
  actor.pitch = flight.pitch;
  actor.rotor = flight.rotor;
  const mount = rotate(
    { x: 0, y: 0, z: -FLIGHT.nozzleLength },
    { x: -0.3 - flight.pitch * 0.75, y: -flight.roll * 0.35, z: 0 }
  );
  const nozzle = rotate(
    {
      x: mount.x + FLIGHT.anchor.x,
      y: mount.y + FLIGHT.anchor.y,
      z: mount.z + FLIGHT.anchor.z,
    },
    {
      x: 0.24 + flight.pitch,
      y: -0.35 + flight.roll * 0.65,
      z: flight.roll,
    }
  );
  actor.previous.x = actor.x;
  actor.previous.y = actor.y;
  actor.nozzle.x = (flight.x + WRITING_NOZZLE_OFFSET.x) * scale;
  actor.nozzle.y = (flight.y + WRITING_NOZZLE_OFFSET.y) * scale + offsetY;
  actor.x = actor.nozzle.x - nozzle.x * actor.size;
  actor.y = actor.nozzle.y + nozzle.y * actor.size;
  actor.vx = flight.vx * scale;
  actor.vy = flight.vy * scale;
  actor.visible = flight.visible;
  actor.spray = flight.spray;
  actor.time = time;
}
