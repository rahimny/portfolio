import * as THREE from 'three';
import { MACHINE_COLORS } from '../../materials/machinePalette';
import { FLIGHT, type RigPose } from '../../../features/can-control/performer';

type Block = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
};

/** One reusable voxel unit, three finishes, four guarded rotors and a real mount. */
export class VoxelDrone {
  readonly root = new THREE.Group();
  readonly mount = new THREE.Group();
  readonly nozzleTip = new THREE.Object3D();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = [
    new THREE.MeshPhongMaterial({ color: MACHINE_COLORS[0], shininess: 24 }),
    new THREE.MeshPhongMaterial({ color: MACHINE_COLORS[1], shininess: 16 }),
    new THREE.MeshPhongMaterial({ color: MACHINE_COLORS[2], shininess: 28 }),
  ];
  private readonly rotors: THREE.Mesh[] = [];
  private readonly batches: THREE.InstancedMesh[] = [];
  private disposed = false;

  constructor() {
    const blocks: Block[] = [];
    const unit = 0.035;
    const cube = (x: number, y: number, z: number, color: number) =>
      blocks.push({
        x: x * unit,
        y: y * unit,
        z: z * unit,
        sx: unit,
        sy: unit,
        sz: unit,
        color,
      });
    for (let x = -3; x <= 3; x++)
      for (let y = 0; y <= 2; y++)
        for (let z = -2; z <= 2; z++) {
          if (y === 2 && Math.abs(x) === 3 && Math.abs(z) === 2) continue;
          cube(x, y - 1, z, y === 0 ? 1 : 0);
        }
    for (let x = -1; x <= 1; x++) {
      cube(x, 0, 3, 1);
      cube(x, 1, 3, x === 0 ? 2 : 1);
    }
    for (const sideX of [-1, 1])
      for (const sideZ of [-1, 1]) {
        for (let step = 3; step <= 6; step++) {
          cube(sideX * step, 0, sideZ * Math.round(step * 0.8), 1);
        }
        const x = sideX * 0.245,
          z = sideZ * 0.2;
        for (let i = -2; i <= 2; i++)
          for (let j = -2; j <= 2; j++) {
            if (Math.abs(i) !== 2 && Math.abs(j) !== 2) continue;
            blocks.push({
              x: x + i * unit,
              y: 0.045,
              z: z + j * unit,
              sx: unit,
              sy: unit,
              sz: unit,
              color: 0,
            });
          }
        blocks.push({
          x,
          y: 0.025,
          z,
          sx: 0.045,
          sy: 0.035,
          sz: 0.045,
          color: 1,
        });
        const rotor = new THREE.Mesh(this.geometry, this.materials[1]);
        rotor.scale.set(0.098, 0.009, 0.016);
        rotor.position.set(x, 0.052, z);
        this.rotors.push(rotor);
        this.root.add(rotor);
      }
    // The stepped boom ends at the exact anchor used by the flight model.
    blocks.push(
      { x: 0, y: -0.07, z: -0.15, sx: 0.07, sy: 0.035, sz: 0.19, color: 1 },
      { x: 0, y: -0.145, z: -0.24, sx: 0.07, sy: 0.18, sz: 0.035, color: 1 },
      { x: 0, y: -0.22, z: -0.29, sx: 0.07, sy: 0.035, sz: 0.13, color: 1 },
      { x: 0, y: -0.16, z: -0.219, sx: 0.035, sy: 0.07, sz: 0.009, color: 2 }
    );
    this.buildBatch(this.root, blocks);
    this.mount.position.set(FLIGHT.anchor.x, FLIGHT.anchor.y, FLIGHT.anchor.z);
    this.root.add(this.mount);
    const can: Block[] = [];
    const u = 0.018;
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
        for (let y = 0; y < 8; y++)
          can.push({
            x: x * u,
            y: -0.04 - y * u,
            z: -FLIGHT.nozzleLength + 0.055 + z * u,
            sx: u,
            sy: u,
            sz: u,
            color: y === 3 || y === 4 ? 2 : 0,
          });
      }
    can.push(
      {
        x: -0.06,
        y: -0.025,
        z: -0.06,
        sx: 0.018,
        sy: 0.07,
        sz: 0.12,
        color: 1,
      },
      { x: 0.06, y: -0.025, z: -0.06, sx: 0.018, sy: 0.07, sz: 0.12, color: 1 },
      { x: 0, y: 0, z: 0, sx: 0.14, sy: 0.035, sz: 0.035, color: 0 },
      { x: 0, y: -0.012, z: -0.125, sx: 0.045, sy: 0.028, sz: 0.045, color: 1 },
      { x: 0, y: 0, z: -0.154, sx: 0.025, sy: 0.024, sz: 0.052, color: 1 },
      { x: 0, y: 0, z: -0.181, sx: 0.013, sy: 0.012, sz: 0.002, color: 2 }
    );
    this.buildBatch(this.mount, can);
    this.nozzleTip.position.set(0, 0, -FLIGHT.nozzleLength);
    this.mount.add(this.nozzleTip);
  }
  private buildBatch(parent: THREE.Group, blocks: Block[]) {
    const matrix = new THREE.Matrix4();
    for (let color = 0; color < this.materials.length; color++) {
      const selected = blocks.filter((b) => b.color === color);
      const batch = new THREE.InstancedMesh(
        this.geometry,
        this.materials[color],
        selected.length
      );
      selected.forEach((b, i) => {
        matrix.makeScale(b.sx, b.sy, b.sz);
        matrix.setPosition(b.x, b.y, b.z);
        batch.setMatrixAt(i, matrix);
      });
      batch.computeBoundingSphere();
      this.batches.push(batch);
      parent.add(batch);
    }
  }
  update(rig: RigPose) {
    this.root.position.set(rig.body.x, rig.body.y, rig.body.z);
    this.root.rotation.set(rig.angles.x, rig.angles.y, rig.angles.z, 'YXZ');
    this.mount.rotation.set(rig.mountPitch, rig.mountYaw, 0, 'YXZ');
    this.rotors.forEach((rotor, i) => {
      rotor.rotation.y = rig.rotor * (i % 2 ? -1 : 1) + (i * Math.PI) / 2;
    });
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.batches.forEach((batch) => batch.dispose());
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.root.clear();
  }
}
