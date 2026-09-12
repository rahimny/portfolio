import { Pane } from 'tweakpane';
import * as THREE from 'three/webgpu';
import { BaseExperience } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { FlowField } from '../../../features/pixel-flow/FlowField';
import {
  DEFAULT_FIELD,
  FIELD_RADIUS,
  fieldHeight,
  readFieldSettings,
} from '../../../features/particle-sanctuary/model';
import { FieldEffects } from './FieldEffects';

export class ParticleSanctuaryExperience extends BaseExperience {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private renderer!: THREE.WebGPURenderer;
  private effects?: FieldEffects;
  private loop?: ExperienceLoop;
  private pane?: Pane;
  private resizeObserver?: ResizeObserver;
  private disposed = false;
  private time = 0;
  private needsResize = false;
  private settings = { ...DEFAULT_FIELD };
  private playback = { paused: false };
  private readonly field = new FlowField({
    gridSize: 84,
    radius: 68,
    impulse: 0.8,
    relaxation: 0.965,
  });
  private flowTexture!: THREE.DataTexture;
  private maskTexture!: THREE.CanvasTexture;
  private maskCanvas!: HTMLCanvasElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly pointer = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();
  private readonly target = new THREE.Vector2();
  private readonly smoothed = new THREE.Vector2();
  private readonly previous = new THREE.Vector2();
  private pointerActive = false;
  private pointerDown: { x: number; y: number } | null = null;
  private lastBurst = -Infinity;
  private readonly ownedGeometry: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private marker!: THREE.Mesh;
  private previousTouchAction = '';

