import { Pane } from 'tweakpane';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ResourceScope } from '../../ResourceScope';
import { ExperienceLoop } from '../../ExperienceLoop';
import particlesVertexShader from '../../shaders/cursor-trails/vertex.glsl';
import particlesFragmentShader from '../../shaders/cursor-trails/fragment.glsl';

interface Displacement {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  glowImage: HTMLImageElement;
  glowSize: number;
  interactivePlane: THREE.Mesh;
  raycaster: THREE.Raycaster;
  screenCursor: THREE.Vector2;
  canvasCursor: THREE.Vector2;
  previousCanvasCursor: THREE.Vector2;
  canvasTexture: THREE.CanvasTexture;
}

export class CursorTrailsExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private loop?: ExperienceLoop;
  private disposed = false;
  private assets = new ResourceScope();
  private particles?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly textures = new Set<THREE.Texture>();
  private currentPicture = '';
  private pictureReady: Promise<void> = Promise.resolve();
  private textureLoader!: THREE.TextureLoader;
  private displacement!: Displacement;
  private pane!: Pane;

  private handleResize!: () => void;

  // Settings object for Tweakpane bindings
  private settings = {
    backgroundImage: 'clown.png',
    glowSize: 0.25,
    fadeSpeed: 0.02,
    cursorIntensity: 0.1,
  };

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    super(canvas, options);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
  }

  private initCamera(): void {
    const aspect = this.sizes.width / this.sizes.height;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 30);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setClearColor('#181818');
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(this.sizes.pixelRatio);
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', this.invalidate);
    // disable rotation on touch
    this.controls.touches.ONE = null;
  }

  private setupResize(): void {
    this.handleResize = () => {
      this.updateSizes();
      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(this.sizes.pixelRatio);
      this.particles?.material.uniforms.uResolution.value.set(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio
      );
      this.invalidate();
    };

    window.addEventListener('resize', this.handleResize);
  }

  private initDisplacement(): void {
    const displacementCanvas = document.createElement('canvas');
    displacementCanvas.width = displacementCanvas.height = 128;
    const glowImage = new Image();
    glowImage.onload = this.invalidate;
    glowImage.src = '/cursor-trails/glow.png';
    const interactivePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    interactivePlane.visible = false;
    const raycaster = new THREE.Raycaster();
    const screenCursor = new THREE.Vector2(9999, 9999);
    const canvasCursor = new THREE.Vector2(9999, 9999);
    const previousCanvasCursor = new THREE.Vector2(9999, 9999);
    const glowSize = displacementCanvas.width * this.settings.glowSize;

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);

    const canvasTexture = new THREE.CanvasTexture(displacementCanvas);

    this.displacement = {
      canvas: displacementCanvas,
      context: displacementCanvas.getContext('2d')!,
      glowImage,
      glowSize,
      interactivePlane,
      raycaster,
      screenCursor,
      canvasCursor,
      previousCanvasCursor,
      canvasTexture,
    };
    this.displacement.context.fillRect(0, 0, 128, 128);
    this.scene.add(this.displacement.interactivePlane);
  }

  private initObjects(): void {
    const particlesGeometry = new THREE.PlaneGeometry(10, 10, 128, 128);
    // clean up geometry for improved performance
    particlesGeometry.setIndex(null);
    particlesGeometry.deleteAttribute('normal');
    const intensitiesArray = new Float32Array(
      particlesGeometry.attributes.position.count
    );
    const anglesArray = new Float32Array(
      particlesGeometry.attributes.position.count
    );
    for (let i = 0; i < intensitiesArray.length; i++) {
      intensitiesArray[i] = Math.random();
      anglesArray[i] = Math.random() * Math.PI * 2;
    }
    particlesGeometry.setAttribute(
      'aDisplacementIntensity',
      new THREE.BufferAttribute(intensitiesArray, 1)
    );
    particlesGeometry.setAttribute(
      'aDisplacementAngle',
      new THREE.BufferAttribute(anglesArray, 1)
    );
    const particlesMaterial = new THREE.ShaderMaterial({
      vertexShader: particlesVertexShader,
      fragmentShader: particlesFragmentShader,
      uniforms: {
        uResolution: new THREE.Uniform(
          new THREE.Vector2(
            this.sizes.width * this.sizes.pixelRatio,
            this.sizes.height * this.sizes.pixelRatio
          )
        ),
        uPictureTexture: new THREE.Uniform(this.loadPicture()),
        uDisplacementTexture: new THREE.Uniform(
          this.displacement.canvasTexture
        ),
      },
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    this.particles = particles;
    this.scene.add(particles);
  }

  private initGUI(): void {
    const container = this.options.controlsContainer;

    this.pane = new Pane({
      title: 'Cursor Trails',
      expanded: true,
      ...(container && { container }),
    });

    const imageOptions = {
      Clown: 'clown.png',
      Jelly: 'jelly.jpeg',
      'Pixel Jellyfish': 'pixel-jellyfish.png',
      Skull: 'skull.png',
      Terra: 'terra.png',
      Glow: 'glow.png',
    };

    this.pane
      .addBinding(this.settings, 'backgroundImage', {
        label: 'Background Image',
        options: imageOptions,
      })
      .on('change', this.updatePicture);

    this.pane.addBinding(this.settings, 'glowSize', {
      label: 'Glow Size',
      min: 0.1,
      max: 1.0,
      step: 0.05,
    });

    this.pane.addBinding(this.settings, 'fadeSpeed', {
      label: 'Fade Speed',
      min: 0.001,
      max: 0.1,
      step: 0.001,
    });

    this.pane.addBinding(this.settings, 'cursorIntensity', {
      label: 'Cursor Intensity',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    });

    this.pane.on('change', this.invalidate);

    this.pane
      .addButton({
        title: 'Reset Settings',
      })
      .on('click', () => {
        this.settings.backgroundImage = 'clown.png';
        this.settings.glowSize = 0.25;
        this.settings.fadeSpeed = 0.02;
        this.settings.cursorIntensity = 0.1;
        this.pane.refresh();
        this.updatePicture();
        this.invalidate();
      });
  }

  private animate(delta: number, moving: boolean): void {
    this.controls.enableDamping = moving;
    this.controls.update();
    if (!moving) {
      this.displacement.context.globalAlpha = 1;
      this.displacement.context.globalCompositeOperation = 'source-over';
      this.displacement.context.fillRect(0, 0, 128, 128);
      this.displacement.canvasTexture.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.displacement.raycaster.setFromCamera(
      this.displacement.screenCursor,
      this.camera
    );
    const intersections = this.displacement.raycaster.intersectObject(
      this.displacement.interactivePlane
    );
    if (intersections.length > 0) {
      const uv = intersections[0].uv;
      if (uv) {
        // convert uv to canvas coordinates
        this.displacement.canvasCursor.x =
          uv.x * this.displacement.canvas.width;
        this.displacement.canvasCursor.y =
          (1 - uv.y) * this.displacement.canvas.height;
      }
    }
    this.displacement.context.globalCompositeOperation = 'source-over';
    this.displacement.context.globalAlpha =
      1 - Math.pow(1 - this.settings.fadeSpeed, delta * 60);
    this.displacement.context.fillRect(
      0,
      0,
      this.displacement.canvas.width,
      this.displacement.canvas.height
    );

    const cursorDelta = this.displacement.previousCanvasCursor.distanceTo(
      this.displacement.canvasCursor
    );
    const alpha = Math.min(cursorDelta * this.settings.cursorIntensity, 1);
    this.displacement.previousCanvasCursor.copy(this.displacement.canvasCursor);

    this.displacement.context.globalAlpha = alpha;
    this.displacement.context.globalCompositeOperation = 'lighten';
    this.displacement.glowSize =
      this.displacement.canvas.width * this.settings.glowSize;
    if (
      this.displacement.glowImage.complete &&
      this.displacement.glowImage.naturalWidth > 0
    )
      this.displacement.context.drawImage(
        this.displacement.glowImage,
        this.displacement.canvasCursor.x - this.displacement.glowSize / 2,
        this.displacement.canvasCursor.y - this.displacement.glowSize / 2,
        this.displacement.glowSize,
        this.displacement.glowSize
      );

    if (this.displacement.canvasTexture) {
      this.displacement.canvasTexture.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    signal?.addEventListener('abort', this.assets.dispose, { once: true });
    this.assets.defer(() =>
      signal?.removeEventListener('abort', this.assets.dispose)
    );
    this.textureLoader = new THREE.TextureLoader();
    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initControls();
    this.setupResize();
    this.initDisplacement();
    this.initObjects();
    if (this.options.controlsContainer) {
      this.initGUI();
    }
    await this.assets.wait(this.pictureReady);
    this.loop = new ExperienceLoop(
      this.canvas,
      (delta, moving) => this.animate(delta, moving),
      this.options.onError
    );
    await this.loop.start();
  }

  public getShareableState(): unknown {
    return this.pane?.exportState();
  }

  public setShareableState(state: unknown): void {
    this.pane?.importState(state as Parameters<Pane['importState']>[0]);
    this.pane?.refresh();
    this.updatePicture();
    this.invalidate();
  }

  private invalidate = (): void => {
    this.loop?.invalidate();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const bounds = this.canvas.getBoundingClientRect();
    this.displacement.screenCursor.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.invalidate();
  };

  private handlePointerLeave = (): void => {
    this.displacement.screenCursor.set(9999, 9999);
  };

  private updatePicture = (): void => {
    if (
      !this.particles ||
      this.currentPicture === this.settings.backgroundImage
    )
      return;
    const previous = this.particles.material.uniforms.uPictureTexture
      .value as THREE.Texture;
    this.particles.material.uniforms.uPictureTexture.value = this.loadPicture();
    previous.dispose();
    this.textures.delete(previous);
    this.invalidate();
  };

  private loadPicture(): THREE.Texture {
    this.currentPicture = this.settings.backgroundImage;
    let texture!: THREE.Texture;
    this.pictureReady = new Promise<void>((resolve, reject) => {
      texture = this.textureLoader.load(
        `/cursor-trails/${this.currentPicture}`,
        (loaded) => {
          if (!this.disposed && this.textures.has(loaded)) this.invalidate();
          resolve();
        },
        undefined,
        reject
      );
    });
    void this.pictureReady.catch((error) => {
      if (!this.disposed && this.textures.has(texture))
        this.options.onError?.(error);
    });
    this.textures.add(texture);
    return texture;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.assets.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.pane?.dispose();
    if (this.displacement) {
      this.displacement.glowImage.onload = null;
      this.displacement.glowImage.src = '';
      this.displacement.canvasTexture.dispose();
      this.displacement.interactivePlane.geometry.dispose();
      (this.displacement.interactivePlane.material as THREE.Material).dispose();
    }
    this.particles?.geometry.dispose();
    this.particles?.material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.textures.clear();
    this.scene?.clear();
    this.renderer?.dispose();
  }
}
