import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import {
  JOINTS,
  restSegments,
  type HandPose,
} from '../../../features/autonomous-hand/rig';
import {
  v,
  sub,
  length,
  nearestOnSegment,
  type Vec3,
} from '../../../features/scene-interactions/math';

function ellipsoid(p: Vec3, centre: Vec3, r: Vec3): number {
  const x = (p.x - centre.x) / r.x,
    y = (p.y - centre.y) / r.y,
    z = (p.z - centre.z) / r.z;
  return (Math.hypot(x, y, z) - 1) * Math.min(r.x, r.y, r.z);
}
function union(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function buildHandGeometry(resolution = 64): THREE.BufferGeometry {
  const segments = restSegments(),
    material = new THREE.MeshBasicMaterial();
  const surface = new MarchingCubes(resolution, material, false, false, 40000);
  surface.isolation = 0;
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++) {
        const p = v(
          ((x / resolution) * 2 - 1) * 2.2,
          ((y / resolution) * 2 - 1) * 2.2 + 0.5,
          ((z / resolution) * 2 - 1) * 2.2
        );
        let d = ellipsoid(p, v(0, -0.04, 0), v(0.59, 0.69, 0.29));
        d = union(d, ellipsoid(p, v(0, -0.65, 0), v(0.34, 0.33, 0.22)), 0.15);
        // A thenar pad joins the opposed thumb into the palm instead of attaching it like a fifth finger.
        d = union(
          d,
          ellipsoid(p, v(-0.39, -0.2, 0.055), v(0.27, 0.37, 0.23)),
          0.12
        );
        d = union(d, ellipsoid(p, v(0, -0.76, 0), v(0.37, 0.13, 0.25)), 0.045);
        for (const x of [-0.43, -0.12, 0.2, 0.49])
          d = union(
            d,
            ellipsoid(
              p,
              v(x, x > 0.4 ? 0.43 : 0.56, -0.035),
              v(0.17, 0.18, 0.23)
            ),
            0.065
          );
        for (let i = 1; i < JOINTS.length; i++) {
          const j = JOINTS[i],
            s = segments[i];
          const closest = nearestOnSegment(p, s.position, s.tip);
          const capsule = length(sub(p, closest)) - j.radius;
          d = union(d, capsule, j.segment === 0 ? 0.105 : 0.055);
        }
        surface.field[z * resolution * resolution + y * resolution + x] =
          -Math.max(d, -0.9 - p.y);
      }
  surface.update();
  const count = surface.geometry.drawRange.count;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      surface.geometry.getAttribute('position').array.slice(0, count * 3),
      3
    )
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      surface.geometry.getAttribute('normal').array.slice(0, count * 3),
      3
    )
  );
  geometry.scale(2.2, 2.2, 2.2);
  geometry.translate(0, 0.5, 0);
  surface.geometry.dispose();
  material.dispose();
  const indices: number[] = [],
    weights: number[] = [],
    positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const p = v(positions.getX(i), positions.getY(i), positions.getZ(i));
    let best = 1,
      minimum = Infinity;
    for (let j = 1; j < JOINTS.length; j++) {
      const s = segments[j],
        d =
          length(sub(p, nearestOnSegment(p, s.position, s.tip))) -
          JOINTS[j].radius;
      if (d < minimum) {
        minimum = d;
        best = j;
      }
    }
    const finger = JOINTS[best].finger,
      base = 1 + finger * 3;
    const palmDistance = ellipsoid(p, v(0, -0.04, 0), v(0.59, 0.69, 0.29));
    const basePoint = segments[base].position;
    const distanceToBase = length(sub(p, basePoint));
    if (
      palmDistance < minimum - 0.035 &&
      p.y < 0.52 &&
      !(p.x < -0.57 && p.y > -0.3)
    ) {
      indices.push(0, 0, 0, 0);
      weights.push(1, 0, 0, 0);
      continue;
    }
    const candidates = [0, base, base + 1, base + 2];
    const values = candidates.map((j) => {
      if (j === 0) return Math.exp(-Math.pow(distanceToBase / 0.24, 2)) * 1.3;
      const s = segments[j],
        centre = {
          x: (s.position.x + s.tip.x) / 2,
          y: (s.position.y + s.tip.y) / 2,
          z: (s.position.z + s.tip.z) / 2,
        };
      return Math.exp(-Math.pow(length(sub(p, centre)) / 0.19, 2));
    });
    const total = values.reduce((a, b) => a + b, 0) || 1;
    indices.push(...candidates);
    weights.push(...values.map((w) => w / total));
  }
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(indices, 4)
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(weights, 4)
  );
  return geometry;
}
export class HandView {
  readonly group = new THREE.Group();
  readonly bones = JOINTS.map(() => new THREE.Bone());
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly debug: THREE.SkeletonHelper;
  private disposed = false;
  constructor(resolution = 64) {
    this.mesh = new THREE.SkinnedMesh(
      buildHandGeometry(resolution),
      new THREE.MeshStandardMaterial({
        color: 0xfdfcf8,
        roughness: 0.48,
        metalness: 0,
      })
    );
    JOINTS.forEach((j, i) => {
      this.bones[i].name = j.name;
      this.bones[i].position.set(j.offset.x, j.offset.y, j.offset.z);
      this.bones[i].quaternion.set(j.rest.x, j.rest.y, j.rest.z, j.rest.w);
      if (j.parent >= 0) this.bones[j.parent].add(this.bones[i]);
    });
    this.mesh.add(this.bones[0]);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.debug = new THREE.SkeletonHelper(this.mesh);
    this.debug.visible = false;
    (this.debug.material as THREE.LineBasicMaterial).depthTest = false;
    this.debug.renderOrder = 10;
  }
  update(pose: HandPose): void {
    this.group.position.set(pose.root.x, pose.root.y, pose.root.z);
    this.group.quaternion.set(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w
    );
    pose.joints.forEach((q, i) =>
      this.bones[i].quaternion.set(q.x, q.y, q.z, q.w)
    );
    this.group.updateMatrixWorld(true);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.skeleton.dispose();
    this.debug.dispose();
  }
}
