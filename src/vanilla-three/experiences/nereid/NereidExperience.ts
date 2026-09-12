import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { SwimmingModel, type SwimParameters } from '@/features/nereid/swimming';
import { SwimDeformation } from './SwimDeformation';
import { NereidAssembly } from './NereidAssembly';
import { clampSeparation, type NereidView } from '@/features/nereid/model';

export interface SwimReadout {
  stage: 'Contract' | 'Recover' | 'Glide';
  phase: number;
  contraction: number;
}

export class NereidExperience extends BaseExperience {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(38, 1, 0.1, 120);
  private projectionDistance = 16;
  private heading = new T.Vector3();
  private upAxis = new T.Vector3(0, 1, 0);
  private swimOrientation = new T.Quaternion();
  private renderer?: T.WebGLRenderer;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private assembly?: NereidAssembly;
  private grid?: T.GridHelper;
  private water?: T.LineSegments<T.BufferGeometry, T.LineBasicMaterial>;
  private waterSeeds = new Float32Array(256 * 3);
  private swimming = new SwimmingModel();
  private deformation?: SwimDeformation;
  private disposed = false;
  private separation = 0;
  private targetSeparation = 0;
  private time = 0;
  private view: NereidView = 'specimen';
  private span = 10.9;
  private autoRotate = false;
  private paused = false;

  private onReady: () => void;
  private onSwim: (status: SwimReadout) => void;
  private nextReadout = 0;

