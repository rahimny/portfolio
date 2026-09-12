import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { fieldVertex, fieldFragment } from './shaders';
import { decodePulseField } from '@/features/filament/pulses';
import { PulseRenderer } from './PulseRenderer';

export const MOTION_MODES = ['Still', 'Vortex', 'Liquid', 'Echo'] as const;
export type MotionMode = (typeof MOTION_MODES)[number];
export const INITIAL_STATUS = {
  ready: false,
  playing: true,
  reduced: false,
  tension: 1,
  exposure: 1,
  zoom: 1,
  time: 0,
  frameMs: 0,
  strength: 0.35,
  pulseForce: 0.85,
  depth: 0.8,
  network: true,
  speed: 1,
  spectral: 0,
  glitch: 0,
  pixelation: 0,
  stretch: 0,
  stretchVertical: false,
  digitalDrag: true,
  mode: 'Vortex' as MotionMode,
};
export type FilamentStatus = typeof INITIAL_STATUS;
const PIXEL_BUDGET = 1_500_000;

export class FilamentExperience extends BaseExperience {
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private renderer?: THREE.WebGLRenderer;
  private material?: THREE.ShaderMaterial;
  private geometry?: THREE.PlaneGeometry;
  private texture?: THREE.Texture;
  private bitmap?: ImageBitmap;
  private depthBitmap?: ImageBitmap;
  private depthTexture?: THREE.Texture;
  private signals?: PulseRenderer;
  private lastStimulus = -1;
  private glitchBirth = -100;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private loading = new AbortController();
  private disposed = false;
  private exporting = false;
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private status = { ...INITIAL_STATUS };
  private lastReport = 0;
  private pointer = new THREE.Vector2();
  private targetPointer = new THREE.Vector2();
  private grab = new THREE.Vector2();
  private drag = new THREE.Vector2();
  private targetDrag = new THREE.Vector2();
  private hover = 0;
  private targetHover = 0;
  private touch = 0;
  private targetTouch = 0;
  private dragId?: number;
  private onStatus: (status: FilamentStatus) => void;
  private uniforms = {
    uSpecimen: { value: null as THREE.Texture | null },
    uSignals: { value: null as THREE.Texture | null },
    uDepthField: { value: null as THREE.Texture | null },
    uDepth: { value: 0.8 },
    uNetwork: { value: 1 },
    uTime: { value: 0 },
    uTension: { value: 1 },
    uExposure: { value: 1 },
    uZoom: { value: 1 },
    uStrength: { value: 0.65 },
    uSpectral: { value: 0 },
    uGlitch: { value: 0 },
    uBurst: { value: 0 },
    uPixelation: { value: 0 },
    uStretch: { value: 0 },
    uStretchVertical: { value: 0 },
    uMode: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
    uTouch: { value: 0 },
    uGrab: { value: new THREE.Vector2() },
    uDrag: { value: new THREE.Vector2() },
    uHover: { value: 0 },
    uDigitalDrag: { value: 1 },
  };

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: FilamentStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }
  async init(signal?: AbortSignal) {
    if (this.disposed || signal?.aborted) return;
    const abort = () => this.loading.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const [response, routes, depthResponse] = await Promise.all([
        fetch('/filament/specimen.webp', { signal: this.loading.signal }),
        fetch('/filament/pulses.bin', { signal: this.loading.signal }),
        fetch('/filament/depth.webp', { signal: this.loading.signal }),
      ]);
      if (!response.ok)
        throw new Error('The filament field could not be loaded.');
      if (!routes.ok) throw new Error('The fibre routes could not be loaded.');
      if (!depthResponse.ok)
        throw new Error('The depth field could not be loaded.');
      const [blob, graphBytes, depthBlob] = await Promise.all([
        response.blob(),
        routes.arrayBuffer(),
        depthResponse.blob(),
      ]);
      if (this.disposed || signal?.aborted) return;
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      });
      if (this.disposed || signal?.aborted) {
        bitmap.close();
        return;
      }
      this.bitmap = bitmap;
      const depthBitmap = await createImageBitmap(depthBlob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      });
      if (this.disposed || signal?.aborted) {
        depthBitmap.close();
        return;
      }
      this.depthBitmap = depthBitmap;
      this.depthTexture = new THREE.Texture(depthBitmap);
      this.depthTexture.colorSpace = THREE.NoColorSpace;
      this.depthTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.depthTexture.magFilter = THREE.LinearFilter;
      this.depthTexture.needsUpdate = true;
      this.uniforms.uDepthField.value = this.depthTexture;
      this.texture = new THREE.Texture(bitmap);
      // The baked shader output already contains display-referred colour.
      this.texture.colorSpace = THREE.NoColorSpace;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.needsUpdate = true;
      this.uniforms.uSpecimen.value = this.texture;
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      });
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.texture.anisotropy = Math.min(
        4,
        this.renderer.capabilities.getMaxAnisotropy()
      );
      this.geometry = new THREE.PlaneGeometry(2, 2);
      this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: fieldVertex,
        fragmentShader: fieldFragment,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.scene.add(new THREE.Mesh(this.geometry, this.material));
      this.signals = new PulseRenderer(decodePulseField(graphBytes));
      this.uniforms.uSignals.value = this.signals.target.texture;
      this.renderer.info.autoReset = false;
      this.loop = new ExperienceLoop(
        this.canvas,
        this.frame,
        this.options.onError
      );
      this.status.playing = !this.motion.matches;
      this.loop.setPlaying(this.status.playing);
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(this.canvas.parentElement ?? this.canvas);
      this.canvas.addEventListener('keydown', this.keyDown);
      this.canvas.addEventListener('pointerdown', this.pointerDown);
      this.canvas.addEventListener('pointermove', this.pointerMove);
      this.canvas.addEventListener('pointerleave', this.pointerLeave);
      this.canvas.addEventListener('pointerup', this.pointerUp);
      this.canvas.addEventListener('pointercancel', this.pointerUp);
      this.canvas.addEventListener('lostpointercapture', this.pointerUp);
      this.canvas.addEventListener('webglcontextlost', this.contextLost);
      this.motion.addEventListener('change', this.motionChange);
      this.resize();
      await this.loop.start();
      if (this.disposed || signal?.aborted) return;
      this.status.ready = true;
      this.report();
    } catch (error) {
      if (!this.disposed && !signal?.aborted && !this.loading.signal.aborted)
        throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
  private report = () => {
    this.status.reduced = this.motion.matches;
    this.onStatus({ ...this.status });
  };
  private syncUniforms() {
    this.uniforms.uTime.value = this.status.time;
    this.uniforms.uTension.value = this.status.tension;
    this.uniforms.uExposure.value = this.status.exposure;
    this.uniforms.uZoom.value = this.status.zoom;
    this.uniforms.uStrength.value = this.status.strength;
    this.uniforms.uSpectral.value = this.status.spectral;
    this.uniforms.uDepth.value = this.status.depth;
    this.uniforms.uGlitch.value = this.status.glitch;
    this.uniforms.uBurst.value = Math.exp(
      -Math.max(0, this.status.time - this.glitchBirth) * 5
    );
    this.uniforms.uPixelation.value = this.status.pixelation;
    this.uniforms.uStretch.value = this.status.stretch;
    this.uniforms.uStretchVertical.value = this.status.stretchVertical ? 1 : 0;
    this.uniforms.uMode.value = MOTION_MODES.indexOf(this.status.mode);
    this.uniforms.uPointer.value.copy(this.pointer);
    this.uniforms.uTouch.value = this.touch;
    this.uniforms.uGrab.value.copy(this.grab);
    this.uniforms.uDrag.value.copy(this.drag);
    this.uniforms.uHover.value = this.hover;
    this.uniforms.uDigitalDrag.value = this.status.digitalDrag ? 1 : 0;
    this.uniforms.uNetwork.value =
      this.status.network && this.status.time > 0 ? 1 : 0;
  }
  private frame = (delta: number, moving: boolean) => {
    if (!this.renderer || this.disposed || this.exporting) return;
    const start = performance.now();
    if (moving) {
      this.status.time += delta * this.status.speed;
    }
    const settling =
      Math.abs(this.targetTouch - this.touch) > 0.001 ||
      Math.abs(this.targetHover - this.hover) > 0.001 ||
      this.drag.distanceToSquared(this.targetDrag) > 0.000001 ||
      this.pointer.distanceToSquared(this.targetPointer) > 0.000001;
    const blend = this.motion.matches
      ? 1
      : 1 - Math.exp(-12 * (delta || 1 / 60));
    this.touch = THREE.MathUtils.lerp(this.touch, this.targetTouch, blend);
    this.pointer.lerp(this.targetPointer, blend);
    this.drag.lerp(
      this.targetDrag,
      blend * (this.dragId === undefined ? 0.65 : 1)
    );
    if (this.motion.matches) this.drag.copy(this.targetDrag);
    this.hover = THREE.MathUtils.lerp(this.hover, this.targetHover, blend);
    this.syncUniforms();
    this.renderScene();
    this.status.frameMs = performance.now() - start;
    this.canvas.dataset.time = this.status.time.toFixed(4);
    this.canvas.dataset.frames = String(
      Number(this.canvas.dataset.frames ?? 0) + 1
    );
    this.canvas.dataset.emissions = String(this.signals?.emissions ?? 0);
    this.canvas.dataset.network = String(this.status.network);
    this.canvas.dataset.dragging = String(this.dragId !== undefined);
    this.canvas.dataset.strain = this.drag.length().toFixed(4);
    this.canvas.dataset.hover = this.hover.toFixed(3);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    if (performance.now() - this.lastReport > 500) {
      this.lastReport = performance.now();
      this.report();
    }
    if (settling && !this.motion.matches) this.loop?.invalidate();
  };
  private renderScene() {
    if (!this.renderer) return;
    this.renderer.info.reset();
    if (this.status.network && this.status.time > 0)
      this.signals?.render(
        this.renderer,
        this.status.time,
        this.status.pulseForce
      );
    this.renderer.render(this.scene, this.camera);
  }
  setNetwork(value: boolean) {
    this.status.network = value;
    this.loop?.invalidate();
    this.report();
  }
  setPulseForce(value: number) {
    this.setValue('pulseForce', value, 0, 1);
  }
  sendPulse() {
    if (this.status.time === 0) this.status.time = 0.001;
    this.status.network = true;
    this.signals?.emit(this.status.time);
    this.loop?.invalidate();
    this.report();
  }
  setPlaying(value: boolean) {
    this.status.playing = value && !this.motion.matches;
    this.loop?.setPlaying(this.status.playing);
    this.report();
  }
  setTension(value: number) {
    this.setValue('tension', value, 0.3, 1.7);
  }
  setExposure(value: number) {
    this.setValue('exposure', value, 0.3, 2);
  }
  setZoom(value: number) {
    this.setValue('zoom', value, 1, 2.5);
  }
  setStrength(value: number) {
    this.setValue('strength', value, 0, 1);
  }
  setSpeed(value: number) {
    this.setValue('speed', value, 0.2, 2);
  }
  setDepth(value: number) {
    this.setValue('depth', value, 0, 1);
  }
  setGlitch(value: number) {
    this.setValue('glitch', value, 0, 1);
  }
  setPixelation(value: number) {
    this.setValue('pixelation', value, 0, 1);
  }
  setStretch(value: number) {
    this.setValue('stretch', value, 0, 1);
  }
  setStretchVertical(value: boolean) {
    this.status.stretchVertical = value;
    this.loop?.invalidate();
    this.report();
  }
  setDigitalDrag(value: boolean) {
    this.status.digitalDrag = value;
    this.loop?.invalidate();
    this.report();
  }
  triggerGlitch() {
    this.glitchBirth = this.status.time;
    this.loop?.invalidate();
    this.report();
  }
  clearDistortion() {
    this.status.glitch = this.status.pixelation = this.status.stretch = 0;
    this.glitchBirth = -100;
    this.loop?.invalidate();
    this.report();
  }
  setSpectral(value: number) {
    this.setValue('spectral', value, 0, 1);
  }
  private setValue(
    key:
      | 'tension'
      | 'exposure'
      | 'zoom'
      | 'strength'
      | 'speed'
      | 'spectral'
      | 'pulseForce'
      | 'depth'
      | 'glitch'
      | 'pixelation'
      | 'stretch',
    value: number,
    min: number,
    max: number
  ) {
    if (!Number.isFinite(value)) return;
    this.status[key] = THREE.MathUtils.clamp(value, min, max);
    this.loop?.invalidate();
    this.report();
  }
  setMode(mode: MotionMode) {
    if (!MOTION_MODES.includes(mode)) return;
    this.status.mode = mode;
    this.loop?.invalidate();
    this.report();
  }
  step() {
    this.status.time += 0.5 * this.status.speed;

    this.loop?.invalidate();
    this.report();
  }
  reset() {
    const ready = this.status.ready;
    this.status = {
      ...INITIAL_STATUS,
      ready,
      playing: false,
      mode: 'Still',
      depth: 0,
    };
    this.signals?.reset();
    this.glitchBirth = -100;
    const captured = this.dragId;
    this.dragId = undefined;
    if (captured !== undefined && this.canvas.hasPointerCapture(captured))
      this.canvas.releasePointerCapture(captured);
    this.targetTouch = this.touch = this.hover = this.targetHover = 0;
    this.drag.set(0, 0);
    this.targetDrag.set(0, 0);
    this.targetPointer.set(0, 0);
    this.pointer.set(0, 0);
    this.loop?.setPlaying(false);
    this.loop?.invalidate();
    this.report();
  }
  async saveStill() {
    if (!this.renderer || this.disposed || this.exporting) return;
    this.exporting = true;
    const renderer = this.renderer,
      size = renderer.getSize(new THREE.Vector2()),
      ratio = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(2400, 2400, false);
      this.signals?.target.setSize(2400, 2400);
      this.syncUniforms();
      this.renderScene();
      // Start encoding synchronously after drawing: no retained default buffer.
      const blob = await new Promise<Blob | null>((resolve) =>
        this.canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('The still could not be encoded.');
      if (this.disposed) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `filament-${this.status.mode.toLowerCase()}-${this.status.time.toFixed(2)}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      this.exporting = false;
      if (!this.disposed) {
        this.signals?.target.setSize(1024, 1024);
        renderer.setPixelRatio(ratio);
        renderer.setSize(size.x, size.y, false);
        this.resize();
        this.frame(0, false);
      }
    }
  }
  private resize = () => {
    if (this.disposed || this.exporting) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    const ratio = Math.min(
      window.devicePixelRatio,
      2,
      Math.sqrt(PIXEL_BUDGET / Math.max(1, width * height))
    );
    this.renderer?.setPixelRatio(ratio);
    this.renderer?.setSize(width, height, false);
    this.loop?.invalidate();
  };
  private motionChange = () => {
    if (this.motion.matches) this.setPlaying(false);
    this.loop?.invalidate();
    this.report();
  };
  private locate = (event: PointerEvent) => {
    const bounds = this.canvas.getBoundingClientRect();
    this.targetPointer.set(
      (((event.clientX - bounds.left) / bounds.width - 0.5) * 2) /
        this.status.zoom,
      ((0.5 - (event.clientY - bounds.top) / bounds.height) * 2) /
        this.status.zoom
    );
    return (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    );
  };
  private stimulate() {
    this.lastStimulus = performance.now();
    if (this.status.time === 0) this.status.time = 0.001;
    this.status.network = true;
    this.signals?.emit(
      this.status.time,
      (this.targetPointer.x * 0.5 + 0.5) * 1024,
      (0.5 - this.targetPointer.y * 0.5) * 1024
    );
    if (!this.status.playing) this.step();
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.dragId !== undefined) return;
    this.dragId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.locate(event);
    this.grab.copy(this.targetPointer);
    this.targetDrag.set(0, 0);
    this.drag.set(0, 0);
    this.stimulate();
    this.targetHover = this.targetTouch = 1;
    this.loop?.invalidate();
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.dragId !== undefined && event.pointerId !== this.dragId) return;
    const inside = this.locate(event);
    this.targetHover =
      inside && (event.pointerType !== 'touch' || this.dragId !== undefined)
        ? 1
        : 0;
    if (event.pointerId === this.dragId) {
      this.targetDrag
        .copy(this.targetPointer)
        .sub(this.grab)
        .clampLength(0, 0.55);
      if (performance.now() - this.lastStimulus > 350) this.stimulate();
    }
    this.loop?.invalidate();
  };
  private pointerLeave = () => {
    this.targetHover = 0;
    this.loop?.invalidate();
  };
  private pointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.dragId) return;
    if (event.type === 'pointerup' && this.targetDrag.lengthSq() > 0.0004)
      this.stimulate();
    this.dragId = undefined;
    this.targetTouch = 0;
    this.targetDrag.set(0, 0);
    if (event.pointerType === 'touch' || event.type === 'pointercancel')
      this.targetHover = 0;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    this.loop?.invalidate();
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault();
      this.setPlaying(!this.status.playing);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.setTension(this.status.tension + 0.05);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.setTension(this.status.tension - 0.05);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.step();
    }
    if (event.key === 'Escape') this.reset();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(
      new Error(
        'The graphics context was lost. Reload to restore the specimen.'
      )
    );
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loading.abort();
    this.observer?.disconnect();
    this.loop?.dispose();
    this.motion.removeEventListener('change', this.motionChange);
    this.canvas.removeEventListener('keydown', this.keyDown);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.pointerUp);
    if (this.dragId !== undefined && this.canvas.hasPointerCapture(this.dragId))
      this.canvas.releasePointerCapture(this.dragId);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.signals?.dispose();
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.depthTexture?.dispose();
    this.depthBitmap?.close();
    this.bitmap?.close();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
