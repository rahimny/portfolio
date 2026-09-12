import { Pane } from 'tweakpane';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { metaShapesConf, type FormationType } from './constants';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { PostProcessingManager } from './managers/PostProcessingManager';
import { MouseInteractionManager } from './managers/MouseInteractionManager';
import { ColorManager } from './managers/ColorManager';
import { FormationManager } from './managers/FormationManager';
import { ExperienceLoop } from '../../ExperienceLoop';
import { GeometryManager } from './managers/GeometryManager';
import { HandTrackingManager } from './managers/HandTrackingManager';

export class MetaShapesExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private loop?: ExperienceLoop;
  private disposed = false;
  private signal?: AbortSignal;
  private elapsed = 0;
  private readonly geometryManager = new GeometryManager();
  private meshGeometry?: THREE.BufferGeometry;

  private instancedMesh?: THREE.InstancedMesh;
  private wireframeInstancedMesh?: THREE.InstancedMesh;
  private edgesGroup?: THREE.Group;
  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;
  private noise!: ImprovedNoise;
  private dummyPos!: THREE.Object3D;
  private handleResize!: () => void;

  // Managers
  private postProcessingManager!: PostProcessingManager;
  private mouseInteractionManager!: MouseInteractionManager;
  private colorManager!: ColorManager;
  private formationManager!: FormationManager;
  private handTrackingManager!: HandTrackingManager;
  private pane!: Pane;

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    super(canvas, options);
    this.noise = new ImprovedNoise();

    // Initialize managers
    this.colorManager = new ColorManager();
    this.formationManager = new FormationManager();
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa0a0a);
  }

  private initCamera(): void {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      metaShapesConf.camera.fov,
      aspect,
      0.1,
      1000
    );
    const [x, y] = metaShapesConf.camera.position;
    this.camera.position.set(
      x,
      y,
      metaShapesConf.instanceMesh.countPerSide * 1.8
    );
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    // Set initial size
    this.updateRendererSize();
  }

  private updateRendererSize(): void {
    this.updateSizes();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.renderer.setSize(width, height, false); // false prevents style changes
    this.renderer.setPixelRatio(this.sizes.pixelRatio);

    // Update post-processing composer size
    if (this.postProcessingManager) {
      this.postProcessingManager.setSize(width, height);
    }
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    const [tx, ty, tz] = metaShapesConf.camera.target;
    this.controls.target.set(tx, ty, tz);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }

  private initLights(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(
      0xffffff,
      metaShapesConf.light.ambientIntensity
    );
    this.scene.add(this.ambientLight);

    // Directional light
    this.directionalLight = new THREE.DirectionalLight(
      0xffffff,
      metaShapesConf.light.directionalIntensity
    );
    const [x, y, z] = metaShapesConf.light.directionalPosition;
    this.directionalLight.position.set(x, y, z);
    this.scene.add(this.directionalLight);
  }

  private setupResize(): void {
    this.handleResize = () => {
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.invalidate();
      this.updateRendererSize();
    };

    window.addEventListener('resize', this.handleResize);
  }

  private setupMouseInteraction(): void {
    this.mouseInteractionManager = new MouseInteractionManager(
      this.camera,
      this.canvas,
      this.noise
    );
    this.mouseInteractionManager.setupMouseInteraction();
  }

  private async setupHandTracking(): Promise<void> {
    if (!metaShapesConf.handTracking.enabled) {
      return;
    }

    this.handTrackingManager = new HandTrackingManager(
      this.camera,
      this.controls
    );

    const initialized = await this.handTrackingManager.init(this.signal);
    if (initialized) {
      console.log('Hand tracking enabled successfully');
    } else {
      console.warn(
        'Hand tracking failed to initialize, falling back to mouse interaction only'
      );
    }
  }

  private initObjects(): void {
    this.createInstancedMesh();
  }

  private createInstancedMesh(): void {
    this.disposeMeshes();
    const geometry = this.geometryManager.createGeometry();
    this.meshGeometry = geometry;
    const materialConfig = metaShapesConf.instanceMesh.material;
    const countPerSide = metaShapesConf.instanceMesh.countPerSide;
    const totalCount = countPerSide ** 3;

    this.dummyPos = new THREE.Object3D();

    const noiseAmplitude = 0.1;
    const noiseScale = 3;

    // Create solid mesh if needed
    if (
      materialConfig.renderMode === 'solid' ||
      materialConfig.renderMode === 'both'
    ) {
      const solidMaterial = new THREE.MeshBasicMaterial();
      this.instancedMesh = new THREE.InstancedMesh(
        geometry,
        solidMaterial,
        totalCount
      );
      this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(this.instancedMesh);
    }

    // Create wireframe mesh if needed
    if (
      materialConfig.renderMode === 'wireframe' ||
      materialConfig.renderMode === 'both'
    ) {
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: materialConfig.wireframeColor,
        wireframe: true,
        wireframeLinewidth: materialConfig.wireframeLinewidth,
        transparent: true,
        opacity: materialConfig.wireframeAlpha,
      });
      this.wireframeInstancedMesh = new THREE.InstancedMesh(
        geometry,
        wireframeMaterial,
        totalCount
      );
      this.wireframeInstancedMesh.instanceMatrix.setUsage(
        THREE.DynamicDrawUsage
      );
      this.scene.add(this.wireframeInstancedMesh);
    }

    // Create edges if needed
    if (
      materialConfig.renderMode === 'edges' ||
      materialConfig.renderMode === 'both'
    ) {
      const edgesGeometry = new THREE.EdgesGeometry(geometry);
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: materialConfig.edgesColor,
        linewidth: materialConfig.wireframeLinewidth,
        transparent: true,
        opacity: materialConfig.edgesAlpha,
      });

      this.edgesGroup = new THREE.Group();

      // Create individual LineSegments for each instance since we can't use InstancedMesh with LineSegments
      for (let i = 0; i < totalCount; i++) {
        const edgesMesh = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        this.edgesGroup.add(edgesMesh);
      }

      this.scene.add(this.edgesGroup);
    }

    this.dummyPos.userData = {
      update: (props: {
        i: number;
        x: number;
        y: number;
        z: number;
        time: number;
      }) => {
        const { i, x, y, z, time } = props;
        const countPerSide = metaShapesConf.instanceMesh.countPerSide;
        const totalCount = countPerSide ** 3;

        // Use formation-based positioning instead of simple cube grid
        const basePosition = this.formationManager.calculateFormationPosition(
          i,
          x,
          y,
          z,
          totalCount,
          countPerSide
        );

        this.dummyPos.position.copy(basePosition);

        const nz =
          this.noise.noise(
            time + x * noiseAmplitude,
            time + y * noiseAmplitude,
            time + z * noiseAmplitude
          ) * noiseScale;

        let finalScale = nz;
        let totalColorInfluence = 0;
        let totalRotationInfluence = { x: 0, y: 0, z: 0 };
        const totalPositionOffset = new THREE.Vector3();

        // Calculate mouse effects if enabled
        if (
          metaShapesConf.mouseInteraction.enabled &&
          this.mouseInteractionManager
        ) {
          const mouseEffects =
            this.mouseInteractionManager.calculateMouseEffects(
              basePosition,
              time
            );

          finalScale += mouseEffects.scaleInfluence;
          totalColorInfluence += mouseEffects.colorInfluence;
          totalRotationInfluence.x += mouseEffects.rotationInfluence.x;
          totalRotationInfluence.y += mouseEffects.rotationInfluence.y;
          totalRotationInfluence.z += mouseEffects.rotationInfluence.z;
          totalPositionOffset.add(mouseEffects.positionOffset);
        }

        // Calculate hand tracking effects if enabled
        if (
          metaShapesConf.handTracking.enabled &&
          this.handTrackingManager &&
          this.handTrackingManager.isHandActive()
        ) {
          const handEffects = this.handTrackingManager.calculateHandEffects(
            basePosition,
            time
          );

          // If hand tracking should replace mouse interaction, use hand effects only
          // Otherwise, combine both effects
          if (metaShapesConf.handTracking.replaceMouseInteraction) {
            finalScale = nz + handEffects.scaleInfluence;
            totalColorInfluence = handEffects.colorInfluence;
            totalRotationInfluence = handEffects.rotationInfluence;
            totalPositionOffset.copy(handEffects.positionOffset);
          } else {
            // Combine hand and mouse effects
            finalScale += handEffects.scaleInfluence;
            totalColorInfluence += handEffects.colorInfluence;
            totalRotationInfluence.x += handEffects.rotationInfluence.x;
            totalRotationInfluence.y += handEffects.rotationInfluence.y;
            totalRotationInfluence.z += handEffects.rotationInfluence.z;
            totalPositionOffset.add(handEffects.positionOffset);
          }
        }

        this.dummyPos.scale.setScalar(finalScale);

        // Apply position displacement
        this.dummyPos.position.add(totalPositionOffset);

        // Update color for solid mesh using new color system
        if (this.instancedMesh) {
          const color = this.colorManager.calculateColor(
            x,
            y,
            z,
            nz,
            time,
            countPerSide,
            totalColorInfluence
          );
          this.instancedMesh.setColorAt(i, color);
          if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
          }
        }

        // Update rotation if enabled
        if (
          metaShapesConf.rotation.enabled &&
          metaShapesConf.rotation.individualRotation
        ) {
          this.calculateInstanceRotation(x, y, z, time, totalRotationInfluence);
        } else {
          // Reset individual rotation when disabled
          this.dummyPos.rotation.set(0, 0, 0);
        }
      },
    };
  }

  public updateInstancedMesh(): void {
    this.createInstancedMesh();

    // Auto-adjust camera Z position based on grid size
    const [x, y] = metaShapesConf.camera.position;
    const z = metaShapesConf.instanceMesh.countPerSide * 1.8;

    // Update both the camera and the config to stay in sync
    metaShapesConf.camera.position[2] = z;
    this.camera.position.set(x, y, z);
    this.controls.update();
  }

  public updateColors(): void {
    // Update colors when settings change
    if (this.instancedMesh) {
      const countPerSide = metaShapesConf.instanceMesh.countPerSide;
      const time = performance.now() * 0.0003;
      let i = 0;

      for (let x = 0; x < countPerSide; x += 1) {
        for (let y = 0; y < countPerSide; y += 1) {
          for (let z = 0; z < countPerSide; z += 1) {
            const noiseAmplitude = 0.1;
            const noiseScale = 3;
            const nz =
              this.noise.noise(
                time + x * noiseAmplitude,
                time + y * noiseAmplitude,
                time + z * noiseAmplitude
              ) * noiseScale;

            const color = this.colorManager.calculateColor(
              x,
              y,
              z,
              nz,
              time,
              countPerSide,
              0
            );
            this.instancedMesh.setColorAt(i, color);
            i += 1;
          }
        }
      }

      if (this.instancedMesh.instanceColor) {
        this.instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  public updateRotation(): void {
    // Reset global rotations when switching modes
    if (
      metaShapesConf.rotation.individualRotation ||
      !metaShapesConf.rotation.enabled
    ) {
      if (this.instancedMesh) {
        this.instancedMesh.rotation.set(0, 0, 0);
      }
      if (this.wireframeInstancedMesh) {
        this.wireframeInstancedMesh.rotation.set(0, 0, 0);
      }
      if (this.edgesGroup) {
        this.edgesGroup.rotation.set(0, 0, 0);
      }
    }
  }

  private calculateInstanceRotation(
    x: number,
    y: number,
    z: number,
    time: number,
    mouseInfluence?: { x: number; y: number; z: number }
  ): void {
    const rotConfig = metaShapesConf.rotation;

    // Use different noise sampling for each axis with better spacing
    const noiseScale = 0.2; // Scale down for smoother noise
    const timeScale = rotConfig.timeInfluence * 5; // Scale up time influence

    // Calculate noise-based rotation for each axis with different offsets
    const noiseX = this.noise.noise(
      x * noiseScale + time * timeScale,
      y * noiseScale,
      z * noiseScale + 1000 // Offset for X axis
    );

    const noiseY = this.noise.noise(
      x * noiseScale + 2000, // Offset for Y axis
      y * noiseScale + time * timeScale,
      z * noiseScale
    );

    const noiseZ = this.noise.noise(
      x * noiseScale,
      y * noiseScale + 3000, // Offset for Z axis
      z * noiseScale + time * timeScale
    );

    // Apply rotation combining base rotation speed with noise variation and mouse influence
    this.dummyPos.rotation.x =
      time * rotConfig.rotationSpeed * 0.5 +
      noiseX * rotConfig.noiseInfluenceX * Math.PI * 2 +
      (mouseInfluence?.x || 0);

    this.dummyPos.rotation.y =
      time * rotConfig.rotationSpeed * 0.3 +
      noiseY * rotConfig.noiseInfluenceY * Math.PI * 2 +
      (mouseInfluence?.y || 0);

    this.dummyPos.rotation.z =
      time * rotConfig.rotationSpeed * 0.2 +
      noiseZ * rotConfig.noiseInfluenceZ * Math.PI * 2 +
      (mouseInfluence?.z || 0);
  }

  private initPostProcessing(): void {
    this.postProcessingManager = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera,
      this.canvas
    );
    this.postProcessingManager.init();
  }

  public updatePostProcessing(): void {
    if (this.postProcessingManager) {
      this.postProcessingManager.updatePostProcessing();
    }
  }

  private animate(deltaTime: number, moving: boolean): void {
    this.elapsed += deltaTime;
    const time = this.elapsed * 0.3;
    this.controls.enableDamping = moving;

    // Update smooth mouse position
    if (this.mouseInteractionManager) {
      this.mouseInteractionManager.updateSmoothMousePosition(deltaTime);
    }

    // Update smooth hand position
    if (this.handTrackingManager) {
      this.handTrackingManager.updateSmoothHandPosition(deltaTime);
    }

    // Update controls
    this.controls.update();

    // Rotate all mesh types
    if (this.instancedMesh) {
      this.instancedMesh.rotation.x = Math.sin(time * 0.25);
      this.instancedMesh.rotation.y = Math.sin(time * 0.2);
    }
    if (this.wireframeInstancedMesh) {
      this.wireframeInstancedMesh.rotation.x = Math.sin(time * 0.25);
      this.wireframeInstancedMesh.rotation.y = Math.sin(time * 0.2);
    }
    if (this.edgesGroup) {
      this.edgesGroup.rotation.x = Math.sin(time * 0.25);
      this.edgesGroup.rotation.y = Math.sin(time * 0.2);
    }

    let i = 0;
    const countPerSide = metaShapesConf.instanceMesh.countPerSide;
    for (let x = 0; x < countPerSide; x += 1) {
      for (let y = 0; y < countPerSide; y += 1) {
        for (let z = 0; z < countPerSide; z += 1) {
          this.dummyPos.userData.update({ i, x, y, z, time });
          this.dummyPos.updateMatrix();

          // Update solid mesh matrix
          if (this.instancedMesh) {
            this.instancedMesh.setMatrixAt(i, this.dummyPos.matrix);
          }

          // Update wireframe mesh matrix
          if (this.wireframeInstancedMesh) {
            this.wireframeInstancedMesh.setMatrixAt(i, this.dummyPos.matrix);
          }

          // Update edges mesh matrix
          if (this.edgesGroup && this.edgesGroup.children[i]) {
            const edgesMesh = this.edgesGroup.children[i] as THREE.LineSegments;
            edgesMesh.position.copy(this.dummyPos.position);
            edgesMesh.scale.copy(this.dummyPos.scale);
            edgesMesh.rotation.copy(this.dummyPos.rotation);
          }

          i += 1;
        }
      }
    }

    // Mark instance matrices for update
    if (this.instancedMesh) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.wireframeInstancedMesh) {
      this.wireframeInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    // Render scene using post-processing composer or direct renderer
    if (metaShapesConf.postProcessing.enabled && this.postProcessingManager) {
      this.postProcessingManager.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    this.signal = signal;
    try {
      if (this.options.controlsContainer) {
        this.initGUI();
      }

      this.initScene();
      this.initCamera();
      this.initRenderer();
      this.initControls();
      this.initLights();
      this.setupResize();
      this.setupMouseInteraction();
      await this.setupHandTracking();
      if (signal?.aborted || this.disposed) return;
      this.initObjects();
      this.initPostProcessing();

      this.loop = new ExperienceLoop(
        this.canvas,
        (delta, moving) => this.animate(delta, moving),
        this.options.onError
      );
      this.controls.addEventListener('change', this.invalidate);
      this.pane?.on('change', this.invalidate);
      await this.loop.start();

      // Initialization complete
    } catch (error) {
      console.error('Failed to initialize MetaShapesExperience:', error);
      throw error;
    }
  }

  public async updateHandTracking(): Promise<void> {
    if (this.disposed || this.signal?.aborted) return;
    if (metaShapesConf.handTracking.enabled) {
      // If hand tracking is enabled but doesn't exist, create it
      if (!this.handTrackingManager) {
        await this.setupHandTracking();
      } else {
        // If it exists, resume it (now async)
        await this.handTrackingManager.resume();
      }
    } else {
      // If hand tracking should be disabled, pause it completely
      if (this.handTrackingManager) {
        this.handTrackingManager.pause();
      }
    }
  }

  public getShareableState(): unknown {
    return this.pane?.exportState();
  }

  public setShareableState(state: unknown): void {
    this.pane?.importState(state as Parameters<Pane['importState']>[0]);
    this.pane?.refresh();
    this.updateFormation();
  }

  private invalidate = (): void => {
    this.loop?.invalidate();
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();

    // Remove resize listener
    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }

    // Dispose mouse interaction manager
    if (this.mouseInteractionManager) {
      this.mouseInteractionManager.dispose();
    }

    // Dispose hand tracking manager
    if (this.handTrackingManager) {
      this.handTrackingManager.dispose();
    }

    // Dispose of Tweakpane
    if (this.pane) {
      this.pane.dispose();
    }

    // Dispose of post-processing resources
    if (this.postProcessingManager) {
      this.postProcessingManager.dispose();
    }

    this.disposeMeshes();
    this.scene?.clear();

    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Disposal complete
  }

  private disposeMeshes(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    if (this.meshGeometry) geometries.add(this.meshGeometry);
    for (const object of [
      this.instancedMesh,
      this.wireframeInstancedMesh,
      this.edgesGroup,
    ]) {
      object?.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.LineSegments
        ) {
          geometries.add(child.geometry);
          const owned = Array.isArray(child.material)
            ? child.material
            : [child.material];
          owned.forEach((material) => materials.add(material));
        }
      });
      object?.removeFromParent();
    }
    this.instancedMesh?.dispose();
    this.wireframeInstancedMesh?.dispose();
    this.edgesGroup?.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.meshGeometry = undefined;
    this.instancedMesh = undefined;
    this.wireframeInstancedMesh = undefined;
    this.edgesGroup = undefined;
  }

  private initGUI(): void {
    const container = this.options.controlsContainer;

    this.pane = new Pane({
      title: 'Meta Shapes',
      expanded: true,
      ...(container && { container }),
    });

    // Three excellent presets, always visible, so a first-time visitor gets
    // one obvious interaction (pick a formation) without the artwork getting
    // buried under nine open control groups on a small viewport. Everything
    // else lives one tap away in "Advanced controls", collapsed by default.
    const presets: Array<[string, FormationType]> = [
      ['Cube', 'cube'],
      ['Sphere', 'sphere'],
      ['Helix', 'helix'],
    ];
    const presetsFolder = this.pane.addFolder({
      title: 'Presets',
      expanded: true,
    });
    for (const [label, type] of presets) {
      presetsFolder.addButton({ title: label }).on('click', () => {
        metaShapesConf.instanceMesh.formation.type = type;
        this.pane.refresh();
        this.updateFormation();
      });
    }

    this.pane.addButton({ title: 'Reset All Settings' }).on('click', () => {
      metaShapesConf.instanceMesh.formation.type = 'cube';
      metaShapesConf.instanceMesh.formation.density = 1.0;
      metaShapesConf.instanceMesh.countPerSide = 10;
      metaShapesConf.color.mode = 'rainbow';
      metaShapesConf.rotation.enabled = true;
      metaShapesConf.mouseInteraction.enabled = true;

      this.pane.refresh();
      this.updateFormation();
      this.updateColors();
      this.updateRotation();
    });

    const advancedFolder = this.pane.addFolder({
      title: 'Advanced controls',
      expanded: false,
    });

    // Formation Settings
    const formationFolder = advancedFolder.addFolder({
      title: 'Formation',
      expanded: false,
    });

    formationFolder
      .addBinding(metaShapesConf.instanceMesh.formation, 'type', {
        label: 'Formation Type',
        options: {
          Cube: 'cube',
          Sphere: 'sphere',
          Cylinder: 'cylinder',
          Plane: 'plane',
          Helix: 'helix',
          Random: 'random',
          Torus: 'torus',
          Wave: 'wave',
        },
      })
      .on('change', () => this.updateFormation());

    formationFolder
      .addBinding(metaShapesConf.instanceMesh.formation, 'density', {
        label: 'Density',
        min: 0.1,
        max: 3,
        step: 0.1,
      })
      .on('change', () => this.updateFormation());

    // Instance Mesh Settings
    const instanceFolder = advancedFolder.addFolder({
      title: 'Instance Mesh',
      expanded: false,
    });

    instanceFolder
      .addBinding(metaShapesConf.instanceMesh, 'countPerSide', {
        label: 'Count Per Side',
        min: 1,
        max: 30,
        step: 1,
      })
      .on('change', () => this.updateInstancedMesh());

    instanceFolder
      .addBinding(metaShapesConf.instanceMesh, 'spacing', {
        label: 'Spacing',
        min: 0.1,
        max: 3,
        step: 0.1,
      })
      .on('change', () => this.updateInstancedMesh());

    // Color Settings
    const colorFolder = advancedFolder.addFolder({
      title: 'Colors',
      expanded: false,
    });

    colorFolder
      .addBinding(metaShapesConf.color, 'mode', {
        label: 'Color Mode',
        options: {
          Original: 'original',
          Palette: 'palette',
          Rainbow: 'rainbow',
          Distance: 'distance',
          Position: 'position',
        },
      })
      .on('change', () => this.updateColors());

    colorFolder
      .addBinding(metaShapesConf.color, 'baseHue', {
        label: 'Base Hue',
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on('change', () => this.updateColors());

    colorFolder
      .addBinding(metaShapesConf.color, 'saturation', {
        label: 'Saturation',
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on('change', () => this.updateColors());

    colorFolder
      .addBinding(metaShapesConf.color, 'lightness', {
        label: 'Lightness',
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on('change', () => this.updateColors());

    // Material Settings
    const materialFolder = advancedFolder.addFolder({
      title: 'Material',
      expanded: false,
    });

    materialFolder
      .addBinding(metaShapesConf.instanceMesh.material, 'renderMode', {
        label: 'Render Mode',
        options: {
          Solid: 'solid',
          Wireframe: 'wireframe',
          Edges: 'edges',
          Both: 'both',
        },
      })
      .on('change', () => this.updateInstancedMesh());

    // Geometry Settings
    const geometryFolder = advancedFolder.addFolder({
      title: 'Geometry',
      expanded: false,
    });

    geometryFolder
      .addBinding(metaShapesConf.instanceMesh.geometry, 'type', {
        label: 'Geometry Type',
        options: {
          Box: 'box',
          Sphere: 'sphere',
          Cylinder: 'cylinder',
          Cone: 'cone',
          Icosahedron: 'icosahedron',
          Octahedron: 'octahedron',
          Tetrahedron: 'tetrahedron',
          Dodecahedron: 'dodecahedron',
        },
      })
      .on('change', () => this.updateInstancedMesh());

    geometryFolder
      .addBinding(metaShapesConf.instanceMesh.geometry, 'size', {
        label: 'Size',
        min: 0.1,
        max: 2,
        step: 0.1,
      })
      .on('change', () => this.updateInstancedMesh());

    // Rotation Settings
    const rotationFolder = advancedFolder.addFolder({
      title: 'Rotation',
      expanded: false,
    });

    rotationFolder
      .addBinding(metaShapesConf.rotation, 'enabled', {
        label: 'Enabled',
      })
      .on('change', () => this.updateRotation());

    rotationFolder.addBinding(metaShapesConf.rotation, 'rotationSpeed', {
      label: 'Speed',
      min: 0,
      max: 5,
      step: 0.1,
    });

    rotationFolder
      .addBinding(metaShapesConf.rotation, 'individualRotation', {
        label: 'Individual',
      })
      .on('change', () => this.updateRotation());

    // Mouse Interaction Settings
    const mouseFolder = advancedFolder.addFolder({
      title: 'Mouse Interaction',
      expanded: false,
    });

    mouseFolder.addBinding(metaShapesConf.mouseInteraction, 'enabled', {
      label: 'Enabled',
    });

    mouseFolder.addBinding(metaShapesConf.mouseInteraction, 'effectType', {
      label: 'Effect Type',
      options: {
        Attraction: 'attraction',
        Repulsion: 'repulsion',
        Scale: 'scale',
        'Color Wave': 'colorWave',
        'Rotation Influence': 'rotationInfluence',
        'Height Wave': 'heightWave',
        Combined: 'combined',
      },
    });

    mouseFolder.addBinding(metaShapesConf.mouseInteraction, 'intensity', {
      label: 'Intensity',
      min: 0,
      max: 3,
      step: 0.1,
    });

    mouseFolder.addBinding(metaShapesConf.mouseInteraction, 'radius', {
      label: 'Radius',
      min: 1,
      max: 20,
      step: 0.5,
    });

    // Post-processing Settings
    const postProcessingFolder = advancedFolder.addFolder({
      title: 'Post-processing',
      expanded: false,
    });

    postProcessingFolder
      .addBinding(metaShapesConf.postProcessing, 'enabled', {
        label: 'Enabled',
      })
      .on('change', () => this.updatePostProcessing());

    postProcessingFolder
      .addBinding(metaShapesConf.postProcessing.bloom, 'enabled', {
        label: 'Bloom',
      })
      .on('change', () => this.updatePostProcessing());

    postProcessingFolder
      .addBinding(metaShapesConf.postProcessing.bloom, 'strength', {
        label: 'Bloom Strength',
        min: 0,
        max: 3,
        step: 0.1,
      })
      .on('change', () => this.updatePostProcessing());

    // Hand Tracking Settings
    const handTrackingFolder = advancedFolder.addFolder({
      title: 'Hand Tracking',
      expanded: false,
    });

    handTrackingFolder
      .addBinding(metaShapesConf.handTracking, 'enabled', {
        label: 'Enabled',
      })
      .on('change', async () => {
        await this.updateHandTracking();
      });

    handTrackingFolder
      .addBinding(metaShapesConf.handTracking, 'minDetectionConfidence', {
        label: 'Detection Confidence',
        min: 0.1,
        max: 1.0,
        step: 0.1,
      })
      .on('change', async () => {
        await this.updateHandTracking();
      });
  }

  public updateFormation(): void {
    // Recreate the instanced mesh with new formation
    this.createInstancedMesh();

    // Auto-adjust camera based on formation type
    this.formationManager.adjustCameraForFormation(this.camera, this.controls);
  }
}
