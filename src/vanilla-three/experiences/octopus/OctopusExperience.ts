import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  clampUnit,
  DEFAULT_POSE,
  type OctopusPose,
  type OctopusView,
} from '@/features/octopus/model';
import { OctopusAssembly } from './OctopusAssembly';

export class OctopusExperience extends BaseExperience {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  private renderer?: T.WebGLRenderer;
  private controls?: OrbitControls;
  private assembly?: OctopusAssembly;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private grid?: T.GridHelper;
  private disposed = false;
  private time = 0;
  private previousFrameTime = 0;
  private paused = false;
  private separation = 0;
  private targetSeparation = 0;
  private pose = { ...DEFAULT_POSE };
  private targetPose = { ...DEFAULT_POSE };
  private view: OctopusView = 'specimen';
  private autoRotate = false;
  private projectionDistance = 16;
  private onReady: () => void;
  constructor(
    canvas: HTMLCanvasElement,
    onReady: () => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onReady = onReady;
  }
  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0xf5f4f1, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.scene.add(new T.HemisphereLight(0xf9fff2, 0x647b83, 1.5));
    const key = new T.DirectionalLight(0xfff7e5, 2.1);
    key.position.set(-4, 9, 7);
    this.scene.add(key);
    const rim = new T.DirectionalLight(0xcde5e6, 1);
    rim.position.set(6, 3, -4);
    this.scene.add(rim);
    this.assembly = new OctopusAssembly();
    this.scene.add(this.assembly.root);
    this.grid = new T.GridHelper(30, 60, 0xa5aca3, 0xc5c9bd);
    this.grid.position.y = -5.8;
    (this.grid.material as T.Material).transparent = true;
    (this.grid.material as T.Material).opacity = 0.2;
    this.scene.add(this.grid);
    this.scene.fog = new T.Fog(0xf5f4f1, 23, 42);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 32;
    this.controls.maxPolarAngle = Math.PI * 0.86;
    this.controls.addEventListener('change', this.invalidate);
    this.canvas.addEventListener('keydown', this.keydown);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resetCamera();
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.onReady();
  }
  setView(view: OctopusView) {
    this.view = view;
    this.resetCamera();
    this.invalidate();
  }
  setSeparation(value: number) {
    this.targetSeparation = clampUnit(value);
    this.invalidate();
  }
  setPose(value: Partial<OctopusPose>) {
    for (const key of ['curl', 'spread', 'current'] as const)
      if (value[key] !== undefined)
        this.targetPose[key] = clampUnit(value[key]);
    this.invalidate();
  }
  setXray(enabled: boolean) {
    this.assembly?.setXray(enabled);
    this.invalidate();
  }
  setPaused(enabled: boolean) {
    this.paused = enabled;
    this.loop?.setPlaying(!enabled);
  }
  setRotate(enabled: boolean) {
    this.autoRotate = enabled;
    this.invalidate();
  }
  step() {
    if (this.paused || this.loop?.reducedMotion) {
      this.time += 0.1;
      this.invalidate();
    }
  }
  resetCamera() {
    if (!this.controls) return;
    this.camera.zoom = 1;
    if (this.view === 'arm') {
      this.camera.position.set(8, 1, -1.6);
      this.controls.target.set(0.8, -2.5, 1.65);
    } else {
      this.camera.position.set(8.8, 4.3, 12.5);
      this.controls.target.set(
        0,
        this.view === 'anatomy' ? -0.45 : -1.55,
        -0.25
      );
    }
    this.projectionDistance = this.camera.position.distanceTo(
      this.controls.target
    );
    this.controls.update();
    this.resize();
  }
  private frame = (delta: number, moving: boolean) => {
    if (this.disposed || !this.renderer || !this.assembly || !this.controls)
      return;
    const now = performance.now();
    // Analytic animation follows elapsed time even when GPU load lowers the frame rate.
    // The shared loop signals a fresh start with delta=0 after visibility or pause changes.
    if (moving && delta > 0 && this.previousFrameTime > 0)
      this.time += Math.min(0.5, (now - this.previousFrameTime) / 1000);
    this.previousFrameTime = now;
    this.separation = moving
      ? T.MathUtils.damp(this.separation, this.targetSeparation, 5, delta)
      : this.targetSeparation;
    for (const k of ['curl', 'spread', 'current'] as const)
      this.pose[k] = moving
        ? T.MathUtils.damp(this.pose[k], this.targetPose[k], 5, delta)
        : this.targetPose[k];
    this.assembly.update(this.time, this.pose, this.separation, this.view);
    if (this.grid) this.grid.visible = this.view !== 'arm';
    this.controls.enableDamping = moving;
    this.controls.autoRotate = moving && this.autoRotate;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.update(delta);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.view = this.view;
    this.canvas.dataset.time = this.time.toFixed(3);
    this.canvas.dataset.renderedSeparation = this.separation.toFixed(3);
    this.canvas.dataset.curl = this.pose.curl.toFixed(3);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
  };
  private keydown = (event: KeyboardEvent) => {
    if (!this.controls) return;
    if (event.key === '+' || event.key === '=')
      this.camera.zoom = Math.min(4, this.camera.zoom * 1.12);
    else if (event.key === '-')
      this.camera.zoom = Math.max(0.6, this.camera.zoom / 1.12);
    else if (event.key.toLowerCase() === 'r') this.resetCamera();
    else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const spherical = new T.Spherical().setFromVector3(
        this.camera.position.clone().sub(this.controls.target)
      );
      spherical.theta +=
        event.key === 'ArrowLeft'
          ? 0.12
          : event.key === 'ArrowRight'
            ? -0.12
            : 0;
      spherical.phi = T.MathUtils.clamp(
        spherical.phi +
          (event.key === 'ArrowUp'
            ? -0.12
            : event.key === 'ArrowDown'
              ? 0.12
              : 0),
        0.1,
        Math.PI * 0.86
      );
      this.camera.position
        .copy(this.controls.target)
        .add(new T.Vector3().setFromSpherical(spherical));
    } else return;
    event.preventDefault();
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(
      new Error('The graphics context was lost. Reload to restore the octopus.')
    );
  };
  private invalidate = () => this.loop?.invalidate();
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height, pixelRatio } = this.sizes;
    const aspect = width / Math.max(height, 1);
    const span =
      (this.view === 'arm' ? 7.7 : this.view === 'anatomy' ? 15.7 : 12.3) *
      Math.max(1, 1.13 / aspect);
    this.camera.aspect = aspect;
    this.camera.fov = T.MathUtils.radToDeg(
      2 * Math.atan(span / (2 * this.projectionDistance))
    );
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(
      Math.min(
        pixelRatio,
        1.75,
        Math.sqrt(2_000_000 / Math.max(1, width * height))
      )
    );
    this.renderer?.setSize(width, height, false);
    this.invalidate();
  };
  async saveStill() {
    if (this.disposed || !this.renderer)
      throw new Error('Specimen unavailable.');
    this.frame(0, false);
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, 'image/png')
    );
    if (!blob || this.disposed) throw new Error('Image unavailable.');
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `octopus-${this.view}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.canvas.removeEventListener('keydown', this.keydown);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    const release = () => {
      this.assembly?.dispose();
      this.grid?.geometry.dispose();
      (this.grid?.material as T.Material | undefined)?.dispose();
      this.renderer?.dispose();
      this.scene.clear();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
