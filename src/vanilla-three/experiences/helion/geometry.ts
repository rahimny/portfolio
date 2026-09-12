import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Cell } from '@/features/helion/model';

export function createPlateGeometry(
  cells: readonly Cell[]
): THREE.BufferGeometry {
  const positions: number[] = [],
    normals: number[] = [],
    centres: number[] = [];
  const levels: number[] = [],
    surfaces: number[] = [],
    seeds: number[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (const [id, cell] of cells.entries()) {
    const centre = new THREE.Vector3(...cell.centre);
    const outer = cell.corners.map((p) =>
      new THREE.Vector3(...p).lerp(centre, 0.045).normalize()
    );
    const inner = outer.map((p) => p.clone().lerp(centre, 0.13).normalize());
    const vertex = (
      p: THREE.Vector3,
      n: THREE.Vector3,
      level: number,
      surface: number
    ) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      centres.push(...cell.centre);
      levels.push(level);
      surfaces.push(surface);
      seeds.push((Math.sin(id * 127.1 + 311.7) * 43758.5453) % 1);
    };
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      // Flat ceramic face, a narrow chamfer, then a deep radial wall.
      vertex(centre, centre, 1, 1);
      vertex(inner[i], centre, 1, 1);
      vertex(inner[j], centre, 1, 1);
      a.subVectors(outer[j], outer[i]);
      b.copy(centre);
      normal.crossVectors(a, b).normalize();
      const bevel = normal.clone().addScaledVector(centre, 1.8).normalize();
      vertex(inner[i], bevel, 1, 0.85);
      vertex(outer[i], bevel, 0.92, 0.85);
      vertex(outer[j], bevel, 0.92, 0.85);
      vertex(inner[i], bevel, 1, 0.85);
      vertex(outer[j], bevel, 0.92, 0.85);
      vertex(inner[j], bevel, 1, 0.85);
      vertex(outer[i], normal, 0, 0);
      vertex(outer[j], normal, 0, 0);
      vertex(outer[j], normal, 0.92, 0);
      vertex(outer[i], normal, 0, 0);
      vertex(outer[j], normal, 0.92, 0);
      vertex(outer[i], normal, 0.92, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [
    ['position', positions, 3],
    ['normal', normals, 3],
    ['aCentre', centres, 3],
    ['aLevel', levels, 1],
    ['aSurface', surfaces, 1],
    ['aSeed', seeds, 1],
  ] as const)
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3.4);
  const indexed = mergeVertices(geometry);
  geometry.dispose();
  return indexed;
}
