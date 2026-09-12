import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Batch only the fixed, scene-level chassis. Moving assemblies retain their
 * transforms and ownership; labels with unique textures remain separate.
 */
export function batchStaticMeshes(scene: THREE.Object3D): void {
  const buckets = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]
  >();
  for (const object of [...scene.children]) {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      object.userData.movable ||
      Array.isArray(object.material)
    )
      continue;
    const key = `${object.material.uuid}/${object.castShadow}/${object.receiveShadow}`;
    const group = buckets.get(key) ?? [];
    group.push(object);
    buckets.set(key, group);
  }
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const copies = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(copies);
    copies.forEach((copy) => copy.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    scene.add(merged);
  }
}
export function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      if (object instanceof THREE.Mesh && object.customDepthMaterial)
        materials.add(object.customDepthMaterial);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Light && 'shadow' in object)
      (object as THREE.DirectionalLight).shadow?.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  scene.clear();
}
