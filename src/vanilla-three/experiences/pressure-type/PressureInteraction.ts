import * as THREE from 'three';
import type { PressureWorld } from '@/features/pressure-type/model';
import type { PressureSettings } from '@/features/pressure-type/settings';

interface InteractionOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  world: PressureWorld;
  scene: THREE.Scene;
  letters: THREE.Mesh[];
  settings: PressureSettings;
  isPaused: () => boolean;
  wake: (steps: number) => void;
  orbit: () => void;
  knock: (air: number) => void;
}

/** Owns pointer capture and gesture cancellation independently of rendering. */
export class PressureInteraction {
  private readonly options: InteractionOptions;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
  private readonly dragPoint = new THREE.Vector3();
  private disposed = false;
  private gesture?: {
    id: number;
    body: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragged: boolean;
    point: THREE.Vector3;
    offsetX: number;
    offsetY: number;
  };
  constructor(options: InteractionOptions) {
    this.options = options;
    const canvas = options.canvas;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('lostpointercapture', this.pointerCancel);
    window.addEventListener('blur', this.cancel);
  }
  private setPointer(event: PointerEvent) {
    const rect = this.options.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
  }

  private pointerDown = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      this.gesture ||
      !this.options.world ||
      this.disposed
    )
      return;
    this.setPointer(event);
    this.options.scene.updateMatrixWorld(true);
    const hit = this.raycaster
      .intersectObjects(this.options.letters, false)
      .find((hit) => hit.object.visible);
    const index = hit
      ? this.options.letters.indexOf(hit.object as THREE.Mesh)
      : -1;
    const body = this.options.world.bodies[index];
    if (body && this.options.isPaused()) return;
    const point = hit?.point.clone() ?? new THREE.Vector3();
    this.gesture = {
      id: event.pointerId,
      body: index,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false,
      point,
      offsetX: body?.motion.offset[0] ?? 0,
      offsetY: body?.motion.offset[1] ?? 0,
    };
    this.dragPlane.constant = -point.z;
    this.options.canvas.setPointerCapture(event.pointerId);
    if (body) {
      body.press(...body.localPoint(point.x, point.y, point.z));
      this.options.canvas.dataset.handling = 'press';
      this.options.wake(8);
    } else this.options.canvas.dataset.handling = 'orbit';
  };

  private pointerMove = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId || !this.options.world)
      return;
    gesture.dragged ||=
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY
      ) > 6;
    if (gesture.body >= 0 && gesture.dragged) {
      const body = this.options.world.bodies[gesture.body];
      if (!body.burst.active) {
        this.setPointer(event);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
          body.motion.grabbing = true;
          body.motion.grabTarget[0] = Math.max(
            -0.55,
            Math.min(0.55, gesture.offsetX + this.dragPoint.x - gesture.point.x)
          );
          body.motion.grabTarget[1] = Math.max(
            -0.55,
            Math.min(0.55, gesture.offsetY + this.dragPoint.y - gesture.point.y)
          );
          this.options.wake(8);
        }
      }
    } else if (gesture.body < 0) {
      this.options.settings.yaw = THREE.MathUtils.clamp(
        this.options.settings.yaw + (event.clientX - gesture.lastX) * 0.004,
        -0.45,
        0.45
      );
      this.options.settings.pitch = THREE.MathUtils.clamp(
        this.options.settings.pitch + (event.clientY - gesture.lastY) * 0.003,
        -0.12,
        0.4
      );
      this.options.orbit();
    }
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  };

  private pointerUp = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    const body = this.options.world?.bodies[gesture.body];
    body?.releasePress();
    if (body && !gesture.dragged) {
      this.options.knock(body.air);
      body.hit(
        ...body.localPoint(gesture.point.x, gesture.point.y, gesture.point.z)
      );
    }
    this.cancel();
    if (body) this.options.wake(body.burst.active || gesture.dragged ? 600 : 8);
  };
  private pointerCancel = (event: PointerEvent) => {
    if (this.gesture?.id === event.pointerId) {
      this.cancel();
      this.options.wake(600);
    }
  };
  cancel = () => {
    const gesture = this.gesture;
    if (!gesture) return;
    this.options.world?.bodies[gesture.body]?.releasePress();
    this.gesture = undefined;
    delete this.options.canvas.dataset.handling;
    if (this.options.canvas.hasPointerCapture(gesture.id))
      this.options.canvas.releasePointerCapture(gesture.id);
  };

  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    const canvas = this.options.canvas;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('lostpointercapture', this.pointerCancel);
    window.removeEventListener('blur', this.cancel);
  }
}
