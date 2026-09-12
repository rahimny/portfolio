import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { MirrorShader } from '@/vanilla-three/shaders';
import { metaShapesConf } from '../constants';

// Define a more robust chromatic aberration shader
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    
    void main() {
      vec2 offset = amount * (vUv - 0.5);
      
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

export class PostProcessingManager {
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private chromaticAberrationPass!: ShaderPass;
  private filmPass!: FilmPass;
  private afterimagePass!: AfterimagePass;
  private outputPass!: OutputPass;
  private mirrorPass!: ShaderPass;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
  }

  public init(): void {
    this.initPostProcessing();
  }

  private initPostProcessing(): void {
    // Create effect composer
    this.composer = new EffectComposer(this.renderer);

    // Render pass - renders the scene
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom pass
    const bloomConfig = metaShapesConf.postProcessing.bloom;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight),
      bloomConfig.strength,
      bloomConfig.radius,
      bloomConfig.threshold
    );
    this.composer.addPass(this.bloomPass);

    // Chromatic aberration pass
    this.chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
    this.chromaticAberrationPass.uniforms.amount.value =
      metaShapesConf.postProcessing.chromaticAberration.strength * 0.005;
    this.composer.addPass(this.chromaticAberrationPass);

    // Mirror pass
    this.mirrorPass = new ShaderPass(MirrorShader);
    this.mirrorPass.uniforms.uResolution.value.set(
      this.canvas.clientWidth,
      this.canvas.clientHeight
    );
    this.composer.addPass(this.mirrorPass);

    // Film grain pass
    this.filmPass = new FilmPass(
      metaShapesConf.postProcessing.filmGrain.intensity
    );
    this.composer.addPass(this.filmPass);

    // Afterimage pass
    this.afterimagePass = new AfterimagePass();
    this.composer.addPass(this.afterimagePass);

    // Output pass (always last)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // Set initial enabled states
    this.updatePostProcessing();
  }

  public updatePostProcessing(): void {
    if (!this.composer) return;

    const config = metaShapesConf.postProcessing;

    // Update bloom
    if (this.bloomPass) {
      this.bloomPass.enabled = config.enabled && config.bloom.enabled;
      this.bloomPass.strength = config.bloom.strength;
      this.bloomPass.radius = config.bloom.radius;
      this.bloomPass.threshold = config.bloom.threshold;
    }

    // Update chromatic aberration
    if (this.chromaticAberrationPass) {
      this.chromaticAberrationPass.enabled =
        config.enabled && config.chromaticAberration.enabled;
      this.chromaticAberrationPass.uniforms.amount.value =
        config.chromaticAberration.strength * 0.005;
    }

    // Update mirror
    if (this.mirrorPass) {
      this.mirrorPass.enabled = config.enabled && config.mirror.enabled;

      // Map mirror type to number
      const typeMap = {
        horizontal: 0,
        vertical: 1,
        kaleidoscope: 2,
        radial: 3,
        diagonal: 4,
        quadrant: 5,
        center: 6,
      };

      this.mirrorPass.uniforms.uMirrorType.value =
        typeMap[config.mirror.type] || 0;
      this.mirrorPass.uniforms.uIntensity.value = config.mirror.intensity;
      this.mirrorPass.uniforms.uSegments.value = config.mirror.segments || 6;
      this.mirrorPass.uniforms.uOffset.value = config.mirror.offset || 0.5;
    }

    // Update film grain
    if (this.filmPass) {
      this.filmPass.enabled = config.enabled && config.filmGrain.enabled;
      const uniforms = this.filmPass.uniforms as {
        intensity: { value: number };
      };
      uniforms.intensity.value = config.filmGrain.intensity;
    }

    // Update afterimage
    if (this.afterimagePass) {
      this.afterimagePass.enabled = config.enabled && config.afterimage.enabled;
      this.afterimagePass.uniforms.damp.value = config.afterimage.damp;
    }
  }

  public render(): void {
    if (metaShapesConf.postProcessing.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public setSize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }

    // Update mirror resolution
    if (this.mirrorPass) {
      this.mirrorPass.uniforms.uResolution.value.set(width, height);
    }
  }

  public dispose(): void {
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose();
      this.composer.dispose();
    }
  }

  // Getters for accessing passes if needed
  public getComposer(): EffectComposer {
    return this.composer;
  }

  public getBloomPass(): UnrealBloomPass {
    return this.bloomPass;
  }

  public getChromaticAberrationPass(): ShaderPass {
    return this.chromaticAberrationPass;
  }

  public getMirrorPass(): ShaderPass {
    return this.mirrorPass;
  }

  public getFilmPass(): FilmPass {
    return this.filmPass;
  }

  public getAfterimagePass(): AfterimagePass {
    return this.afterimagePass;
  }
}
