import { Pane } from 'tweakpane';
import * as THREE from 'three/webgpu';
import {
  sin,
  positionLocal,
  vec2,
  vec3,
  vec4,
  uv,
  uniform,
  pass,
  renderOutput,
} from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js';
import { BaseExperience } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';

export class EXPERIMENT_CLASS_NAME extends BaseExperience {
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGPURenderer;
  private controls?: OrbitControls;
  private pipeline?: THREE.RenderPipeline;
  private scenePass?: ReturnType<typeof pass>;
  private loop?: ExperienceLoop;
  private resizeObserver?: ResizeObserver;
  private pane?: Pane;
  private mesh?: THREE.Mesh<
    THREE.TorusKnotGeometry,
    THREE.MeshBasicNodeMaterial
  >;
  private disposed = false;
  private elapsed = uniform(0);
  private timeFrequency = uniform(0.5);
  private positionFrequency = uniform(2);
  private intensityFrequency = uniform(0.5);

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(
      25,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );
    this.camera.position.set(6, 3, 10);
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.connectRendererErrors(this.renderer);
    await this.renderer.init();
    if (signal?.aborted || this.disposed) return;
    this.controls = new OrbitControls(this.camera, this.canvas);
    const material = new THREE.MeshBasicNodeMaterial();
    const oscillation = sin(
      this.elapsed
        .mul(this.timeFrequency)
        .add(positionLocal.y.mul(this.positionFrequency))
    ).mul(this.intensityFrequency);
    material.positionNode = vec3(
      positionLocal.x.add(oscillation),
      positionLocal.y,
      positionLocal.z
    );
    material.colorNode = vec4(uv().mul(vec2(32, 8)).fract(), 1, 1);
    this.mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
      material
    );
    this.scene.add(this.mesh);
    this.scenePass = pass(this.scene, this.camera);
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = sobel(renderOutput(this.scenePass));
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.controls.addEventListener('change', this.invalidate);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    if (this.options.controlsContainer) this.initGUI();
    await this.loop.start();
  }

  private initGUI(): void {
    this.pane = new Pane({
      title: 'EXPERIMENT_TITLE',
      container: this.options.controlsContainer!,
    });
    this.pane.addBinding(this.timeFrequency, 'value', {
      label: 'Time frequency',
      min: 0,
      max: 5,
    });
    this.pane.addBinding(this.positionFrequency, 'value', {
      label: 'Position frequency',
      min: 0,
      max: 5,
    });
    this.pane.addBinding(this.intensityFrequency, 'value', {
      label: 'Intensity',
      min: 0,
      max: 5,
    });
    this.pane.on('change', this.invalidate);
    this.pane.addButton({ title: 'Reset' }).on('click', () => {
      this.elapsed.value = 0;
      this.timeFrequency.value = 0.5;
      this.positionFrequency.value = 2;
      this.intensityFrequency.value = 0.5;
      this.pane?.refresh();
      this.invalidate();
    });
  }

  private frame = (delta: number, moving: boolean): void => {
    if (!this.controls) return;
    this.elapsed.value += delta;
    this.controls.enableDamping = moving;
    this.controls.update();
    this.pipeline?.render();
  };

  private invalidate = (): void => {
    this.loop?.invalidate();
  };

  private resize = (): void => {
    if (this.disposed) return;
    this.updateSizes();
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(this.sizes.width, this.sizes.height);
    this.renderer?.setPixelRatio(this.sizes.pixelRatio);
    this.invalidate();
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.pane?.dispose();
    this.pipeline?.dispose();
    this.scenePass?.dispose();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
