import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { HandView } from './HandView';
import {
  HandSimulation,
  STEP,
  MAX_TICKS,
  parseTape,
  type Input,
  type Tape,
} from '@/features/autonomous-hand/simulation';
import { pose, socket, type PoseName } from '@/features/autonomous-hand/rig';
import { type Personality, type Phase } from '@/features/autonomous-hand/actor';
import type { GestureKind } from '@/features/autonomous-hand/commands';
export interface HandStatus {
  ready: boolean;
  phase: Phase;
  personality: Personality;
  pending: Personality;
  automatic: boolean;
  paused: boolean;
  reduced: boolean;
  time: number;
  result: string;
  events: string[];
  replaying: boolean;
  triangles: number;
  gesture: string;
  intention: string;
  agitation: number;
  interruptions: number;
  corrections: number;
  stamps: number;
  held: boolean;
}
export const INITIAL_STATUS: HandStatus = {
  ready: false,
  phase: 'rest',
  personality: 'deliberate',
  pending: 'deliberate',
  automatic: true,
  paused: false,
  reduced: false,
  time: 0,
  result: 'Waiting',
  gesture: '',
  intention: 'Everything has its place.',
  agitation: 0,
  interruptions: 0,
  corrections: 0,
  stamps: 0,
  held: false,
  events: [],
  replaying: false,
  triangles: 0,
};
export class AutonomousHandExperience extends BaseExperience {
  simulation = new HandSimulation();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(
    -4.4,
    4.4,
    3,
    -3,
    0.1,
    40
  );
  private renderer?: THREE.WebGLRenderer;
  private hand?: HandView;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private ink?: THREE.Points;
  private puck?: THREE.Mesh;
  private impactRing?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly puckFacing = new THREE.Quaternion(
    Math.SQRT1_2,
    0,
    0,
    Math.SQRT1_2
  );
  private stamps?: THREE.InstancedMesh;
  private stampCount = -1;
  private readonly stampTransform = new THREE.Object3D();
  private pointerId: number | null = null;
  private pointerOffset = new THREE.Vector2();
  private readonly downloads = new Map<string, ReturnType<typeof setTimeout>>();
  private bullets: THREE.Mesh[] = [];
  private muzzle?: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly projectileAxis = new THREE.Vector3(0, 0, 1);
  private readonly projectileDirection = new THREE.Vector3();
  private targetDebug = new THREE.Group();
  private socketMarker?: THREE.Mesh;
  private disposed = false;
  private staticPose: PoseName | 'performance' = 'performance';
  private feedback = true;
  private readonly inkColor = new THREE.Color(0x191815);
  private readonly hotColor = new THREE.Color(0xff3600);
  private readonly particleColor = new THREE.Color();
  private statusTime = -1;
  private commandSequence = 0;
  private playback?: Tape;
  private playbackIndex = 0;
  private playbackAccumulator = 0;
  private onStatus: (status: HandStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: HandStatus) => void,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }
  async init(signal?: AbortSignal): Promise<void> {
    if (this.disposed || signal?.aborted) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.setPixelRatio(Math.min(this.sizes.pixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0xeeeae3);
    this.camera.position.set(0, 0, 14);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x817666, 2.1));
    const light = new THREE.DirectionalLight(0xffffff, 2.7);
    light.position.set(-3, 5, 10);
    light.shadow.intensity = 0.35;
    light.shadow.radius = 4;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 5;
    light.shadow.camera.bottom = -5;
    light.shadow.bias = -0.001;
    light.shadow.normalBias = 0.035;
    this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 1.1);
    fill.position.set(4, -2, 3);
    this.scene.add(fill);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 20),
      new THREE.MeshStandardMaterial({ color: 0xeeeae3, roughness: 1 })
    );
    back.position.z = -0.9;
    back.receiveShadow = true;
    this.scene.add(back);
    this.hand = new HandView();
    this.scene.add(this.hand.group, this.hand.debug);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        new Float32Array(this.simulation.ink.points.length * 3),
        3
      )
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        new Float32Array(this.simulation.ink.points.length * 3),
        3
      )
    );
    this.ink = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 2.4,
        vertexColors: true,
        sizeAttenuation: false,
      })
    );
    this.ink.frustumCulled = false;
    this.scene.add(this.ink);
    this.puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.18, 64),
      new THREE.MeshStandardMaterial({
        color: 0x25231f,
        roughness: 0.45,
        metalness: 0.15,
      })
    );
    this.puck.rotation.x = Math.PI / 2;
    this.puck.castShadow = true;
    this.scene.add(this.puck);
    this.impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.13, 32),
      new THREE.MeshBasicMaterial({
        color: this.hotColor,
        transparent: true,
        depthWrite: false,
      })
    );
    this.impactRing.visible = false;
    this.scene.add(this.impactRing);
    const homeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.405, 0.415, 64),
      new THREE.MeshBasicMaterial({ color: 0x8b857c })
    );
    homeRing.position.set(
      this.simulation.puck.home.x,
      this.simulation.puck.home.y,
      -0.84
    );
    this.scene.add(homeRing);
    this.stamps = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.235, 0.34, 64, 1, 0, 5.65),
      new THREE.MeshBasicMaterial({
        color: this.inkColor,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      256
    );
    this.stamps.geometry.setAttribute(
      'stampPressure',
      new THREE.InstancedBufferAttribute(new Float32Array(256), 1)
    );
    (this.stamps.material as THREE.MeshBasicMaterial).onBeforeCompile = (
      shader
    ) => {
      shader.vertexShader =
        'attribute float stampPressure; varying float vStampPressure;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvStampPressure = stampPressure;'
        );
      shader.fragmentShader =
        'varying float vStampPressure;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= vStampPressure;'
        );
    };
    this.stamps.count = 0;
    this.stamps.frustumCulled = false;
    this.scene.add(this.stamps);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.235, 0.008, 6, 64),
      new THREE.MeshStandardMaterial({ color: 0xaaa59a, roughness: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.095;
    this.puck.add(ring);
    const dotGeometry = new THREE.SphereGeometry(0.038, 10, 8),
      dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff3600 });
    this.bullets = Array.from({ length: 24 }, () => {
      const m = new THREE.Mesh(dotGeometry, dotMaterial);
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.muzzle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 4),
      new THREE.MeshBasicMaterial({
        color: this.hotColor,
        transparent: true,
        depthWrite: false,
      })
    );
    this.muzzle.visible = false;
    this.scene.add(this.muzzle);
    this.socketMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3600, depthTest: false })
    );
    this.socketMarker.renderOrder = 20;
    this.targetDebug.add(this.socketMarker);
    for (const t of this.simulation.world.targets.values())
      for (const proxy of t.proxies) {
        const g =
          proxy.kind === 'sphere'
            ? new THREE.SphereGeometry(proxy.radius, 12, 8)
            : new THREE.BoxGeometry(
                proxy.max.x - proxy.min.x,
                proxy.max.y - proxy.min.y,
                proxy.max.z - proxy.min.z
              );
        const mesh = new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({
            color: 0x746a5b,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
          })
        );
        const c =
          proxy.kind === 'sphere'
            ? proxy.centre
            : {
                x: (proxy.min.x + proxy.max.x) / 2,
                y: (proxy.min.y + proxy.max.y) / 2,
                z: (proxy.min.z + proxy.max.z) / 2,
              };
        mesh.position.set(
          t.position.x + c.x,
          t.position.y + c.y,
          t.position.z + c.z
        );
        mesh.userData.target = t.id;
        mesh.userData.local = c;
        this.targetDebug.add(mesh);
      }
    this.targetDebug.visible = false;
    this.scene.add(this.targetDebug);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    document.addEventListener('visibilitychange', this.visibilityChange);
    window.addEventListener('blur', this.releaseOnBlur);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerEnd);
    this.canvas.addEventListener('pointercancel', this.pointerEnd);
    this.canvas.addEventListener('lostpointercapture', this.pointerEnd);
    this.resize();
    await this.loop.start();
    if (!this.disposed) this.publish();
  }
  private resize = (): void => {
    if (this.disposed) return;
    this.updateSizes();
    const aspect = this.sizes.width / Math.max(1, this.sizes.height);
    const width = Math.max(8.3, 4.1 * aspect),
      height = width / aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    if (this.ink)
      (this.ink.material as THREE.PointsMaterial).size =
        (0.027 * this.sizes.width) / width;
    this.renderer?.setSize(this.sizes.width, this.sizes.height);
    this.loop?.invalidate();
  };
  private frame = (dt: number, moving: boolean): void => {
    if (this.disposed) return;
    if (this.pointerId !== null && !this.canMove()) this.releasePointer();
    if (moving && this.staticPose === 'performance') {
      if (this.playback && !this.simulation.paused) {
        this.playbackAccumulator += Math.min(0.1, dt);
        while (
          this.playbackAccumulator >= STEP &&
          this.simulation.tick < this.playback.ticks
        ) {
          while (
            this.playbackIndex < this.playback.inputs.length &&
            this.playback.inputs[this.playbackIndex].tick ===
              this.simulation.tick
          )
            this.simulation.input(
              this.playback.inputs[this.playbackIndex++].input,
              false
            );
          this.simulation.step();
          this.playbackAccumulator -= STEP;
        }
        if (this.simulation.tick >= this.playback.ticks) {
          while (
            this.playbackIndex < this.playback.inputs.length &&
            this.playback.inputs[this.playbackIndex].tick ===
              this.simulation.tick
          ) {
            this.simulation.input(
              this.playback.inputs[this.playbackIndex++].input,
              false
            );
          }
          this.playback = undefined;
          this.simulation.paused = true;
          this.loop?.setPlaying(false);
          this.publish();
        }
      } else this.simulation.advance(dt);
    }
    if (this.simulation.tick >= MAX_TICKS) this.loop?.setPlaying(false);
    this.draw();
    if (this.simulation.actor.time - this.statusTime > 0.1 || dt === 0)
      this.publish();
  };
  private draw(): void {
    if (!this.renderer || !this.hand || !this.ink || !this.puck) return;
    const s = this.simulation,
      p =
        this.staticPose === 'performance'
          ? s.actor.pose
          : pose(this.staticPose);
    this.hand.update(p);
    if (this.stamps && this.stampCount !== s.puck.stamps.length) {
      this.stampCount = s.puck.stamps.length;
      this.stamps.count = this.feedback ? this.stampCount : 0;
      s.puck.stamps.forEach((mark, i) => {
        this.stampTransform.position.set(mark.x, mark.y, -0.85 + i * 0.00002);
        this.stampTransform.rotation.z = mark.angle;
        this.stampTransform.updateMatrix();
        this.stamps!.setMatrixAt(i, this.stampTransform.matrix);
        this.stamps!.geometry.getAttribute('stampPressure').setX(
          i,
          mark.pressure
        );
      });
      this.stamps.instanceMatrix.needsUpdate = true;
      this.stamps.geometry.getAttribute('stampPressure').needsUpdate = true;
    }
    if (this.stamps) this.stamps.visible = this.feedback;
    const positions = this.ink.geometry.getAttribute('position'),
      colors = this.ink.geometry.getAttribute('color');
    const inkColor = this.inkColor,
      hot = this.hotColor,
      color = this.particleColor;
    s.ink.points.forEach((point, i) => {
      const p = this.feedback ? point : s.ink.home[i];
      positions.setXYZ(
        i,
        p.x + s.ink.position.x,
        p.y + s.ink.position.y,
        p.z + s.ink.position.z
      );
      color.copy(inkColor).lerp(hot, this.feedback ? s.ink.heat[i] : 0);
      colors.setXYZ(i, color.r, color.g, color.b);
    });
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    const puck = this.feedback ? s.puck.position : s.puck.home;
    this.puck.position.set(puck.x, puck.y, puck.z);
    const impact = this.feedback ? Math.max(0, 1 - s.puck.impactAge / 0.12) : 0;
    this.puck.scale.set(1 + impact * 0.06, 1 - impact * 0.3, 1 + impact * 0.06);
    if (this.impactRing) {
      const age = s.puck.impactAge;
      this.impactRing.visible = this.feedback && age < 0.22;
      this.impactRing.position.set(
        s.puck.impactPoint.x,
        s.puck.impactPoint.y,
        0.16
      );
      this.impactRing.scale.setScalar(1 + Math.min(age, 0.22) * 18);
      this.impactRing.material.opacity = Math.max(0, 1 - age / 0.22);
    }
    const puckAngle = this.feedback ? s.puck.rotationAngle : 0;
    this.puck.quaternion
      .set(0, 0, Math.sin(puckAngle / 2), Math.cos(puckAngle / 2))
      .multiply(this.puckFacing);
    (this.puck.material as THREE.MeshStandardMaterial).color
      .copy(inkColor)
      .lerp(hot, this.feedback ? s.puck.heat * 0.7 : 0);
    this.bullets.forEach((m, i) => {
      const b = s.world.projectiles[i];
      m.visible = !!b && this.feedback;
      if (b) {
        m.position.set(b.position.x, b.position.y, b.position.z);
        m.scale.set(0.8, 0.8, 3.6);
        this.projectileDirection
          .set(b.velocity.x, b.velocity.y, b.velocity.z)
          .normalize();
        m.quaternion.setFromUnitVectors(
          this.projectileAxis,
          this.projectileDirection
        );
      }
    });
    const shot = s.actor.lastShot;
    if (this.muzzle) {
      const age = shot ? s.actor.time - shot.time : 10;
      this.muzzle.visible =
        !!shot &&
        age < 0.07 &&
        this.feedback &&
        this.staticPose === 'performance';
      if (shot && this.muzzle.visible) {
        const d = shot.direction;
        this.muzzle.position.set(
          shot.position.x + d.x * 0.14,
          shot.position.y + d.y * 0.14,
          shot.position.z + 0.02
        );
        this.muzzle.rotation.z = Math.atan2(d.y, d.x);
        this.muzzle.scale.set(0.25, 0.1, 1);
        this.muzzle.material.opacity = 1 - age / 0.07;
      }
    }
    const tip = socket(p).position;
    this.socketMarker?.position.set(tip.x, tip.y, tip.z);
    this.targetDebug.children.forEach((child) => {
      if (child.userData.target === 'puck') {
        const c = child.userData.local;
        child.position.set(puck.x + c.x, puck.y + c.y, puck.z + c.z);
      }
    });
    this.renderer.render(this.scene, this.camera);
  }
  private publish(): void {
    if (this.disposed) return;
    const a = this.simulation.actor;
    this.statusTime = a.time;
    const result = this.simulation.world.results.at(-1);
    this.canvas.dataset.tick = String(this.simulation.tick);
    this.canvas.dataset.shots = String(a.shotsFired);
    this.canvas.dataset.corrections = String(a.corrections);
    this.canvas.dataset.stamps = String(this.simulation.puck.stamps.length);
    this.canvas.dataset.replaying = String(!!this.playback);
    this.canvas.dataset.held = this.simulation.puck.heldBy ?? '';
    this.onStatus({
      ready: !!this.renderer,
      gesture: a.command?.action ?? '',
      intention: a.intention,
      agitation: a.agitation,
      interruptions: a.interruptions,
      corrections: a.corrections,
      stamps: this.simulation.puck.stamps.length,
      held: this.simulation.puck.heldBy === 'visitor',
      phase: a.phase,
      personality: a.personality,
      pending: a.requestedPersonality,
      automatic: a.automatic,
      paused: this.simulation.paused,
      reduced: this.loop?.reducedMotion ?? false,
      time: a.time,
      result:
        this.simulation.tick >= MAX_TICKS
          ? 'Recording limit / Reset to continue'
          : a.command?.action === 'shoot' && a.shotsFired
            ? `${a.shotsFired}/${a.burstSize} shots · ${a.outcome ?? 'firing'} / ${a.command.targetId}`
            : result
              ? `${result.kind} / ${result.targetId}`
              : 'Waiting',
      events: [
        ...a.events.map((e) => ({
          time: e.time,
          text: `${e.time.toFixed(2)} · ${e.kind} · ${e.actionId}`,
        })),
        ...this.simulation.world.results.slice(-5).map((r) => ({
          time: a.time,
          text: `${r.kind} · ${r.targetId} · ${r.actionId}`,
        })),
      ]
        .slice(-12)
        .map((e) => e.text)
        .reverse(),
      replaying: !!this.playback,
      triangles:
        (this.hand?.mesh.geometry.getAttribute('position').count ?? 0) / 3,
    });
  }
  private releaseOnBlur = (): void => {
    this.releasePointer();
  };
  private visibilityChange = (): void => {
    if (document.hidden) this.releasePointer();
  };
  private canMove(): boolean {
    return (
      !this.disposed &&
      !!this.renderer &&
      !this.playback &&
      !this.simulation.paused &&
      !this.loop?.reducedMotion &&
      this.staticPose === 'performance' &&
      this.simulation.tick < MAX_TICKS &&
      this.simulation.tape.inputs.length < 11998
    );
  }
  private pointerPoint(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      this.camera.left +
        ((e.clientX - r.left) / r.width) *
          (this.camera.right - this.camera.left),
      this.camera.top -
        ((e.clientY - r.top) / r.height) *
          (this.camera.top - this.camera.bottom)
    );
  }
  private pointerDown = (e: PointerEvent): void => {
    if (!this.canMove() || e.button !== 0 || this.pointerId !== null) return;
    const p = this.pointerPoint(e),
      puck = this.simulation.puck.position;
    if (p.distanceTo(new THREE.Vector2(puck.x, puck.y)) > 0.52) return;
    e.preventDefault();
    this.pointerOffset.set(puck.x - p.x, puck.y - p.y);
    if (
      this.input({ kind: 'puck', phase: 'begin', x: puck.x, y: puck.y }) !==
      'accepted'
    )
      return;
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
  };
  private pointerMove = (e: PointerEvent): void => {
    const p = this.pointerPoint(e).add(
      this.pointerId === null ? new THREE.Vector2() : this.pointerOffset
    );
    if (this.pointerId !== e.pointerId) {
      const puck = this.simulation.puck.position;
      this.canvas.style.cursor =
        this.canMove() && p.distanceTo(new THREE.Vector2(puck.x, puck.y)) < 0.52
          ? 'grab'
          : '';
      return;
    }
    if (!this.canMove()) {
      this.releasePointer();
      return;
    }
    this.input({
      kind: 'puck',
      phase: 'move',
      x: THREE.MathUtils.clamp(p.x, -3.15, 3.15),
      y: THREE.MathUtils.clamp(p.y, -1.7, 1.6),
    });
  };
  private pointerEnd = (e: PointerEvent): void => {
    if (this.pointerId === e.pointerId) this.releasePointer();
  };
  private releasePointer(): void {
    if (this.pointerId === null) return;
    const id = this.pointerId;
    this.pointerId = null;
    const p = this.simulation.puck.position;
    this.input({ kind: 'puck', phase: 'end', x: p.x, y: p.y });
    if (this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
    this.canvas.style.cursor = '';
  }
  movePuck(dx: number, dy: number): string {
    if (!this.canMove()) return 'Resume Performance to move the puck.';
    const p = this.simulation.puck.position;
    const x = THREE.MathUtils.clamp(p.x + dx, -3.15, 3.15),
      y = THREE.MathUtils.clamp(p.y + dy, -1.7, 1.6);
    const result = this.input({ kind: 'puck', phase: 'begin', x: p.x, y: p.y });
    if (result !== 'accepted') return result;
    return this.input({ kind: 'puck', phase: 'end', x, y });
  }
  input(input: Input): string {
    if (this.playback) return 'Replay is active';
    const result = this.simulation.input(input);
    this.publish();
    this.loop?.invalidate();
    return result;
  }
  perform(action: GestureKind, targetId: string): string {
    if (this.staticPose !== 'performance')
      return 'Choose Performance in pose inspection first.';
    if (this.loop?.reducedMotion)
      return 'Reduced motion is active. Inspect the static poses below.';
    if (this.simulation.paused) return 'Resume the performance first.';
    return this.input({
      kind: 'command',
      command: {
        id: `manual-${this.simulation.tick}-${++this.commandSequence}`,
        action,
        targetId,
      },
    });
  }
  setPaused(value: boolean): void {
    if (this.simulation.tick >= MAX_TICKS) return;
    this.releasePointer();
    this.simulation.paused = value;
    this.loop?.setPlaying(!value && this.staticPose === 'performance');
    this.publish();
  }
  setPose(value: PoseName | 'performance'): void {
    this.releasePointer();
    this.staticPose = value;
    this.loop?.setPlaying(value === 'performance' && !this.simulation.paused);
    this.loop?.invalidate();
  }
  setDebug(value: boolean): void {
    if (this.hand) this.hand.debug.visible = value;
    this.targetDebug.visible = value;
    this.loop?.invalidate();
  }
  setFeedback(value: boolean): void {
    this.feedback = value;
    this.stampCount = -1;
    this.loop?.invalidate();
  }
  reset(seed: number): void {
    if (this.disposed) return;
    this.releasePointer();
    this.stampCount = -1;
    this.simulation.dispose();
    this.simulation = new HandSimulation(seed);
    this.playback = undefined;
    this.playbackIndex = 0;
    this.playbackAccumulator = 0;
    this.commandSequence = 0;
    this.statusTime = -1;
    this.staticPose = 'performance';
    this.loop?.setPlaying(true);
    this.publish();
  }
  replay(raw: unknown): void {
    if (this.disposed) return;
    const tape = parseTape(raw);
    this.reset(tape.seed);
    this.playback = tape;
    this.simulation.tape.inputs = structuredClone(tape.inputs);
    this.publish();
  }
  exportTape(): Tape {
    this.releasePointer();
    return structuredClone(this.playback ?? this.simulation.tape);
  }
  saveComposition(): void {
    const marks = this.simulation.puck.stamps
      .map(
        (m) =>
          `<path d="M .34 0 A .34 .34 0 1 0 .274 .201 L .19 .139 A .235 .235 0 1 1 .235 0 Z" transform="translate(${m.x} ${-m.y}) rotate(${(-m.angle * 180) / Math.PI})" opacity="${m.pressure}"/>`
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="-4 -2.5 8 5"><title>Autonomous Hand — ${this.simulation.tape.seed}</title><rect x="-4" y="-2.5" width="8" height="5" fill="rgb(238,234,227)"/><g fill="rgb(25,24,21)">${marks}</g></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-composition-${this.simulation.tape.seed}.svg`;
    a.click();
    this.downloads.set(
      url,
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.downloads.delete(url);
      }, 1000)
    );
  }
  saveStill(): void {
    this.draw();
    const a = document.createElement('a');
    a.download = `autonomous-hand-${this.simulation.tape.seed}-${this.simulation.tick}.png`;
    a.href = this.canvas.toDataURL('image/png');
    a.click();
  }
  dispose(): void {
    if (this.disposed) return;
    this.releasePointer();
    this.disposed = true;
    for (const [url, timer] of this.downloads) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.downloads.clear();
    document.removeEventListener('visibilitychange', this.visibilityChange);
    window.removeEventListener('blur', this.releaseOnBlur);
    this.stamps?.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerEnd);
    this.canvas.removeEventListener('pointercancel', this.pointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.pointerEnd);
    this.canvas.style.cursor = '';
    this.loop?.dispose();
    this.observer?.disconnect();
    this.simulation.dispose();
    this.hand?.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object === this.hand?.mesh || object === this.hand?.debug) return;
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const m of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(m);
      }
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.scene.clear();
    this.renderer?.dispose();
  }
}
