import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  createField,
  direction,
  index,
  restore,
  SIZE,
  snapshot,
  step,
  VERSION,
  type Light,
} from '@/features/umbra/model';

export const INITIAL_STATUS = {
  ready: false,
  paused: false,
  reduced: false,
  seed: 1,
  tick: 24,
  cells: 0,
  grown: 0,
  eroded: 0,
  stepMs: 0,
  azimuth: -22,
  elevation: 22,
  interior: false,
};
export type UmbraStatus = typeof INITIAL_STATUS;
export class UmbraExperience extends BaseExperience {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.025, 100);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private surface?: MarchingCubes;
  private light = new THREE.DirectionalLight(0xfff2d8, 4.5);
  private marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffedca })
  );
  private observer?: ResizeObserver;
  private loop?: ExperienceLoop;
  private disposed = false;
  private field = createField();
  private status = { ...INITIAL_STATUS };
  private accumulator = 0;
  private transition?: { position: THREE.Vector3; target: THREE.Vector3 };
  private targetLight: Light = { ...this.field.light };
  private drag?: {
    x: number;
    y: number;
    azimuth: number;
    elevation: number;
    id: number;
  };
  private mode: 'light' | 'camera' = 'light';
  private onStatus: (status: UmbraStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: UmbraStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }
  public async init(signal?: AbortSignal) {
    if (this.disposed || signal?.aborted) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x181917);
    this.scene.fog = new THREE.Fog(0x181917, 9, 26);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera.position.set(4.3, 2.7, 8.4);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 16;
    this.controls.enabled = false;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', this.cancelTransition);
    this.scene.add(new THREE.HemisphereLight(0xd9e3e7, 0x504333, 1.25));
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, {
      left: -4,
      right: 4,
      top: 4,
      bottom: -4,
      near: 0.1,
      far: 24,
    });
    this.light.shadow.bias = -0.00025;
    this.light.shadow.normalBias = 0.035;
    this.scene.add(this.light, this.light.target, this.marker);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.surface = new MarchingCubes(SIZE, material, false, true, 80000);
    this.surface.scale.setScalar(3.2);
    this.surface.isolation = 0.42;
    this.surface.castShadow = true;
    this.surface.receiveShadow = true;
    this.scene.add(this.surface);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x252621, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.65;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.remesh();
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerUp);
    this.canvas.addEventListener('keydown', this.keyDown);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    await this.loop.start();
  }
  private remesh() {
    if (!this.surface) return;
    this.surface.reset();
    const bone = new THREE.Color(0xdad4bf),
      amber = new THREE.Color(0xd78a2c),
      colour = new THREE.Color();
    // Both meshing and occlusion read this field. The isosurface interpolates cell boundaries.
    for (let i = 0; i < this.field.matter.length; i++) {
      this.surface.field[i] = this.field.matter[i];
      const fresh =
        this.field.matter[i] && !this.field.substrate[i]
          ? Math.max(0, 1 - this.field.age[i] / 14)
          : 0;
      colour.copy(bone).lerp(amber, fresh * 0.9);
      this.surface.palette[i * 3] = colour.r;
      this.surface.palette[i * 3 + 1] = colour.g;
      this.surface.palette[i * 3 + 2] = colour.b;
    }
    // Sub-cell reconstruction softens the voxel stair steps without adding a separate base mesh.
    const samples = this.surface.field.slice();
    for (let z = 1; z < SIZE - 1; z++)
      for (let y = 1; y < SIZE - 1; y++)
        for (let x = 1; x < SIZE - 1; x++) {
          const i = index(x, y, z);
          this.surface.field[i] =
            samples[i] * 0.4 +
            (samples[i - 1] +
              samples[i + 1] +
              samples[i - SIZE] +
              samples[i + SIZE] +
              samples[i - SIZE * SIZE] +
              samples[i + SIZE * SIZE]) *
              0.1;
        }
    this.surface.update();
    this.status.cells = this.field.matter.reduce((sum, cell) => sum + cell, 0);
  }
  private frame = (delta: number, moving: boolean) => {
    if (!this.renderer || !this.controls || this.disposed) return;
    const reduced = this.loop?.reducedMotion ?? false;
    this.status.reduced = reduced;
    const damping = reduced ? 1 : 1 - Math.exp(-10 * Math.max(delta, 1 / 60));
    this.field.light.azimuth = THREE.MathUtils.lerp(
      this.field.light.azimuth,
      this.targetLight.azimuth,
      damping
    );
    this.field.light.elevation = THREE.MathUtils.lerp(
      this.field.light.elevation,
      this.targetLight.elevation,
      damping
    );
    const lightMoving =
      Math.abs(this.field.light.azimuth - this.targetLight.azimuth) +
        Math.abs(this.field.light.elevation - this.targetLight.elevation) >
      0.03;
    if (!lightMoving) this.field.light = { ...this.targetLight };
    this.light.position
      .fromArray(direction(this.field.light))
      .multiplyScalar(9);
    this.marker.position.copy(this.light.position).multiplyScalar(0.48);
    if (this.transition) {
      this.camera.position.lerp(
        this.transition.position,
        damping * 0.65 + (reduced ? 0.35 : 0)
      );
      this.controls.target.lerp(
        this.transition.target,
        damping * 0.65 + (reduced ? 0.35 : 0)
      );
      if (
        this.camera.position.distanceTo(this.transition.position) < 0.01 &&
        this.controls.target.distanceTo(this.transition.target) < 0.01
      )
        this.transition = undefined;
    }
    this.controls.enableDamping = moving;
    this.controls.update();
    if (moving && !this.status.paused) {
      this.accumulator += delta;
      if (this.accumulator >= 0.25) {
        this.accumulator %= 0.25;
        this.advance();
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.report();
    if (lightMoving || this.transition) this.invalidate();
  };
  private previousReport = '';
  private report() {
    this.status = {
      ...this.status,
      ready: true,
      seed: this.field.seed,
      tick: this.field.tick,
      azimuth: this.targetLight.azimuth,
      elevation: this.targetLight.elevation,
    };
    this.canvas.dataset.tick = String(this.field.tick);
    this.canvas.dataset.cells = String(this.status.cells);
    this.canvas.dataset.interior = String(this.status.interior);
    const encoded = JSON.stringify(this.status);
    if (encoded !== this.previousReport) {
      this.previousReport = encoded;
      this.onStatus({ ...this.status });
    }
  }
  private advance() {
    const start = performance.now();
    const changes = step(this.field);
    Object.assign(this.status, changes);
    this.remesh();
    this.status.stepMs = performance.now() - start;
    if (this.status.interior && !this.safeInterior()) this.setView(false);
  }
  public stepOnce() {
    if (this.disposed) return;
    this.field.light = { ...this.targetLight };
    this.advance();
    this.invalidate();
  }
  public setPaused(paused: boolean) {
    this.status.paused = paused;
    this.accumulator = 0;
    this.loop?.setPlaying(!paused);
    this.invalidate();
  }
  public setLight(azimuth: number, elevation: number) {
    this.targetLight = {
      azimuth: THREE.MathUtils.clamp(azimuth, -180, 180),
      elevation: THREE.MathUtils.clamp(elevation, 5, 85),
    };
    this.invalidate();
  }
  public setMode(mode: 'light' | 'camera') {
    this.mode = mode;
    if (this.controls) this.controls.enabled = mode === 'camera';
  }
  public reset(seed = this.field.seed) {
    this.field = createField(Math.max(1, Math.min(999999, Math.round(seed))));
    this.targetLight = { ...this.field.light };
    this.accumulator = 0;
    this.status.grown = 0;
    this.status.eroded = 0;
    this.remesh();
    this.setView(false);
    this.invalidate();
  }
  private safeInterior() {
    // Keep a three-cell clearance around the prescribed viewpoint. Revalidate after growth.
    for (let z = 15; z <= 21; z++)
      for (let y = 15; y <= 21; y++)
        for (let x = 15; x <= 21; x++)
          if (
            Math.hypot(x - 18, y - 18, z - 18) <= 3 &&
            this.field.matter[index(x, y, z)]
          )
            return false;
    return true;
  }
  public setView(interior: boolean) {
    if (interior && !this.safeInterior()) return false;
    this.status.interior = interior;
    this.camera.fov = interior ? 94 : 40;
    this.camera.updateProjectionMatrix();
    this.transition = {
      position: interior
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(4.3, 2.7, 8.4),
      target: interior ? new THREE.Vector3(1.3, 0.5, -2) : new THREE.Vector3(),
    };
    this.invalidate();
    return true;
  }
  private cancelTransition = () => {
    this.transition = undefined;
  };
  private pointerDown = (event: PointerEvent) => {
    if (this.mode !== 'light' || event.button !== 0) return;
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      ...this.targetLight,
      id: event.pointerId,
    };
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    this.setLight(
      this.drag.azimuth + (event.clientX - this.drag.x) * 0.4,
      this.drag.elevation - (event.clientY - this.drag.y) * 0.2
    );
  };
  private pointerUp = (event: PointerEvent) => {
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    this.drag = undefined;
  };
  private keyDown = (event: KeyboardEvent) => {
    const d = event.shiftKey ? 10 : 3;
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      this.setLight(
        this.targetLight.azimuth +
          (event.key === 'ArrowLeft' ? -d : event.key === 'ArrowRight' ? d : 0),
        this.targetLight.elevation +
          (event.key === 'ArrowDown' ? -d : event.key === 'ArrowUp' ? d : 0)
      );
    } else if (event.code === 'Space') {
      event.preventDefault();
      this.setPaused(!this.status.paused);
    }
  };
  public saveState() {
    // Capture the actual light, including any in-progress gesture damping.
    this.download(
      new Blob(
        [
          JSON.stringify({
            ...snapshot(this.field),
            view: {
              position: this.camera.position.toArray(),
              target: this.controls?.target.toArray(),
              fov: this.camera.fov,
              interior: this.status.interior,
            },
          }),
        ],
        { type: 'application/json' }
      ),
      `umbra-${this.field.seed}-${this.field.tick}.json`
    );
  }
  public async loadState(file: File) {
    if (file.size > 3000000)
      throw new Error('State files must be smaller than 3 MB.');
    const data = JSON.parse(await file.text());
    const field = restore(data);
    if (this.disposed) return;
    // Validate optional view data before changing any live state.
    const view = data.view;
    if (
      view &&
      ![view.position, view.target].every(
        (a) =>
          Array.isArray(a) &&
          a.length === 3 &&
          a.every((n) => Number.isFinite(n) && Math.abs(n) <= 30)
      )
    )
      throw new Error('Invalid saved viewpoint.');
    if (
      view &&
      (!Number.isFinite(view.fov) ||
        view.fov < 20 ||
        view.fov > 100 ||
        typeof view.interior !== 'boolean')
    )
      throw new Error('Invalid saved view settings.');
    this.field = field;
    this.targetLight = { ...field.light };
    this.setPaused(true);
    this.remesh();
    this.transition = undefined;
    this.status.interior = Boolean(view?.interior);
    this.status.grown = 0;
    this.status.eroded = 0;
    if (view && this.controls) {
      this.camera.fov = view.fov;
      this.camera.updateProjectionMatrix();
      this.camera.position.fromArray(view.position);
      this.controls.target.fromArray(view.target);
    } else {
      this.setView(false);
    }
    this.invalidate();
    return field.seed;
  }
  public saveImpression() {
    if (!this.renderer || !this.surface) return;
    const output = document.createElement('canvas');
    output.width = 2400;
    output.height = 2800;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Image export unavailable.');
    const renderer = this.renderer;
    const dimensions = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    const originalMaterial = this.surface.material;
    const originalBackground = this.scene.background;
    const originalFog = this.scene.fog;
    const material = new THREE.MeshBasicMaterial({
      color: 0x22231f,
      side: THREE.DoubleSide,
    });
    const hidden: THREE.Object3D[] = [];
    try {
      this.scene.children.forEach((child) => {
        if (child !== this.surface && child.visible) {
          hidden.push(child);
          child.visible = false;
        }
      });
      this.surface.material = material;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0xf3f0e7);
      const camera = new THREE.OrthographicCamera(
        -3.6,
        3.6,
        3.6,
        -3.6,
        0.1,
        40
      );
      camera.position.fromArray(direction(this.field.light)).multiplyScalar(12);
      camera.lookAt(0, 0, 0);
      renderer.setPixelRatio(1);
      renderer.setSize(2400, 2400, false);
      renderer.render(this.scene, camera);
      ctx.fillStyle = '#f3f0e7';
      ctx.fillRect(0, 0, 2400, 2800);
      ctx.drawImage(this.canvas, 0, 0);
      ctx.fillStyle = '#22231f';
      ctx.font = '64px monospace';
      ctx.fillText('UMBRA / SHADOW IMPRESSION', 140, 2520);
      ctx.font = '28px monospace';
      ctx.fillText(
        `SEED ${this.field.seed}     TICK ${this.field.tick}     ${VERSION}`,
        140,
        2600
      );
      ctx.fillText(
        `LIGHT ${this.field.light.azimuth.toFixed(3)}° / ${this.field.light.elevation.toFixed(3)}°`,
        140,
        2650
      );
    } finally {
      hidden.forEach((child) => {
        child.visible = true;
      });
      this.surface.material = originalMaterial;
      this.scene.background = originalBackground;
      this.scene.fog = originalFog;
      material.dispose();
      renderer.setPixelRatio(ratio);
      renderer.setSize(dimensions.x, dimensions.y, false);
      this.invalidate();
    }
    const name = `umbra-${this.field.seed}-${this.field.tick}-shadow.png`;
    output.toBlob((blob) => {
      if (blob && !this.disposed) this.download(blob, name);
    }, 'image/png');
  }
  private download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private invalidate = () => this.loop?.invalidate();
  private resize = () => {
    if (this.disposed || !this.renderer) return;
    this.updateSizes();
    const { width, height, pixelRatio } = this.sizes;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(pixelRatio, Math.sqrt(1400000 / Math.max(1, width * height)))
    );
    this.renderer.setSize(width, height);
    this.invalidate();
  };
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('start', this.cancelTransition);
    this.controls?.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('keydown', this.keyDown);
    if (this.drag && this.canvas.hasPointerCapture(this.drag.id))
      this.canvas.releasePointerCapture(this.drag.id);
    if (!this.marker.parent) {
      this.marker.geometry.dispose();
      this.marker.material.dispose();
    }
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.light.shadow.dispose();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
