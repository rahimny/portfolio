import { Pane } from 'tweakpane';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { Simulation } from './mls-mpm/Simulation';
import { ParticleRenderer } from './renderers/ParticleRenderer';
import { conf } from './constants';
import { Fn, mrt, output, pass, vec4 } from 'three/tsl';
import BloomNode, { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ExperienceUnavailableError } from '../../types';
import { ExperienceLoop } from '../../ExperienceLoop';
import { Lights } from './lights';

export class ParticlesExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGPURenderer;
  private controls!: OrbitControls;
  private loop?: ExperienceLoop;
  private scenePass?: ReturnType<typeof pass>;
  private disposed = false;
  private lights!: Lights;
  private simulation!: Simulation;
  private pointRenderer!: ParticleRenderer;
  private postProcessing!: THREE.RenderPipeline;
  private bloomPass!: BloomNode;
  private pane!: Pane;

  private handleResize!: () => void;

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    super(canvas, options);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
  }

  private initCamera(): void {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(conf.camera.fov, aspect, 0.01, 5);
    const [x, y, z] = conf.camera.position;
    this.camera.position.set(x, y, z);
    this.camera.updateProjectionMatrix();
  }

  private async initRenderer(): Promise<void> {
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.connectRendererErrors(this.renderer);
    await this.renderer.init();
    if ('isWebGLBackend' in this.renderer.backend) {
      throw new ExperienceUnavailableError(
        'webgpu',
        'This particle simulation requires WebGPU. Try a browser and device with WebGPU support.'
      );
    }
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    const [tx, ty, tz] = conf.camera.target;
    this.controls.target.set(tx, ty, tz);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }

  private initLights(): void {
    this.lights = new Lights();
    this.scene.add(this.lights.object);
  }

  private setupResize(): void {
    this.handleResize = () => {
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.invalidate();
    };

    window.addEventListener('resize', this.handleResize);
  }

  private initPostProcessing(): void {
    const scenePass = pass(this.scene, this.camera);
    this.scenePass = scenePass;
    scenePass.setMRT(
      mrt({
        output: output,
        bloomIntensity: vec4(0, 0, 0, 1),
      })
    );

    const outputPass = scenePass.getTextureNode();
    const bloomIntensityPass = scenePass.getTextureNode('bloomIntensity');
    const bloomPass = bloom(outputPass.mul(bloomIntensityPass.r));

    const postProcessing = new THREE.RenderPipeline(this.renderer);
    postProcessing.outputColorTransform = false;
    postProcessing.outputNode = Fn(() => {
      const a = outputPass.rgb.clamp(0, 1).toVar();
      const b = bloomPass.rgb
        .clamp(0, 1)
        .mul(bloomIntensityPass.r.sign().oneMinus())
        .toVar();
      const blended = a.mul(a.add(b.mul(a.oneMinus()).mul(2))).toVar();
      return vec4(blended.clamp(0, 1), 1.0);
    })().renderOutput();

    this.postProcessing = postProcessing;
    this.bloomPass = bloomPass;
    this.bloomPass.threshold.value = 0.001;
    this.bloomPass.strength.value = 0.94;
    this.bloomPass.radius.value = 0.8;
  }

  private async initSimulation(): Promise<void> {
    this.simulation = new Simulation(this.renderer);
    await this.simulation.init();
    this.pointRenderer = new ParticleRenderer(this.simulation);
    if (this.pointRenderer.object) {
      this.scene.add(this.pointRenderer.object);
    }
  }

  private initGUI(): void {
    const container = this.options.controlsContainer;

    this.pane = new Pane({
      title: 'Particles Simulation',
      expanded: true,
      ...(container && { container }),
    });

    // Particle Settings
    const particlesFolder = this.pane.addFolder({
      title: 'Particles',
      expanded: false,
    });

    particlesFolder.addBinding(conf.particles, 'particles', {
      label: 'Particle Count',
      min: 1000,
      max: conf.particles.maxParticles,
      step: 1000,
    });

    particlesFolder.addBinding(conf.particles, 'actualSize', {
      label: 'Actual Size',
      min: 0.1,
      max: 5,
      step: 0.1,
    });

    particlesFolder.addBinding(conf.particles, 'size', {
      label: 'Display Size',
      min: 0.1,
      max: 5,
      step: 0.1,
    });

    particlesFolder.addBinding(conf.particles, 'points', {
      label: 'Show Points',
    });

    // Simulation Physics
    const simulationFolder = this.pane.addFolder({
      title: 'Simulation',
      expanded: false,
    });

    simulationFolder.addBinding(conf.simulation, 'noise', {
      label: 'Noise',
      min: 0,
      max: 5,
      step: 0.1,
    });

    simulationFolder.addBinding(conf.simulation, 'speed', {
      label: 'Speed',
      min: 0,
      max: 10,
      step: 0.1,
    });

    simulationFolder.addBinding(conf.simulation, 'stiffness', {
      label: 'Stiffness',
      min: 0,
      max: 10,
      step: 0.1,
    });

    simulationFolder.addBinding(conf.simulation, 'restDensity', {
      label: 'Rest Density',
      min: 0,
      max: 5,
      step: 0.1,
    });

    simulationFolder.addBinding(conf.simulation, 'density', {
      label: 'Density',
      min: 0,
      max: 5,
      step: 0.1,
    });

    simulationFolder.addBinding(conf.simulation, 'dynamicViscosity', {
      label: 'Viscosity',
      min: 0,
      max: 1,
      step: 0.01,
    });

    simulationFolder.addBinding(conf.simulation, 'gravity', {
      label: 'Gravity',
      min: -10,
      max: 10,
      step: 0.1,
    });

    // Rendering
    const renderingFolder = this.pane.addFolder({
      title: 'Rendering',
      expanded: false,
    });

    renderingFolder.addBinding(conf.rendering, 'bloom', {
      label: 'Bloom Effect',
    });

    renderingFolder.addBinding(conf.rendering, 'run', {
      label: 'Run Simulation',
    });

    // Camera
    const cameraFolder = this.pane.addFolder({
      title: 'Camera',
      expanded: false,
    });

    cameraFolder
      .addBinding(conf.camera, 'fov', {
        label: 'Field of View',
        min: 10,
        max: 120,
        step: 1,
      })
      .on('change', () => {
        this.camera.fov = conf.camera.fov;
        this.camera.updateProjectionMatrix();
      });

    // Light (Spotlight)
    const lightFolder = this.pane.addFolder({
      title: 'Light',
      expanded: false,
    });

    lightFolder.addBinding(conf.light, 'intensity', {
      label: 'Intensity',
      min: 0,
      max: 5,
      step: 0.1,
    });

    lightFolder.addBinding(conf.light, 'angle', {
      label: 'Angle',
      min: 0,
      max: Math.PI / 2,
      step: 0.01,
    });

    lightFolder.addBinding(conf.light, 'penumbra', {
      label: 'Penumbra',
      min: 0,
      max: 1,
      step: 0.01,
    });

    // World
    const worldFolder = this.pane.addFolder({
      title: 'World',
      expanded: false,
    });

    worldFolder.addBinding(conf.world, 'size', {
      label: 'Grid Size',
      min: 16,
      max: 128,
      step: 16,
    });

    // Reset button
    this.pane
      .addButton({
        title: 'Reset Settings',
      })
      .on('click', () => {
        conf.particles.particles = 5000;
        conf.simulation.speed = 1.0;
        conf.simulation.stiffness = 1.0;
        conf.rendering.bloom = true;
        conf.rendering.run = true;
        this.pane.refresh();
      });
  }

  private animate = async (delta: number, moving: boolean): Promise<void> => {
    this.controls.enableDamping = moving;
    const pointObj = this.pointRenderer.object!;
    pointObj.visible = conf.particles.points;
    this.controls.update(delta);
    this.pointRenderer.update();
    await this.simulation.update(delta, moving);
    if (this.disposed) return;

    if (conf.rendering.bloom && this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.disposed) return;
  };

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    if (this.options.controlsContainer) {
      this.initGUI();
    }

    this.initScene();
    this.initCamera();
    await this.initRenderer();
    if (signal?.aborted) return;
    this.initControls();
    await this.initSimulation();
    if (signal?.aborted) return;
    this.initLights();
    this.setupResize();
    this.initPostProcessing();

    this.loop = new ExperienceLoop(
      this.canvas,
      this.animate,
      this.options.onError
    );
    this.controls.addEventListener('change', this.invalidate);
    this.pane?.on('change', this.invalidate);
    await this.loop.start();
  }

  public getShareableState(): unknown {
    return this.pane?.exportState();
  }

  public setShareableState(state: unknown): void {
    this.pane?.importState(state as Parameters<Pane['importState']>[0]);
    this.pane?.refresh();
  }

  private invalidate = (): void => {
    this.loop?.invalidate();
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.pane?.dispose();
    const release = () => {
      this.pointRenderer?.dispose();
      this.postProcessing?.dispose();
      this.scenePass?.dispose();
      this.bloomPass?.dispose();
      this.lights?.dispose();
      this.scene?.clear();
      this.renderer?.dispose();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
