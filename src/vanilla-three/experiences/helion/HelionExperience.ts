import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  addImpact,
  createShell,
  MAX_IMPACTS,
  type Impact,
  type Vec3,
} from '@/features/helion/model';
import { createPlateGeometry } from './geometry';
import {
  createMissile,
  launchMissile,
  stepMissile,
  stepSwarm,
  nearestTile,
  kickCamera,
  stepCamera,
  SHELL_FREQUENCY,
  MISSILE_COUNT,
  TRAIL_LENGTH,
  FIXED_STEP,
  type Missile,
  type CameraResponse,
} from '@/features/helion/dynamics';
import * as shaders from './shaders';
import { createPrintPass, siteColour } from './finish';
import {
  RENDER_PRESETS,
  normaliseRendering,
  type RenderingSettings,
} from '@/features/helion/rendering';
import { CoinPops } from './coins';
import { fieldMood, type Mood } from '@/features/helion/mood';
import { blastPixelation, BLAST_DURATION } from '@/features/helion/effects';

const COMETS = MISSILE_COUNT,
  TRAIL_SEGMENTS = TRAIL_LENGTH - 1,
  SPARKS = 720;
export interface HelionStatus {
  ready: boolean;
  paused: boolean;
  reduced: boolean;
  charge: number;
  time: number;
  impacts: number;
  frameMs: number;
  drawCalls: number;
  pixels: string;
  tile: number;
  dragging: boolean;
  cells: number;
  mood: string;
  resonance: number;
  combo: number;
}
export const INITIAL_STATUS: HelionStatus = {
  ready: false,
  paused: false,
  reduced: false,
  charge: 0,
  time: 0,
  impacts: 0,
  frameMs: 0,
  drawCalls: 0,
  pixels: '',
  tile: -1,
  dragging: false,
  cells: 492,
  mood: 'Breathing',
  resonance: 0,
  combo: 0,
};
interface Comet {
  trail: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  missile: Missile;
}
interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  duration: number;
}
interface Shock {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  born: number;
  strength: number;
}

export class HelionExperience extends BaseExperience {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private printPass?: ShaderPass;
  private rendering: RenderingSettings = { ...RENDER_PRESETS.Cel };
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private disposed = false;
  private paused = false;
  private cells = createShell(SHELL_FREQUENCY);
  private accumulator = 0;
  private moodTime = 0;
  private excitement = 0;
  private frenzyUntil = 0;
  private orbitPhase = 0;
  private mood: Mood = fieldMood(0, 0);
  private coins?: CoinPops;
  private combo = 0;
  private lastGesture = -100;
  private stir = 0;

