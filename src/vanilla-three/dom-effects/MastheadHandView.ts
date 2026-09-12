import * as THREE from 'three';
import type { MastheadHand } from '../../features/particle-text/MastheadHand';
import { MechanicalHandView } from './MechanicalHandView';
import { MACHINE_COLORS } from '../materials/machinePalette';

/** Passive view: no renderer, clock, listeners or simulation ownership. */
export class MastheadHandView {
  readonly root = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly hand = new MechanicalHandView();
  private readonly flashMaterial = new THREE.MeshBasicMaterial({
    color: MACHINE_COLORS[2],
    transparent: true,
    depthWrite: false,
  });
  private readonly flash = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    this.flashMaterial
  );
  private disposed = false;

  constructor() {
    this.rig.add(this.hand.group);
    this.root.add(this.rig, this.flash);
    this.root.visible = false;
  }

  frame(score: MastheadHand, originX: number, originY: number) {
    this.root.visible = !score.done;
    this.root.position.set(originX, originY, 80);
    this.rig.scale.setScalar(score.scale);
    this.hand.update(score.motion.value, score.reveal, score.time);
    const muzzle = score.muzzle;
    this.flash.visible = muzzle.age < 0.065;
    this.flash.position.set(muzzle.x, -muzzle.y, 4);
    this.flash.rotation.z = Math.atan2(-muzzle.dy, muzzle.dx);
    this.flash.scale.set(score.scale * 0.17, score.scale * 0.055, 1);
    this.flashMaterial.opacity = Math.max(0, 1 - muzzle.age / 0.065);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hand.dispose();
    this.flash.geometry.dispose();
    this.flashMaterial.dispose();
    this.root.clear();
  }
}
