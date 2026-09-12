import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import auroraFragmentShader from '@/vanilla-three/shaders/gallery/artistic/aurora-fragment.glsl';

export class AuroraBackgroundExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private animationFrameId: number | null = null;

  private shaderMaterial!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private handleResize!: () => void;
  private mouse = new THREE.Vector2();

  private pane?: Pane;
  private isControlsVisible = false;
  private keyboardHandler?: (event: KeyboardEvent) => void;
  private mouseHandler?: (event: MouseEvent) => void;

  private uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2() },
    uSpeed: { value: 0.7 },
    uIntensity: { value: 1.2 },
    uWaveHeight: { value: 0.25 },
  };

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    super(canvas, options);
    this.clock = new THREE.Clock();
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
  }

  private initCamera(): void {
    // Orthographic camera for fullscreen background
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });

    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private setupResize(): void {
    this.handleResize = () => {
      this.updateSizes();

      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      if (this.shaderMaterial) {
        this.shaderMaterial.uniforms.uResolution.value.set(
          this.sizes.width,
          this.sizes.height
        );
      }
    };

    window.addEventListener('resize', this.handleResize);
  }

  private setupMouseTracking(): void {
    this.mouseHandler = (event: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.shaderMaterial) {
        this.shaderMaterial.uniforms.uMouse.value.copy(this.mouse);
      }
    };

    this.canvas.addEventListener('mousemove', this.mouseHandler);
  }

  private setupKeyboardControls(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 't') {
        this.toggleControls();
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  private toggleControls(): void {
    if (!this.options.controlsContainer) return;

    this.isControlsVisible = !this.isControlsVisible;

    if (this.isControlsVisible && !this.pane) {
      this.initGUI();
    } else if (this.pane) {
      this.disposeGUI();
    }
  }

  private disposeGUI(): void {
    if (this.pane) {
      this.pane.dispose();
      this.pane = undefined;
    }
  }

  private initShader(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);

    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: perlinVertexShader,
      fragmentShader: auroraFragmentShader,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.shaderMaterial);
    this.scene.add(this.mesh);

    // Set initial resolution for proper aspect ratio handling
    this.shaderMaterial.uniforms.uResolution.value.set(
      this.sizes.width,
      this.sizes.height
    );
  }

  private initGUI(): void {
    const container = this.options.controlsContainer;
    if (!container) return;

    // Ensure no existing pane before creating new one
    this.disposeGUI();

    this.pane = new Pane({
      title: 'Aurora Background',
      expanded: true,
      container,
    });

    const defaults = {
      speed: 0.7,
      intensity: 1.2,
      waveHeight: 0.25,
    };

    const settings = {
      speed: this.uniforms.uSpeed.value,
      intensity: this.uniforms.uIntensity.value,
      waveHeight: this.uniforms.uWaveHeight.value,
    };

    const auroraFolder = this.pane.addFolder({
      title: 'Aurora Properties',
      expanded: true,
    });

    auroraFolder
      .addBinding(settings, 'speed', {
        label: 'Animation Speed',
        min: 0.1,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        if (this.shaderMaterial) {
          this.shaderMaterial.uniforms.uSpeed.value = ev.value;
        }
      });

    auroraFolder
      .addBinding(settings, 'intensity', {
        label: 'Light Intensity',
        min: 0.5,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        if (this.shaderMaterial) {
          this.shaderMaterial.uniforms.uIntensity.value = ev.value;
        }
      });

    auroraFolder
      .addBinding(settings, 'waveHeight', {
        label: 'Wave Height',
        min: 0.1,
        max: 1.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        if (this.shaderMaterial) {
          this.shaderMaterial.uniforms.uWaveHeight.value = ev.value;
        }
      });

    this.pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        if (this.shaderMaterial) {
          this.shaderMaterial.uniforms.uSpeed.value = defaults.speed;
          this.shaderMaterial.uniforms.uIntensity.value = defaults.intensity;
          this.shaderMaterial.uniforms.uWaveHeight.value = defaults.waveHeight;

          Object.assign(settings, defaults);
          this.pane?.refresh();
        }
      });
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    const elapsedTime = this.clock.getElapsedTime();

    if (this.shaderMaterial) {
      this.shaderMaterial.uniforms.uTime.value = elapsedTime;
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  public async init(): Promise<void> {
    try {
      this.initScene();
      this.initCamera();
      this.initRenderer();
      this.setupResize();
      this.setupMouseTracking();
      this.setupKeyboardControls();
      this.initShader();

      this.animate();
    } catch (error) {
      console.error('Failed to initialize AuroraBackgroundExperience:', error);
      throw error;
    }
  }

  public dispose(): void {
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove event listeners
    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }

    if (this.mouseHandler) {
      this.canvas.removeEventListener('mousemove', this.mouseHandler);
      this.mouseHandler = undefined;
    }

    // Dispose of Tweakpane
    this.disposeGUI();

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
