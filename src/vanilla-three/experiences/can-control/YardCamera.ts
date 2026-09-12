import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type YardView = 'yard' | 'front' | 'detail' | 'follow' | 'manual';
type CameraState = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  view: YardView;
};

/** One camera owner; orbit input cancels preset motion, and never advances paint. */
export class YardCamera {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.08, 100);
  readonly controls: OrbitControls;
  view: YardView = 'yard';
  moving = false;
  private transition?: {
    from: CameraState;
    position: THREE.Vector3;
    target: THREE.Vector3;
    elapsed: number;
  };
  private saved?: CameraState;
  private editing = false;
  private snapFollow = false;
  private disposed = false;
  private readonly invalidate: () => void;
  private readonly changed: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    invalidate: () => void,
    changed: () => void
  ) {
    this.invalidate = invalidate;
    this.changed = changed;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 2.1;
    this.controls.maxDistance = 26;
    this.controls.minAzimuthAngle = -1.22;
    this.controls.maxAzimuthAngle = 1.22;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.57;
    this.controls.enablePan = true;
    this.controls.cursor.set(1.6, 0.8, 0);
    this.controls.maxTargetRadius = 4;
    this.controls.addEventListener('start', this.takeover);
    this.controls.addEventListener('change', this.invalidate);
    this.setView('yard', true);
  }
  private snapshot(): CameraState {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      view: this.view,
    };
  }
  private takeover = () => {
    this.transition = undefined;
    this.view = 'manual';
    this.moving = true;
    this.changed();
    this.invalidate();
  };
  setView(view: Exclude<YardView, 'manual'>, instant = false) {
    if (this.disposed || (this.editing && view !== 'front')) return;
    const target = new THREE.Vector3(1.5, 0.65, -0.5);
    const position = new THREE.Vector3(7.5, 3.65, 9.4);
    if (view === 'front') {
      target.set(1.6, 1.2, 0);
      const distance =
        (Math.max(1.2, 1.6 / this.camera.aspect) /
          Math.tan(THREE.MathUtils.degToRad(21))) *
        1.22;
      position.copy(target).add(new THREE.Vector3(0, 0, distance));
    } else if (view === 'detail') {
      target.set(1.6, 1.2, 0);
      position.set(3.25, 2.1, 4.1);
    } else if (view === 'follow') {
      target.copy(this.controls.target);
      position.copy(this.camera.position);
    }
    const from = this.snapshot();
    this.view = view;
    this.snapFollow = view === 'follow' && instant;
    // Flush any old orbit velocity before a preset or editing transition.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    if (instant) {
      this.transition = undefined;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.moving = false;
    } else {
      this.transition = { from, position, target, elapsed: 0 };
      this.moving = true;
    }
    this.changed();
    this.invalidate();
  }
  setEditing(editing: boolean) {
    if (editing === this.editing) return;
    if (editing) {
      this.saved = this.snapshot();
      this.setView('front', true);
      this.editing = true;
      this.controls.enabled = false;
    } else {
      this.editing = false;
      this.controls.enabled = true;
      if (this.saved) {
        this.transition = undefined;
        this.camera.position.copy(this.saved.position);
        this.controls.target.copy(this.saved.target);
        this.view = this.saved.view;
        this.controls.update();
        this.saved = undefined;
        this.moving = false;
        this.changed();
      }
    }
    this.invalidate();
  }
  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.editing || this.view === 'front') this.setView('front', true);
  }
  nudge(horizontal: number, vertical: number) {
    if (this.editing || this.disposed) return;
    this.takeover();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += horizontal;
    spherical.phi += vertical;
    this.camera.position
      .copy(this.controls.target)
      .add(offset.setFromSpherical(spherical));
    this.controls.update();
  }
  pan(horizontal: number, vertical: number) {
    if (this.editing || this.disposed) return;
    this.takeover();
    const movement = new THREE.Vector3(horizontal, vertical, 0).applyQuaternion(
      this.camera.quaternion
    );
    this.controls.target.add(movement);
    this.camera.position.add(movement);
    this.controls.update();
  }
  zoom(scale: number) {
    if (this.editing || this.disposed) return;
    this.takeover();
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * scale, 2.1, 26));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  update(dt: number, body: { x: number; y: number; z: number }) {
    if (this.disposed || this.editing) return;
    if (this.transition) {
      this.transition.elapsed += Math.min(dt, 0.05);
      const t = Math.min(1, this.transition.elapsed / 0.7);
      const ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(
        this.transition.from.position,
        this.transition.position,
        ease
      );
      this.controls.target.lerpVectors(
        this.transition.from.target,
        this.transition.target,
        ease
      );
      if (t === 1) this.transition = undefined;
    }
    let following = false;
    if (this.view === 'follow' && !this.transition) {
      const target = new THREE.Vector3(body.x, body.y - 0.14, 0.05);
      const position = new THREE.Vector3(
        body.x + 1.2,
        body.y + 0.95,
        body.z + 2.65
      );
      following =
        this.camera.position.distanceToSquared(position) > 1e-7 ||
        this.controls.target.distanceToSquared(target) > 1e-7;
      const blend = this.snapFollow ? 1 : 1 - Math.exp(-dt * 5);
      this.snapFollow = false;
      this.camera.position.lerp(position, blend);
      this.controls.target.lerp(target, blend);
    }
    const orbiting = this.controls.update();
    this.moving = Boolean(this.transition) || following || orbiting;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controls.removeEventListener('start', this.takeover);
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
  }
}
