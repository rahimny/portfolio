import * as THREE from 'three/webgpu';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  COLUMNS,
  ROWS,
  COUNT,
  MESSAGES,
  ShutterField,
} from '@/features/signal-shutters/model';
import {
  HEIGHT,
  WIDTH,
  PITCH_X,
  PITCH_Y,
  makeAtlas,
  makeShutters,
} from './board';

export const INITIAL_STATUS = {
  ready: false,
  paused: false,
  inspecting: false,
  face: 0,
  reduced: false,
  active: false,
  frames: 0,
};
export type ShutterStatus = typeof INITIAL_STATUS;

export class SignalShuttersExperience extends BaseExperience {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly board = new THREE.Group();
  private readonly field = new ShutterField();
  private readonly messages = [...MESSAGES];
  private readonly status = { ...INITIAL_STATUS };
  private renderer?: THREE.WebGPURenderer;
  private rendererReady = false;
  private rendererReleased = false;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private atlas?: THREE.CanvasTexture;
  private shutters?: ReturnType<typeof makeShutters>;
  private disposed = false;
  private accumulator = 0;
  private pointer: number | null = null;
  private lastPointer = new THREE.Vector2(-100, -100);
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.15);
  private readonly motion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );
  private inspectAngle = 0;
  private viewTarget = 0;
  private active = false;

  private readonly report: (status: ShutterStatus) => void;

  constructor(
    canvas: HTMLCanvasElement,
    report: (status: ShutterStatus) => void,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.report = report;
  }

  async init(signal?: AbortSignal): Promise<void> {
    if (this.disposed || signal?.aborted) return;
    await document.fonts.load('900 200px Archivo');
    await document.fonts.load('500 25px "Geist Mono"');
    if (this.disposed || signal?.aborted) return;
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.connectRendererErrors(this.renderer);
    try {
      await this.renderer.init();
      this.rendererReady = true;
    } catch (error) {
      this.releaseRenderer();
      throw error;
    }
    if (this.disposed || signal?.aborted) {
      this.releaseRenderer();
      return;
    }
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene.background = new THREE.Color('#191b19');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#303c31', 2.5));
    const key = new THREE.DirectionalLight('#ffffff', 3.1);
    key.position.set(-3, 7, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#b3c9ff', 1.8);
    rim.position.set(8, 1, -2);
    this.scene.add(rim);
    this.atlas = makeAtlas(this.messages);
    this.shutters = makeShutters(this.field.angles, this.atlas);
    this.board.add(this.shutters.mesh);
    this.makeHousing();
    this.scene.add(this.board);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.loop.setPlaying(false);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    this.canvas.addEventListener('lostpointercapture', this.up);
    this.canvas.addEventListener('keydown', this.key);
    this.motion.addEventListener('change', this.motionChange);
    this.status.reduced = this.motion.matches;
    this.canvas.dataset.face = String(this.status.face);
    this.canvas.dataset.instances = String(COUNT);
    this.canvas.dataset.backend = (
      this.renderer.backend as unknown as { isWebGPUBackend?: boolean }
    ).isWebGPUBackend
      ? 'webgpu'
      : 'webgl';
    this.resize();
    await this.loop.start();
    if (this.disposed || signal?.aborted) return;
    this.status.ready = true;
    this.publish();
  }

  private makeHousing(): void {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: '#454944',
      metalness: 0.75,
      roughness: 0.37,
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: '#080a08',
      roughness: 0.8,
    });
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      this.board.add(mesh);
    };
    box(WIDTH + 0.5, HEIGHT + 0.5, 0.28, 0, 0, -0.16, backMaterial);
    for (const sign of [-1, 1]) {
      box(
        WIDTH + 0.64,
        0.12,
        0.47,
        0,
        sign * (HEIGHT / 2 + 0.24),
        0,
        frameMaterial
      );
      box(
        0.12,
        HEIGHT + 0.36,
        0.47,
        sign * (WIDTH / 2 + 0.26),
        0,
        0,
        frameMaterial
      );
      box(
        WIDTH + 0.38,
        0.025,
        0.05,
        0,
        sign * (HEIGHT / 2 + 0.12),
        0.26,
        frameMaterial
      );
    }
    const screws = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.024, 12),
      frameMaterial,
      12
    );
    const transform = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      transform.position.set(
        ((i % 6) / 5 - 0.5) * (WIDTH + 0.35),
        (i < 6 ? 1 : -1) * (HEIGHT / 2 + 0.24),
        0.25
      );
      transform.rotation.x = Math.PI / 2;
      transform.updateMatrix();
      screws.setMatrixAt(i, transform.matrix);
    }
    this.board.add(screws);
  }

  transmit(face: number): void {
    if (!this.status.ready) return;
    this.field.transmit(face, face === 1 ? COLUMNS - 1 : 0, ROWS / 2);
    this.status.face = this.field.face;
    this.canvas.dataset.face = String(this.status.face);
    if (this.motion.matches || this.status.paused) this.field.settle();
    this.wake();
    this.publish();
  }

  disturb(): void {
    if (this.status.paused || this.motion.matches) {
      this.field.disturb(COLUMNS / 2, ROWS / 2, 3);
      for (let i = 0; i < 16; i++) this.field.step(1 / 120);
    } else this.field.disturb(COLUMNS / 2, ROWS / 2, 3);
    this.wake();
  }

  setPaused(paused: boolean): void {
    this.accumulator = 0;
    this.status.paused = paused;
    this.loop?.setPlaying(!paused && this.active);
    this.publish();
  }

  inspect(): void {
    this.status.inspecting = !this.status.inspecting;
    this.viewTarget = this.status.inspecting ? 0.95 : 0;
    if (this.motion.matches || this.status.paused)
      this.inspectAngle = this.viewTarget;
    this.wake();
    this.publish();
  }

  saveStill(): void {
    if (!this.renderer || this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.canvas.toBlob((blob) => {
      if (!blob || this.disposed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'signal-shutters.png';
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  private wake(): void {
    const wasActive = this.active;
    this.active = !this.motion.matches;
    if (this.status.active !== this.active) {
      this.status.active = this.active;
      this.publish();
    }
    // setPlaying resets the loop clock. Repeated pointer input must only
    // invalidate an already-running loop, otherwise every drag frame has dt=0.
    if (!wasActive && this.active && !this.status.paused)
      this.loop?.setPlaying(true);
    if (this.motion.matches || this.status.paused)
      this.shutters!.turns.needsUpdate = true;
    this.loop?.invalidate();
  }

  private frame = (delta: number, moving: boolean): void => {
    if (this.disposed || !this.renderer) return;
    if (moving) {
      this.accumulator += delta;
      let active = this.active;
      let stepped = false;
      while (this.accumulator >= 1 / 120) {
        active = this.field.step(1 / 120);
        stepped = true;
        this.accumulator -= 1 / 120;
      }
      this.inspectAngle +=
        (this.viewTarget - this.inspectAngle) * (1 - Math.exp(-delta * 7));
      this.active =
        active || Math.abs(this.inspectAngle - this.viewTarget) > 0.0001;
      if (!this.active) this.loop?.setPlaying(false);
      if (stepped) this.shutters!.turns.needsUpdate = true;
    }
    const zoom = 1 + this.inspectAngle * 0.48;
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.board.rotation.y = this.inspectAngle;
    this.board.rotation.x = this.inspectAngle * -0.24;
    this.renderer.render(this.scene, this.camera);
    this.status.frames++;
    this.canvas.dataset.frames = String(this.status.frames);
    if (this.status.active !== this.active) {
      this.status.active = this.active;
      this.publish();
    }
  };

  private resize = (): void => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    this.camera.aspect = width / Math.max(height, 1);
    const fov = Math.tan(THREE.MathUtils.degToRad(16));
    const distance = Math.max(
      (HEIGHT + 1.4) / (2 * fov),
      (WIDTH + 1.6) / (2 * fov * this.camera.aspect)
    );
    this.camera.position.set(0, 0, distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(
      Math.min(
        this.sizes.pixelRatio,
        1.75,
        Math.sqrt(1_800_000 / Math.max(1, width * height))
      )
    );
    this.renderer?.setSize(width, height);
    this.loop?.invalidate();
  };

  private hit(event: PointerEvent): THREE.Vector2 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2
      ),
      this.camera
    );
    this.board.updateWorldMatrix(true, false);
    const inverse = this.board.matrixWorld.clone().invert();
    const localRay = this.ray.ray.clone().applyMatrix4(inverse);
    const point = localRay.intersectPlane(this.plane, new THREE.Vector3());
    if (
      !point ||
      Math.abs(point.x) > WIDTH / 2 ||
      Math.abs(point.y) > HEIGHT / 2
    )
      return null;
    return new THREE.Vector2(
      (point.x + WIDTH / 2) / PITCH_X,
      (HEIGHT / 2 - point.y) / PITCH_Y
    );
  }

  private down = (event: PointerEvent): void => {
    if (!this.hit(event) || this.pointer !== null || event.button !== 0) return;
    this.pointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus({ preventScroll: true });
    this.lastPointer.set(-100, -100);
    this.move(event);
  };
  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    const point = this.hit(event);
    if (!point || point.distanceTo(this.lastPointer) < 0.6) return;
    this.field.disturb(point.x, point.y, 1.8);
    if (this.motion.matches || this.status.paused)
      for (let i = 0; i < 12; i++) this.field.step(1 / 120);
    this.lastPointer.copy(point);
    this.wake();
  };
  private up = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  };
  private key = (event: KeyboardEvent): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.disturb();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.transmit((this.status.face + 1) % 3);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.transmit((this.status.face + 2) % 3);
    }
  };
  private motionChange = (): void => {
    this.status.reduced = this.motion.matches;
    if (this.motion.matches) {
      this.field.settle();
      this.inspectAngle = this.viewTarget;
      this.active = false;
    }
    this.shutters!.turns.needsUpdate = true;
    this.loop?.invalidate();
    this.publish();
  };
  private publish(): void {
    if (!this.disposed) this.report({ ...this.status });
  }

  private releaseRenderer(): void {
    if (this.rendererReleased) return;
    this.rendererReleased = true;
    this.renderer?.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.motion.removeEventListener('change', this.motionChange);
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('lostpointercapture', this.up);
    this.canvas.removeEventListener('keydown', this.key);
    if (this.pointer !== null && this.canvas.hasPointerCapture(this.pointer))
      this.canvas.releasePointerCapture(this.pointer);
    const release = () => {
      const materials = new Set<THREE.Material>();
      this.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      materials.forEach((material) => material.dispose());
      this.atlas?.dispose();
      this.scene.clear();
      if (this.rendererReady) this.releaseRenderer();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