  constructor(
    canvas: HTMLCanvasElement,
    onReady: () => void,
    options?: ExperienceOptions,
    onSwim: (status: SwimReadout) => void = () => {}
  ) {
    super(canvas, options);
    this.onReady = onReady;
    this.onSwim = onSwim;
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
    this.scene.fog = new T.Fog(0xf5f4f1, 22, 65);
    this.scene.add(new T.HemisphereLight(0xf9fff2, 0x647b83, 1.5));
    const key = new T.DirectionalLight(0xfff7e5, 2.1);
    key.position.set(-4, 9, 7);
    this.scene.add(key);
    const rim = new T.DirectionalLight(0xcde5e6, 1.0);
    rim.position.set(6, 3, -4);
    this.scene.add(rim);
    this.assembly = new NereidAssembly();
    this.deformation = new SwimDeformation(this.assembly, this.swimming);
    this.scene.add(this.assembly.root);
    this.grid = new T.GridHelper(160, 160, 0xa5aca3, 0xc5c9bd);
    this.grid.position.y = -5.4;
    (this.grid.material as T.Material).transparent = true;
    (this.grid.material as T.Material).opacity = 0.32;
    this.scene.add(this.grid);
    const waterPositions = new Float32Array(256 * 6);
    for (let i = 0; i < 256; i++) {
      this.waterSeeds[i * 3] = ((i * 0.61803398875) % 1) * 26 - 13;
      this.waterSeeds[i * 3 + 1] = ((i * 0.754877666) % 1) * 26 - 13;
      this.waterSeeds[i * 3 + 2] = ((i * 0.56984029) % 1) * 24 - 12;
    }
    this.water = new T.LineSegments(
      new T.BufferGeometry().setAttribute(
        'position',
        new T.BufferAttribute(waterPositions, 3).setUsage(T.DynamicDrawUsage)
      ),
      new T.LineBasicMaterial({
        color: 0x839b93,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.water.frustumCulled = false;
    this.scene.add(this.water);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = true;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 5;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 36;
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

  setSeparation(value: number) {
    if (this.disposed) return;
    this.targetSeparation = clampSeparation(value);
    this.canvas.dataset.separation = String(this.targetSeparation);
    this.invalidate();
  }

  setView(view: NereidView) {
    if (this.disposed) return;
    this.view = view;
    this.canvas.dataset.view = view;
    this.resetCamera();
    this.invalidate();
  }

  setXray(enabled: boolean) {
    if (!this.assembly || this.disposed) return;
    for (const part of this.assembly.parts) {
      if (part.kind !== 'shell') continue;
      part.group.traverse((object) => {
        if (object instanceof T.Mesh) {
          if (!('nereidOriginal' in object.userData))
            object.userData.nereidOriginal = object.material;
          object.material = enabled
            ? (object.userData.nereidXray ?? this.assembly!.glass)
            : object.userData.nereidOriginal;
        }
      });
    }
    this.invalidate();
  }

  setSwimming(params: Partial<SwimParameters>) {
    this.swimming.setParameters(params);
    this.invalidate();
  }
  resetSwimming() {
    this.swimming.reset();
    this.time = 0;
    this.nextReadout = 0;
    this.invalidate();
  }
  stepSwimming() {
    this.swimming.advance(0.1);
    this.time = this.swimming.time;
    this.invalidate();
  }

  setRotate(enabled: boolean) {
    this.autoRotate = enabled;
    this.invalidate();
  }
  setPaused(enabled: boolean) {
    this.paused = enabled;
    this.loop?.setPlaying(!enabled);
  }

  resetCamera() {
    if (!this.controls) return;
    this.controls.reset();
    this.camera.zoom = 1;
    if (this.view === 'lattice') {
      this.span = 6.9;
      this.camera.position.set(6.6, 0.5, -0.6);
      this.controls.target.set(-0.3, -1.8, -2.65);
    } else {
      this.span = this.view === 'anatomy' ? 17 : 11.6;
      this.camera.position.set(8.3, this.view === 'anatomy' ? 5.8 : 4.5, 13);
      this.controls.target.set(0, this.view === 'anatomy' ? 1 : -0.85, 0);
    }
    this.projectionDistance = this.camera.position.distanceTo(
      this.controls.target
    );
    this.controls.update();
    this.resize();
  }

  private keydown = (event: KeyboardEvent) => {
    if (!this.controls) return;
    if (event.key === '+' || event.key === '=')
      this.camera.zoom = Math.min(5, this.camera.zoom * 1.12);
    else if (event.key === '-')
      this.camera.zoom = Math.max(0.6, this.camera.zoom / 1.12);
    else if (event.key.toLowerCase() === 'r') this.resetCamera();
    else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const spherical = new T.Spherical().setFromVector3(offset);
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

  private frame = (delta: number, moving: boolean) => {
    if (!this.renderer || !this.assembly || !this.controls || this.disposed)
      return;
    this.swimming.advance(delta);
    this.time = this.swimming.time;
    this.separation = moving
      ? T.MathUtils.damp(this.separation, this.targetSeparation, 5, delta)
      : this.targetSeparation;
    const weight = 1 - T.MathUtils.smoothstep(this.separation, 0, 0.5);
    this.deformation?.update(this.swimming, weight);
    this.assembly.apply(
      this.separation,
      this.view === 'lattice',
      -this.swimming.flowBias * 0.04,
      this.swimming.bell,
      this.swimming.margin,
      this.swimming.stroke,
      this.swimming.distance
    );
    // Floating origin follows the mean cruise, not every turn of the swimmer.
    // The path always advances in world X/Y; lateral/depth offsets remain visible.
    const distance = this.swimming.distance;
    const travelWeight = this.view === 'specimen' ? weight : 0;
    const lateral = Math.sin(distance * 0.23) * 1.25;
    const depth = Math.sin(distance * 0.16) * 1.75;
    this.assembly.root.position.set(
      (lateral * 0.843 + depth * 0.538) * travelWeight,
      0,
      (-lateral * 0.538 + depth * 0.843) * travelWeight
    );
    const lateralRate = Math.cos(distance * 0.23) * 0.2875;
    const depthRate = Math.cos(distance * 0.16) * 0.28;
    this.heading
      .set(
        0.42 + lateralRate * 0.843 + depthRate * 0.538,
        0.85,
        -lateralRate * 0.538 + depthRate * 0.843
      )
      .normalize();
    this.swimOrientation.setFromUnitVectors(this.upAxis, this.heading);
    this.assembly.root.quaternion.slerp(this.swimOrientation, travelWeight);
    if (this.grid) this.grid.visible = this.view !== 'lattice' && weight < 0.99;
    if (this.water) {
      this.water.visible = this.view === 'specimen' && weight > 0.01;
      this.water.material.opacity = 0.55 * weight;
      const attribute = this.water.geometry.getAttribute(
        'position'
      ) as T.BufferAttribute;
      for (let i = 0; i < 256; i++) {
        const j = i * 3;
        const x =
          T.MathUtils.euclideanModulo(
            this.waterSeeds[j] -
              distance * 0.42 +
              this.swimming.currentTravel +
              13,
            26
          ) - 13;
        const y =
          T.MathUtils.euclideanModulo(
            this.waterSeeds[j + 1] - distance * 0.85 + 13,
            26
          ) - 13;
        const z = this.waterSeeds[j + 2];
        attribute.setXYZ(i * 2, x, y, z);
        const length = 0.04 + (i % 5) * 0.025;
        attribute.setXYZ(i * 2 + 1, x + length * 0.42, y + length * 0.85, z);
      }
      attribute.needsUpdate = true;
    }
    if (this.time >= this.nextReadout || !moving) {
      this.nextReadout = this.time + 0.12;
      this.onSwim({
        stage: this.swimming.stage,
        phase: this.swimming.phase,
        contraction: 1 - this.swimming.rootScale,
      });
    }
    this.canvas.dataset.swimPhase = this.swimming.stage;
    this.canvas.dataset.bell = this.swimming.bell.toFixed(4);
    this.canvas.dataset.swimSteps = String(this.swimming.steps);
    this.canvas.dataset.tipX = this.swimming.chains[0].positions[96].toFixed(4);
    this.canvas.dataset.rootScale = this.swimming.rootScale.toFixed(4);
    this.canvas.dataset.travel = this.swimming.distance.toFixed(4);
    this.canvas.dataset.bodyY = this.assembly.root.position.y.toFixed(4);
    this.canvas.dataset.bodyX = this.assembly.root.position.x.toFixed(4);
    this.canvas.dataset.bodyZ = this.assembly.root.position.z.toFixed(4);
    this.canvas.dataset.projection = 'perspective';
    this.controls.enableDamping = moving;
    this.controls.autoRotate = moving && this.autoRotate;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.update(delta);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.renderedSeparation = this.separation.toFixed(3);
    this.canvas.dataset.time = this.time.toFixed(3);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
  };

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(
      new Error(
        'The graphics context was lost. Reload this study to restore the specimen.'
      )
    );
  };
  private invalidate = () => this.loop?.invalidate();
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    const aspect = width / Math.max(1, height);
    const span = this.span * Math.max(1, 0.82 / aspect);
    this.camera.aspect = aspect;
    this.camera.fov = T.MathUtils.radToDeg(
      2 * Math.atan(span / (2 * this.projectionDistance))
    );
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(
      Math.min(
        this.sizes.pixelRatio,
        1.75,
        Math.sqrt(2_000_000 / Math.max(1, width * height))
      )
    );
    this.renderer?.setSize(width, height, false);
    this.invalidate();
  };

  async saveStill(): Promise<void> {
    if (this.disposed || !this.renderer)
      throw new Error('The specimen is unavailable.');
    this.frame(0, !this.paused && !this.loop?.reducedMotion);
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, 'image/png')
    );
    if (!blob || this.disposed) throw new Error('Could not save the specimen.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nereid-${this.view}.png`;
    link.click();
    // Navigation has consumed the object URL before the next event-loop task.
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
      this.deformation?.dispose();
      this.assembly?.dispose();
      this.grid?.geometry.dispose();
      (this.grid?.material as T.Material | undefined)?.dispose();
      this.water?.geometry.dispose();
      this.water?.material.dispose();
      this.renderer?.dispose();
      this.scene.clear();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
