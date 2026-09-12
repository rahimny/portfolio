import { Pane } from 'tweakpane';
import * as THREE from 'three/webgpu';
import { uv, uniform, pass, renderOutput, texture } from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ExperienceLoop } from '../../ExperienceLoop';
import { ResourceScope } from '../../ResourceScope';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { IdleMovementController } from './IdleMovementController';
import { ParameterOrchestra } from './ParameterOrchestra';
import type { OrchestrationState } from './ParameterOrchestra';
import { pointerWeight } from '../../../features/pixel-flow/pointerWeight';

export class PixelFlowExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGPURenderer;
  private controls!: OrbitControls;
  private postProcessing!: THREE.RenderPipeline;
  private loop?: ExperienceLoop;
  private disposed = false;
  private scenePass?: ReturnType<typeof pass>;
  private readonly assets = new ResourceScope();
  private handleResize!: () => void;
  private handlePointerMove!: (event: MouseEvent) => void;
  private mesh!: THREE.Mesh;
  private material!: THREE.MeshBasicNodeMaterial;
  private dataTexture!: THREE.DataTexture;
  private imageTexture!: THREE.Texture;
  private pane!: Pane;
  private idleController!: IdleMovementController;
  private parameterOrchestra!: ParameterOrchestra;

  private resolutionUniform = uniform(new THREE.Vector4());
  private offsetStrengthUniform = uniform(0.02);
  private imageAspectRatio = 1;

  // Raycaster setup for accurate mouse interaction
  private interactivePlane!: THREE.Mesh;
  private raycaster!: THREE.Raycaster;
  private screenCursor!: THREE.Vector2;

  private pointer = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vX: 0,
    vY: 0,
  };

  private settings = {
    offsetStrength: 0.02,
    gridSize: 100,
    mouse: 0.16,
    strength: 0.3,
    relaxation: 0.9,
    enableMouseInteraction: true,
  };

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    super(canvas, options);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
  }

  private initCamera(): void {
    const frustumSize = 1;

    // const aspect = this.sizes.width / this.sizes.height;
    this.camera = new THREE.OrthographicCamera(
      frustumSize / -2,
      frustumSize / 2,
      frustumSize / 2,
      frustumSize / -2,
      -1000,
      1000
    );

    this.camera.position.set(0, 0, 5);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      forceWebGL: false,
    });
    this.connectRendererErrors(this.renderer);
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(this.sizes.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    // disable rotation & zoom on touch
    this.controls.touches.ONE = null;
    this.controls.touches.TWO = null;
  }

  private initPostProcessing(): void {
    this.postProcessing = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    this.scenePass = scenePass;
    const outputPass = renderOutput(scenePass);
    this.postProcessing.outputNode = outputPass;
  }

  private initRaycaster(): void {
    // Create invisible interactive plane for raycasting
    this.interactivePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    this.interactivePlane.visible = false;
    this.scene.add(this.interactivePlane);

    this.raycaster = new THREE.Raycaster();
    this.screenCursor = new THREE.Vector2(9999, 9999);
  }

  private updateImageCover(): void {
    let a1, a2;
    if (this.sizes.height / this.sizes.width > this.imageAspectRatio) {
      a1 = (this.sizes.width / this.sizes.height) * this.imageAspectRatio;
      a2 = 1;
    } else {
      a1 = 1;
      a2 = this.sizes.height / this.sizes.width / this.imageAspectRatio;
    }
    this.resolutionUniform.value.set(
      this.sizes.width,
      this.sizes.height,
      a1,
      a2
    );
  }

  private setupResize(): void {
    this.handleResize = () => {
      this.updateSizes();
      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(this.sizes.pixelRatio);

      this.updateImageCover();
      this.camera.updateProjectionMatrix();
      this.invalidate();
    };

    this.handlePointerMove = (event: MouseEvent) => {
      if (!this.settings.enableMouseInteraction) return;

      // convert screen coordinates to normalized device coordinates
      this.screenCursor.x = (event.clientX / this.sizes.width) * 2 - 1;
      this.screenCursor.y = -(event.clientY / this.sizes.height) * 2 + 1;

      // Reset idle timer on mouse movement
      this.idleController.resetIdleTimer();
      this.invalidate();
    };

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  private updatePointerFromRaycaster(): void {
    this.raycaster.setFromCamera(this.screenCursor, this.camera);
    const intersections = this.raycaster.intersectObject(this.interactivePlane);

    if (intersections.length > 0) {
      const uv = intersections[0].uv;
      if (uv) {
        this.pointer.prevX = this.pointer.x;
        this.pointer.prevY = this.pointer.y;

        this.pointer.x = uv.x;
        this.pointer.y = 1 - uv.y;

        this.pointer.vX = this.pointer.x - this.pointer.prevX;
        this.pointer.vY = this.pointer.y - this.pointer.prevY;
      }
    }
  }

  private async initObjects(): Promise<void> {
    this.regenerateGrid();
    this.material = new THREE.MeshBasicNodeMaterial();
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 32, 32),
      this.material
    );
    this.imageTexture = await this.assets.acquire(
      new THREE.TextureLoader().loadAsync('/cursor-trails/pixel-jellyfish.png'),
      (texture) => texture.dispose()
    );
    this.imageTexture.colorSpace = THREE.SRGBColorSpace;
    const image = this.imageTexture.image as HTMLImageElement;
    this.imageAspectRatio = image.height / image.width;
    this.updateImageCover();
    this.updateMaterialNodes();
    this.scene.add(this.mesh);
  }

  private regenerateGrid(): void {
    const width = this.settings.gridSize;
    const height = this.settings.gridSize;
    const size = width * height;
    const data = new Float32Array(4 * size);

    for (let i = 0; i < size; i++) {
      const r = Math.random() * 255 - 125;
      const r1 = Math.random() * 255 - 125;
      const stride = i * 4;

      data[stride] = r;
      data[stride + 1] = r1;
      data[stride + 2] = r;
      data[stride + 3] = 255;
    }

    // Dispose old texture if it exists
    if (this.dataTexture) {
      this.dataTexture.dispose();
    }

    this.dataTexture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType
    );

    this.dataTexture.magFilter = this.dataTexture.minFilter =
      THREE.NearestFilter;
    // this.dataTexture.needsUpdate = true;

    // Update material nodes when data texture changes
    if (this.material) {
      console.log('Updating material nodes');
      this.updateMaterialNodes();
    }
  }

  private updateMaterialNodes(): void {
    if (!this.imageTexture || !this.dataTexture) return;

    const imageTextureNode = texture(this.imageTexture);
    const dataTextureNode = texture(this.dataTexture);

    const baseUV = uv();

    // Apply image cover transformation (equivalent to reference's newUV calculation)
    const coverUV = baseUV.sub(0.5).mul(this.resolutionUniform.zw).add(0.5);

    const offset = dataTextureNode.sample(baseUV);

    const distortedUV = coverUV.sub(offset.rg.mul(this.offsetStrengthUniform));

    this.material.colorNode = imageTextureNode.sample(distortedUV);
  }

  private updateDataTexture(): void {
    if (!this.dataTexture?.image?.data) return;

    const data = this.dataTexture.image.data as Float32Array;

    // Apply relaxation
    for (let i = 0; i < data.length; i += 4) {
      data[i] *= this.settings.relaxation;
      data[i + 1] *= this.settings.relaxation;
    }

    // compute mouse influence using raycasted coordinates
    const gridMouseX = this.settings.gridSize * this.pointer.x;
    const gridMouseY = this.settings.gridSize * (1 - this.pointer.y);
    const maxDist = this.settings.gridSize * this.settings.mouse;
    const aspect = this.sizes.width / this.sizes.height;

    for (let i = 0; i < this.settings.gridSize; i++) {
      for (let j = 0; j < this.settings.gridSize; j++) {
        // Properly handle aspect ratio correction for circular mouse effect
        // Multiply dx by aspect to compensate for screen stretching
        const dx = (gridMouseX - i) * aspect;
        const dy = gridMouseY - j;
        const distance = dx * dx + dy * dy;
        const maxDistSq = maxDist ** 2;

        if (distance < maxDistSq) {
          const index = 4 * (i + this.settings.gridSize * j);
          const power = pointerWeight(distance, maxDist);

          data[index] += this.settings.strength * 100 * this.pointer.vX * power;
          data[index + 1] -=
            this.settings.strength * 100 * this.pointer.vY * power;
        }
      }
    }

    // dampen mouse velocity
    this.pointer.vX *= 0.9;
    this.pointer.vY *= 0.9;
    this.dataTexture.needsUpdate = true;
  }

  private animate(delta: number, moving: boolean): void {
    this.controls.enableDamping = moving;
    this.controls.update();
    if (!moving) {
      this.offsetStrengthUniform.value = 0;
      this.postProcessing.render();
      return;
    }

    // Check idle state and update pointer accordingly
    const idleState = this.idleController.update(delta * 1000);

    if (idleState.shouldUseAutoMovement && idleState.position) {
      // Use automatic movement
      this.pointer.prevX = this.pointer.x;
      this.pointer.prevY = this.pointer.y;

      // Blend between current position and target position for smooth transitions
      const blendFactor = idleState.transitionFactor;
      this.pointer.x =
        this.pointer.x * (1 - blendFactor) + idleState.position.x * blendFactor;
      this.pointer.y =
        this.pointer.y * (1 - blendFactor) + idleState.position.y * blendFactor;

      this.pointer.vX = this.pointer.x - this.pointer.prevX;
      this.pointer.vY = this.pointer.y - this.pointer.prevY;

      // Subtle visual indicator for idle state
      const idleIntensity = idleState.transitionFactor * 0.1;
      const baseColor = new THREE.Color(0x1a1a1a);
      const idleColor = new THREE.Color(0x1a1b1f); // Slightly bluer
      this.scene.background = baseColor.lerp(idleColor, idleIntensity);
    } else if (this.settings.enableMouseInteraction) {
      // Use manual mouse input only if mouse interaction is enabled
      this.updatePointerFromRaycaster();

      // Reset background to normal
      this.scene.background = new THREE.Color(0x1a1a1a);
    } else {
      // Mouse interaction disabled, keep background indicating idle debugging mode
      this.scene.background = new THREE.Color(0x1a1a1a);
    }

    // Get orchestrated parameters if idle
    let orchestratedParams: OrchestrationState | null = null;
    if (idleState.shouldUseAutoMovement && idleState.rhythms) {
      const currentEcosystem = this.idleController.getCurrentEcosystem();
      orchestratedParams = this.parameterOrchestra.orchestrate(
        currentEcosystem,
        idleState.rhythms,
        delta * 1000
      );

      // Apply orchestrated parameters to settings
      this.settings.offsetStrength = orchestratedParams.distortion;
      this.settings.strength = orchestratedParams.strength;
      this.settings.relaxation = orchestratedParams.relaxation;
      this.settings.mouse = orchestratedParams.mouseRadius;
    } else {
      // Update base settings in orchestra when not idle
      this.parameterOrchestra.updateBaseSettings({
        distortion: this.settings.offsetStrength,
        strength: this.settings.strength,
        relaxation: this.settings.relaxation,
        mouseRadius: this.settings.mouse,
      });
    }

    this.updateDataTexture();

    // Update uniforms
    this.offsetStrengthUniform.value = this.settings.offsetStrength;

    // Use post-processing render instead of direct scene render
    this.postProcessing.render();
  }

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    signal?.addEventListener('abort', this.assets.dispose, { once: true });
    this.assets.defer(() =>
      signal?.removeEventListener('abort', this.assets.dispose)
    );
    try {
      this.initScene();
      this.initCamera();
      this.initRenderer();
      await this.renderer.init();
      if (signal?.aborted) return;
      this.initControls();
      this.initPostProcessing();
      this.initRaycaster();
      await this.initObjects();
      this.initIdleController();
      this.initParameterOrchestra();
      this.setupResize();
      if (this.options.controlsContainer) this.initGUI();

      this.loop = new ExperienceLoop(
        this.canvas,
        (delta, moving) => this.animate(delta, moving),
        this.options.onError
      );
      this.controls.addEventListener('change', this.invalidate);
      this.pane?.on('change', this.invalidate);
      await this.loop.start();
    } catch (error) {
      console.error('Failed to initialize PixelFlowExperience:', error);
      throw error;
    }
  }

  private initIdleController(): void {
    this.idleController = new IdleMovementController();
  }

  private initParameterOrchestra(): void {
    const baseSettings: OrchestrationState = {
      distortion: this.settings.offsetStrength,
      strength: this.settings.strength,
      relaxation: this.settings.relaxation,
      mouseRadius: this.settings.mouse,
    };
    this.parameterOrchestra = new ParameterOrchestra(baseSettings);
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
    this.loop?.dispose();
    this.assets.dispose();
    this.controls?.removeEventListener('change', this.invalidate);
    this.postProcessing?.dispose();
    this.scenePass?.dispose();

    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.handlePointerMove) {
      window.removeEventListener('pointermove', this.handlePointerMove);
    }

    if (this.pane) {
      this.pane.dispose();
    }

    if (this.idleController) {
      this.idleController.dispose();
    }

    if (this.parameterOrchestra) {
      this.parameterOrchestra.dispose();
    }

    this.controls?.dispose();
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      // Releases the node/pipeline/binding caches backing postProcessing.
      this.renderer.dispose();
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material?.dispose();
    }

    if (this.interactivePlane) {
      this.interactivePlane.geometry.dispose();
      (this.interactivePlane.material as THREE.Material).dispose();
    }

    if (this.dataTexture) {
      this.dataTexture.dispose();
    }
  }

  private initGUI(): void {
    this.pane = new Pane({
      title: 'Pixel Flow Controls',
      ...(this.options.controlsContainer && {
        container: this.options.controlsContainer,
      }),
      expanded: true,
    });

    // Mouse interaction controls
    const interactionFolder = this.pane.addFolder({
      title: 'Mouse Interaction',
      expanded: true,
    });

    interactionFolder.addBinding(this.settings, 'mouse', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Mouse Radius',
    });

    interactionFolder.addBinding(this.settings, 'strength', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Strength',
    });

    interactionFolder.addBinding(this.settings, 'relaxation', {
      min: 0.5,
      max: 1,
      step: 0.01,
      label: 'Relaxation',
    });

    // Distortion control
    interactionFolder.addBinding(this.settings, 'offsetStrength', {
      min: 0,
      max: 0.1,
      step: 0.001,
      label: 'Distortion',
    });

    interactionFolder.addBinding(this.settings, 'enableMouseInteraction', {
      label: 'Enable Mouse Input',
    });

    // Idle movement controls
    const idleFolder = this.pane.addFolder({
      title: 'Idle Movement',
      expanded: true,
    });

    const idleSettings = this.idleController.getSettings();

    idleFolder.addBinding(idleSettings, 'enabled', {
      label: 'Enable Idle',
    });

    idleFolder.addBinding(idleSettings, 'idleTimeout', {
      min: 1000,
      max: 10000,
      step: 500,
      label: 'Idle Timeout (ms)',
    });

    idleFolder.addBinding(idleSettings, 'transitionDuration', {
      min: 500,
      max: 3000,
      step: 100,
      label: 'Transition Time (ms)',
    });

    // Current ecosystem display
    const ecosystemDisplay = {
      ecosystem: this.idleController.getCurrentEcosystem().name,
    };
    const currentEcosystemMonitor = idleFolder.addBinding(
      ecosystemDisplay,
      'ecosystem',
      {
        label: 'Current Ecosystem',
        readonly: true,
      }
    );

    // Update ecosystem display every frame

    // Ecosystem selection
    const ecosystemOptions = this.idleController.getEcosystems().reduce(
      (acc, ecosystem, index) => {
        acc[`${ecosystem.name} (${ecosystem.category})`] = index;
        return acc;
      },
      {} as Record<string, number>
    );

    idleFolder
      .addBinding({ selectedEcosystem: 0 }, 'selectedEcosystem', {
        label: 'Force Ecosystem',
        options: ecosystemOptions,
      })
      .on('change', (ev) => {
        this.idleController.setEcosystem(ev.value);
      });

    // Debug controls
    const debugButton = idleFolder.addButton({
      title: 'Force Idle Now',
    });

    debugButton.on('click', () => {
      // Force idle state by setting last interaction to past time
      this.idleController.forceIdle();
    });

    const buildupButton = idleFolder.addButton({
      title: 'Trigger Relaxation Buildup',
    });

    buildupButton.on('click', () => {
      this.parameterOrchestra.triggerBuildup();
    });

    // Rhythm monitoring section
    const rhythmFolder = this.pane.addFolder({
      title: 'Nature Rhythms',
      expanded: false,
    });

    const rhythmDisplay = {
      breathing: '0.0',
      pulse: '0.0',
      circadian: '0.0',
      chaos: '0.0',
      overall: '0.0',
      intensity: '0.0',
    };

    const rhythmMonitors = {
      breathing: rhythmFolder.addBinding(rhythmDisplay, 'breathing', {
        label: 'Breathing',
        readonly: true,
      }),
      pulse: rhythmFolder.addBinding(rhythmDisplay, 'pulse', {
        label: 'Pulse',
        readonly: true,
      }),
      circadian: rhythmFolder.addBinding(rhythmDisplay, 'circadian', {
        label: 'Circadian',
        readonly: true,
      }),
      chaos: rhythmFolder.addBinding(rhythmDisplay, 'chaos', {
        label: 'Chaos',
        readonly: true,
      }),
      overall: rhythmFolder.addBinding(rhythmDisplay, 'overall', {
        label: 'Overall',
        readonly: true,
      }),
      intensity: rhythmFolder.addBinding(rhythmDisplay, 'intensity', {
        label: 'Intensity',
        readonly: true,
      }),
    };

    // Parameter Orchestra monitoring
    const orchestraFolder = this.pane.addFolder({
      title: 'Parameter Orchestra',
      expanded: false,
    });

    const orchestraDisplay = {
      distortion: '0.000',
      strength: '0.00',
      relaxation: '0.00',
      mouseRadius: '0.00',
      isActive: 'No',
    };

    const orchestraMonitors = {
      isActive: orchestraFolder.addBinding(orchestraDisplay, 'isActive', {
        label: 'Active',
        readonly: true,
      }),
      distortion: orchestraFolder.addBinding(orchestraDisplay, 'distortion', {
        label: 'Distortion',
        readonly: true,
      }),
      strength: orchestraFolder.addBinding(orchestraDisplay, 'strength', {
        label: 'Strength',
        readonly: true,
      }),
      relaxation: orchestraFolder.addBinding(orchestraDisplay, 'relaxation', {
        label: 'Relaxation',
        readonly: true,
      }),
      mouseRadius: orchestraFolder.addBinding(orchestraDisplay, 'mouseRadius', {
        label: 'Mouse Radius',
        readonly: true,
      }),
    };

    // Update displays periodically
    const updateDisplays = () => {
      // Update ecosystem display
      const currentEcosystem = this.idleController.getCurrentEcosystem();
      ecosystemDisplay.ecosystem = `${currentEcosystem.name} (${currentEcosystem.category})`;
      currentEcosystemMonitor.refresh();

      // Update rhythm displays
      const rhythms = this.idleController.getCurrentRhythms();
      if (rhythms) {
        rhythmDisplay.breathing = rhythms.breathing.toFixed(2);
        rhythmDisplay.pulse = rhythms.pulse.toFixed(2);
        rhythmDisplay.circadian = rhythms.circadian.toFixed(2);
        rhythmDisplay.chaos = rhythms.chaos.toFixed(2);
        rhythmDisplay.overall = rhythms.overall.toFixed(2);
        rhythmDisplay.intensity = rhythms.intensity.toFixed(2);

        Object.values(rhythmMonitors).forEach((monitor) => monitor.refresh());
      }

      // Update orchestra displays
      const isIdle = this.idleController.getIdleState();
      if (isIdle && rhythms) {
        const orchestratedParams = this.parameterOrchestra.getCurrentState();
        orchestraDisplay.isActive = 'Yes';
        orchestraDisplay.distortion = orchestratedParams.distortion.toFixed(3);
        orchestraDisplay.strength = orchestratedParams.strength.toFixed(2);
        orchestraDisplay.relaxation = orchestratedParams.relaxation.toFixed(2);
        orchestraDisplay.mouseRadius =
          orchestratedParams.mouseRadius.toFixed(2);
      } else {
        orchestraDisplay.isActive = 'No';
        orchestraDisplay.distortion = this.settings.offsetStrength.toFixed(3);
        orchestraDisplay.strength = this.settings.strength.toFixed(2);
        orchestraDisplay.relaxation = this.settings.relaxation.toFixed(2);
        orchestraDisplay.mouseRadius = this.settings.mouse.toFixed(2);
      }

      Object.values(orchestraMonitors).forEach((monitor) => monitor.refresh());
    };

    setInterval(updateDisplays, 100);
  }
}
