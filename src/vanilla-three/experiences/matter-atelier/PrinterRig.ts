import { batchStaticMeshes } from './sceneResources';
import * as THREE from 'three';
import { SceneAssembly } from './SceneAssembly';
import { BED_Y, type samplePrint } from '@/features/matter-atelier/toolpath';
import type { sampleProcess } from '@/features/matter-atelier/process';
export class PrinterRig extends SceneAssembly {
  private gantry = new THREE.Group();
  private carriage = new THREE.Group();
  private head = new THREE.Group();
  private tip = new THREE.PointLight(0xffa43b, 2, 1.4, 2);
  private hotTip?: THREE.Mesh;
  private cable!: THREE.InstancedMesh;
  private scanner = new THREE.Group();
  private armLinks: THREE.Mesh[] = [];
  private armJoints: THREE.Mesh[] = [];
  private readonly cableCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 5, -1.8),
    new THREE.Vector3(0, 5.65, -1),
    new THREE.Vector3(),
    new THREE.Vector3()
  );
  private readonly dummy = new THREE.Object3D();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly root = new THREE.Vector3(-3.3, 0.55, 0.3);
  private readonly target = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly lastNozzle = new THREE.Vector3(Infinity, Infinity, Infinity);
  constructor(scene: THREE.Scene) {
    super(scene);
    this.build();
    for (const group of [this.gantry, this.carriage, this.head])
      batchStaticMeshes(group);
  }
  private build() {
    const shell = this.material(0xe5ebef, 0.22, 0.36);
    const edge = this.material(0x8f9dac, 0.7, 0.32);
    const dark = this.material(0x202b43, 0.35, 0.4);
    const chrome = this.material(0xa5bdc5, 0.95, 0.18);
    const accent = this.material(0xe76b33, 0.5, 0.32);
    const light = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xeaf1ff).multiplyScalar(1.2),
    });
    this.box(this.scene, [4.8, 0.46, 4.7], [0, 0.35, 0], shell, 0.1);
    this.box(this.scene, [4.5, 0.12, 4.4], [0, 0.64, 0], dark, 0.035);
    this.box(this.scene, [3.45, 0.12, 3.45], [0, 0.8, 0], edge);
    const grid = new THREE.GridHelper(3.35, 20, 0x738d94, 0x4a626c);
    grid.position.y = BED_Y + 0.001;
    this.scene.add(grid);
    this.label('M / 01', 0.85, [-1.4, 0.34, 2.357], this.scene, '#17252c');
    this.label(
      'ADDITIVE SYSTEM',
      1.35,
      [0.7, 0.34, 2.357],
      this.scene,
      '#17252c'
    );
    this.box(this.scene, [0.43, 0.045, 0.012], [1.95, 0.33, 2.365], light);
    for (const x of [-2.12, 2.12])
      for (const z of [-2, 2]) {
        this.box(this.scene, [0.23, 4.2, 0.24], [x, 2.72, z], shell);
        this.box(
          this.scene,
          [0.065, 3.75, 0.05],
          [x, 2.7, z + 0.13],
          dark,
          0.006
        );
        this.cylinder(
          this.scene,
          0.025,
          3.85,
          [x + (x > 0 ? -0.14 : 0.14), 2.65, z],
          chrome
        );
        this.box(this.scene, [0.5, 0.16, 0.5], [x, 0.08, z], dark);
        this.box(this.scene, [0.4, 0.23, 0.42], [x, 4.65, z], edge);
      }
    for (const z of [-2, 2])
      this.box(this.scene, [4.5, 0.18, 0.24], [0, 4.7, z], shell);
    for (const x of [-2.12, 2.12]) {
      this.box(this.scene, [0.24, 0.18, 4.2], [x, 4.7, 0], shell);
      this.box(this.scene, [0.035, 0.025, 3.7], [x * 0.96, 4.59, 0], light);
      this.box(this.gantry, [0.18, 0.24, 4.08], [x, 0.57, 0], edge);
      this.box(this.gantry, [0.03, 0.035, 3.8], [x, 0.715, 0], chrome);
    }
    this.box(this.carriage, [4.35, 0.12, 0.17], [0, 0.62, 0], chrome);
    this.box(this.carriage, [4.35, 0.06, 0.035], [0, 0.5, 0.1], dark);
    for (const x of [-2.12, 2.12])
      this.box(this.carriage, [0.34, 0.35, 0.48], [x, 0.59, 0], shell);
    this.box(this.head, [0.47, 0.5, 0.44], [0, 0.47, 0], shell, 0.065);
    this.box(this.head, [0.32, 0.25, 0.025], [0, 0.46, 0.225], dark);
    for (let i = 0; i < 5; i++)
      this.box(
        this.head,
        [0.24, 0.012, 0.02],
        [0, 0.38 + i * 0.04, 0.245],
        edge,
        0.003
      );
    this.box(this.head, [0.12, 0.11, 0.46], [0.22, 0.65, 0], accent);
    this.cylinder(this.head, 0.085, 0.14, [0, 0.15, 0], chrome);
    const nozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.16, 20),
      this.material(0xc99752, 0.9, 0.22)
    );
    nozzle.rotation.z = Math.PI;
    nozzle.position.y = 0.07;
    this.head.add(nozzle);
    this.hotTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffb767).multiplyScalar(5),
      })
    );
    this.head.add(this.hotTip);
    this.tip.position.y = 0.055;
    this.head.add(this.tip);
    this.carriage.add(this.head);
    this.gantry.add(this.carriage);
    this.scene.add(this.gantry);
    this.cable = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1, 8),
      dark,
      28
    );
    this.cable.frustumCulled = false;
    this.scene.add(this.cable);
    const spool = this.cylinder(this.scene, 0.42, 0.3, [0, 4.98, -1.95], dark);
    spool.rotation.x = Math.PI / 2;
    for (const z of [-2.13, -1.77]) {
      const flange = this.cylinder(this.scene, 0.49, 0.04, [0, 4.98, z], shell);
      flange.rotation.x = Math.PI / 2;
    }
    this.cylinder(this.scene, 0.42, 0.35, [-3.3, 0.3, 0.3], dark);
    for (let i = 0; i < 2; i++)
      this.armLinks.push(
        this.cylinder(this.scene, i ? 0.105 : 0.14, 1, [0, 0, 0], shell)
      );
    for (let i = 0; i < 3; i++) {
      const joint = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 20, 12),
        edge
      );
      this.scene.add(joint);
      this.armJoints.push(joint);
    }
    this.box(this.scanner, [0.28, 0.18, 0.32], [0, 0, 0], dark);
    this.box(this.scanner, [0.2, 0.025, 0.03], [0, 0, 0.17], light);
    for (const mesh of [...this.armLinks, ...this.armJoints])
      mesh.userData.movable = true;
    this.scene.add(this.scanner);
    this.label('SURFACE / 02', 0.7, [-3.3, 0.34, 0.73], this.scene, '#33425e');
  }

  private placeLink(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.scale.y = a.distanceTo(b);
    this.direction.subVectors(b, a).normalize();
    mesh.quaternion.setFromUnitVectors(this.up, this.direction);
  }
  public update(
    print: ReturnType<typeof samplePrint>,
    process: ReturnType<typeof sampleProcess>
  ) {
    const p = print.position;
    const extruding = print.move.extrude && process.stage === 'printing';
    this.tip.intensity = extruding ? 1.5 : 0;
    if (this.hotTip) this.hotTip.visible = extruding;
    if (
      this.lastNozzle.x !== p.x ||
      this.lastNozzle.y !== p.y ||
      this.lastNozzle.z !== p.z
    ) {
      this.gantry.position.y = p.y;
      this.carriage.position.z = p.z;
      this.head.position.x = p.x;
      this.cableCurve.v2.set(p.x, 5.5, p.z);
      this.cableCurve.v3.set(p.x, p.y + 0.75, p.z);
      for (let i = 0; i < 28; i++) {
        this.cableCurve.getPoint(i / 28, this.a);
        this.cableCurve.getPoint((i + 1) / 28, this.b);
        this.placeLink(this.dummy, this.a, this.b);
        this.dummy.updateMatrix();
        this.cable.setMatrixAt(i, this.dummy.matrix);
      }
      this.cable.instanceMatrix.needsUpdate = true;
      this.lastNozzle.set(p.x, p.y, p.z);
    }
    this.target.set(process.arm.x, process.arm.y, process.arm.z);
    this.direction.subVectors(this.target, this.root);
    const height = Math.sqrt(
      Math.max(0, 1.65 ** 2 - this.direction.lengthSq() / 4)
    );
    this.bend.set(-this.direction.y, this.direction.x, 0).normalize();
    this.elbow
      .copy(this.root)
      .lerp(this.target, 0.5)
      .addScaledVector(this.bend, height);
    this.placeLink(this.armLinks[0], this.root, this.elbow);
    this.placeLink(this.armLinks[1], this.elbow, this.target);
    this.armJoints[0].position.copy(this.root);
    this.armJoints[1].position.copy(this.elbow);
    this.armJoints[2].position.copy(this.target);
    this.scanner.position.copy(this.target);
    this.scanner.lookAt(0, process.arm.y, 0);
  }
}
