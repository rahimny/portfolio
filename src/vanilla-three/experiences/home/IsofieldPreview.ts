import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { IsofieldState } from '@/features/home/IsofieldState';
import fragmentShader from '../../shaders/gallery/studies/isofield-fragment.glsl';

/** A bounded homepage adapter reusing the gallery's field, without its inspector. */
export class IsofieldPreview extends BaseExperience {
  private readonly state: IsofieldState;
  private renderer?: THREE.WebGLRenderer;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private disposed = false;
  private resizePending = true;
  private budget = 600_000;
  private slow = 0;
  private playing = true;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.ShaderMaterial({
    vertexShader:
      'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new THREE.Vector2() },
      uClock: { value: 8 },
      uSeed: { value: 1 },
      uFocusX: { value: 0 },
      uFocusY: { value: 0 },
      uRelief: { value: 1.15 },
      uContours: { value: 28 },
      uSection: { value: 1 },
      uImpulse: { value: 0 },
      uImpulseAge: { value: 0 },
      uImpulseOrigin: { value: new THREE.Vector2() },
      uFraming: { value: 1.1 },
      uPagePalette: { value: 1 },
      uPaper: { value: new THREE.Vector3() },
      uInk: { value: new THREE.Vector3() },
      uSignal: { value: new THREE.Vector3() },
    },
  });

  constructor(
    canvas: HTMLCanvasElement,
    state: IsofieldState,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.state = state;
  }

  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    // Resolve the actual CSS palette once; the shader outputs these sRGB values directly.
    const sampler = document.createElement('canvas');
    sampler.width = sampler.height = 1;
    const context = sampler.getContext('2d', { willReadFrequently: true })!;
    const styles = getComputedStyle(document.documentElement);
    for (const [uniform, token] of [
      ['uPaper', '--bg'],
      ['uInk', '--ink'],
      ['uSignal', '--brand'],
    ]) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = styles.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      this.material.uniforms[uniform].value.set(r / 255, g / 255, b / 255);
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'low-power',
    });
    this.renderer.debug.onShaderError = () =>
      this.options.onError?.(
        new Error('The field could not be drawn on this device.')
      );
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.state.invalidate = this.invalidate;
    this.observer = new ResizeObserver(() => {
      this.resizePending = true;
      this.invalidate();
    });
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.playing = !this.state.paused;
    this.loop.setPlaying(this.playing);
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
  }

  private invalidate = () => {
    if (this.playing === this.state.paused) {
      this.playing = !this.state.paused;
      this.loop?.setPlaying(this.playing);
    }
    this.loop?.invalidate();
  };
  private contextLost = () =>
    this.options.onError?.(
      new Error(
        'The graphics context was interrupted. The study link remains available below.'
      )
    );

  private frame = (dt: number, moving: boolean) => {
    if (this.disposed || !this.renderer) return;
    // Sustained slow presentation lowers pixels; it never oscillates quality upward.
    this.slow =
      moving && dt > 0.024 ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (this.slow >= 90 && this.budget > 300_000) {
      this.budget = Math.max(300_000, this.budget * 0.8);
      this.resizePending = true;
      this.slow = 0;
    }
    if (this.resizePending) {
      this.resizePending = false;
      this.updateSizes();
      this.material.uniforms.uFraming.value =
        this.sizes.width < 600 ? 1.3 : 1.1;
      const ratio = Math.min(
        1.25,
        window.devicePixelRatio || 1,
        Math.sqrt(
          this.budget / Math.max(1, this.sizes.width * this.sizes.height)
        )
      );
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(this.sizes.width, this.sizes.height, false);
      this.renderer.getDrawingBufferSize(
        this.material.uniforms.uResolution.value
      );
    }
    this.state.step(dt, moving, this.loop?.reducedMotion);
    const s = this.state,
      u = this.material.uniforms;
    u.uClock.value = s.time;
    u.uSeed.value = s.seed;
    u.uFocusX.value = s.focusX;
    u.uFocusY.value = s.focusY;
    const reveal = s.arrival * s.arrival * (3 - 2 * s.arrival);
    u.uRelief.value = 0.4 + reveal * (s.height - 0.4);
    u.uImpulse.value = s.impulse;
    u.uImpulseAge.value = s.impulseAge;
    u.uImpulseOrigin.value.set(s.impulseX, s.impulseY);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.time = s.time.toFixed(3);
    this.canvas.dataset.pulses = String(s.pulses);
    this.canvas.dataset.pixels = String(
      this.renderer.domElement.width * this.renderer.domElement.height
    );
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.state.invalidate === this.invalidate)
      this.state.invalidate = undefined;
    this.observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.loop?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}
