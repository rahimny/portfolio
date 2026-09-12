import { solveBrushArm } from '@/features/matter-atelier/brushKinematics';
import { batchStaticMeshes } from './sceneResources';
import * as THREE from 'three';
import { SceneAssembly } from './SceneAssembly';
import { BRUSH_BASE } from '@/features/matter-atelier/process';
import { DIP, type sampleBrush } from '@/features/matter-atelier/painting';

export class PainterRig extends SceneAssembly {
  private turret = new THREE.Group();
  private upper = new THREE.Group();
  private fore = new THREE.Group();
  private wrist = new THREE.Group();
  private bristles: THREE.InstancedMesh;
  private stains: THREE.InstancedMesh;
  private tether: THREE.Mesh;
  private bead: THREE.Mesh;
  private strandStart = new THREE.Vector3();
  private strandMid = new THREE.Vector3();
  private joints: THREE.Mesh[] = [];
  private dummy = new THREE.Object3D();
  private up = new THREE.Vector3(0, 1, 0);
  private shoulder = new THREE.Vector3(BRUSH_BASE.x, 1.35, BRUSH_BASE.z);
  private elbow = new THREE.Vector3();
  private target = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private hinge = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private frame = new THREE.Matrix4();
  private sensor = new THREE.Group();
  private sensorLight = new THREE.MeshBasicMaterial({ color: 0x355aca });
  private bristleEnd = new THREE.Vector3();
  constructor(scene: THREE.Scene) {
    super(scene);
    const shell = new THREE.MeshPhysicalMaterial({
      color: 0xf2f0e6,
      metalness: 0.12,
      roughness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.2,
    });
    const inset = this.material(0xd7763c, 0.35, 0.3);
    const graphite = this.material(0x27303a, 0.5, 0.3);
    const chrome = this.material(0xbecbd0, 0.95, 0.17);
    this.cylinder(scene, 0.78, 0.18, [BRUSH_BASE.x, 0.16, BRUSH_BASE.z], shell);
    this.cylinder(
      scene,
      0.59,
      0.11,
      [BRUSH_BASE.x, 0.31, BRUSH_BASE.z],
      graphite
    );
    this.cylinder(scene, 0.52, 0.055, [BRUSH_BASE.x, 0.4, BRUSH_BASE.z], inset);
    this.turret.position.set(BRUSH_BASE.x, 0.42, BRUSH_BASE.z);
    this.box(this.turret, [0.58, 0.8, 0.62], [0, 0.4, 0], shell, 0.065);
    this.box(this.turret, [0.6, 0.5, 0.035], [0, 0.46, 0.32], inset);
    scene.add(this.turret, this.upper, this.fore, this.wrist);
    this.box(this.sensor, [0.42, 0.2, 0.23], [0, 0, 0], shell, 0.06);
    this.box(
      this.sensor,
      [0.34, 0.115, 0.025],
      [0, 0.005, 0.12],
      graphite,
      0.035
    );
    for (const x of [-0.09, 0.09]) {
      const lens = this.cylinder(
        this.sensor,
        0.034,
        0.012,
        [x, 0.008, 0.14],
        this.sensorLight
      );
      lens.rotation.x = Math.PI / 2;
      lens.castShadow = false;
    }
    this.sensor.position.set(BRUSH_BASE.x - 0.38, 1.47, BRUSH_BASE.z + 0.18);
    this.sensor.userData.movable = true;
    batchStaticMeshes(this.sensor);
    scene.add(this.sensor);
    for (const [group, length, width] of [
      [this.upper, 2.0, 0.4],
      [this.fore, 2.05, 0.32],
    ] as const) {
      const profile = [
        [0.08, 0.09],
        [width * 0.48, 0.18],
        [width * 0.66, 0.4],
        [width * 0.62, length * 0.5],
        [width * 0.47, length - 0.32],
        [0.09, length - 0.08],
      ].map(([radius, y]) => new THREE.Vector2(radius, y));
      const casing = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 28),
        shell
      );
      casing.castShadow = casing.receiveShadow = true;
      group.add(casing);
      this.box(
        group,
        [0.06, length - 0.75, 0.07],
        [width * 0.58, length * 0.51, 0.04],
        inset,
        0.025
      );
      for (const y of [0.16, length - 0.15]) {
        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(width * 0.34, 0.025, 6, 24),
          chrome
        );
        collar.rotation.x = Math.PI / 2;
        collar.position.y = y;
        group.add(collar);
      }
      for (const x of [-width * 0.8, width * 0.8]) {
        this.cylinder(
          group,
          0.035,
          length - 0.18,
          [x, length / 2, -0.14],
          chrome
        );
        this.cylinder(
          group,
          0.063,
          (length - 0.18) * 0.48,
          [x, length * 0.32, -0.14],
          graphite
        );
      }
      for (const y of [0.07, length - 0.07]) {
        const pin = this.cylinder(group, 0.16, width + 0.18, [0, y, 0], chrome);
        pin.rotation.z = Math.PI / 2;
      }
    }
    for (let i = 0; i < 3; i++) {
      const joint = new THREE.Mesh(
        new THREE.SphereGeometry(i === 2 ? 0.14 : 0.21, 16, 12),
        chrome
      );
      const motor = new THREE.Mesh(
        new THREE.CylinderGeometry(
          i === 2 ? 0.105 : 0.17,
          i === 2 ? 0.105 : 0.17,
          0.44,
          28
        ),
        shell
      );
      motor.rotation.z = Math.PI / 2;
      joint.add(motor);
      for (const side of [-1, 1]) {
        const bearing = new THREE.Mesh(
          new THREE.TorusGeometry(i === 2 ? 0.083 : 0.13, 0.017, 6, 28),
          chrome
        );
        bearing.rotation.y = Math.PI / 2;
        bearing.position.x = side * 0.225;
        joint.add(bearing);
      }
      joint.userData.movable = true;
      scene.add(joint);
      this.joints.push(joint);
    }
    this.box(this.wrist, [0.24, 0.2, 0.23], [0, 0.13, 0], graphite, 0.03);
    this.cylinder(this.wrist, 0.065, 0.32, [0, -0.12, 0], shell);
    this.box(this.wrist, [0.34, 0.16, 0.1], [0, -0.32, 0], chrome, 0.018);
    this.bristles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.009, 0.014, 1, 5),
      this.material(0x263dc3, 0.18, 0.3),
      120
    );
    this.bristles.castShadow = true;
    this.bristles.frustumCulled = false;
    scene.add(this.bristles);
    const ink = new THREE.MeshPhysicalMaterial({
      color: 0x1426ab,
      roughness: 0.12,
      clearcoat: 1,
      metalness: 0.12,
    });
    this.tether = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), ink);
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), ink);
    this.tether.userData.movable = this.bead.userData.movable = true;
    scene.add(this.tether, this.bead);
    this.stains = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      ink,
      3
    );
    this.stains.frustumCulled = false;
    scene.add(this.stains);
    this.box(scene, [0.88, 0.11, 0.88], [DIP.x, 0.1, DIP.z], graphite, 0.04);
    this.cylinder(scene, 0.47, 0.06, [DIP.x, 0.185, DIP.z], inset);
    this.cylinder(scene, 0.42, 0.35, [DIP.x, 0.39, DIP.z], shell);
    this.cylinder(
      scene,
      0.34,
      0.025,
      [DIP.x, 0.57, DIP.z],
      this.material(0x1c33aa, 0.2, 0.13)
    );
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.375, 0.025, 8, 32),
      chrome
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.set(DIP.x, 0.58, DIP.z);
    scene.add(lip);
    this.label(
      'PIGMENT / 01',
      0.82,
      [DIP.x, 0.105, DIP.z + 0.45],
      scene,
      '#c6d2d6'
    );
    this.label(
      '02 / GESTURE',
      1.7,
      [BRUSH_BASE.x, 0.21, BRUSH_BASE.z + 0.795],
      scene,
      '#26303a'
    );
    for (const group of [this.turret, this.upper, this.fore, this.wrist])
      batchStaticMeshes(group);
  }
  private place(group: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
    group.position.copy(from);
    this.direction.subVectors(to, from).normalize();
    // Both links share a hinge axis. Minimal vector-to-vector rotation has an
    // unconstrained roll near the downward pole and can visibly flip the casing.
    this.forward.crossVectors(this.hinge, this.direction).normalize();
    this.frame.makeBasis(this.hinge, this.direction, this.forward);
    group.quaternion.setFromRotationMatrix(this.frame);
  }
  update(pose: ReturnType<typeof sampleBrush>, load = 0, toolScale = 1) {
    const solved = solveBrushArm(pose);
    this.target.copy(solved.wrist);
    this.sensor.lookAt(pose.x, Math.max(0.25, pose.y), pose.z);
    this.sensor.rotation.x = THREE.MathUtils.clamp(
      this.sensor.rotation.x,
      -0.65,
      0.65
    );
    this.sensorLight.color.setHex(
      pose.contact ? 0x365aca : load > 0.005 ? 0x67b9ba : 0xe98e4b
    );
    this.elbow.copy(solved.elbow);
    this.hinge.copy(solved.hinge);
    this.turret.rotation.y = solved.azimuth;
    this.place(this.upper, this.shoulder, this.elbow);
    this.place(this.fore, this.elbow, this.target);
    this.joints[0].position.copy(this.shoulder);
    this.joints[1].position.copy(this.elbow);
    this.joints[2].position.copy(this.target);
    this.wrist.position.copy(this.target);
    this.wrist.scale.set(toolScale < 1 ? 0.42 : 1, 1, toolScale < 1 ? 0.42 : 1);
    this.wrist.rotation.y = -pose.angle + Math.PI / 2;
    const saturation = Math.min(1, load / 0.04);
    const inkMaterial = this.bristles.material as THREE.MeshStandardMaterial;
    inkMaterial.color.setRGB(
      0.08 + (1 - saturation) * 0.16,
      0.1 + (1 - saturation) * 0.13,
      0.45
    );
    inkMaterial.roughness = 0.5 - saturation * 0.36;
    for (let i = 0; i < 40; i++) {
      const lateral = ((i % 10) - 4.5) * 0.03 * toolScale;
      const depth = (Math.floor(i / 10) - 1.5) * 0.022 * toolScale;
      this.strandStart.set(
        this.target.x - Math.sin(pose.angle) * lateral,
        this.target.y - 0.39,
        this.target.z + Math.cos(pose.angle) * lateral
      );
      const fan = 1 + pose.pressure * 0.62;
      this.bristleEnd.set(
        pose.x -
          Math.sin(pose.angle) * lateral * fan -
          Math.cos(pose.angle) * pose.pressure * 0.16 * toolScale,
        pose.y + 0.012 + depth * 0.2,
        pose.z +
          Math.cos(pose.angle) * lateral * fan -
          Math.sin(pose.angle) * pose.pressure * 0.16 * toolScale
      );
      this.strandMid.copy(this.strandStart).lerp(this.bristleEnd, 0.5);
      this.strandMid.y -= pose.pressure * 0.07;
      const curve = (t: number, out: THREE.Vector3) =>
        out
          .copy(this.strandStart)
          .multiplyScalar((1 - t) ** 2)
          .addScaledVector(this.strandMid, 2 * t * (1 - t))
          .addScaledVector(this.bristleEnd, t * t);
      for (let part = 0; part < 3; part++) {
        curve(part / 3, this.direction);
        curve((part + 1) / 3, this.dummy.position);
        this.dummy.position.add(this.direction).multiplyScalar(0.5);
        this.direction.sub(this.dummy.position).multiplyScalar(-2);
        this.dummy.scale.set(
          Math.sqrt(toolScale),
          this.direction.length(),
          Math.sqrt(toolScale)
        );
        this.dummy.quaternion.setFromUnitVectors(
          this.up,
          this.direction.normalize()
        );
        this.dummy.updateMatrix();
        this.bristles.setMatrixAt(i * 3 + part, this.dummy.matrix);
      }
    }
    this.tether.visible = pose.tether > 0 && load > 0;
    this.tether.position.set(
      pose.anchor.x,
      (pose.surfaceY + pose.y) / 2,
      pose.anchor.z
    );
    const radius = 0.023 * Math.sqrt(toolScale) * (1 - pose.tether * 0.85);
    this.tether.scale.set(
      radius,
      Math.max(0.001, pose.y - pose.surfaceY),
      radius
    );
    this.bead.visible = (pose.tether > 0 || pose.dipping) && load > 0;
    this.bead.position.set(pose.x, pose.y + 0.017, pose.z);
    this.bead.scale.set(
      0.045 * saturation * Math.sqrt(toolScale),
      0.025 + pose.tether * 0.04,
      0.045 * saturation
    );
    for (let i = 0; i < 3; i++) {
      const stained =
        pose.reloadId > i || (pose.reloadId === i && pose.loadProgress > 0.5);
      const angle = -0.3 + i * 0.8;
      this.dummy.position.set(
        DIP.x + Math.sin(angle) * 0.42,
        0.46 - i * 0.04,
        DIP.z + Math.cos(angle) * 0.42
      );
      this.dummy.quaternion.identity();
      this.dummy.scale.set(0.028, 0.12 + i * 0.04, 0.017);
      if (!stained) this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.stains.setMatrixAt(i, this.dummy.matrix);
    }
    this.stains.instanceMatrix.needsUpdate = true;
    this.bristles.instanceMatrix.needsUpdate = true;
  }
}
