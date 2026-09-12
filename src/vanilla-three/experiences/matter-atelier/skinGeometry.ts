import * as THREE from 'three';
import type { PrintJob } from '@/features/matter-atelier/types';

/** A fused skin from the exact printed contours, with welded seam normals. */
export function skinGeometry(job: PrintJob) {
  const rows = job.contours.length,
    cols = job.contours[0].length;
  const positions = new Float32Array(rows * cols * 3),
    times = new Float32Array(rows * cols),
    distances = new Float32Array(rows * cols);
  const indices: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const contour = job.contours[y],
        p = contour[Math.round((x / (cols - 1)) * (contour.length - 1))],
        i = y * cols + x;
      positions.set([p.x, p.y, p.z], i * 3);
      if (y < rows - 1 && x < cols - 1)
        indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPrintTime', new THREE.BufferAttribute(times, 1));
  geometry.setAttribute(
    'aPrintDistance',
    new THREE.BufferAttribute(distances, 1)
  );
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal'),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  for (let y = 0; y < rows; y++) {
    const a = y * cols,
      b = a + cols - 1;
    n.fromBufferAttribute(normals, a);
    m.fromBufferAttribute(normals, b);
    n.add(m).normalize();
    normals.setXYZ(a, n.x, n.y, n.z);
    normals.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}
