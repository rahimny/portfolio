import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { getVariant } from '@/features/lab/registry';
import { shaderDefinitions } from './gallery';

export interface ShaderUniforms {
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uMouse: { value: THREE.Vector2 };
  [key: string]: { value: any };
}

/**
 * Per-frame uniform driver.
 *
 * A shader whose resting state is a composed animation — rather than a still
 * image with a time uniform in it — needs somewhere to hold state between
 * frames: springs, a programme clock, an integrated camera position. Deriving
 * that from uTime inside the fragment shader means recomputing the whole
 * history for every pixel of every frame, and deriving it in React means the
 * render loop is no longer what owns motion. This is the seam.
 */
export interface FrameDriver {
  update(uniforms: Record<string, { value: any }>, dt: number): void;
  /** Omit for continuous rendering; false sleeps until runtime.invalidate(). */
  needsFrame?(): boolean;
  dispose?(): void;
}

export interface ShaderRuntime {
  readonly canvas: HTMLCanvasElement;
  invalidate(): void;
  setPixelRatioCap(cap: number): void;
  savePng(): void;
}

export interface ShaderDefinition {
  id: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms?: Record<string, { value: any }>;
  geometry?: 'plane' | 'sphere' | 'cube' | 'torus' | 'points';
  /** Vertex count for a procedural point study. */
  pointCount?: number;
  needsOrbitControls?: boolean;
  pixelRatioCap?: number;
  /** Upper bound on drawing-buffer pixels, independent of viewport size. */
  maxPixels?: number;
  pointerTracking?: boolean;
  /** One driver per experience instance, so leaving the page resets its state. */
  createDriver?: (runtime: ShaderRuntime) => FrameDriver;
  setupTweakpane?: (
    pane: Pane,
    uniforms: Record<string, { value: any }>,
    driver?: FrameDriver
  ) => void;
}

/**
 * Shader Gallery Experience - displays interactive WebGL shaders with Tweakpane controls.
 * Replaces the previous BaseShaderExperience + GenericShaderExperience abstraction.
 */
export class ShaderGalleryExperience extends BaseExperience {
  private shaderId: string;
  private shaderDefinition: ShaderDefinition;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private timer = new THREE.Timer();
  private motion?: MediaQueryList;
  private elapsed = 0;
  private disposed = false;
  private animationFrameId: number | null = null;
  private pixelRatioCap = 2;

  private shaderMaterial!: THREE.ShaderMaterial;
  private driver?: FrameDriver;
  private mesh!: THREE.Mesh | THREE.Points;
  private handleResize!: () => void;
  private handleMouseMove!: (event: MouseEvent) => void;
  private mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();

  private pane!: Pane;

