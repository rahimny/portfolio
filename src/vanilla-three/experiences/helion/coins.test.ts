import { expect, it } from 'vitest';
import * as THREE from 'three';
import { CoinPops } from './coins';

it('turns the face edge-on under torque and retires both bounded instance pools', () => {
  const pops = new CoinPops();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  pops.emit(new THREE.Vector3(0, 0, 2.8), camera, 8, 1.8);
  const matrix = new THREE.Matrix4(),
    normal = new THREE.Vector3();
  let minimum = 1,
    maximum = 0,
    finite = true;
  for (let i = 0; i < 120; i++) {
    pops.update(1 / 120, camera);
    pops.mesh.getMatrixAt(0, matrix);
    normal.set(0, 1, 0).transformDirection(matrix);
    minimum = Math.min(minimum, Math.abs(normal.z));
    maximum = Math.max(maximum, Math.abs(normal.z));
    finite &&= matrix.elements.every(Number.isFinite);
  }
  expect(minimum).toBeLessThan(0.15);
  expect(maximum).toBeGreaterThan(0.9);
  expect(finite).toBe(true);
  expect(pops.mesh.count).toBe(40);
  pops.update(0.5, camera);
  expect(pops.mesh.visible).toBe(false);
  expect(pops.glints.visible).toBe(false);
  for (const mesh of [pops.mesh, pops.glints]) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  }
});
