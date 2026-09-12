import * as THREE from 'three';
import { expect, it } from 'vitest';
import { HomeWatcher } from '../../features/home/HomeWatcher';
import { HomeWatcherView } from './HomeWatcherView';

it('keeps the small watcher within five draws, reuses settled buffers and disposes once', () => {
  const model = new HomeWatcher();
  model.enabled = model.visible = true;
  model.resize(350, 400, 120);
  const view = new HomeWatcherView();
  view.frame(model, 0, 0);
  const meshes = view.root.children.filter(
    (child) => child instanceof THREE.Mesh
  );
  expect(meshes).toHaveLength(5);
  let triangles = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const mesh of meshes) {
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    triangles += (mesh.geometry.index!.count / 3) * instances;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      materials.add(material);
  }
  expect(triangles).toBeLessThan(1600);
  const batch = meshes[0] as THREE.InstancedMesh;
  const version = batch.instanceMatrix.version;
  view.frame(model, 20, 300);
  expect(batch.instanceMatrix.version).toBe(version);
  let disposed = 0;
  for (const resource of [...geometries, ...materials])
    resource.addEventListener('dispose', () => disposed++);
  view.dispose();
  view.dispose();
  expect(disposed).toBe(geometries.size + materials.size);
});
