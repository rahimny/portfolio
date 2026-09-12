import * as THREE from 'three';
import {
  JOINTS,
  transforms,
  type HandPose,
} from '../../features/autonomous-hand/rig';
import { identity, v } from '../../features/scene-interactions/math';
import { MACHINE_COLORS } from '../materials/machinePalette';
import { HandTeleportMaterial } from './HandTeleportMaterial';

interface Plate {
  joint: number;
  matrix: THREE.Matrix4;
}

/** The study's articulation expressed as the drone's stepped armour and exposed joints. */
export class MechanicalHandView {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = MACHINE_COLORS.map(
    (color) => new HandTeleportMaterial(color)
  );
  private readonly plates: Plate[][] = [[], [], []];
  private readonly batches: THREE.InstancedMesh[];
  private readonly jointMatrices = JOINTS.map(() => new THREE.Matrix4());
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly unit = new THREE.Vector3(1, 1, 1);
  private disposed = false;

  constructor() {
    const plate = (
      joint: number,
      color: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number
    ) => {
      const matrix = new THREE.Matrix4().makeScale(sx, sy, sz);
      matrix.setPosition(x, y, z);
      this.plates[color].push({ joint, matrix });
    };
    const u = 0.12;
    for (let x = -4; x <= 4; x++)
      for (let y = -4; y <= 3; y++) {
        if (Math.abs(x) === 4 && (y === -4 || y === 3)) continue;
        plate(0, 1, x * u, y * u, -0.035, u, u, 0.32);
        plate(
          0,
          y === -2 && x >= -2 && x <= 1 ? 2 : 0,
          x * u,
          y * u,
          0.15,
          u - 0.008,
          u - 0.008,
          0.11
        );
        plate(0, 0, x * u, y * u, -0.22, u - 0.008, u - 0.008, 0.055);
      }
    // Cuff, recessed bus and a single orange power rail.
    plate(0, 1, 0, -0.66, 0, 0.56, 0.26, 0.34);
    plate(0, 0, 0, -0.88, 0, 0.68, 0.2, 0.42);
    plate(0, 2, 0, -0.88, 0.22, 0.3, 0.05, 0.035);
    for (let i = 1; i < JOINTS.length; i++) {
      const j = JOINTS[i],
        width = j.radius * 1.85;
      plate(
        i,
        1,
        0,
        j.length * 0.42,
        0,
        width * 0.63,
        j.length * 0.95,
        width * 0.68
      );
      plate(i, 1, 0, 0.015, 0, width * 1.08, 0.09, width * 0.82);
      for (let row = 0; row < 2; row++) {
        const y = j.length * (0.26 + row * 0.42);
        plate(i, 0, 0, y, width * 0.24, width, j.length * 0.38, width * 0.43);
        plate(
          i,
          0,
          0,
          y,
          -width * 0.3,
          width * 0.88,
          j.length * 0.38,
          width * 0.22
        );
      }
      if (j.segment === 2) {
        plate(
          i,
          0,
          0,
          j.length + j.radius * 0.3,
          0,
          width * 0.78,
          j.radius * 0.8,
          width * 0.76
        );
        plate(
          i,
          j.finger === 0 ? 2 : 1,
          0,
          j.length + j.radius * 0.85,
          0,
          width * 0.42,
          j.radius * 0.3,
          width * 0.42
        );
      }
    }
    this.batches = this.plates.map((plates, color) => {
      const mesh = new THREE.InstancedMesh(
        this.geometry,
        this.materials[color],
        plates.length
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
  }

  update(pose: HandPose, reveal: number, time: number) {
    this.group.position.set(pose.root.x, pose.root.y, pose.root.z);
    this.group.quaternion.set(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w
    );
    const joints = transforms({
      root: v(),
      rotation: identity(),
      joints: pose.joints,
    });
    joints.forEach((joint, id) => {
      this.position.set(joint.position.x, joint.position.y, joint.position.z);
      this.rotation.set(
        joint.rotation.x,
        joint.rotation.y,
        joint.rotation.z,
        joint.rotation.w
      );
      this.jointMatrices[id].compose(this.position, this.rotation, this.unit);
    });
    this.batches.forEach((mesh, color) => {
      this.plates[color].forEach((plate, id) => {
        this.matrix.multiplyMatrices(
          this.jointMatrices[plate.joint],
          plate.matrix
        );
        mesh.setMatrixAt(id, this.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.materials[color].reveal.value = reveal;
      this.materials[color].time.value = time;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.batches.forEach((mesh) => mesh.dispose());
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.group.clear();
  }
}
