import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelDrone } from '../../vanilla-three/experiences/can-control/VoxelDrone';
import { FLIGHT, nozzleTransform, Performer, type RigPose } from './performer';
import { buildScore, DEFAULT_SETTINGS, presetPath, STEP } from './model';

describe('voxel drone and emitter agreement', () => {
  it('keeps every voxel ahead of the wall even at the joint envelope extremes', () => {
    const drone = new VoxelDrone();
    const instance = new THREE.Matrix4(),
      world = new THREE.Matrix4();
    const corner = new THREE.Vector3();
    for (const pitch of [-1, 1])
      for (const yaw of [-1, 1])
        for (const roll of [-1, 1])
          for (const mountPitch of [-1, 1])
            for (const mountYaw of [-1, 1]) {
              const rig: RigPose = {
                body: { x: 1.6, y: 1.2, z: FLIGHT.minBodyZ },
                angles: {
                  x: pitch * FLIGHT.pitchLimit,
                  y: yaw * FLIGHT.yawLimit,
                  z: roll * FLIGHT.rollLimit,
                },
                mountPitch: mountPitch * FLIGHT.mountLimit,
                mountYaw: mountYaw * FLIGHT.mountLimit,
                rotor: 1,
              };
              drone.update(rig);
              drone.root.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const count =
                  object instanceof THREE.InstancedMesh ? object.count : 1;
                for (let i = 0; i < count; i++) {
                  if (object instanceof THREE.InstancedMesh) {
                    object.getMatrixAt(i, instance);
                    world.multiplyMatrices(object.matrixWorld, instance);
                  } else world.copy(object.matrixWorld);
                  for (const x of [-0.5, 0.5])
                    for (const y of [-0.5, 0.5])
                      for (const z of [-0.5, 0.5]) {
                        corner.set(x, y, z).applyMatrix4(world);
                        expect(corner.z).toBeGreaterThan(0.01);
                      }
                }
              });
            }
    drone.dispose();
    drone.dispose();
  });

  it('places the visible nozzle and its forward axis at the actual paint emitter', () => {
    const p = new Performer(
      buildScore(presetPath('flare'), DEFAULT_SETTINGS, 'flare'),
      'fine'
    );
    const drone = new VoxelDrone();
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for (let i = 0; i < 120 * 10; i++) {
      p.advance(STEP, () => {});
      drone.update(p.rig);
      const actual = nozzleTransform(p.rig);
      drone.nozzleTip.getWorldPosition(position);
      direction.set(0, 0, -1).transformDirection(drone.nozzleTip.matrixWorld);
      expect(
        position.distanceTo(
          new THREE.Vector3(actual.origin.x, actual.origin.y, actual.origin.z)
        )
      ).toBeLessThan(1e-12);
      expect(
        direction.distanceTo(
          new THREE.Vector3(
            actual.direction.x,
            actual.direction.y,
            actual.direction.z
          )
        )
      ).toBeLessThan(1e-12);
    }
    drone.dispose();
  });

  it('preserves velocity, acceleration and articulation when a new piece interrupts flight', () => {
    const score = buildScore(presetPath('loop'), DEFAULT_SETTINGS);
    const p = new Performer(score, 'fine');
    for (let i = 0; i < 360; i++) p.advance(STEP, () => {});
    const interrupted = new Performer(score, 'fine', p.flightState);
    expect(interrupted.flightState).toEqual(p.flightState);
    const old = { ...interrupted.acceleration };
    interrupted.advance(STEP, () => {});
    expect(
      Math.hypot(
        interrupted.acceleration.x - old.x,
        interrupted.acceleration.y - old.y,
        interrupted.acceleration.z - old.z
      )
    ).toBeLessThanOrEqual(FLIGHT.maxJerk * STEP + 1e-8);
  });
});
