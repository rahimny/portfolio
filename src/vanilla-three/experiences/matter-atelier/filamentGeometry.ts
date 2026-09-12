import * as THREE from 'three';
import type { PrintJob } from '@/features/matter-atelier/types';

/** Bounded, preallocated buffers avoid large temporary JS number arrays for STL jobs. */
export function filamentGeometry(job: PrintJob) {
  const moves = job.moves.filter((move) => move.extrude);
  const sides = 6,
    radius = 0.015,
    vertices = moves.length * sides * 2;
  const positions = new Float32Array(vertices * 3),
    normals = new Float32Array(vertices * 3);
  const times = new Float32Array(vertices),
    distances = new Float32Array(vertices);
  const indices = new Uint32Array(moves.length * sides * 6);
  const ghosts = new Float32Array(moves.length * 6),
    ghostDistances = new Float32Array(moves.length * 2),
    ghostLayers = new Float32Array(moves.length * 2);
  moves.forEach((move, segment) => {
    const dx = (move.to.x - move.from.x) / move.length,
      dz = (move.to.z - move.from.z) / move.length;
    const base = segment * sides * 2;
    for (let end = 0; end < 2; end++) {
      const p = end ? move.to : move.from;
      const ghost = segment * 2 + end;
      ghosts.set([p.x, p.y, p.z], ghost * 3);
      ghostDistances[ghost] = move.offset + (end ? move.length : 0);
      ghostLayers[ghost] = move.layer;
      for (let j = 0; j < sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        const nx = -dz * Math.cos(angle),
          ny = Math.sin(angle),
          nz = dx * Math.cos(angle);
        const vertex = base + end * sides + j;
        positions.set(
          [p.x + nx * radius, p.y + ny * radius, p.z + nz * radius],
          vertex * 3
        );
        normals.set([nx, ny, nz], vertex * 3);
        times[vertex] = end ? move.end : move.start;
        distances[vertex] = ghostDistances[ghost];
      }
    }
    for (let j = 0; j < sides; j++) {
      const n = (j + 1) % sides;
      indices.set(
        [
          base + j,
          base + n,
          base + sides + j,
          base + n,
          base + sides + n,
          base + sides + j,
        ],
        (segment * sides + j) * 6
      );
    }
  });
  const solid = new THREE.BufferGeometry();
  solid.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  solid.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  solid.setAttribute('aPrintTime', new THREE.BufferAttribute(times, 1));
  solid.setAttribute('aPrintDistance', new THREE.BufferAttribute(distances, 1));
  solid.setIndex(new THREE.BufferAttribute(indices, 1));
  solid.computeBoundingSphere();
  const preview = new THREE.BufferGeometry();
  preview.setAttribute('position', new THREE.BufferAttribute(ghosts, 3));
  preview.setAttribute(
    'aDistance',
    new THREE.BufferAttribute(ghostDistances, 1)
  );
  preview.setAttribute('aLayer', new THREE.BufferAttribute(ghostLayers, 1));
  return { solid, preview };
}
