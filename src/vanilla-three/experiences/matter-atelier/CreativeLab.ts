import {
  BATH_DROPS,
  BATH_LEVEL,
  sampleBathDrop,
} from '@/features/matter-atelier/bath';
import type { PrintJob } from '@/features/matter-atelier/types';
import { batchStaticMeshes } from './sceneResources';
import * as THREE from 'three/webgpu';
import { SceneAssembly } from './SceneAssembly';
import { FusionCore } from './FusionCore';
import {
  BATH,
  PRINTER,
  DISPLAY,
  OBJECT_SCALE,
  type ProcessState,
  type Treatment,
} from '@/features/matter-atelier/process';
import {
  createBathInputs,
  createBathMaterial,
  worldIndex,
  type AtelierWorld,
} from './treatmentNodes';

export class CreativeLab extends SceneAssembly {
  private carrier = new THREE.Group();
  private trolley = new THREE.Group();
  private cables: THREE.InstancedMesh;
  private drops: THREE.InstancedMesh;
  private threads: THREE.InstancedMesh;
  private collar = new THREE.Group();
  private glow: THREE.PointLight;
  private dummy = new THREE.Object3D();
  private uniforms = createBathInputs();
  private fusion: FusionCore;
  private worldStyle: AtelierWorld = 'atelier';
  constructor(scene: THREE.Scene) {
    super(scene);
    const shell = this.material(0xe4e9e9, 0.27, 0.35);
    const dark = this.material(0x263544, 0.55, 0.32);
    const metal = this.material(0xabc0c7, 0.92, 0.22);
    const accent = this.material(0xdf6937, 0.25, 0.34);
    const railHeight = 5.75;
    // Rear uprights carry cantilevered rails, leaving the audience side open.
    for (const x of [-7.1, 8.2]) {
      this.box(
        scene,
        [0.17, railHeight, 0.17],
        [x, railHeight / 2, -4.5],
        metal
      );
      this.box(scene, [0.2, 0.18, 10.3], [x, railHeight + 0.05, 0.55], shell);
    }
    this.box(scene, [15.5, 0.16, 0.18], [0.55, railHeight + 0.05, -4.5], shell);
    this.box(
      this.trolley,
      [15.2, 0.16, 0.18],
      [0.55, railHeight - 0.02, 0],
      dark
    );
    const carrierRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.23, 0.045, 8, 64),
      metal
    );
    carrierRim.rotation.x = Math.PI / 2;
    carrierRim.position.y = 0.58;
    this.carrier.add(carrierRim);
    // An open cradle supports the specimen without hiding drainage into the bath.
    this.box(this.carrier, [2.4, 0.06, 0.055], [0, 0.58, 0], metal);
    this.box(this.carrier, [0.055, 0.06, 2.4], [0, 0.58, 0], metal);
    for (const x of [-1.15, 1.15]) {
      this.box(this.carrier, [0.13, 0.1, 2.3], [x, 0.65, 0], dark);
      this.box(this.carrier, [0.06, 0.25, 0.16], [x, 0.76, 0], accent);
    }
    this.carrier.userData.movable = true;
    scene.add(this.carrier, this.trolley);
    this.cables = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1, 6),
      dark,
      4
    );
    this.cables.frustumCulled = false;
    scene.add(this.cables);
    this.cylinder(scene, 1.8, 0.42, [BATH.x, 0.25, BATH.z], shell);
    this.cylinder(scene, 1.6, 0.07, [BATH.x, 0.48, BATH.z], dark);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.68, 0.09, 12, 96),
      metal
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(BATH.x, 0.55, BATH.z);
    scene.add(rim);
    const fluid = new THREE.Mesh(
      new THREE.PlaneGeometry(3.22, 3.22, 96, 96),
      createBathMaterial(this.uniforms)
    );
    fluid.rotation.x = -Math.PI / 2;
    fluid.position.set(BATH.x, 0.535, BATH.z);
    scene.add(fluid);
    this.fusion = new FusionCore(scene);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.085, 12, 80),
      shell
    );
    ring.rotation.x = Math.PI / 2;
    this.collar.add(ring);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(1.43, 0.024, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0x8ba9e7 })
    );
    inner.rotation.x = Math.PI / 2;
    this.collar.add(inner);
    for (const x of [-1.95, 1.95]) {
      this.box(scene, [0.16, 3.6, 0.22], [BATH.x + x, 1.9, BATH.z], shell);
      this.box(
        scene,
        [0.035, 3.3, 0.04],
        [BATH.x + x, 1.9, BATH.z + 0.14],
        metal
      );
      this.box(this.collar, [0.45, 0.16, 0.2], [x * 0.9, 0, 0], dark);
    }
    this.collar.position.set(BATH.x, 3.35, BATH.z);
    scene.add(this.collar);
    this.glow = new THREE.PointLight(0x6a74ff, 0, 7, 2);
    this.glow.position.set(BATH.x, 1.5, BATH.z);
    scene.add(this.glow);
    this.drops = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.3,
        clearcoat: 1,
      }),
      BATH_DROPS
    );
    this.drops.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < BATH_DROPS; i++)
      this.drops.setColorAt(i, color.setHSL(i / BATH_DROPS, 0.85, 0.52));
    this.threads = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 6),
      this.drops.material,
      BATH_DROPS
    );
    this.threads.frustumCulled = false;
    for (let i = 0; i < BATH_DROPS; i++)
      this.threads.setColorAt(i, color.setHSL(i / BATH_DROPS, 0.85, 0.52));
    scene.add(this.drops, this.threads);
    this.cylinder(scene, 1.6, 0.48, [DISPLAY.x, 0.25, DISPLAY.z], shell);
    this.cylinder(scene, 1.5, 0.06, [DISPLAY.x, 0.52, DISPLAY.z], dark);
    this.label(
      '03 / SPECTRAL BATH',
      2.6,
      [BATH.x, 0.22, BATH.z + 1.83],
      scene,
      '#263544'
    );
    this.label(
      '04 / EDITION',
      1.65,
      [DISPLAY.x, 0.25, DISPLAY.z + 1.63],
      scene,
      '#263544'
    );
    this.label(
      '01 / FABRICATION',
      2.7,
      [PRINTER.x, 0.17, PRINTER.z + 1.85],
      scene,
      '#263544'
    );
    for (const group of [this.carrier, this.collar, this.trolley])
      batchStaticMeshes(group);
  }
  setSoftness(value: number) {
    this.uniforms.softness.value = Math.max(0, Math.min(1, value));
  }
  setWorld(world: AtelierWorld) {
    this.uniforms.world.value = worldIndex(world);
    this.worldStyle = world;
  }
  update(
    process: ProcessState,
    treatment: Treatment,
    seed: number,
    job: PrintJob,
    pigment: number,
    carrier?: {
      position: { x: number; y: number; z: number };
      engaged: boolean;
    },
    factoryTime?: number
  ) {
    this.fusion.setJob(job);
    this.fusion.update(
      factoryTime ?? process.elapsed,
      process,
      seed,
      this.uniforms.softness.value,
      this.worldStyle
    );
    const p = carrier?.position ?? process.object;
    this.carrier.position.set(p.x, p.y, p.z);
    this.trolley.position.z = p.z;
    for (let i = 0; i < 4; i++) {
      const x = p.x + (i % 2 ? 1.13 : -1.13),
        z = p.z + (i < 2 ? -1.13 : 1.13);
      const bottom = p.y + 0.83;
      this.dummy.position.set(x, (bottom + 5.7) / 2, z);
      this.dummy.scale.set(1, 5.7 - bottom, 1);
      this.dummy.quaternion.identity();
      this.dummy.updateMatrix();
      this.cables.setMatrixAt(i, this.dummy.matrix);
    }
    this.cables.instanceMatrix.needsUpdate = true;
    this.cables.visible =
      !!carrier ||
      (process.stage !== 'printing' && process.stage !== 'complete');
    this.uniforms.phase.value =
      (factoryTime === undefined ? process.spectral * 18 : factoryTime * 0.8) +
      seed * 0.7 +
      pigment * 7;
    this.uniforms.immersion.value = process.spectral;
    this.uniforms.activation.value =
      Math.sin(Math.PI * process.spectral) * 0.7 + process.sweep * 0.3;
    this.uniforms.treatment.value = [
      'prismatic',
      'recursive',
      'glitch',
    ].indexOf(treatment);
    this.collar.position.y =
      factoryTime === undefined
        ? process.stage === 'painting'
          ? 0.85 + process.sweep * 2.6
          : 3.45
        : 2.9 + 0.28 * Math.sin(process.spectral * Math.PI * 2 - 0.5);
    this.glow.intensity =
      process.stage === 'spectral'
        ? 3.2 * Math.sin(Math.PI * process.spectral)
        : 0;
    this.glow.color.setHSL((process.spectral * 0.8 + 0.6) % 1, 0.8, 0.65);
    this.threads.visible = process.stage === 'spectral';
    this.drops.visible = process.stage === 'spectral';
    for (let i = 0; i < BATH_DROPS; i++) {
      const drop = sampleBathDrop(job, process.spectral, i);
      this.uniforms.impactValues[i].set(
        (drop.x - BATH.x) / 1.61,
        -(drop.z - BATH.z) / 1.61,
        drop.impactAge,
        drop.radius
      );
      this.dummy.position.set(drop.x, Math.max(BATH_LEVEL, drop.y), drop.z);
      this.dummy.scale.setScalar(drop.visible ? drop.radius : 0);
      this.dummy.scale.y *= drop.attached ? 1 + drop.stretch * 3 : 1.8;
      this.dummy.quaternion.identity();
      this.dummy.updateMatrix();
      this.drops.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = (drop.originY + drop.y) / 2;
      const width = drop.attached
        ? drop.radius * 0.5 * (1 - drop.stretch * 0.75)
        : 0;
      this.dummy.scale.set(
        width,
        Math.max(0.001, drop.originY - drop.y),
        width
      );
      this.dummy.updateMatrix();
      this.threads.setMatrixAt(i, this.dummy.matrix);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    this.threads.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.fusion.dispose();
  }
  static objectScale = OBJECT_SCALE;
}
