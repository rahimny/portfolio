import { Pane } from 'tweakpane';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';

export class EXPERIMENT_CLASS_NAME extends BaseExperience {
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private resizeObserver?: ResizeObserver;
  private pane?: Pane;
  private cube?: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;
  private settings = {
    cubeColor: '#00ff00',
    rotationSpeed: 1,
    wireframe: false,
  };

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );
    this.camera.position.set(0, 2, 5);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    this.scene.add(this.cube);
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
    this.applySettings();
    await this.loop.start();
  }

  private initGUI(): void {
    this.pane = new Pane({
      title: 'EXPERIMENT_TITLE',
      container: this.options.controlsContainer!,
    });
    this.pane.addBinding(this.settings, 'cubeColor', { label: 'Colour' });
    this.pane.addBinding(this.settings, 'rotationSpeed', {
      label: 'Rotation speed',
      min: 0,
      max: 5,
    });
    this.pane.addBinding(this.settings, 'wireframe', { label: 'Wireframe' });
    this.pane.on('change', this.applySettings);
    this.pane.addButton({ title: 'Reset' }).on('click', () => {
      Object.assign(this.settings, {
        cubeColor: '#00ff00',
        rotationSpeed: 1,
        wireframe: false,
      });
      this.cube?.rotation.set(0, 0, 0);
      this.pane?.refresh();
      this.applySettings();
    });
  }

  private applySettings = (): void => {
    if (!this.cube) return;
    this.cube.material.color.set(this.settings.cubeColor);
    this.cube.material.wireframe = this.settings.wireframe;
    this.invalidate();
  };

  private frame = (delta: number, moving: boolean): void => {
    if (!this.renderer || !this.cube || !this.controls) return;
    this.controls.enableDamping = moving;
    this.controls.update();
    this.cube.rotation.x += delta * 0.6 * this.settings.rotationSpeed;
    this.cube.rotation.y += delta * 0.6 * this.settings.rotationSpeed;
    this.renderer.render(this.scene, this.camera);
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
    this.cube?.geometry.dispose();
    this.cube?.material.dispose();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
