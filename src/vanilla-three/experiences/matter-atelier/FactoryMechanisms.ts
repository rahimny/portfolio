import * as THREE from 'three';
import { AtelierFibres } from './AtelierFibres';
import { SceneAssembly } from './SceneAssembly';
import {
  BRUSH_BASE,
  BATH,
  DISPLAY,
  ease,
} from '@/features/matter-atelier/process';
import { DIP } from '@/features/matter-atelier/painting';
import type { FactoryFrame } from './FactoryProduction';

/** Visible preparation and recovery driven by the production clock. */
export class FactoryMechanisms extends SceneAssembly {
  readonly group = new THREE.Group();
  private flow: THREE.InstancedMesh;
  private pipe: THREE.CatmullRomCurve3;
  private rotor = new THREE.Group();
  private iris: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private point = new THREE.Vector3();
  private colour = new THREE.Color();
  private lamp: THREE.Mesh;
  private tray: THREE.Mesh;
  private fibres: AtelierFibres;
  private communication = true;
  setFlora(enabled: boolean) {
    this.fibres.mesh.visible = enabled;
  }
  constructor(scene: THREE.Scene) {
    super(scene);
    scene.add(this.group);
    this.fibres = new AtelierFibres(this.group);
    const shell = this.material(0xe1e7e6, 0.25, 0.35),
      dark = this.material(0x243a4a, 0.5, 0.3),
      chrome = this.material(0xadc4cd, 0.8, 0.24);
    this.pipe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(DIP.x, 0.58, DIP.z - 0.4),
      new THREE.Vector3(-3.8, 0.25, 0.05),
      new THREE.Vector3(-1, 0.22, -0.6),
      new THREE.Vector3(2, 0.25, -0.8),
      new THREE.Vector3(BATH.x - 1.6, 0.55, BATH.z),
    ]);
    const pipe = new THREE.Mesh(
      new THREE.TubeGeometry(this.pipe, 80, 0.085, 8, false),
      new THREE.MeshPhysicalMaterial({
        color: 0x6c8d9f,
        transparent: true,
        opacity: 0.3,
        roughness: 0.22,
        depthWrite: false,
      })
    );
    this.group.add(pipe);
    this.flow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.058, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x7affde }),
      18
    );
    this.flow.frustumCulled = false;
    this.group.add(this.flow);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.08, 0.04, 8, 120),
      chrome
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(BRUSH_BASE.x, 0.1, BRUSH_BASE.z);
    this.group.add(ring);
    const recess = new THREE.Mesh(new THREE.RingGeometry(0.8, 3.05, 128), dark);
    recess.rotation.x = -Math.PI / 2;
    recess.position.set(BRUSH_BASE.x, 0.101, BRUSH_BASE.z);
    this.group.add(recess);
    this.tray = new THREE.Mesh(
      new THREE.RingGeometry(0.81, 3.025, 128),
      this.material(0xf0eedd, 0, 0.8)
    );
    this.tray.rotation.x = -Math.PI / 2;
    this.tray.receiveShadow = true;
    this.group.add(this.tray);
    for (const x of [-3.75, 2.35])
      this.box(this.group, [0.28, 0.16, 6.3], [x, 0.045, BRUSH_BASE.z], dark);
    for (let i = 0; i < 2; i++) {
      const paddle = this.box(
        this.rotor,
        [1.15, 0.035, 0.085],
        [i ? -0.84 : 0.84, 0, 0],
        chrome
      );
      paddle.rotation.y = i ? 0.24 : -0.24;
    }
    this.rotor.position.set(BATH.x, 0.56, BATH.z);
    this.group.add(this.rotor);
    this.iris = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.64, 0.035, 1.25),
      dark,
      6
    );
    this.iris.frustumCulled = false;
    this.group.add(this.iris);
    this.box(this.group, [0.6, 0.42, 0.45], [DIP.x, 0.27, DIP.z - 0.88], shell);
    this.lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x7affde })
    );
    this.lamp.position.set(DIP.x, 0.51, DIP.z - 0.88);
    this.group.add(this.lamp);
    this.label(
      'PIGMENT / RECIRCULATION',
      2.3,
      [-0.5, 0.16, -0.78],
      this.group,
      '#213a4c'
    );
  }
  update(time: number, frame: FactoryFrame) {
    this.group.visible = true;
    this.fibres.update(time, frame);
    const phase = frame.rhythm.phase;
    this.tray.position.set(BRUSH_BASE.x, 0.115, BRUSH_BASE.z);
    // A batch travels to the bath as its matching object leaves the printer.
    const packet = frame.living.feed;
    this.flow.count = packet.active && this.communication ? 18 : 0;
    for (let i = 0; i < 18; i++) {
      const p = Math.max(
        0,
        Math.min(1, packet.progress - (1 - packet.progress) * i * 0.009)
      );
      this.pipe.getPoint(p, this.point);
      this.dummy.position.copy(this.point);
      this.dummy.scale.setScalar(Math.sin(Math.PI * p));
      this.dummy.updateMatrix();
      this.flow.setMatrixAt(i, this.dummy.matrix);
      this.flow.setColorAt(
        i,
        this.colour.setHSL(0.55 + frame.mass * 0.7 + i * 0.004, 0.85, 0.55)
      );
    }
    this.flow.instanceMatrix.needsUpdate = true;
    if (this.flow.instanceColor) this.flow.instanceColor.needsUpdate = true;
    this.rotor.rotation.y = time * 0.12 + frame.process.spectral * Math.PI * 2;
    // The display's receiver opens before the oldest specimen descends.
    const open = ease((phase - 13) / 2) * (1 - ease((phase - 20) / 1));
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      this.dummy.position.set(
        DISPLAY.x + Math.cos(angle) * (0.65 + open * 0.9),
        0.56,
        DISPLAY.z + Math.sin(angle) * (0.65 + open * 0.9)
      );
      this.dummy.rotation.set(0, -angle + 0.5 + open * 0.3, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.iris.setMatrixAt(i, this.dummy.matrix);
    }
    this.iris.instanceMatrix.needsUpdate = true;
    (this.lamp.material as THREE.MeshBasicMaterial).color.setHSL(
      frame.pose.contact ? 0.48 : 0.08,
      0.75,
      0.5
    );
  }
  setCommunication(enabled: boolean) {
    this.communication = enabled;
  }
  dispose() {
    this.fibres.dispose();
  }
}