  private hovered = false;
  private dragging = false;
  private tile = -1;
  private lastRake = -10;
  private lastRakeTile = -1;
  private pointerSpeed = 0;
  private lastPointerTime = 0;
  private lastPointer = new THREE.Vector2();
  private gestureEnergy = 0;
  private salvoCursor = 4;
  private recoil: CameraResponse = {
    offset: [0, 0, 0],
    velocity: [0, 0, 0],
    trauma: 0,
  };
  private baseCameraPosition = new THREE.Vector3();
  private baseCameraQuaternion = new THREE.Quaternion();
  private cameraShift = new THREE.Vector3();
  private selection?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private debris?: THREE.InstancedMesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private fragments = Array.from({ length: 48 }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    life: 0,
    duration: 1,
  }));
  private fragmentCursor = 0;
  private dummy = new THREE.Object3D();
  private fragmentColour = new THREE.Color();
  private axisZ = new THREE.Vector3(0, 0, 1);
  private blasts: Shock[] = [];
  private burstLabel?: THREE.Sprite;
  private labelTexture?: THREE.CanvasTexture;
  private labelBorn = -100;
  private labelOrigin = new THREE.Vector3();
  private time = 2.4;
  private intensity = 1;
  private charge = 0;
  private holding = false;
  private pointerId: number | null = null;
  private down = new THREE.Vector2();
  private aim = new THREE.Vector3(0.2, 0.2, 1).normalize();
  private aimTarget = this.aim.clone();
  private raycaster = new THREE.Raycaster();
  private hitSphere = new THREE.Sphere(new THREE.Vector3(), 2.12);
  private pointer = new THREE.Vector2();
  private temp = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private side = new THREE.Vector3();
  private view = new THREE.Vector3();
  private impacts: Impact[] = [];
  private impactCount = 0;
  private comets: Comet[] = [];
  private shocks: Shock[] = [];
  private sparkCursor = 0;
  private wakeAccumulator = 0;
  private sparkStreaks?: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private sparks: Spark[] = [];
  private sparkPoints?: THREE.Points<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  private halo?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private audio?: AudioContext;
  private audioEnabled = false;
  private voices = new Set<OscillatorNode>();
  private frameAverage = 16.7;
  private quality = 1;
  private reportAt = -1;
  private lastFrame = 0;
  private adaptiveFrames = 0;
  private readonly uniforms = {
    uTime: { value: 2.4 },
    uCharge: { value: 0 },
    uHover: { value: 0 },
    uSweep: { value: 0 },
    uIntensity: { value: 1 },
    uMood: { value: 0.08 },
    uCel: { value: 0.85 },
    uPaper: { value: new THREE.Color(0.9, 0.89, 0.88) },
    uInk: { value: new THREE.Color(0.003, 0.003, 0.003) },
    uBrand: { value: new THREE.Color(1, 0.036, 0) },
    uAim: { value: this.aim },
    uPixelRatio: { value: 1 },
    uImpacts: {
      value: Array.from(
        { length: MAX_IMPACTS },
        () => new THREE.Vector4(0, 0, 1, -100)
      ),
    },
    uStrengths: { value: new Float32Array(MAX_IMPACTS) },
  };

  private readonly onStatus: (status: HelionStatus) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: HelionStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }
  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch {
      throw new Error(
        'Helion needs WebGL 2. Try a browser with hardware acceleration enabled.'
      );
    }
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.info.autoReset = false;
    this.uniforms.uPaper.value.copy(siteColour('--paper'));
    this.uniforms.uInk.value.copy(siteColour('--ink'));
    this.uniforms.uBrand.value.copy(siteColour('--brand'));
    this.scene.background = this.uniforms.uPaper.value;
    this.camera.position.set(0, 0.35, 10.8);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 6.7;
    this.controls.maxDistance = 15;
    this.controls.rotateSpeed = 0.45;
    this.controls.addEventListener('change', this.invalidate);
    const plates = createPlateGeometry(this.cells);
    // Resolve the nearest plate first: one transparent mesh otherwise blends
    // rear walls over front caps according to buffer order as the camera orbits.
    const shellDepth = new THREE.Mesh(
      plates,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: shaders.plateVertex,
        fragmentShader: 'void main(){gl_FragColor=vec4(0.0);}',
        colorWrite: false,
      })
    );
    shellDepth.renderOrder = 1;
    const shell = new THREE.Mesh(
      plates,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: shaders.plateVertex,
        fragmentShader: shaders.plateFragment,
        transparent: true,
        depthWrite: false,
        depthFunc: THREE.EqualDepth,
      })
    );
    shell.renderOrder = 2;
    this.scene.add(shellDepth, shell);
    this.scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.92, 48, 32),
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: shaders.coreVertex,
          fragmentShader: shaders.coreFragment,
        })
      )
    );
    this.halo = this.makeGlow(new THREE.Color(0.5, 0.46, 0.42), 0.06);
    this.halo.scale.setScalar(11);
    this.halo.renderOrder = -1;
    this.halo.material.depthTest = false;
    this.scene.add(this.halo);
    this.createComets();
    this.createSparks();
    this.createDust();
    this.createImpactEffects();
    this.coins = new CoinPops();
    this.scene.add(this.coins.mesh, this.coins.glints);
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          uniforms: { uOpacity: { value: 0 }, uAge: { value: 0 } },
          vertexShader: shaders.trailVertex,
          fragmentShader: shaders.shockFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
        })
      );
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.shocks.push({ mesh, born: -100, strength: 0 });
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.3, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.printPass = createPrintPass(
      this.uniforms.uPaper.value,
      this.uniforms.uInk.value
    );
    this.composer.addPass(this.printPass);
    this.setRendering(this.rendering);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.canvas.addEventListener('pointerdown', this.pointerDown, true);
    this.canvas.addEventListener('pointerleave', this.pointerLeave);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.pointerCancel);
    this.canvas.addEventListener('keydown', this.keyDown);
    this.canvas.addEventListener('keyup', this.keyUp);
    this.canvas.addEventListener('blur', this.cancelCharge);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('blur', this.cancelCharge);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    // A composed first frame also gives reduced-motion visitors a readable specimen.
    this.strike([-0.72, 0.4, 0.57], 0.85, false, 1.9);
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.report();
  }
  private makeGlow(colour: THREE.Color, opacity: number) {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: { uColour: { value: colour }, uOpacity: { value: opacity } },
        vertexShader: shaders.trailVertex,
        fragmentShader: shaders.glowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
  }
  private createComets() {
    for (let id = 0; id < COMETS; id++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((TRAIL_SEGMENTS + 1) * 6);
      const uv = new Float32Array((TRAIL_SEGMENTS + 1) * 4);
      const indices: number[] = [];
      for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
        uv.set([i / TRAIL_SEGMENTS, 0, i / TRAIL_SEGMENTS, 1], i * 4);
        if (i < TRAIL_SEGMENTS) {
          const k = i * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
      );
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      const colour =
        id % 3 !== 0
          ? new THREE.Color(1, 0.04, 0.002)
          : new THREE.Color(0.14, 0.11, 0.085);
      const trail = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: { uColour: { value: colour }, uTime: this.uniforms.uTime },
          vertexShader: shaders.trailVertex,
          fragmentShader: shaders.trailFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
        })
      );
      trail.frustumCulled = false;
      trail.renderOrder = 3;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.044, 12, 8),
        new THREE.MeshBasicMaterial({
          color: colour.clone().multiplyScalar(0.85),
        })
      );
      const glow = this.makeGlow(colour, 1.25);
      glow.scale.setScalar(0.5);
      glow.renderOrder = 3;
      this.scene.add(trail, head, glow);
      this.comets.push({
        trail,
        head,
        glow,
        missile: createMissile(id, this.cells),
      });
    }
  }
  private createSparks() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    geometry.setAttribute(
      'aLife',
      new THREE.BufferAttribute(new Float32Array(SPARKS), 1).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(
        Float32Array.from({ length: SPARKS }, (_, i) => 0.2 + (i % 7) * 0.07),
        1
      )
    );
    geometry.setAttribute(
      'aColour',
      new THREE.BufferAttribute(
        Float32Array.from({ length: SPARKS * 3 }, (_, i) =>
          i % 3 === 0 ? 1 : i % 3 === 1 ? 0.4 : 0.045
        ),
        3
      )
    );
    this.sparkPoints = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: this.uniforms.uPixelRatio },
        vertexShader: shaders.sparkVertex,
        fragmentShader: shaders.sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    streakGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    this.sparkStreaks = new THREE.LineSegments(
      streakGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    this.sparkStreaks.frustumCulled = false;
    this.sparkStreaks.renderOrder = 3;
    this.scene.add(this.sparkStreaks);
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 3;
    this.scene.add(this.sparkPoints);
    this.sparks = Array.from({ length: SPARKS }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      duration: 1,
    }));
  }
  private createDust() {
    const count = 850,
      positions = new Float32Array(count * 3),
      seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const seed = (Math.sin(i * 127.1 + 42) * 43758.5453) % 1;
      const angle = i * 2.39996323,
        z = 1 - (2 * (i + 0.5)) / count,
        r = 5 + Math.abs(seed) * 11;
      positions.set(
        [
          Math.cos(angle) * Math.sqrt(1 - z * z) * r,
          z * r,
          Math.sin(angle) * Math.sqrt(1 - z * z) * r,
        ],
        i * 3
      );
      seeds[i] = Math.abs(seed);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: shaders.dustVertex,
          fragmentShader: shaders.dustFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending,
        })
      )
    );
  }
  private createImpactEffects() {
    this.selection = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.155, 6),
      new THREE.MeshBasicMaterial({
        color: this.uniforms.uBrand.value.clone(),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      })
    );
    this.selection.renderOrder = 3;
    this.scene.add(this.selection);
    this.debris = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.09, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
      48
    );
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    for (let i = 0; i < 48; i++) {
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.debris.setMatrixAt(i, this.dummy.matrix);
      this.debris.setColorAt(i, new THREE.Color());
    }
    this.debris.renderOrder = 3;
    this.scene.add(this.debris);
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          uniforms: {
            uAge: { value: 10 },
            uPower: { value: 0 },
            uPixelation: { value: 0 },
          },
          vertexShader: shaders.trailVertex,
          fragmentShader: shaders.burstFragment,
          transparent: true,
          depthWrite: false,
        })
      );
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.blasts.push({ mesh, born: -100, strength: 0 });
    }
    const label = document.createElement('canvas');
    label.width = 512;
    label.height = 192;
    const context = label.getContext('2d')!;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font =
      '900 96px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    context.lineJoin = 'round';
    context.lineWidth = 18;
    context.strokeStyle = '#171513';
    context.strokeText('衝撃', 256, 82);
    context.lineWidth = 5;
    context.strokeStyle = '#f6f5f3';
    context.strokeText('衝撃', 256, 82);
    context.fillStyle = '#ff3600';
    context.fillText('衝撃', 256, 82);
    context.font = '900 24px sans-serif';
    context.fillStyle = '#171513';
    context.fillText('I M P A C T', 256, 156);
    this.labelTexture = new THREE.CanvasTexture(label);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.burstLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.labelTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.burstLabel.visible = false;
    this.burstLabel.renderOrder = 4;
    this.scene.add(this.burstLabel);
  }
  private emitFragments(tile: number, power: number) {
    if (power < 0.4) return;
    const direction = this.cells[tile].centre;
    const neighbours = this.cells
      .map((cell, id) => ({
        id,
        distance: cell.centre.reduce((sum, n, i) => sum + n * direction[i], 0),
      }))
      .sort((a, b) => b.distance - a.distance);
    const count = Math.min(10, Math.round(2 + power * 3));
    for (let i = 0; i < count; i++) {
      const fragment = this.fragments[this.fragmentCursor++ % 48];
      const n = this.cells[neighbours[i].id].centre;
      fragment.position.set(...n).multiplyScalar(2.17);
      fragment.velocity.set(...n).multiplyScalar(1.1 + power * 0.9);
      this.temp
        .set(...n)
        .sub(new THREE.Vector3(...direction))
        .multiplyScalar(4.5);
      fragment.velocity.add(this.temp);
      fragment.rotation.set(i * 0.7, i * 1.1, this.impactCount * 0.3);
      fragment.duration = 0.65 + (i % 5) * 0.13;
      fragment.life = fragment.duration;
    }
  }
  private updateImpactEffects(delta: number, moving: boolean) {
    if (this.selection) {
      this.selection.visible = this.hovered;
      this.selection.position
        .copy(this.aim)
        .multiplyScalar(2.43 + this.charge * 0.33);
      this.selection.quaternion.setFromUnitVectors(this.axisZ, this.aim);
      this.selection.scale.setScalar(1 + this.charge * 0.3);
    }
    if (this.debris) {
      for (let i = 0; i < this.fragments.length; i++) {
        const fragment = this.fragments[i];
        fragment.life = Math.max(0, fragment.life - delta);
        if (fragment.life > 0) {
          fragment.position.addScaledVector(fragment.velocity, delta);
          fragment.velocity.multiplyScalar(Math.exp(-delta * 0.6));
          fragment.rotation.x += delta * 1.7;
          fragment.rotation.z += delta * 1.1;
        }
        const life = fragment.life / fragment.duration;
        this.dummy.position.copy(fragment.position);
        this.dummy.rotation.copy(fragment.rotation);
        this.dummy.scale.setScalar(life > 0.05 ? 1 : 0);
        this.dummy.updateMatrix();
        this.debris.setMatrixAt(i, this.dummy.matrix);
        this.debris.setColorAt(
          i,
          this.fragmentColour.setRGB(
            0.04 + life * 0.06,
            0.035 + life * 0.03,
            0.028 + life * 0.02
          )
        );
      }
      this.debris.instanceMatrix.needsUpdate = true;
      if (this.debris.instanceColor)
        this.debris.instanceColor.needsUpdate = true;
    }
    let raster = 0;
    for (const blast of this.blasts) {
      const age = this.time - blast.born;
      blast.mesh.visible = age >= 0 && age < BLAST_DURATION;
      if (!blast.mesh.visible) continue;
      blast.mesh.quaternion.copy(this.camera.quaternion);
      const bloom = 1 - Math.exp(-Math.max(0, age) * 17);
      blast.mesh.scale.setScalar(
        (0.6 + bloom * 1.25) * Math.sqrt(blast.strength)
      );
      blast.mesh.material.uniforms.uAge.value = age;
      blast.mesh.material.uniforms.uPower.value = blast.strength;
      const pixels = this.loop?.reducedMotion
        ? 0
        : blastPixelation(age, blast.strength) * this.rendering.pixels;
      blast.mesh.material.uniforms.uPixelation.value = pixels;
      raster = Math.max(raster, pixels);
    }
    this.canvas.dataset.pixelation = raster.toFixed(3);
    if (this.burstLabel) {
      const age = this.time - this.labelBorn;
      this.burstLabel.visible = age >= 0 && age < 0.8;
      this.burstLabel.position.copy(this.labelOrigin);
      this.burstLabel.position.y += age * 0.75;
      const scale = 1 + Math.sin(Math.min(1, age * 10) * Math.PI) * 0.18;
      this.burstLabel.scale.set(scale * 1.4, scale * 0.525, 1);
      this.burstLabel.material.opacity = Math.min(1, (0.8 - age) * 5);
      this.burstLabel.material.rotation = -0.15;
    }
    if (!moving) this.cameraShift.set(0, 0, 0);
  }
  private strike(
    direction: Vec3,
    strength: number,
    sparks = true,
    time = this.time
  ) {
    const tile = nearestTile(direction, this.cells);
    direction = this.cells[tile].centre;
    addImpact(this.impacts, { direction, time, strength });
    this.canvas.dataset.hitTile = String(tile);
    this.impactCount++;
    const shock = this.shocks[this.impactCount % MAX_IMPACTS];
    if (shock) {
      shock.born = time;
      shock.strength = strength;
      shock.mesh.position.set(...direction).multiplyScalar(2.38);
      shock.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...direction)
      );
    }
    if (sparks) {
      kickCamera(this.recoil, direction, strength * (this.dragging ? 0.4 : 1));
      this.emitFragments(tile, strength);
      if (strength > 0.55) {
        // Prefer an expired slot; a salvo cannot erase an unrelated fresh burst.
        const blast =
          this.blasts.find((b) => time - b.born >= BLAST_DURATION) ??
          this.blasts.reduce((oldest, b) =>
            b.born < oldest.born ? b : oldest
          );
        blast.born = time;
        blast.strength = strength;
        blast.mesh.position.set(...direction).multiplyScalar(2.9);
      }
      if (strength > 1.15 && this.burstLabel) {
        this.labelBorn = time;
        this.labelOrigin.set(...direction).multiplyScalar(2.9);
        this.view.copy(this.camera.position).normalize();
        this.labelOrigin.addScaledVector(this.view, 0.8);
      }
      this.tangent
        .set(...direction)
        .cross(
          Math.abs(direction[1]) < 0.9
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0)
        )
        .normalize();
      this.side
        .set(...direction)
        .cross(this.tangent)
        .normalize();
      const count = Math.round(14 + strength * 44);
      for (let i = 0; i < count; i++) {
        const spark = this.sparks[this.sparkCursor++ % SPARKS];
        const angle = i * 2.39996 + this.impactCount;
        this.temp
          .copy(this.tangent)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(this.side, Math.sin(angle));
        spark.position.set(...direction).multiplyScalar(2.12);
        spark.velocity
          .set(...direction)
          .multiplyScalar(0.8 + strength * 1.8)
          .addScaledVector(
            this.temp,
            (1.8 + strength * 2.5) * (0.35 + ((i * 37) % 101) / 75)
          );
        spark.duration = 0.42 + ((i * 13) % 37) / 48;
        spark.life = spark.duration;
      }
      this.sound(strength);
    }
    this.invalidate();
  }
  public discharge = (): void => {
    if (this.disposed || !this.renderer) return;
    if (this.paused || this.loop?.reducedMotion) {
      this.impacts.length = 0;
      for (const spark of this.sparks) spark.life = 0;
      for (const shock of this.shocks) shock.born = -100;
      for (const fragment of this.fragments) fragment.life = 0;
      for (const blast of this.blasts) blast.born = -100;
      this.coins?.clear();
      this.labelBorn = -100;
    }
    const live = !this.paused && !this.loop?.reducedMotion;
    if (live) {
      this.combo =
        this.time - this.lastGesture < 1.35 ? Math.min(8, this.combo + 1) : 1;
      this.lastGesture = this.time;
      this.excitement = Math.min(1, this.excitement + 0.16 + this.charge * 0.4);
      if (this.charge > 0.65 || this.excitement > 0.82) {
        this.frenzyUntil = this.moodTime + 5;
        this.excitement = 0.45;
      }
      if (this.charge > 0.2 || this.combo > 1) {
        this.temp.copy(this.aim).multiplyScalar(2.85);
        this.coins?.emit(
          this.temp,
          this.camera,
          Math.min(8, 3 + this.combo + Math.round(this.charge * 3)),
          0.7 + this.charge * 1.3
        );
      }
    }
    this.strike(
      this.aim.toArray() as Vec3,
      0.7 + this.charge * 1.3,
      !this.paused && !this.loop?.reducedMotion
    );
    // Frozen inspection shows the wave near its source without starting autoplay.
    if (this.paused || this.loop?.reducedMotion)
      this.impacts.at(-1)!.time = this.time - 0.22;
    if (!this.paused && !this.loop?.reducedMotion && this.charge > 0.2) {
      const target =
        this.tile >= 0
          ? this.tile
          : nearestTile(this.aim.toArray() as Vec3, this.cells);
      for (let i = 0; i < 3; i++) {
        const id = this.salvoCursor++;
        if (this.salvoCursor >= COMETS) this.salvoCursor = 4;
        launchMissile(
          this.comets[id].missile,
          id,
          this.cells,
          target,
          1 + this.charge
        );
      }
    }
    this.charge = 0;
    this.holding = false;
    this.gestureEnergy = 0;
    this.report();
  };
  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused)
      this.recoil = { offset: [0, 0, 0], velocity: [0, 0, 0], trauma: 0 };
    this.cancelCharge();
    this.loop?.setPlaying(!paused);
    this.report();
  }
  public setRendering(settings: RenderingSettings): void {
    this.rendering = normaliseRendering(settings);
    this.uniforms.uCel.value = this.rendering.cel;
    if (this.bloom) {
      this.bloom.strength = this.rendering.glow;
      this.bloom.enabled = this.rendering.glow > 0;
    }
    if (this.printPass) {
      this.printPass.uniforms.uLine.value = this.rendering.ink;
      this.printPass.uniforms.uHatch.value = this.rendering.hatch;
      this.printPass.enabled =
        this.rendering.ink > 0 || this.rendering.hatch > 0;
    }
    this.canvas.dataset.renderStyle = JSON.stringify(this.rendering);
    this.invalidate();
  }
  public setIntensity(value: number): void {
    if (!Number.isFinite(value)) return;
    this.intensity = THREE.MathUtils.clamp(value, 0.25, 1.8);
    this.uniforms.uIntensity.value = this.intensity;
    this.invalidate();
  }
  public setSound(enabled: boolean): void {
    if (this.disposed || !this.renderer) return;
    this.audioEnabled = enabled;
    if (enabled) {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } else if (this.audio) void this.audio.suspend();
  }
  private sound(strength: number) {
    if (!this.audioEnabled || !this.audio || this.voices.size >= 8) return;
    const audio = this.audio,
      osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 + strength * 35, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, audio.currentTime + 0.35);
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(
      0.055 * strength,
      audio.currentTime + 0.012
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audio.destination);
    this.voices.add(osc);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.voices.delete(osc);
    };
    osc.start();
    osc.stop(audio.currentTime + 0.52);
  }
  private pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.pointerId !== null) {
      this.cancelCharge();
      if (this.controls) this.controls.enableRotate = true;
      return;
    }
    this.pointerMove(event);
    if (this.controls)
      this.controls.enableRotate = !this.hovered || event.shiftKey;
    this.pointerId = event.pointerId;
    this.down.set(event.clientX, event.clientY);
    this.dragging = false;
    this.gestureEnergy = 0;
    this.holding =
      this.hovered &&
      !event.shiftKey &&
      !this.paused &&
      !this.loop?.reducedMotion;
    this.canvas.focus({ preventScroll: true });
  };
  private pointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2
    );
    const now = performance.now(),
      elapsed = Math.max(8, now - this.lastPointerTime);
    this.pointerSpeed = Math.min(
      2,
      Math.hypot(
        event.clientX - this.lastPointer.x,
        event.clientY - this.lastPointer.y
      ) / elapsed
    );
    if (!this.paused && !this.loop?.reducedMotion) {
      const dx = event.clientX - this.lastPointer.x,
        dy = event.clientY - this.lastPointer.y;
      // A circular hand movement adds angular momentum to the shared swarm.
      const cx = event.clientX - (rect.left + rect.width * 0.5),
        cy = event.clientY - (rect.top + rect.height * 0.5);
      const turn = (cx * dy - cy * dx) / Math.max(1, rect.width * rect.height);
      this.stir = THREE.MathUtils.clamp(this.stir + turn * 6, -1.8, 1.8);
      this.excitement = Math.min(
        1,
        this.excitement + Math.min(0.016, Math.abs(turn) * 1.8)
      );
      if (this.excitement > 0.9) {
        this.frenzyUntil = this.moodTime + 5;
        this.excitement = 0.45;
      }
    }
    this.lastPointer.set(event.clientX, event.clientY);
    this.lastPointerTime = now;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.hovered = !!this.raycaster.ray.intersectSphere(
      this.hitSphere,
      this.temp
    );
    if (this.hovered) {
      this.tile = nearestTile(
        this.temp.normalize().toArray() as Vec3,
        this.cells
      );
      this.aimTarget.set(...this.cells[this.tile].centre);
    }
    const onShell = this.controls?.enableRotate === false;
    if (
      this.pointerId === event.pointerId &&
      onShell &&
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 7
    ) {
      this.dragging = true;
      this.holding = false;
      if (
        this.hovered &&
        !this.paused &&
        !this.loop?.reducedMotion &&
        this.tile !== this.lastRakeTile &&
        this.time - this.lastRake > 0.095
      ) {
        this.strike(
          this.cells[this.tile].centre,
          0.17 + this.pointerSpeed * 0.09
        );
        this.lastRake = this.time;
        this.lastRakeTile = this.tile;
        this.gestureEnergy = Math.min(0.8, this.gestureEnergy + 0.085);
        this.charge = this.gestureEnergy;
      }
    }
    this.canvas.style.cursor = this.hovered
      ? this.dragging
        ? 'grabbing'
        : 'crosshair'
      : 'grab';
    if (this.paused || this.loop?.reducedMotion) this.aim.copy(this.aimTarget);
    this.invalidate();
  };
  private pointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    if (
      this.controls?.enableRotate === false &&
      (this.hovered || this.dragging)
    )
      this.discharge();
    this.cancelCharge();
  };
  private pointerLeave = (): void => {
    this.hovered = false;
    this.invalidate();
  };
  private pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.cancelCharge();
  };
  private cancelCharge = (): void => {
    this.pointerId = null;
    this.holding = false;
    this.dragging = false;
    this.charge = 0;
    this.gestureEnergy = 0;
    if (this.controls) this.controls.enableRotate = true;
    this.invalidate();
    this.report();
  };
  private keyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat)
        this.holding = !this.paused && !this.loop?.reducedMotion;
    }
    if (event.code === 'KeyP' && !event.repeat) this.setPaused(!this.paused);
  };
  private keyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault();
      this.discharge();
    }
  };
  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.options.onError?.(
      new Error(
        'The graphics context was lost. Reload the study to restart it.'
      )
    );
  };
  private updateComets(delta: number, moving: boolean) {
    if (moving) {
      this.accumulator += delta;
      while (this.accumulator >= FIXED_STEP) {
        this.orbitPhase +=
          FIXED_STEP * Math.max(0.15, this.mood.speed + this.stir);
        for (let id = 0; id < this.comets.length; id++) {
          if (id < 4 && this.mood.orbit) {
            stepSwarm(
              this.comets[id].missile,
              id,
              this.cells,
              FIXED_STEP,
              this.orbitPhase,
              this.mood.radius,
              this.mood.speed,
              this.hovered ? this.tile : null
            );
            continue;
          }
          const contact = stepMissile(
            this.comets[id].missile,
            id,
            this.cells,
            FIXED_STEP * (id < 4 ? this.mood.speed : 1),
            this.hovered ? this.tile : null
          );
          if (contact)
            this.strike(contact.direction, contact.strength * this.intensity);
        }
        this.accumulator -= FIXED_STEP;
      }
    }
    for (let id = 0; id < this.comets.length; id++) {
      const comet = this.comets[id],
        m = comet.missile;
      comet.head.visible = m.active;
      comet.glow.visible = m.active;
      comet.trail.visible = m.samples > 1 && (m.active || m.cooldown > 0.15);
      comet.head.position.set(...m.position);
      comet.head.scale.set(0.8, 0.8, 1.8);
      this.temp.copy(comet.head.position).add(new THREE.Vector3(...m.velocity));
      comet.head.lookAt(this.temp);
      comet.glow.position.copy(comet.head.position);
      comet.glow.quaternion.copy(this.camera.quaternion);
      comet.glow.material.uniforms.uOpacity.value =
        (1.1 + Math.sin(this.time * 23 + id) * 0.15) * this.rendering.glow;
      const positions = comet.trail.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
        const sample = Math.min(i, m.samples - 1),
          index = (m.cursor - sample + TRAIL_LENGTH) % TRAIL_LENGTH;
        const older = (index - 1 + TRAIL_LENGTH) % TRAIL_LENGTH;
        this.temp.fromArray(m.history, index * 3);
        this.tangent.fromArray(m.history, older * 3).sub(this.temp);
        if (this.tangent.lengthSq() < 0.00001)
          this.tangent.set(...m.velocity).negate();
        this.tangent.normalize();
        this.view.subVectors(this.camera.position, this.temp).normalize();
        const progress = i / TRAIL_SEGMENTS;
        const taper = m.active ? 1 : Math.min(1, m.cooldown * 3);
        this.side
          .crossVectors(this.tangent, this.view)
          .normalize()
          .multiplyScalar((0.035 + 0.05 * (1 - progress)) * taper);
        const flutter =
          Math.sin(progress * 45 - this.time * 18 + id) * 0.018 * progress;
        this.temp.addScaledVector(this.side, flutter * 10);
        positions.setXYZ(
          i * 2,
          this.temp.x + this.side.x,
          this.temp.y + this.side.y,
          this.temp.z + this.side.z
        );
        positions.setXYZ(
          i * 2 + 1,
          this.temp.x - this.side.x,
          this.temp.y - this.side.y,
          this.temp.z - this.side.z
        );
      }
      positions.needsUpdate = true;
    }
  }
  private shedWake(delta: number) {
    this.wakeAccumulator += delta;
    if (this.wakeAccumulator < 0.025) return;
    this.wakeAccumulator %= 0.025;
    for (const comet of this.comets) {
      const m = comet.missile;
      if (!m.active) continue;
      const spark = this.sparks[this.sparkCursor++ % SPARKS];
      spark.position.set(...m.position);
      spark.velocity.set(...m.velocity).multiplyScalar(-0.16);
      this.temp.set(
        Math.sin(this.sparkCursor * 2.4),
        Math.cos(this.sparkCursor * 1.7),
        Math.sin(this.sparkCursor * 0.9)
      );
      spark.velocity.addScaledVector(this.temp, 0.45);
      spark.duration = 0.23 + (this.sparkCursor % 7) * 0.04;
      spark.life = spark.duration;
    }
  }
  private updateSparks(delta: number) {
    if (!this.sparkPoints) return;
    const position = this.sparkPoints.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const life = this.sparkPoints.geometry.getAttribute(
      'aLife'
    ) as THREE.BufferAttribute;
    const streakPosition = this.sparkStreaks?.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const streakColour = this.sparkStreaks?.geometry.getAttribute(
      'color'
    ) as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i++) {
      const spark = this.sparks[i];
      if (spark.life > 0) {
        spark.life = Math.max(0, spark.life - delta);
        spark.velocity.multiplyScalar(Math.exp(-delta * 0.8));
        spark.position.addScaledVector(spark.velocity, delta);
        position.setXYZ(
          i,
          spark.position.x,
          spark.position.y,
          spark.position.z
        );
      }
      const fade = spark.life / spark.duration;
      life.setX(i, fade);
      if (streakPosition && streakColour) {
        streakPosition.setXYZ(
          i * 2,
          spark.position.x,
          spark.position.y,
          spark.position.z
        );
        this.temp
          .copy(spark.position)
          .addScaledVector(spark.velocity, -0.045 * fade);
        streakPosition.setXYZ(i * 2 + 1, this.temp.x, this.temp.y, this.temp.z);
        streakColour.setXYZ(i * 2, fade * 0.8, fade * 0.08, fade * 0.005);
        streakColour.setXYZ(i * 2 + 1, 0, 0, 0);
      }
    }
    position.needsUpdate = true;
    life.needsUpdate = true;
    if (streakPosition) streakPosition.needsUpdate = true;
    if (streakColour) streakColour.needsUpdate = true;
  }
  private frame = (delta: number, moving: boolean): void => {
    if (this.disposed || !this.renderer || !this.composer) return;
    this.time += delta;
    this.moodTime += delta;
    this.excitement = Math.max(0, this.excitement - delta * 0.025);
    this.stir *= Math.exp(-delta * 0.7);
    this.mood = fieldMood(this.moodTime, this.excitement, this.frenzyUntil);
    this.uniforms.uMood.value = THREE.MathUtils.damp(
      this.uniforms.uMood.value,
      this.mood.energy,
      3,
      delta
    );
    if (this.time - this.lastGesture > 1.35) this.combo = 0;
    this.coins?.update(delta, this.camera);
    this.canvas.dataset.mood = this.mood.name;
    this.canvas.dataset.coins = String(this.coins?.mesh.visible ?? false);
    if (this.holding) this.charge = Math.min(1, this.charge + delta * 0.62);
    this.aim
      .lerp(this.aimTarget, moving ? 1 - Math.exp(-delta * 9) : 1)
      .normalize();
    this.uniforms.uTime.value = this.time;
    this.uniforms.uCharge.value = this.charge;
    this.uniforms.uHover.value = THREE.MathUtils.damp(
      this.uniforms.uHover.value,
      this.hovered ? 1 : 0,
      12,
      moving ? delta : 1
    );
    this.uniforms.uSweep.value = THREE.MathUtils.damp(
      this.uniforms.uSweep.value,
      this.hovered ? this.pointerSpeed : 0,
      8,
      moving ? delta : 1
    );
    this.pointerSpeed *= Math.exp(-delta * 5);
    if (this.controls) {
      this.controls.enableDamping = moving;
      this.controls.update();
    }
    this.updateComets(delta, moving);
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const impact = this.impacts[i];
      if (impact) {
        this.uniforms.uImpacts.value[i].set(...impact.direction, impact.time);
        this.uniforms.uStrengths.value[i] = impact.strength;
      } else this.uniforms.uImpacts.value[i].w = -100;
    }
    if (moving) this.shedWake(delta);
    this.updateSparks(delta);
    this.updateImpactEffects(delta, moving);
    for (const shock of this.shocks) {
      const age = this.time - shock.born;
      shock.mesh.visible = age >= 0 && age < 1.4;
      shock.mesh.scale.setScalar(0.15 + (1 - Math.exp(-age * 3)) * 4.8);
      shock.mesh.material.uniforms.uAge.value = age;
      shock.mesh.material.uniforms.uOpacity.value =
        Math.exp(-age * 3) * shock.strength * 0.55;
    }
    if (this.halo) {
      this.halo.quaternion.copy(this.camera.quaternion);
      this.halo.material.uniforms.uOpacity.value =
        (0.08 + this.charge * 0.08) * this.rendering.glow;
    }
    this.baseCameraPosition.copy(this.camera.position);
    this.baseCameraQuaternion.copy(this.camera.quaternion);
    if (moving) {
      stepCamera(this.recoil, delta);
      const trauma = this.recoil.trauma ** 2;
      this.cameraShift.set(
        this.recoil.offset[0] + Math.sin(this.time * 63) * trauma * 0.035,
        this.recoil.offset[1] + Math.sin(this.time * 79 + 2) * trauma * 0.027,
        this.recoil.offset[2] - this.charge * 0.15
      );
      this.camera.position.add(this.cameraShift);
      this.camera.rotateZ(Math.sin(this.time * 47) * trauma * 0.006);
      this.camera.updateMatrixWorld();
    }
    this.renderer.info.reset();
    this.composer.render();
    this.canvas.dataset.recoil = (
      moving ? this.cameraShift.length() : 0
    ).toFixed(5);
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
    this.camera.updateMatrixWorld();
    const now = performance.now();
    if (moving && this.lastFrame > 0)
      this.frameAverage = THREE.MathUtils.lerp(
        this.frameAverage,
        Math.min(100, now - this.lastFrame),
        0.04
      );
    this.lastFrame = moving ? now : 0;
    // Adapt only after warm-up; never increase quality in a way that oscillates.
    if (
      moving &&
      ++this.adaptiveFrames > 240 &&
      this.frameAverage > 25 &&
      this.quality > 0.65
    ) {
      this.quality = Math.max(0.65, this.quality - 0.1);
      this.adaptiveFrames = 0;
      this.resize();
    }
    this.canvas.dataset.time = this.time.toFixed(3);
    this.canvas.dataset.impacts = String(this.impactCount);
    this.canvas.dataset.burst = String(this.burstLabel?.visible ?? false);
    this.canvas.dataset.hoverTile = String(this.hovered ? this.tile : -1);
    this.canvas.dataset.dragging = String(this.dragging);
    this.canvas.dataset.view = this.baseCameraPosition
      .toArray()
      .map((n) => n.toFixed(3))
      .join(',');
    if (
      now - this.reportAt >
        (this.holding || this.hovered || this.dragging ? 100 : 700) ||
      !moving
    ) {
      this.reportAt = now;
      this.report();
    }
  };
  private report() {
    if (this.disposed) return;
    this.onStatus({
      ready: !!this.renderer,
      paused: this.paused,
      reduced: this.loop?.reducedMotion ?? false,
      charge: this.charge,
      tile: this.hovered ? this.tile : -1,
      dragging: this.dragging,
      cells: this.cells.length,
      mood: this.mood.name,
      resonance: this.excitement,
      combo: this.combo,
      time: this.time,
      impacts: this.impactCount,
      frameMs: this.frameAverage,
      drawCalls: this.renderer?.info.render.calls ?? 0,
      pixels: `${this.canvas.width} × ${this.canvas.height}`,
    });
  }
  private invalidate = (): void => {
    this.loop?.invalidate();
  };
  private resize = (): void => {
    if (this.disposed || !this.renderer) return;
    this.updateSizes();
    const width = Math.max(1, this.sizes.width),
      height = Math.max(1, this.sizes.height);
    const ratio =
      Math.min(
        this.sizes.pixelRatio,
        1.5,
        Math.sqrt(1500000 / (width * height))
      ) * this.quality;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(width, height);
    this.bloom?.setSize(
      Math.round(width * ratio * 0.7),
      Math.round(height * ratio * 0.7)
    );
    this.uniforms.uPixelRatio.value = ratio;
    if (this.printPass) {
      this.printPass.uniforms.uSize.value.set(width * ratio, height * ratio);
      this.printPass.uniforms.uRatio.value = ratio;
    }
    this.camera.aspect = width / height;
    this.camera.fov =
      width < height
        ? THREE.MathUtils.radToDeg(
            2 *
              Math.atan(
                Math.tan(THREE.MathUtils.degToRad(42 / 2)) / (width / height)
              )
          )
        : 42;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };
  public saveStill(): void {
    if (this.disposed || !this.renderer || !this.composer) return;
    this.composer.render();
    this.canvas.toBlob((blob) => {
      if (!blob || this.disposed) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `helion-${this.time.toFixed(2)}s.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown, true);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.pointerCancel);
    this.canvas.removeEventListener('keydown', this.keyDown);
    this.canvas.removeEventListener('keyup', this.keyUp);
    this.canvas.removeEventListener('blur', this.cancelCharge);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    window.removeEventListener('blur', this.cancelCharge);
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
    if (this.audio) void this.audio.close();
    const disposedGeometry = new Set<THREE.BufferGeometry>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments
      ) {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (!disposedGeometry.has(object.geometry)) {
          object.geometry.dispose();
          disposedGeometry.add(object.geometry);
        }
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.labelTexture?.dispose();
    this.burstLabel?.material.dispose();
    this.scene.clear();
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}
