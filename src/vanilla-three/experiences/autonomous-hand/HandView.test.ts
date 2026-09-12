import { it, expect } from 'vitest';
import * as THREE from 'three';
import { HandView } from './HandView';
import {
  JOINTS,
  pose,
  transforms,
  socket,
  type PoseName,
} from '../../../features/autonomous-hand/rig';

it('shares joint and fingertip transforms with the pure rig in all essential poses', () => {
  const view = new HandView();
  for (const name of [
    'open',
    'fist',
    'point',
    'gun',
    'pinch',
    'beckon',
    'palm-up',
    'thumbs-up',
  ] as PoseName[]) {
    const p = pose(name);
    view.update(p);
    const expected = transforms(p);
    const gun = socket(p).position;
    const visibleSocket = view.bones[3].localToWorld(
      new THREE.Vector3(0, JOINTS[3].length + JOINTS[3].radius, 0)
    );
    expect(
      visibleSocket.distanceTo(new THREE.Vector3(gun.x, gun.y, gun.z))
    ).toBeLessThan(1e-10);
    for (let i = 0; i < JOINTS.length; i++) {
      const origin = view.bones[i].getWorldPosition(new THREE.Vector3());
      const tip = view.bones[i].localToWorld(
        new THREE.Vector3(0, JOINTS[i].length, 0)
      );
      expect(
        origin.distanceTo(
          new THREE.Vector3(
            expected[i].position.x,
            expected[i].position.y,
            expected[i].position.z
          )
        )
      ).toBeLessThan(1e-10);
      expect(
        tip.distanceTo(
          new THREE.Vector3(
            expected[i].tip.x,
            expected[i].tip.y,
            expected[i].tip.z
          )
        )
      ).toBeLessThan(1e-10);
    }
  }
  const weights = view.mesh.geometry.getAttribute('skinWeight');
  for (let i = 0; i < weights.count; i++)
    expect(
      weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)
    ).toBeCloseTo(1, 5);
  view.dispose();
  view.dispose();
}, 15000);
