import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  PowderWorld,
  M,
  type Tool,
  type SceneName,
  type Snapshot,
  type Discovery,
} from '@/features/aftermatter/model';

export interface AftermatterStatus {
  ready: boolean;
  paused: boolean;
  reduced: boolean;
  cells: number;
  tick: number;
  discoveries: Discovery[];
  reactions: number;
  frameMs: number;
  drawing: boolean;
}
export const INITIAL_STATUS: AftermatterStatus = {
  ready: false,
  paused: false,
  reduced: false,
  cells: 0,
  tick: 0,
  discoveries: [],
  reactions: 0,
  frameMs: 0,
  drawing: false,
};
const CELL = 1 / 16,
  WIDTH = 20,
  HEIGHT = 6;
const PALETTE = [
  0x000000, 0xc79850, 0x1679b8, 0xff661c, 0x68552c, 0x9582ad, 0x765035,
  0xbac941, 0x367b43, 0xff4212, 0x586476, 0xa3c5d0, 0xb5cf32, 0xa1d2e2,
  0x566477,
];
export class AftermatterExperience extends BaseExperience {
  readonly world = new PowderWorld();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private particles?: THREE.InstancedMesh;
  private glow?: THREE.InstancedBufferAttribute;
  private brush?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private disposed = false;
  private paused = false;
  private drawing = false;
  private pointerId: number | null = null;
  private tool: Tool = M.Sand;
  private radius = 4;
  private orbit = false;
  private speed = 1;
  private accumulator = 0;
  private paintAccumulator = 0;
  private lastReport = 0;
  private frameMs = 16.7;
  private lastTime = 0;
  private quality = 1;
  private slowFrames = 0;
  private aim = new THREE.Vector2(160, 87);
  private previousAim = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private point = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private colors = PALETTE.map((c) => new THREE.Color(c));
  private history: Snapshot[] = [];
  private audio?: AudioContext;
  private sound = false;
  private voices = new Set<OscillatorNode>();
  private lastSound = 0;
  private lastReactions = 0;
  private onStatus: (s: AftermatterStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (s: AftermatterStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
    this.world.loadScene('Terrarium');
  }
  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch {
      throw new Error(
        'Aftermatter needs WebGL 2. Enable hardware acceleration to enter the chamber.'
      );
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color(0x10151c);
    this.camera.position.set(0.8, 1.35, 17.8);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enabled = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 27;
    this.controls.minAzimuthAngle = -0.48;
    this.controls.maxAzimuthAngle = 0.48;
    this.controls.minPolarAngle = 1.12;
    this.controls.maxPolarAngle = 1.82;
    this.controls.addEventListener('change', this.invalidate);
    this.scene.add(new THREE.HemisphereLight(0xd1e5ff, 0x323547, 1.8));
    const key = new THREE.DirectionalLight(0xffe7c7, 2.7);
    key.position.set(-5, 8, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x76acff, 2.5);
    rim.position.set(6, 2, -1);
    this.scene.add(rim);
    this.buildChamber();
    const geometry = new THREE.BoxGeometry(CELL * 0.97, CELL * 0.97, CELL);
    this.glow = new THREE.InstancedBufferAttribute(
      new Float32Array(this.world.cells.length),
      1
    );
    geometry.setAttribute('aGlow', this.glow);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.48,
      metalness: 0.16,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aGlow; varying float vGlow;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvGlow = aGlow;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;'
        );
    };
    this.particles = new THREE.InstancedMesh(
      geometry,
      material,
      this.world.cells.length
    );
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.brush = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf5e9d2,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      })
    );
    this.brush.renderOrder = 10;
    this.scene.add(this.brush);
    this.updateBrush();
    const ringGeometry = new THREE.RingGeometry(0.97, 1, 80);
    for (let i = 0; i < 24; i++) {
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffb25d,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.visible = false;
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.35, 1.25)
    );
    this.composer.addPass(new OutputPass());
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.cancel);
    this.canvas.addEventListener('lostpointercapture', this.cancel);
    this.canvas.addEventListener('contextmenu', this.contextMenu);
    this.canvas.addEventListener('keydown', this.keyDown);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.visibility);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement!);
    this.resize();
    this.sync();
    if (signal?.aborted || this.disposed) {
      this.dispose();
      return;
    }
    await this.loop.start();
    if (!this.disposed) this.report();
  }
  private buildChamber() {
    const dark = new THREE.MeshStandardMaterial({
      color: 0x263343,
      roughness: 0.38,
      metalness: 0.7,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xa0a9ac,
      roughness: 0.32,
      metalness: 0.8,
    });
    const luminous = new THREE.MeshStandardMaterial({
      color: 0x67929e,
      emissive: 0x39717e,
      emissiveIntensity: 1.2,
    });
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry((w * WIDTH) / 14, (h * HEIGHT) / 8, d),
        material
      );
      mesh.position.set((x * WIDTH) / 14, (y * HEIGHT) / 8, z);
      this.scene.add(mesh);
      return mesh;
    };
    box(
      14.6,
      8.5,
      0.24,
      0,
      0,
      -0.48,
      new THREE.MeshStandardMaterial({
        color: 0x15202d,
        roughness: 0.8,
        metalness: 0.25,
      })
    );
    box(14.9, 0.32, 1.15, 0, -4.25, -0.1, dark);
    box(14.9, 0.17, 0.8, 0, 4.18, -0.2, dark);
    for (const side of [-1, 1]) {
      box(0.22, 8.5, 0.85, side * 7.3, 0, -0.1, dark);
      box(0.04, 7.8, 0.06, side * 7.16, 0, 0.35, luminous);
      box(0.7, 0.65, 1.2, side * 6.45, -4.65, -0.25, dark);
    }
    box(13.7, 0.045, 0.05, 0, -4.06, 0.47, metal);
    for (let i = 0; i < 24; i++) {
      const x = -6.7 + i * 0.58;
      box(0.19, 0.025, 0.18, x, -4.43, 0.42, metal);
    }
    const screwGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    for (const x of [-7.3, 7.3])
      for (const y of [-3.85, 3.85]) {
        const screw = new THREE.Mesh(screwGeometry, metal);
        screw.rotation.x = Math.PI / 2;
        screw.position.set((x * WIDTH) / 14, (y * HEIGHT) / 8, 0.36);
        this.scene.add(screw);
      }
    const lines: number[] = [];
    for (let x = -7; x <= 7; x += 0.5)
      lines.push(
        (x * WIDTH) / 14,
        -HEIGHT / 2,
        -0.33,
        (x * WIDTH) / 14,
        HEIGHT / 2,
        -0.33
      );
    for (let y = -4; y <= 4; y += 0.5)
      lines.push(
        -WIDTH / 2,
        (y * HEIGHT) / 8,
        -0.33,
        WIDTH / 2,
        (y * HEIGHT) / 8,
        -0.33
      );
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.scene.add(
      new THREE.LineSegments(
        grid,
        new THREE.LineBasicMaterial({
          color: 0x2a3a48,
          transparent: true,
          opacity: 0.45,
        })
      )
    );
  }
  private sync() {
    if (!this.particles || !this.glow) return;
    let count = 0;
    for (let i = 0; i < this.world.cells.length; i++) {
      const m = this.world.cells[i];
      if (!m) continue;
      const x = i % this.world.width,
        y = Math.floor(i / this.world.width),
        hash = Math.imul(i ^ (i >>> 9), 0x45d9f3b),
        jitter =
          ((Math.imul(hash ^ (hash >>> 13), 0x45d9f3b) >>> 0) % 101) / 100;
      const isGas = m === M.Fire || m === M.Steam || m === M.Smoke;
      this.dummy.position.set(
        (x + 0.5) * CELL - WIDTH / 2,
        (y + 0.5) * CELL - HEIGHT / 2,
        0.02 + (m === M.Water ? -0.015 : jitter * 0.045)
      );
      const size = isGas ? 0.5 + jitter * 0.45 : 1;
      this.dummy.scale.set(
        size,
        size,
        m === M.Stone
          ? 4.6
          : m === M.Wood
            ? 3.8
            : m === M.Plant
              ? 2.5
              : m === M.Water
                ? 1.7
                : m === M.Lava
                  ? 2.7
                  : 1.9 + jitter
      );
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(count, this.dummy.matrix);
      this.color.copy(this.colors[m]).multiplyScalar(0.78 + jitter * 0.36);
      if (m === M.Fire)
        this.color.lerp(
          this.colors[M.Sand],
          Math.min(1, this.world.life[i] / 110)
        );
      this.particles.setColorAt(count, this.color);
      this.glow.setX(
        count,
        m === M.Fire
          ? 0.9 + jitter * 0.6
          : m === M.Lava
            ? 1.7
            : m === M.Acid
              ? 0.24
              : m === M.Water
                ? 0.1
                : 0
      );
      count++;
    }
    this.particles.count = count;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor)
      this.particles.instanceColor.needsUpdate = true;
    this.glow.needsUpdate = true;
  }
  private frame = (dt: number, moving: boolean) => {
    if (this.disposed) return;
    const now = performance.now();
    if (this.lastTime && dt > 0)
      this.frameMs += (now - this.lastTime - this.frameMs) * 0.04;
    this.lastTime = now;
    if (moving) {
      this.accumulator += dt * this.speed;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps < 5) {
        if (this.drawing) {
          this.paintAccumulator++;
          if (this.paintAccumulator % 3 === 0)
            this.world.paint(this.aim.x, this.aim.y, this.radius, this.tool);
        }
        this.world.step();
        this.accumulator -= 1 / 60;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
      if (steps) this.sync();
    }
    for (let i = 0; i < this.rings.length; i++) {
      const b = this.world.blasts[i],
        ring = this.rings[i];
      ring.visible = !!b && moving;
      if (b) {
        const age = (this.world.tick - b.tick) / 30;
        ring.position.set(
          (b.x + 0.5) * CELL - WIDTH / 2,
          (b.y + 0.5) * CELL - HEIGHT / 2,
          0.5
        );
        ring.scale.setScalar(0.12 + age * 1.6);
        ring.material.opacity = (1 - age) * 0.5;
      }
    }
    if (this.world.reactions > this.lastReactions) {
      this.playSound(this.world.blasts.length > 0);
      this.lastReactions = this.world.reactions;
    }
    this.renderer?.info.reset();
    this.composer?.render();
    if (this.frameMs > 29 && moving) {
      this.slowFrames++;
      if (this.slowFrames > 120 && this.quality > 0.65) {
        this.quality *= 0.85;
        this.resize();
        this.slowFrames = 0;
      }
    } else this.slowFrames = 0;
    if (now - this.lastReport > 200 || !moving) {
      this.lastReport = now;
      this.report();
    }
  };
  private report() {
    if (this.disposed) return;
    const s: AftermatterStatus = {
      ready: !!this.renderer,
      paused: this.paused,
      reduced: this.loop?.reducedMotion ?? false,
      cells: this.particles?.count ?? 0,
      tick: this.world.tick,
      discoveries: [...this.world.discoveries],
      reactions: this.world.reactions,
      frameMs: this.frameMs,
      drawing: this.drawing,
    };
    this.canvas.dataset.tick = String(s.tick);
    this.canvas.dataset.cells = String(s.cells);
    this.canvas.dataset.reactions = String(s.reactions);
    this.canvas.dataset.drawing = String(s.drawing);
    this.onStatus(s);
  }
  private resize = () => {
    if (this.disposed || !this.renderer) return;
    this.updateSizes();
    const { width: w, height: h } = this.sizes;
    if (!w || !h) return;
    const dpr =
      Math.min(1.5, window.devicePixelRatio, Math.sqrt(1_350_000 / (w * h))) *
      this.quality;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.max(3.7, 11 / this.camera.aspect) / 17.8)
    );
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };
  private invalidate = () => this.loop?.invalidate();
  private locate(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1
      ),
      this.camera
    );
    if (!this.ray.ray.intersectPlane(this.plane, this.point)) return false;
    this.aim.set(
      (this.point.x + WIDTH / 2) / CELL,
      (this.point.y + HEIGHT / 2) / CELL
    );
    return this.world.inside(Math.floor(this.aim.x), Math.floor(this.aim.y));
  }
  private updateBrush() {
    if (!this.brush) return;
    this.brush.position.set(
      this.aim.x * CELL - WIDTH / 2,
      this.aim.y * CELL - HEIGHT / 2,
      0.5
    );
    this.brush.scale.setScalar(this.radius * CELL);
    this.brush.visible = !this.orbit;
    this.invalidate();
  }
  private pointerDown = (e: PointerEvent) => {
    if (this.orbit || e.button !== 0) return;
    if (this.pointerId !== null) {
      this.cancel();
      return;
    }
    if (!this.locate(e)) return;
    e.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.checkpoint();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.drawing = true;
    this.previousAim.copy(this.aim);
    this.world.paint(this.aim.x, this.aim.y, this.radius, this.tool);
    this.sync();
    this.updateBrush();
    this.report();
  };
  private pointerMove = (e: PointerEvent) => {
    if (this.orbit) return;
    const inside = this.locate(e);
    if (this.drawing && e.pointerId === this.pointerId && inside) {
      this.world.line(
        this.previousAim.x,
        this.previousAim.y,
        this.aim.x,
        this.aim.y,
        this.radius,
        this.tool
      );
      this.previousAim.copy(this.aim);
      this.sync();
    } else if (this.drawing && !inside) this.cancel();
    this.updateBrush();
  };
  private pointerUp = () => this.cancel();
  private cancel = () => {
    const id = this.pointerId;
    this.pointerId = null;
    this.drawing = false;
    if (id !== null && this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
    this.report();
  };
  private visibility = () => {
    if (document.hidden) {
      this.cancel();
      void this.audio?.suspend();
    } else if (this.sound) void this.audio?.resume();
  };
  private contextMenu = (e: Event) => e.preventDefault();
  private keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.setPaused(!this.paused);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      this.aim.x = THREE.MathUtils.clamp(
        this.aim.x +
          (e.key === 'ArrowLeft' ? -4 : e.key === 'ArrowRight' ? 4 : 0),
        1,
        this.world.width - 2
      );
      this.aim.y = THREE.MathUtils.clamp(
        this.aim.y + (e.key === 'ArrowDown' ? -4 : e.key === 'ArrowUp' ? 4 : 0),
        1,
        this.world.height - 2
      );
      this.updateBrush();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.pour();
    } else if (e.key === 'Escape') this.cancel();
  };
  setTool(tool: Tool) {
    this.cancel();
    this.tool = tool;
    this.updateBrush();
  }
  setRadius(r: number) {
    this.radius = Math.max(1, Math.min(14, r));
    this.updateBrush();
  }
  setSpeed(speed: number) {
    this.speed = speed;
  }
  setPaused(p: boolean) {
    this.cancel();
    this.paused = p;
    this.accumulator = 0;
    this.loop?.setPlaying(!p);
    this.report();
  }
  setOrbit(value: boolean) {
    this.cancel();
    this.orbit = value;
    if (this.controls) this.controls.enabled = value;
    this.updateBrush();
  }
  front() {
    this.camera.position.set(0.8, 1.35, 17.8);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
    this.invalidate();
  }
  pour() {
    this.checkpoint();
    this.world.paint(this.aim.x, this.aim.y, this.radius, this.tool);
    this.sync();
    this.invalidate();
    this.report();
  }
  step() {
    this.cancel();
    this.world.step();
    this.sync();
    this.invalidate();
    this.report();
  }
  private checkpoint() {
    this.history.push(this.world.snapshot());
    if (this.history.length > 8) this.history.shift();
  }
  undo() {
    const s = this.history.pop();
    if (!s) return;
    this.cancel();
    this.world.restore(s);
    this.lastReactions = this.world.reactions;
    this.sync();
    this.invalidate();
    this.report();
  }
  loadScene(scene: SceneName) {
    this.cancel();
    this.checkpoint();
    this.world.loadScene(scene);
    this.lastReactions = 0;
    this.accumulator = 0;
    this.sync();
    this.invalidate();
    this.report();
  }
  save() {
    localStorage.setItem(
      'aftermatter-chamber-v1',
      JSON.stringify(this.world.snapshot())
    );
  }
  load() {
    const raw = localStorage.getItem('aftermatter-chamber-v1');
    if (!raw) throw new Error('No saved chamber yet. Save one first.');
    const parsed: unknown = JSON.parse(raw);
    this.checkpoint();
    this.world.restore(parsed);
    this.lastReactions = this.world.reactions;
    this.cancel();
    this.sync();
    this.invalidate();
    this.report();
  }
  saveStill() {
    if (!this.renderer) return;
    this.composer?.render();
    const a = document.createElement('a');
    a.download = 'aftermatter.png';
    a.href = this.canvas.toDataURL('image/png');
    a.click();
  }
  setSound(enabled: boolean) {
    if (enabled && this.disposed) return;
    this.sound = enabled;
    if (enabled) {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } else {
      for (const v of this.voices) {
        v.stop();
      }
      this.voices.clear();
      void this.audio?.suspend();
    }
  }
  private playSound(blast: boolean) {
    if (
      !this.sound ||
      !this.audio ||
      this.paused ||
      this.loop?.reducedMotion ||
      this.voices.size > 5
    )
      return;
    const now = this.audio.currentTime;
    if (now - this.lastSound < 0.12) return;
    this.lastSound = now;
    const oscillator = this.audio.createOscillator(),
      gain = this.audio.createGain();
    oscillator.type = blast ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(blast ? 110 : 540, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      blast ? 35 : 220,
      now + 0.2
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(blast ? 0.12 : 0.025, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices.delete(oscillator);
    };
    oscillator.start();
    oscillator.stop(now + 0.28);
  }
  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.cancel);
    this.canvas.removeEventListener('contextmenu', this.contextMenu);
    this.canvas.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.setSound(false);
    void this.audio?.close();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.scene.clear();
    this.history = [];
  }
}
