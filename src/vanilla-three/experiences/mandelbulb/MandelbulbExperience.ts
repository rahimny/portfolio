import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  bounded,
  growthPose,
  patternWeights,
  NUMERIC_LIMITS,
  type NumericSetting,
  DEFAULT_SETTINGS,
  readSettings,
  sectionPlane,
  cursorSlicePercent,
  cursorSlicePlane,
  type MandelbulbSettings,
} from '@/features/mandelbulb/model';
import fragmentShader from './mandelbulb.frag.glsl';

export interface MandelbulbStatus extends MandelbulbSettings {
  ready: boolean;
  paused: boolean;
  reduced: boolean;
  frameMs: number;
  width: number;
  height: number;
  growth: number;
  phase: string;
  time: number;
}
export const INITIAL_STATUS: MandelbulbStatus = {
  ...DEFAULT_SETTINGS,
  ready: false,
  paused: false,
  reduced: false,
  frameMs: 0,
  width: 0,
  height: 0,
  growth: 0,
  phase: 'Seed',
  time: 0,
};

export class MandelbulbExperience extends BaseExperience {
  private report: (status: MandelbulbStatus) => void;
  private scene = new THREE.Scene();
  private screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private disposed = false;
  private ready = false;
  private paused = false;
  private settings = { ...DEFAULT_SETTINGS };
  private power = DEFAULT_SETTINGS.power;
  private section = DEFAULT_SETTINGS.section;
  private sliceX = 0;
  private sliceY = 0;
  private time = 0;
  private growthAge = 0;
  private pointer = new THREE.Vector3(0, 0, 1);
  private pointerTarget = new THREE.Vector3(0, 0, 1);
  private pointerStrength = 0;
  private pointerActive = false;
  private restoredForce: number | null = null;
  private pulse = 0;
  private pulseAge = 0;
  private pulseOrigin = new THREE.Vector3(0, 0, 1);
  private raycaster = new THREE.Raycaster();
  private interactionSphere = new THREE.Sphere(new THREE.Vector3(), 1.15);
  private lastFrame = 0;
  private frameMs = 0;
  private lastReport = 0;
  private reportedReduced = false;
  private pixelBudget = 900_000;
  private slowFrames = 0;
  private geometry = new THREE.PlaneGeometry(2, 2);
  private material = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uPaper: { value: new THREE.Color() },
      uInk: { value: new THREE.Color() },
      uBrand: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAmplitude: { value: 0.55 },
      uWeights: { value: new THREE.Vector3(1, 0, 0) },
      uScale: { value: 0.18 },
      uBranching: { value: 0 },
      uComplexity: { value: 1 },
      uPointer: { value: new THREE.Vector3(0, 0, 1) },
      uPointerStrength: { value: 0 },
      uPulse: { value: 0 },
      uPulseAge: { value: 0 },
      uPulseOrigin: { value: new THREE.Vector3(0, 0, 1) },
      uFinish: { value: 0 },
      uLine: { value: 0.65 },
      uHatch: { value: 0.22 },
      uEye: { value: new THREE.Vector3() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uFov: { value: Math.tan(THREE.MathUtils.degToRad(38) / 2) },
      uPower: { value: 8 },
      uSection: { value: 1.4 },
      uCuts: { value: new THREE.Vector2(1.7, 1.7) },
      uSlicing: { value: 3 },
      uCutAccent: { value: 0.12 },
      uFine: { value: 0 },
      uOffset: { value: new THREE.Vector2() },
    },
  });

  constructor(
    canvas: HTMLCanvasElement,
    report: (status: MandelbulbStatus) => void,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.report = report;
  }

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
      });
    } catch {
      throw new Error(
        'This sculpture needs WebGL 2. Try a browser with hardware acceleration enabled.'
      );
    }
    const sampler = document.createElement('canvas');
    sampler.width = sampler.height = 1;
    const context = sampler.getContext('2d', { willReadFrequently: true })!;
    const styles = getComputedStyle(document.documentElement);
    for (const [uniform, token] of [
      ['uPaper', '--paper'],
      ['uInk', '--ink'],
      ['uBrand', '--brand'],
    ]) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = styles.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      this.material.uniforms[uniform].value.setRGB(
        r / 255,
        g / 255,
        b / 255,
        THREE.SRGBColorSpace
      );
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.debug.onShaderError = () => {
      this.options.onError?.(
        new Error('The fractal shader could not compile on this device.')
      );
    };
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.camera.position.set(2.6, 1.55, 3.6);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 2.1;
    this.controls.maxDistance = 7;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI - 0.15;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.rotateSpeed = 0.6;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.update();
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    if (this.loop.reducedMotion) this.growthAge = this.settings.growthDuration;
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointerleave', this.pointerLeave);
    this.canvas.addEventListener('pointercancel', this.pointerLeave);
    this.canvas.addEventListener('blur', this.pointerLeave);
    window.addEventListener('blur', this.pointerLeave);
    this.canvas.addEventListener('keydown', this.keyDown);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.ready = true;
    this.publish();
  }

  public configure(key: NumericSetting, value: number): void {
    const [min, max] = NUMERIC_LIMITS[key];
    const progress = this.growthAge / this.settings.growthDuration;
    this.settings[key] = bounded(value, min, max);
    if (key === 'growthDuration')
      this.growthAge = progress * this.settings.growthDuration;
    this.changed();
  }
  public setPattern(pattern: MandelbulbSettings['pattern']): void {
    this.settings.pattern = pattern;
    this.changed();
  }
  public setFinish(finish: MandelbulbSettings['finish']): void {
    this.settings.finish = finish;
    this.settings.ink =
      finish === 'ink' ? 0.95 : finish === 'cel' ? 0.65 : 0.25;
    this.settings.hatch =
      finish === 'ink' ? 0.65 : finish === 'cel' ? 0.22 : 0.05;
    this.changed();
  }
  public setTurntable(value: boolean): void {
    this.settings.turntable = value;
    this.changed();
  }
  public replayGrowth(): void {
    this.growthAge = 0;
    this.time = 0;
    this.pulse = 0;
    this.pointerLeave();
    this.pointerStrength = 0;
    if (!this.loop?.reducedMotion) this.setPaused(false);
    this.changed();
  }
  public setGrowthProgress(value: number): void {
    this.growthAge =
      (bounded(value, 0, 100) * this.settings.growthDuration) / 100;
    this.setPaused(true);
  }
  public excite(): void {
    this.pulse = 1;
    this.pulseAge = 0;
    this.pulseOrigin.copy(this.pointer);
    this.changed();
  }
  private pointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && !event.isPrimary) {
      this.pointerLeave();
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const uv = new THREE.Vector3(
      ((((event.clientX - bounds.left) / bounds.width) * 2 - 1) *
        bounds.width) /
        bounds.height,
      1 -
        ((event.clientY - bounds.top) / bounds.height) * 2 +
        this.material.uniforms.uOffset.value.y,
      -1
    );
    uv.x *= this.material.uniforms.uFov.value;
    uv.y *= this.material.uniforms.uFov.value;
    const cursorX = uv.x * this.camera.position.length();
    const cursorY = uv.y * this.camera.position.length();
    this.camera.updateMatrixWorld();
    uv.transformDirection(this.camera.matrixWorld);
    this.raycaster.ray.set(this.camera.position, uv);
    this.restoredForce = null;
    this.pointerActive = !!this.raycaster.ray.intersectSphere(
      this.interactionSphere,
      this.pointerTarget
    );
    if (
      this.pointerActive &&
      this.settings.slicing !== 'off' &&
      this.settings.response > 0 &&
      (!event.buttons || event.type === 'pointerdown')
    ) {
      if (this.settings.slicing !== 'y')
        this.settings.sliceX = cursorSlicePercent(cursorX);
      if (this.settings.slicing !== 'x')
        this.settings.sliceY = cursorSlicePercent(cursorY);
      this.publish();
    }
    this.invalidate();
  };
  private pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.shiftKey || !event.isPrimary) return;
    this.pointerMove(event);
    if (this.pointerActive) {
      this.pointer.copy(this.pointerTarget);
      this.excite();
    }
  };
  private pointerLeave = (): void => {
    this.restoredForce = null;
    this.pointerActive = false;
    this.invalidate();
  };

  public setSlicing(slicing: MandelbulbSettings['slicing']): void {
    this.settings.slicing = slicing;
    this.changed();
  }
  public clearCuts(): void {
    this.settings.sliceX = this.settings.sliceY = this.settings.section = 0;
    this.changed();
  }
  public setPower(value: number): void {
    this.settings.power = bounded(value, 3, 10);
    this.changed();
  }
  public setSection(value: number): void {
    this.settings.section = bounded(value, 0, 100);
    this.changed();
  }
  public setDetail(value: MandelbulbSettings['detail']): void {
    this.settings.detail = value;
    this.pixelBudget = value === 'fine' ? 1_500_000 : 900_000;
    this.slowFrames = 0;
    this.resize();
    this.changed();
  }
  public setPaused(value: boolean): void {
    this.paused = value;
    this.loop?.setPlaying(!value);
    this.lastFrame = 0;
    this.changed();
  }
  public reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.time = 0;
    this.growthAge = this.settings.growthDuration;
    this.pulse = 0;
    this.pointerActive = false;
    this.pointerStrength = 0;
    this.restoredForce = null;
    this.pointer.set(0, 0, 1);
    this.pointerTarget.copy(this.pointer);
    this.power = this.settings.power;
    this.section = this.settings.section;
    this.sliceX = this.sliceY = 0;
    this.camera.position.set(2.6, 1.55, 3.6);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
    this.setDetail('balanced');
    this.changed();
  }
  private changed(): void {
    if (this.disposed) return;
    this.publish();
    this.invalidate();
  }
  private invalidate = (): void => {
    this.loop?.invalidate();
  };
  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.options.onError?.(
      new Error(
        'The graphics context was lost. Reload to reopen the sculpture.'
      )
    );
  };
  private keyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.clearCuts();
    }
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      this.excite();
    }
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      this.camera.position.setLength(
        bounded(
          this.camera.position.length() * (event.key === '-' ? 1.12 : 0.89),
          2.1,
          7
        )
      );
      this.controls?.update();
      this.invalidate();
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.setPaused(!this.paused);
    }
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(
        this.camera.position
      );
      spherical.theta +=
        event.key === 'ArrowLeft'
          ? -0.12
          : event.key === 'ArrowRight'
            ? 0.12
            : 0;
      spherical.phi = bounded(
        spherical.phi +
          (event.key === 'ArrowUp'
            ? -0.12
            : event.key === 'ArrowDown'
              ? 0.12
              : 0),
        0.15,
        Math.PI - 0.15
      );
      this.camera.position.setFromSpherical(spherical);
      this.controls?.update();
      this.invalidate();
    }
  };
  private resize = (): void => {
    if (this.disposed || !this.renderer) return;
    this.updateSizes();
    const width = Math.max(1, this.sizes.width);
    const height = Math.max(1, this.sizes.height);
    this.material.uniforms.uFov.value =
      Math.tan(THREE.MathUtils.degToRad(38) / 2) *
      Math.max(1, 0.98 / (width / height));
    this.material.uniforms.uOffset.value.set(0, 0);
    this.material.uniforms.uViewport.value.set(width, height);
    const ratio = Math.min(
      this.sizes.pixelRatio,
      Math.sqrt(this.pixelBudget / (width * height))
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(
      this.material.uniforms.uResolution.value
    );
    this.invalidate();
    this.publish();
  };
  private frame = (delta: number, moving: boolean): void => {
    if (!this.renderer || !this.controls || this.disposed) return;
    const now = performance.now();
    if (moving && this.lastFrame && now - this.lastFrame < 250) {
      const interval = now - this.lastFrame;
      this.frameMs = this.frameMs
        ? THREE.MathUtils.lerp(this.frameMs, interval, 0.06)
        : interval;
      // Reduce only pixel count: the geometric rule and march budget stay intact.
      if (this.frameMs > 34 && this.settings.detail === 'balanced')
        this.slowFrames++;
      else this.slowFrames = 0;
      if (this.slowFrames > 90 && this.pixelBudget > 400_000) {
        this.pixelBudget = Math.max(400_000, this.pixelBudget * 0.8);
        this.slowFrames = 0;
        this.resize();
      }
    }
    this.lastFrame = moving ? now : 0;
    const weight = moving ? 1 - Math.exp(-delta * 9) : 1;
    this.power = THREE.MathUtils.lerp(this.power, this.settings.power, weight);
    this.section = THREE.MathUtils.lerp(
      this.section,
      this.settings.section,
      weight
    );
    if (moving) {
      this.time += delta * this.settings.speed;
      this.growthAge = Math.min(
        this.settings.growthDuration,
        this.growthAge + delta
      );
      this.pulseAge += delta;
      this.pulse *= Math.exp(-delta * 1.35);
    }
    this.pointer.lerp(
      this.pointerTarget,
      moving ? 1 - Math.exp(-delta * 12) : 1
    );
    this.pointerStrength = THREE.MathUtils.lerp(
      this.pointerStrength,
      this.restoredForce ?? (this.pointerActive ? 1 : 0),
      moving ? 1 - Math.exp(-delta * 8) : 1
    );
    this.sliceX = THREE.MathUtils.lerp(
      this.sliceX,
      this.settings.sliceX,
      weight
    );
    this.sliceY = THREE.MathUtils.lerp(
      this.sliceY,
      this.settings.sliceY,
      weight
    );
    this.controls.autoRotate = moving && this.settings.turntable;
    this.controls.enableDamping = moving;
    this.controls.update(delta);
    this.draw();
    this.canvas.dataset.time = this.time.toFixed(4);
    this.canvas.dataset.growth = (
      this.growthAge / this.settings.growthDuration
    ).toFixed(4);
    this.canvas.dataset.sliceX = this.sliceX.toFixed(3);
    this.canvas.dataset.sliceY = this.sliceY.toFixed(3);
    this.canvas.dataset.pointer = this.pointerStrength.toFixed(3);
    this.canvas.dataset.pulse = this.pulse.toFixed(3);
    this.canvas.dataset.power = this.power.toFixed(3);
    this.canvas.dataset.section = this.section.toFixed(3);
    this.canvas.dataset.frames = String(
      Number(this.canvas.dataset.frames ?? 0) + 1
    );
    if (
      now - this.lastReport > 600 ||
      this.reportedReduced !== this.loop?.reducedMotion
    ) {
      this.lastReport = now;
      this.publish();
    }
  };
  private draw(): void {
    if (!this.renderer) return;
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCameraWorld.value.copy(this.camera.matrixWorld);
    this.material.uniforms.uEye.value.copy(this.camera.position);
    const pose = growthPose(
      this.growthAge,
      this.settings.growthDuration,
      this.settings.complexity
    );
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = this.time;
    uniforms.uScale.value = pose.scale;
    uniforms.uBranching.value = pose.branching;
    uniforms.uComplexity.value = pose.complexity;
    uniforms.uWeights.value.fromArray(
      patternWeights(this.settings.pattern, this.time)
    );
    uniforms.uAmplitude.value = this.settings.amplitude * pose.branching;
    uniforms.uPointer.value.copy(this.pointer);
    uniforms.uPointerStrength.value =
      this.settings.slicing === 'off'
        ? this.pointerStrength * this.settings.response
        : 0;
    uniforms.uPulse.value = this.pulse * this.settings.response;
    uniforms.uPulseAge.value = this.pulseAge;
    uniforms.uPulseOrigin.value.copy(this.pulseOrigin);
    uniforms.uFinish.value =
      this.settings.finish === 'cel'
        ? 0
        : this.settings.finish === 'ink'
          ? 1
          : 2;
    uniforms.uLine.value = this.settings.ink;
    uniforms.uHatch.value = this.settings.hatch;
    this.material.uniforms.uPower.value = THREE.MathUtils.lerp(
      2.2,
      this.power +
        Math.sin(this.time * 0.62 + Math.sin(this.time * 0.17) * 0.35) *
          this.settings.morph *
          this.settings.amplitude,
      pose.branching
    );
    uniforms.uCuts.value.set(
      cursorSlicePlane(this.sliceX),
      cursorSlicePlane(this.sliceY)
    );
    uniforms.uSlicing.value =
      this.settings.response === 0 || this.settings.slicing === 'off'
        ? 0
        : this.settings.slicing === 'x'
          ? 1
          : this.settings.slicing === 'y'
            ? 2
            : 3;
    uniforms.uCutAccent.value = this.settings.cutAccent;
    this.material.uniforms.uSection.value = sectionPlane(this.section);
    this.material.uniforms.uFine.value =
      this.settings.detail === 'fine' ? 1 : 0;
    this.renderer.render(this.scene, this.screenCamera);
  }
  private publish(): void {
    if (this.disposed) return;
    this.reportedReduced = this.loop?.reducedMotion ?? false;
    this.report({
      ...this.settings,
      ready: this.ready,
      paused: this.paused,
      reduced: this.reportedReduced,
      frameMs: this.frameMs,
      width: this.canvas.width,
      height: this.canvas.height,
      growth: (this.growthAge / this.settings.growthDuration) * 100,
      phase: growthPose(
        this.growthAge,
        this.settings.growthDuration,
        this.settings.complexity
      ).phase,
      time: this.time,
    });
  }
  public getShareableState(): unknown {
    // Manual controls can change while an offscreen canvas has no pending draw.
    // In inspection mode, share their requested values rather than the last rendered values.
    const settled = this.paused || this.loop?.reducedMotion;
    return {
      version: 2,
      motion: {
        time: this.time,
        growthAge: this.growthAge,
        pointer: this.pointer.toArray(),
        strength: this.pointerStrength,
        pulse: this.pulse,
        pulseAge: this.pulseAge,
        pulseOrigin: this.pulseOrigin.toArray(),
      },
      settings: {
        ...this.settings,
        power: settled ? this.settings.power : this.power,
        section: settled ? this.settings.section : this.section,
        sliceX: settled ? this.settings.sliceX : this.sliceX,
        sliceY: settled ? this.settings.sliceY : this.sliceY,
      },
      camera: this.camera.position.toArray(),
    };
  }
  public setShareableState(value: unknown): void {
    if (!value || typeof value !== 'object' || this.disposed) return;
    const state = value as Record<string, unknown>;
    const settings = readSettings(state.settings);
    const camera = state.camera;
    if (
      ![1, 2].includes(Number(state.version)) ||
      !settings ||
      !Array.isArray(camera) ||
      camera.length !== 3 ||
      !camera.every((v) => typeof v === 'number' && Number.isFinite(v))
    )
      return;
    const position = new THREE.Vector3().fromArray(camera);
    if (position.length() < 2.1 || position.length() > 7.01) return;
    const motion = state.motion as Record<string, unknown> | undefined;
    if (state.version === 2) {
      if (!motion) return;
      for (const [key, max] of [
        ['time', 1e9],
        ['growthAge', 20],
        ['strength', 1],
        ['pulse', 1],
        ['pulseAge', 1e9],
      ] as const) {
        if (
          typeof motion[key] !== 'number' ||
          !Number.isFinite(motion[key]) ||
          Number(motion[key]) < 0 ||
          Number(motion[key]) > max
        )
          return;
      }
      for (const key of ['pointer', 'pulseOrigin']) {
        const vector = motion[key];
        if (
          !Array.isArray(vector) ||
          vector.length !== 3 ||
          !vector.every(
            (v) =>
              typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2
          )
        )
          return;
      }
      this.time = motion.time as number;
      this.growthAge = Math.min(
        settings.growthDuration,
        motion.growthAge as number
      );
      this.pointer.fromArray(motion.pointer as number[]);
      this.pointerTarget.copy(this.pointer);
      this.pointerStrength = motion.strength as number;
      this.pointerActive = this.pointerStrength > 0;
      this.restoredForce = this.pointerStrength;
      this.pulse = motion.pulse as number;
      this.pulseAge = motion.pulseAge as number;
      this.pulseOrigin.fromArray(motion.pulseOrigin as number[]);
    } else {
      this.time = 0;
      this.growthAge = settings.growthDuration;
    }
    this.settings = settings;
    this.power = settings.power;
    this.section = settings.section;
    this.sliceX = settings.sliceX;
    this.sliceY = settings.sliceY;
    this.camera.position.copy(position);
    if (this.controls) this.controls.autoRotate = false;
    this.controls?.update();
    this.setDetail(settings.detail);
    this.setPaused(true);
  }
  public async saveStill(): Promise<boolean> {
    if (!this.renderer || this.disposed) return false;
    const renderer = this.renderer;
    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalRatio = renderer.getPixelRatio();
    const width = 2400;
    const height = Math.round((width * originalSize.y) / originalSize.x);
    const detail = this.settings.detail;
    const filename = `mandelbulb-p${this.power.toFixed(2)}-section${this.section.toFixed(0)}.png`;
    let pending: Promise<Blob | null>;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      this.material.uniforms.uResolution.value.set(width, height);
      this.settings.detail = 'fine';
      this.draw();
      // toBlob snapshots synchronously; encoding can finish after restoring the live buffer.
      pending = new Promise((resolve) =>
        this.canvas.toBlob(resolve, 'image/png')
      );
    } finally {
      this.settings.detail = detail;
      renderer.setPixelRatio(originalRatio);
      renderer.setSize(originalSize.x, originalSize.y, false);
      renderer.getDrawingBufferSize(this.material.uniforms.uResolution.value);
      this.draw();
    }
    const blob = await pending;
    if (!blob || this.disposed) return false;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointercancel', this.pointerLeave);
    this.canvas.removeEventListener('blur', this.pointerLeave);
    window.removeEventListener('blur', this.pointerLeave);
    this.canvas.removeEventListener('keydown', this.keyDown);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
