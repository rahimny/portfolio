import { DEFAULT_SETTINGS } from '@/features/medusa/settings';
import { MedusaStudio } from './MedusaStudio';
import * as T from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  createAnatomy,
  GROWTH_END,
  MedusaMotion,
} from '@/features/medusa/model';
import { OilPainter } from './OilPainter';

export interface MedusaReadout {
  seed: number;
  marks: number;
  backend: string;
}

export class MedusaExperience extends BaseExperience {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(38, 1, 0.1, 80);
  private renderer?: T.WebGPURenderer;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private painter?: OilPainter;
  private motion?: MedusaMotion;
  private disposed = false;
  private generation = 0;
  private paused = false;
  private rotating = false;
  private settings = { ...DEFAULT_SETTINGS };
  private studio?: MedusaStudio;
  private rate = 1;
  private current = 0.12;
  private pulseAmount = 1;
  private frames = 0;
  private growth = 1;
  private onReady: (status: MedusaReadout) => void;
  private exportRequest?: {
    resolve: () => void;
    reject: (error: unknown) => void;
  };
  private seed: number;
  private regeneration?: {
    seed: number;
    resolve: () => void;
    reject: (error: unknown) => void;
  };

  constructor(
    canvas: HTMLCanvasElement,
    onReady: (status: MedusaReadout) => void,
    seed = 1289,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.seed = seed;
    this.settings.seed = seed;
    this.onReady = onReady;
  }

  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    this.renderer = new T.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      forceWebGL:
        new URLSearchParams(location.search).get('backend') === 'webgl',
    });
    this.connectRendererErrors(this.renderer);
    this.renderer.toneMapping = T.NoToneMapping;
    await this.renderer.init();
    if (signal?.aborted || this.disposed) return;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 27;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = Math.PI - 0.22;
    this.controls.rotateSpeed = 0.65;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.dampingFactor = 0.075;
    this.controls.addEventListener('change', this.invalidate);
    this.canvas.addEventListener('keydown', this.keydown);
    this.canvas.addEventListener('dblclick', this.stir);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resetCamera();
    await this.makeSpecimen(this.seed, signal);
    if (signal?.aborted || this.disposed) return;
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.loop.setPlaying(!this.paused);
    this.resize();
    await this.renderer.compileAsync(this.scene, this.camera);
    if (signal?.aborted || this.disposed) return;
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.reportReady();
    if (this.options.controlsContainer)
      this.studio = new MedusaStudio(
        this.options.controlsContainer,
        this.settings,
        {
          change: async (rebuild) => {
            this.applySettings();
            if (rebuild) await this.regenerate(this.settings.seed);
          },
          step: () => this.step(),
          grow: () => this.replayGrowth(),
          finish: () => {
            this.growth = 1;
            this.invalidate();
          },
          current: () => this.sendCurrent(),
          resetCamera: () => this.resetCamera(),
          print: () => this.exportPNG(),
        }
      );
  }

  private reportReady() {
    if (!this.painter || !this.renderer) return;
    const backend =
      'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2';
    this.canvas.dataset.backend = backend;
    this.canvas.dataset.seed = String(this.seed);
    this.canvas.dataset.marks = String(this.painter.count);
    this.onReady({ seed: this.seed, marks: this.painter.count, backend });
  }

  private async makeSpecimen(seed: number, signal?: AbortSignal) {
    const generation = ++this.generation;
    const motion = new MedusaMotion(createAnatomy(seed, this.settings));
    motion.current = this.current;
    motion.pulseAmount = this.pulseAmount;
    motion.turbulence = this.settings.turbulence;
    motion.drag = this.settings.drag;
    motion.suspension = this.settings.suspension;
    // Warm the trailing anatomy in cancellable slices, including regeneration.
    for (let i = 0; i < 20; i++) {
      if (signal?.aborted || this.disposed || generation !== this.generation)
        return;
      motion.advance(0.1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (signal?.aborted || this.disposed || generation !== this.generation)
      return;
    const painter = new OilPainter(motion.anatomy, motion.positions);
    painter.applySettings(this.settings);
    painter.time.value = motion.time;
    painter.pulseAmount.value = this.pulseAmount;
    this.growth =
      this.settings.growOnCreation &&
      !this.paused &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 1;
    painter.revealAge.value = this.growth * GROWTH_END;
    if (this.painter) {
      this.scene.remove(this.painter.root, this.painter.background);
      this.painter.dispose();
    }
    this.painter = painter;
    this.motion = motion;
    this.seed = seed;
    this.scene.add(painter.background, painter.root);
  }

  async regenerate(seed: number) {
    if (
      this.disposed ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff
    )
      return;
    if (this.regeneration || !this.loop) return;
    return new Promise<void>((resolve, reject) => {
      this.regeneration = { seed, resolve, reject };
      this.invalidate();
    });
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.loop?.setPlaying(!value);
  }
  setRotate(value: boolean) {
    this.rotating = value;
    this.invalidate();
  }
  private applySettings() {
    const s = this.settings;
    this.setPaused(s.paused);
    this.setRotate(s.rotating);
    this.rate = s.rate;
    this.current = s.current;
    this.pulseAmount = s.pulseAmount;
    if (this.motion) {
      this.motion.current = s.current;
      this.motion.pulseAmount = s.pulseAmount;
      this.motion.turbulence = s.turbulence;
      this.motion.drag = s.drag;
      this.motion.suspension = s.suspension;
    }
    this.painter?.applySettings(s);
    if (this.controls) this.controls.autoRotateSpeed = s.turnSpeed;
    this.camera.zoom = s.zoom;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
  sendCurrent(strength = 1.2) {
    if (this.motion) this.motion.impulse = strength;
    this.invalidate();
  }
  private stir = (event: MouseEvent) => {
    const bounds = this.canvas.getBoundingClientRect();
    const direction =
      (event.clientX - bounds.left) / bounds.width < 0.5 ? 1 : -1;
    this.sendCurrent(direction * 1.2);
    if (this.paused || this.loop?.reducedMotion) this.step();
  };
  step() {
    this.growth = Math.min(1, this.growth + 0.1 / this.settings.growthDuration);
    this.motion?.advance(0.1);
    this.invalidate();
  }
  private replayGrowth() {
    this.growth = this.loop?.reducedMotion ? 1 : 0;
    this.settings.paused = false;
    this.setPaused(false);
    this.invalidate();
  }
  resetCamera() {
    this.settings.zoom = 1;
    this.camera.position.set(0.4, 0.1, 14.8);
    this.controls?.target.set(0.1, -0.8, 0);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls?.update();
    this.invalidate();
  }

  private frame = async (delta: number, moving: boolean) => {
    if (!this.renderer || !this.motion || !this.painter || this.disposed)
      return;
    // Serialise rebuilding with rendering, so old resources cannot be disposed
    // while a frame or PNG capture is still using them.
    const regeneration = this.regeneration;
    this.regeneration = undefined;
    if (regeneration) {
      try {
        await this.makeSpecimen(regeneration.seed);
        if (!this.disposed)
          await this.renderer.compileAsync(this.scene, this.camera);
        if (this.disposed) {
          regeneration.resolve();
          return;
        }
        this.reportReady();
        regeneration.resolve();
      } catch (error) {
        regeneration.reject(error);
      }
    }
    if (this.loop?.reducedMotion) this.growth = 1;
    else
      this.growth = Math.min(
        1,
        this.growth + delta / this.settings.growthDuration
      );
    this.painter.revealAge.value = this.growth * GROWTH_END;
    this.motion.advance(delta * this.rate);
    this.painter.time.value = this.motion.time;
    this.painter.viewDistance.value = this.camera.position.distanceTo(
      this.controls?.target ?? this.scene.position
    );
    if (delta > 0 || !moving) this.painter.pose.needsUpdate = true;
    if (this.controls) {
      this.controls.enableDamping = moving;
      this.controls.autoRotate = this.rotating && moving;
      this.controls.update(delta);
    }
    const exporting = this.exportRequest;
    this.exportRequest = undefined;
    if (exporting) {
      try {
        const width = 2400;
        const height = Math.round(width / this.camera.aspect);
        const scale = Math.min(1, Math.sqrt(5_000_000 / (width * height)));
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(
          Math.round(width * scale),
          Math.round(height * scale),
          false
        );
        this.renderer.render(this.scene, this.camera);
        const blob = await new Promise<Blob>((resolve, reject) =>
          this.canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error('PNG capture failed.')),
            'image/png'
          )
        );
        if (!this.disposed) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `medusa-${this.seed}-${this.motion.time.toFixed(2)}.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        exporting.resolve();
      } catch (error) {
        exporting.reject(error);
      } finally {
        if (!this.disposed) this.resize();
      }
    }
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.growth = this.growth.toFixed(4);
    this.canvas.dataset.grown = String(this.growth >= 1);
    this.canvas.dataset.time = this.motion.time.toFixed(3);
    this.canvas.dataset.frames = String(++this.frames);
  };
  exportPNG(): Promise<void> {
    if (this.disposed || !this.loop)
      return Promise.reject(new Error('The painting is not ready.'));
    if (this.exportRequest)
      return Promise.reject(new Error('A print is already being prepared.'));
    return new Promise((resolve, reject) => {
      this.exportRequest = { resolve, reject };
      this.invalidate();
    });
  }
  private keydown = (event: KeyboardEvent) => {
    if (!this.controls) return;
    if (event.code === 'Space') {
      this.sendCurrent();
      if (this.paused || this.loop?.reducedMotion) this.step();
    } else if (event.key.toLowerCase() === 'r') this.resetCamera();
    else if (event.key === '+' || event.key === '=')
      this.camera.position.lerp(this.controls.target, 0.08);
    else if (event.key === '-')
      this.camera.position
        .sub(this.controls.target)
        .multiplyScalar(1.08)
        .add(this.controls.target);
    else if (event.key.startsWith('Arrow')) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const spherical = new T.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta += 0.12;
      if (event.key === 'ArrowRight') spherical.theta -= 0.12;
      if (event.key === 'ArrowUp') spherical.phi -= 0.12;
      if (event.key === 'ArrowDown') spherical.phi += 0.12;
      spherical.phi = T.MathUtils.clamp(spherical.phi, 0.22, Math.PI - 0.22);
      this.camera.position
        .copy(this.controls.target)
        .add(offset.setFromSpherical(spherical));
    } else return;
    event.preventDefault();
    this.controls.update();
    this.invalidate();
  };
  private invalidate = () => {
    this.loop?.invalidate();
  };
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const width = Math.max(1, this.sizes.width);
    const height = Math.max(1, this.sizes.height);
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 50 : 38;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(
      this.sizes.pixelRatio,
      Math.sqrt(2_000_000 / (width * height))
    );
    this.renderer?.setPixelRatio(dpr);
    this.renderer?.setSize(width, height, false);
    this.invalidate();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.studio?.dispose();
    this.observer?.disconnect();
    this.canvas.removeEventListener('keydown', this.keydown);
    this.canvas.removeEventListener('dblclick', this.stir);
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.exportRequest?.reject(new Error('The painting was closed.'));
    this.exportRequest = undefined;
    this.regeneration?.resolve();
    this.regeneration = undefined;
    const release = () => {
      this.painter?.dispose();
      this.scene.clear();
      this.renderer?.dispose();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
