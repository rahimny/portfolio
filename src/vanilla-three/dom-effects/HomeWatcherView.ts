import * as THREE from 'three';
import type { HomeWatcher } from '../../features/home/HomeWatcher';

type Part = {
  material: number;
  parent: 'body' | 'head';
  matrix: THREE.Matrix4;
};
const UP = new THREE.Vector3(0, 1, 0);

/** Three box batches, one optic, one small contact shadow. No textures,
 * postprocessing or shadow-map pass. All scratch storage lives with the view. */
export class HomeWatcherView {
  readonly root = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = [
    new THREE.MeshLambertMaterial({ color: 0xdedfd3 }),
    new THREE.MeshLambertMaterial({ color: 0x203033 }),
    new THREE.MeshLambertMaterial({ color: 0xdf542c }),
  ];
  private readonly batches = this.materials.map((material) => {
    const mesh = new THREE.InstancedMesh(this.box, material, 96);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    return mesh;
  });
  private readonly counts = new Uint8Array(3);
  private readonly parts: Part[] = [];
  private readonly body = new THREE.Matrix4();
  private readonly head = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly angles = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly direction = new THREE.Vector3();
  private readonly lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12),
    new THREE.MeshBasicMaterial({ color: 0x080f12 })
  );
  private readonly shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(6.6, 4.4),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec2 vUv; void main() { float r = length((vUv - 0.5) * 2.0); gl_FragColor = vec4(0.08, 0.1, 0.09, 0.16 * pow(max(0.0, 1.0 - r), 2.0)); }',
    })
  );
  private revision = -1;
  private disposed = false;

  constructor() {
    this.root.rotation.x = 0.48;
    this.root.add(...this.batches, this.lens, this.shadow);
    this.lens.matrixAutoUpdate = false;
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -0.03;
    this.shadow.renderOrder = -1;
    const part = (
      material: number,
      parent: Part['parent'],
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number
    ) => {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, d)
      );
      this.parts.push({ material, parent, matrix });
    };
    part(1, 'body', 0, 0, 0, 1.8, 0.64, 1.65);
    part(0, 'body', 0, 0.38, 0, 1.93, 0.16, 1.77);
    part(0, 'body', -0.86, 0, 0, 0.13, 0.48, 1.38);
    part(0, 'body', 0.86, 0, 0, 0.13, 0.48, 1.38);
    for (let i = 0; i < 5; i++)
      part(0, 'body', -0.54 + i * 0.27, 0.02, 0.84, 0.095, 0.28, 0.04);
    part(1, 'body', 0, 0.62, 0, 0.46, 0.44, 0.48);
    part(2, 'body', 0, 0.48, 0, 0.63, 0.12, 0.62);
    for (const side of [-1, 1]) {
      part(1, 'body', side * 0.73, 0.94, 0, 0.15, 0.86, 0.34);
      part(2, 'head', side * 0.7, 0, 0, 0.11, 0.25, 0.27);
    }
    part(0, 'head', 0, 0, -0.14, 1.33, 0.67, 1.52);
    part(1, 'head', 0, 0, 0.65, 1.12, 0.52, 0.12);
    part(0, 'head', 0, 0.4, 0.02, 1.49, 0.12, 1.99);
    part(0, 'head', -0.7, 0.16, 0.49, 0.09, 0.47, 0.98);
    part(0, 'head', 0.7, 0.16, 0.49, 0.09, 0.47, 0.98);
    part(2, 'head', 0.4, -0.14, 0.723, 0.065, 0.065, 0.035);
    // Two small reflections keep the recessed lens legible at phone size.
    part(0, 'head', -0.07, 0.09, 0.81, 0.075, 0.04, 0.015);
    part(0, 'head', 0.08, -0.06, 0.81, 0.035, 0.025, 0.015);
  }

  frame(state: HomeWatcher, originX: number, originY: number) {
    this.root.visible = state.enabled && state.visible && state.inView;
    if (!this.root.visible || this.disposed) return;
    this.root.position.set(originX + state.x, originY - state.floor, 25);
    this.root.scale.setScalar(state.scale);
    if (this.revision === state.revision) return;
    this.revision = state.revision;
    this.counts.fill(0);
    this.position.set(state.balance, 1.85 - state.crouch + state.lift, 0);
    this.rotation.setFromEuler(this.angles.set(0, state.bodyYaw, state.roll));
    this.body.compose(this.position, this.rotation, this.size.set(1, 1, 1));
    this.position.set(0, 1.15, 0);
    this.rotation.setFromEuler(
      this.angles.set(
        state.headPitch,
        state.headYaw,
        -state.roll * 0.8 + state.headCant
      )
    );
    this.head.compose(this.position, this.rotation, this.size);
    this.head.premultiply(this.body);
    for (const part of this.parts) {
      this.matrix.multiplyMatrices(
        part.parent === 'body' ? this.body : this.head,
        part.matrix
      );
      this.batches[part.material].setMatrixAt(
        this.counts[part.material]++,
        this.matrix
      );
    }
    const joints = state.joints;
    for (let leg = 0; leg < 8; leg++) {
      const j = leg * 12;
      for (let section = 0; section < 3; section++) {
        const a = j + section * 3,
          b = a + 3;
        this.direction.set(
          joints[b] - joints[a],
          joints[b + 1] - joints[a + 1],
          joints[b + 2] - joints[a + 2]
        );
        const length = this.direction.length();
        this.rotation.setFromUnitVectors(
          UP,
          this.direction.multiplyScalar(1 / Math.max(0.001, length))
        );
        this.position.set(
          (joints[a] + joints[b]) / 2,
          (joints[a + 1] + joints[b + 1]) / 2,
          (joints[a + 2] + joints[b + 2]) / 2
        );
        const width = section === 0 ? 0.23 : section === 1 ? 0.14 : 0.13;
        this.local.compose(
          this.position,
          this.rotation,
          this.size.set(width, length, width)
        );
        const material = section === 0 ? 0 : 1;
        this.batches[material].setMatrixAt(this.counts[material]++, this.local);
        this.position.set(joints[a], joints[a + 1], joints[a + 2]);
        this.rotation.identity();
        this.local.compose(
          this.position,
          this.rotation,
          this.size.setScalar(section === 0 ? 0.25 : 0.21)
        );
        this.batches[1].setMatrixAt(this.counts[1]++, this.local);
      }
      this.position.set(joints[j + 9], joints[j + 10], joints[j + 11]);
      this.local.compose(
        this.position,
        this.rotation.identity(),
        this.size.set(0.25, 0.07, 0.3)
      );
      this.batches[1].setMatrixAt(this.counts[1]++, this.local);
    }
    this.local.makeRotationX(Math.PI / 2);
    this.local.setPosition(0, 0, 0.74);
    this.lens.matrix.multiplyMatrices(this.head, this.local);
    for (let i = 0; i < this.batches.length; i++) {
      this.batches[i].count = this.counts[i];
      this.batches[i].instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.box.dispose();
    this.materials.forEach((material) => material.dispose());
    this.batches.forEach((batch) => batch.dispose());
    this.lens.geometry.dispose();
    this.lens.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.root.clear();
  }
}