  private requestFrame = (): void => {
    if (this.disposed || document.hidden || this.animationFrameId !== null)
      return;
    this.animationFrameId = requestAnimationFrame(() => {
      try {
        this.animate();
      } catch (error) {
        this.options.onError?.(error);
        this.dispose();
      }
    });
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      if (this.animationFrameId !== null)
        cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    } else {
      this.requestFrame();
    }
  };

  private getPixelRatio(): number {
    const budget = this.shaderDefinition.maxPixels ?? Infinity;
    return Math.min(
      this.sizes.pixelRatio,
      this.pixelRatioCap,
      Math.sqrt(budget / Math.max(1, this.sizes.width * this.sizes.height))
    );
  }

  // Default shader uniforms
  private baseUniforms: ShaderUniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2() },
  };

  constructor(
    canvas: HTMLCanvasElement,
    shaderId: string,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.shaderId = shaderId;

    // Get shader definition at construction time
    const definition = shaderDefinitions.find(
      (def) => def.id === this.shaderId
    );
    if (!definition) {
      throw new Error(`Shader definition not found for id: ${this.shaderId}`);
    }
    this.shaderDefinition = definition;
    this.pixelRatioCap = definition.pixelRatioCap ?? 2;
  }

  // Public method to update uniforms from external controls
  public updateUniformExternal(name: string, value: any): void {
    if (this.shaderMaterial && this.shaderMaterial.uniforms[name]) {
      // Handle vector uniforms (THREE.Vector2, THREE.Vector3, etc.)
      const currentValue = this.shaderMaterial.uniforms[name].value;
      if (
        currentValue &&
        typeof currentValue === 'object' &&
        'set' in currentValue
      ) {
        if (Array.isArray(value)) {
          (currentValue as any).set(...value);
        } else {
          (currentValue as any).copy(value);
        }
      } else {
        // Handle scalar uniforms
        this.shaderMaterial.uniforms[name].value = value;
      }
      this.requestFrame();
    }
  }

  // Get current uniform value
  public getUniformExternal(name: string): any {
    if (this.shaderMaterial && this.shaderMaterial.uniforms[name]) {
      return this.shaderMaterial.uniforms[name].value;
    }
    return null;
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
  }

  private initCamera(): void {
    if (
      this.shaderDefinition.geometry === 'plane' ||
      this.shaderDefinition.geometry === 'points' ||
      !this.shaderDefinition.geometry
    ) {
      // Orthographic camera for fullscreen shaders
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    } else {
      // Perspective camera for 3D geometry
      const aspect = this.sizes.width / this.sizes.height;
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      this.camera.position.set(0, 0, 3);
    }
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(this.getPixelRatio());
  }

  private initControls(): void {
    if (
      this.shaderDefinition.needsOrbitControls &&
      this.camera instanceof THREE.PerspectiveCamera
    ) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
    }
  }

  private setupResize(): void {
    this.handleResize = () => {
      this.updateSizes();

      if (this.camera instanceof THREE.PerspectiveCamera) {
        this.camera.aspect = this.sizes.width / this.sizes.height;
        this.camera.updateProjectionMatrix();
      } else if (this.camera instanceof THREE.OrthographicCamera) {
        // For fullscreen shaders, keep orthographic camera at fixed bounds
        // Let the shader handle aspect ratio via uResolution uniform
        // No need to update camera bounds - keep at (-1, 1, 1, -1)
      }

      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(this.getPixelRatio());

      // Update resolution uniform (include pixel ratio for accurate shader rendering)
      if (this.shaderMaterial) {
        this.renderer.getDrawingBufferSize(
          this.shaderMaterial.uniforms.uResolution.value
        );
      }
      this.requestFrame();
    };

    window.addEventListener('resize', this.handleResize);
  }

  private setupMouseTracking(): void {
    if (this.shaderDefinition.pointerTracking === false) return;
    this.handleMouseMove = (event: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseTarget.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.requestFrame();
    };

    window.addEventListener('mousemove', this.handleMouseMove);
  }

  private createGeometry(): THREE.BufferGeometry {
    switch (this.shaderDefinition.geometry) {
      case 'points': {
        const count = this.shaderDefinition.pointCount ?? 1;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(count * 3), 3)
        );
        geometry.setAttribute(
          'aIndex',
          new THREE.BufferAttribute(
            Float32Array.from({ length: count }, (_, index) => index),
            1
          )
        );
        return geometry;
      }
      case 'sphere':
        return new THREE.SphereGeometry(1, 32, 32);
      case 'cube':
        return new THREE.BoxGeometry(1, 1, 1);
      case 'torus':
        return new THREE.TorusGeometry(1, 0.4, 16, 100);
      case 'plane':
      default:
        return new THREE.PlaneGeometry(2, 2);
    }
  }

  private initShader(): void {
    const geometry = this.createGeometry();

    // Convert uniform definitions to Three.js format
    const customUniforms: Record<string, { value: any }> = {};
    if (this.shaderDefinition.uniforms) {
      Object.entries(this.shaderDefinition.uniforms).forEach(([key, def]) => {
        customUniforms[key] = { value: def.value };
      });
    }

    // Merge custom uniforms with base uniforms
    const uniforms = {
      ...this.baseUniforms,
      ...customUniforms,
    };

    const isPoints = this.shaderDefinition.geometry === 'points';
    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: this.shaderDefinition.vertexShader,
      fragmentShader: this.shaderDefinition.fragmentShader,
      uniforms,
      side: THREE.DoubleSide,
      transparent: isPoints,
      blending: isPoints ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthTest: !isPoints,
      depthWrite: !isPoints,
    });

    this.mesh = isPoints
      ? new THREE.Points(geometry, this.shaderMaterial)
      : new THREE.Mesh(geometry, this.shaderMaterial);
    this.mesh.frustumCulled = !isPoints;
    this.scene.add(this.mesh);

    this.driver = this.shaderDefinition.createDriver?.({
      canvas: this.canvas,
      invalidate: this.requestFrame,
      setPixelRatioCap: (cap) => {
        if (this.disposed || !Number.isFinite(cap)) return;
        this.pixelRatioCap = THREE.MathUtils.clamp(cap, 0.5, 2);
        this.handleResize();
      },
      savePng: () => {
        if (this.disposed) return;
        // Read immediately after rendering: the normal drawing buffer can be
        // discarded at compositing, so preserveDrawingBuffer is unnecessary.
        this.renderer.render(this.scene, this.camera);
        const link = document.createElement('a');
        link.download = `${this.shaderId}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
      },
    });

    // Set initial resolution (include pixel ratio for accurate shader rendering)
    this.renderer.getDrawingBufferSize(
      this.shaderMaterial.uniforms.uResolution.value
    );
  }

  private initGUI(): void {
    const container = this.options.controlsContainer;

    this.pane = new Pane({
      title:
        getVariant('shader-gallery', this.shaderId)?.title ?? this.shaderId,
      expanded: true,
      ...(container && { container }),
    });

    // Call the setup function with error handling
    if (this.shaderDefinition.setupTweakpane) {
      try {
        this.shaderDefinition.setupTweakpane(
          this.pane,
          this.shaderMaterial.uniforms,
          this.driver
        );
      } catch (error) {
        console.error(`Failed to setup Tweakpane for ${this.shaderId}:`, error);

        // Fallback: Add a simple error message to the pane
        this.pane.addBlade({
          view: 'text',
          label: 'Error',
          value: 'Failed to load shader controls',
          readonly: true,
        });
      }
    }
  }

  private animate(): void {
    this.animationFrameId = null;
    if (this.disposed) return;

    this.timer.update();
    const dt = this.timer.getDelta();

    // Cap slow frames so springs and integrators remain stable under load.
    const step = Math.min(dt, 0.05);
    if (!this.motion?.matches) this.elapsed += step;

    if (this.shaderMaterial) {
      this.shaderMaterial.uniforms.uTime.value = this.elapsed;
      const follow = this.motion?.matches ? 1 : 1 - Math.exp(-step * 8);
      this.mouse.lerp(this.mouseTarget, follow);
      this.shaderMaterial.uniforms.uMouse.value.copy(this.mouse);
      this.driver?.update(this.shaderMaterial.uniforms, step);
    }

    // Update controls
    if (this.controls) {
      this.controls.enableDamping = !this.motion?.matches;
      this.controls.update();
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
    if (this.driver?.needsFrame?.() ?? !this.motion?.matches)
      this.requestFrame();
  }

  public async init(signal?: AbortSignal): Promise<void> {
    if (this.disposed || signal?.aborted) return;
    try {
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.motion.addEventListener('change', this.requestFrame);
      this.elapsed = this.motion.matches ? 8 : 0;
      this.initScene();
      this.initCamera();
      this.initRenderer();
      this.initControls();
      this.setupResize();
      this.setupMouseTracking();
      this.initShader();

      // Initialize GUI after shader is ready
      if (this.options.controlsContainer) {
        this.initGUI();
      }

      this.pane?.on('change', this.requestFrame);
      this.controls?.addEventListener('change', this.requestFrame);
      this.timer.connect(document);
      document.addEventListener('visibilitychange', this.handleVisibility);
      this.timer.reset();
      // GUI setup may invalidate while init is still synchronous. Consume that
      // request before drawing the first frame, so only one RAF chain survives.
      if (this.animationFrameId !== null)
        cancelAnimationFrame(this.animationFrameId);
      this.animate();
    } catch (error) {
      console.error('Failed to initialize ShaderGalleryExperience:', error);
      throw error;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.handleMouseMove) {
      window.removeEventListener('mousemove', this.handleMouseMove);
    }

    this.motion?.removeEventListener('change', this.requestFrame);
    this.controls?.removeEventListener('change', this.requestFrame);
    this.driver?.dispose?.();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.controls?.dispose();
    this.timer.dispose();

    // Dispose of Tweakpane
    if (this.pane) {
      this.pane.dispose();
    }

    // Dispose of geometry and material
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.material instanceof THREE.Material) {
        this.mesh.material.dispose();
      }
    }

    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