  public async init(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.disposed) return;
    this.scene.background = new THREE.Color('#141811');
    this.camera.position.set(8, 9, 12);
    this.camera.lookAt(0, 0.2, 0);
    this.camera.near = 0.1;
    this.camera.far = 80;
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      // An explicit test path; ordinary visits use Three's supported backend fallback.
      forceWebGL:
        new URLSearchParams(location.search).get('renderer') === 'webgl',
    });
    this.connectRendererErrors(this.renderer);
    await this.renderer.init();
    signal?.throwIfAborted();
    this.resize();
    this.field.resize(640, 640);
    this.flowTexture = new THREE.DataTexture(
      this.field.textureData,
      this.field.textureWidth,
      this.field.textureHeight
    );
    this.flowTexture.minFilter = this.flowTexture.magFilter =
      THREE.LinearFilter;
    this.flowTexture.needsUpdate = true;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.maskCanvas.height = 512;
    this.maskTexture = new THREE.CanvasTexture(this.maskCanvas);
    this.maskTexture.flipY = false;
    this.drawMask();
    this.effects = new FieldEffects(
      this.flowTexture,
      this.maskTexture,
      this.settings
    );
    this.scene.add(this.effects.group);
    this.createStage();
    // Compile the pooled fragments before hiding them, so the first click is warm.
    await this.renderer.compileAsync(this.scene, this.camera);
    signal?.throwIfAborted();
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.previousTouchAction = this.canvas.style.touchAction;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerLeave);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => {
      this.needsResize = true;
      this.loop?.invalidate();
    });
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    if (this.options.controlsContainer) this.createControls();
    await this.loop.start();
  }

  private createStage(): void {
    const geometry = new THREE.CylinderGeometry(
      FIELD_RADIUS + 0.06,
      FIELD_RADIUS + 0.06,
      0.16,
      128
    );
    const material = new THREE.MeshBasicMaterial({ color: '#262c1e' });
    const ground = new THREE.Mesh(geometry, material);
    ground.position.y = -0.12;
    this.scene.add(ground);
    const ringGeometry = new THREE.RingGeometry(
      FIELD_RADIUS + 0.08,
      FIELD_RADIUS + 0.09,
      128
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#606544',
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    this.scene.add(ring);
    const markerGeometry = new THREE.RingGeometry(0.18, 0.2, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: '#ff632b',
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.marker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    this.scene.add(this.marker);
    this.ownedGeometry.push(geometry, ringGeometry, markerGeometry);
    this.ownedMaterials.push(material, ringMaterial, markerMaterial);
  }

  private resize(): void {
    this.updateSizes();
    const aspect = this.sizes.width / Math.max(1, this.sizes.height);
    const height = Math.max(12.8, 14 / aspect);
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(
        this.sizes.pixelRatio,
        this.settings.quality === 'high' ? 2 : 1.5
      )
    );
    this.renderer.setSize(this.sizes.width, this.sizes.height, false);
  }

  private drawMask(): void {
    const context = this.maskCanvas.getContext('2d')!;
    context.fillStyle = this.settings.text ? '#000' : '#fff';
    context.fillRect(0, 0, 512, 512);
    if (this.settings.text) {
      context.font = '900 170px Arial, sans-serif';
      const width = context.measureText(this.settings.text).width;
      context.font = `900 ${170 * Math.min(1, 410 / width)}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#fff';
      context.fillText(this.settings.text, 256, 256);
    }
    this.maskTexture.needsUpdate = true;
  }

  private createControls(): void {
    this.pane = new Pane({
      title: 'Particle Sanctuary',
      container: this.options.controlsContainer!,
    });
    this.pane
      .addBinding(this.playback, 'paused', { label: 'Pause' })
      .on('change', () => {
        this.loop?.setPlaying(!this.playback.paused);
      });
    this.pane
      .addButton({ title: 'Send an impulse · Enter' })
      .on('click', () => this.emit());
    this.pane
      .addBinding(this.settings, 'wind', {
        label: 'Wind',
        min: 0,
        max: 1.5,
        step: 0.05,
      })
      .on('change', () => {
        if (this.effects) this.effects.wind.value = this.settings.wind;
        this.loop?.invalidate();
      });
    const field = this.pane.addFolder({ title: 'Field', expanded: false });
    field
      .addBinding(this.settings, 'seed', {
        label: 'Seed',
        min: 1,
        max: 999999,
        step: 1,
      })
      .on('change', this.rebuild);
    field
      .addBinding(this.settings, 'quality', {
        label: 'Detail',
        options: { Standard: 'standard', High: 'high' },
      })
      .on('change', this.rebuild);
    field
      .addBinding(this.settings, 'text', { label: 'Grow a word' })
      .on('change', () => {
        this.settings.text = readFieldSettings(this.settings).text;
        this.drawMask();
        this.loop?.invalidate();
      });
    field.addButton({ title: 'Reset field · R' }).on('click', this.reset);
    this.pane
      .addButton({ title: 'Save still · PNG' })
      .on('click', this.saveStill);
  }

  private rebuild = (): void => {
    this.effects?.rebuild(this.settings);
    this.needsResize = true;
    this.reset();
  };

  private reset = (): void => {
    this.time = 0;
    this.lastBurst = -Infinity;
    this.effects?.bursts.clear();
    this.effects?.syncBursts();
    this.field.resize(640, 640);
    this.flowTexture.image.data = this.field.textureData;
    this.flowTexture.needsUpdate = true;
    this.pointerActive = false;
    this.loop?.invalidate();
  };

  private frame = (delta: number, moving: boolean): void => {
    if (this.disposed || !this.effects) return;
    if (this.needsResize) {
      this.needsResize = false;
      this.resize();
    }
    if (moving) {
      this.time += delta;
      if (this.pointerActive) {
        this.previous.copy(this.smoothed);
        this.smoothed.lerp(this.target, 1 - Math.exp(-delta * 18));
        const scale = 640 / (FIELD_RADIUS * 2);
        this.field.addImpulse(
          (this.smoothed.x + FIELD_RADIUS) * scale,
          (this.smoothed.y + FIELD_RADIUS) * scale,
          (this.smoothed.x - this.previous.x) * scale,
          (this.smoothed.y - this.previous.y) * scale
        );
      }
      if (this.field.energy > 0) {
        this.field.step(delta * 1000);
        this.flowTexture.needsUpdate = true;
      }
    }
    this.effects.update(this.time, !this.loop?.reducedMotion);
    this.renderer.render(this.scene, this.camera);
  };

  private locate(event: PointerEvent): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (
      !this.raycaster.ray.intersectPlane(this.plane, this.hit) ||
      Math.hypot(this.hit.x, this.hit.z) > FIELD_RADIUS
    )
      return false;
    this.target.set(this.hit.x, this.hit.z);
    return true;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.locate(event)) {
      this.onPointerLeave();
      return;
    }
    if (!this.pointerActive) this.smoothed.copy(this.target);
    this.pointerActive = true;
    this.marker.visible = false;
    this.loop?.invalidate();
  };

  private onPointerLeave = (): void => {
    this.pointerActive = false;
    this.pointerDown = null;
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.locate(event)) return;
    this.canvas.focus({ preventScroll: true });
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (
      this.pointerDown &&
      Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y
      ) < 8 &&
      this.locate(event)
    )
      this.emit();
    this.pointerDown = null;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) this.emit();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      this.playback.paused = !this.playback.paused;
      this.loop?.setPlaying(!this.playback.paused);
      this.pane?.refresh();
    } else if (event.key.toLowerCase() === 'r') this.reset();
    else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      this.target.x +=
        event.key === 'ArrowLeft'
          ? -0.45
          : event.key === 'ArrowRight'
            ? 0.45
            : 0;
      this.target.y +=
        event.key === 'ArrowUp' ? -0.45 : event.key === 'ArrowDown' ? 0.45 : 0;
      this.target.clampLength(0, FIELD_RADIUS - 0.3);
      this.marker.position.set(
        this.target.x,
        fieldHeight(this.target.x, this.target.y) + 0.8,
        this.target.y
      );
      this.marker.visible = true;
      this.loop?.invalidate();
    }
  };

  private emit(): void {
    const now = performance.now() / 1000;
    if (!this.effects || now - this.lastBurst < 0.15) return;
    this.lastBurst = now;
    // Reduced motion receives a static location marker, never a flashing burst.
    if (this.loop?.reducedMotion) {
      this.marker.position.set(this.target.x, 0.8, this.target.y);
      this.marker.visible = true;
    } else {
      this.effects.bursts.emit(
        this.target.x,
        this.target.y,
        this.time - (this.playback.paused ? 0.2 : 0)
      );
      this.effects.syncBursts();
    }
    this.loop?.invalidate();
  }

  private saveStill = (): void => {
    if (this.disposed) return;
    this.frame(0, false);
    this.canvas.toBlob((blob) => {
      if (!blob || this.disposed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `particle-sanctuary-${this.settings.seed}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  public getShareableState(): unknown {
    return { version: 1, ...this.settings };
  }

  public setShareableState(state: unknown): void {
    Object.assign(this.settings, readFieldSettings(state));
    if (this.effects) this.effects.wind.value = this.settings.wind;
    this.drawMask();
    this.rebuild();
    this.pane?.refresh();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerLeave);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.style.touchAction = this.previousTouchAction;
    this.pane?.dispose();
    this.effects?.dispose();
    this.flowTexture?.dispose();
    this.maskTexture?.dispose();
    this.ownedGeometry.forEach((geometry) => geometry.dispose());
    this.ownedMaterials.forEach((material) => material.dispose());
    this.scene.clear();
    this.renderer?.dispose();
  }
}
