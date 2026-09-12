import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { VoxelDrone } from '../../vanilla-three/experiences/can-control/VoxelDrone';
import { MastheadDrone } from './MastheadDrone';
import { writeDronePose } from './dronePose';
import { WRITING_NOZZLE_OFFSET } from './DroneWriting';

describe('writing projection', () => {
  it('keeps the real rig nozzle on the ink emission point at each responsive size', () => {
    const rig = new VoxelDrone();
    try {
      for (const scale of [45, 100, 240])
        for (const id of [0, 1]) {
          const actor = new MastheadDrone(1000, 400);
          const flight = {
            x: 2.1,
            y: 1.2,
            vx: 0.3,
            vy: -0.2,
            roll: -0.23,
            pitch: 0.14,
            rotor: 50,
            visible: true,
            spray: true,
          };
          writeDronePose(actor, flight, scale, 18, 2.4, id);
          rig.root.scale.setScalar(actor.size);
          rig.update({
            body: { x: actor.x, y: -actor.y, z: actor.depth },
            angles: {
              x: 0.24 + actor.pitch,
              y: -0.35 + actor.roll * 0.65,
              z: actor.roll,
            },
            mountPitch: -0.3 - actor.pitch * 0.75,
            mountYaw: -actor.roll * 0.35,
            rotor: actor.rotor,
          });
          const nozzle = rig.nozzleTip.getWorldPosition(new Vector3());
          expect(nozzle.x).toBeCloseTo(
            (flight.x + WRITING_NOZZLE_OFFSET.x) * scale,
            8
          );
          expect(nozzle.y).toBeCloseTo(
            -18 - (flight.y + WRITING_NOZZLE_OFFSET.y) * scale,
            8
          );
        }
    } finally {
      rig.dispose();
    }
  });
});
