import * as THREE from 'three';
import type { IExperience } from '@/vanilla-three/types';
import {
  buildScore,
  presetPath,
  WALL,
  STEP,
  type Path,
  type Point,
  type Settings,
} from '@/features/can-control/model';

import {
  DEFAULT_STROKE_STYLE,
  styleScore,
  type StrokeStyle,
} from '@/features/can-control/stroke-style';
import {
  Performer,
  nozzleTransform,
  type PlaybackRate,
} from '@/features/can-control/performer';
import { WetPaint, type PaintSnapshot } from '@/features/can-control/wet-paint';
import {
  ART_SETTINGS,
  artworkScore,
  isArtwork,
  type Selection,
} from '@/features/can-control/compositions';
import { TrainYard } from './TrainYard';
import { YardCamera, type YardView } from './YardCamera';
import { VoxelDrone } from './VoxelDrone';

export type CanStatus = {
  ready: boolean;
  paused: boolean;
  complete: boolean;
  phase: string;
  recoverable: boolean;
  view?: YardView;
};

const fragmentShader = `
  uniform sampler2D pigment;
  uniform sampler2D wetSurface;
  vec2 reservoir(vec2 uv) {
    vec2 size = vec2(256., 192.);
    vec2 p = uv * size - .5;
    vec2 cell = floor(p), f = fract(p);
    vec2 a = texture2D(wetSurface, (cell + .5) / size).rg;
    vec2 b = texture2D(wetSurface, (cell + vec2(1.5, .5)) / size).rg;
    vec2 c = texture2D(wetSurface, (cell + vec2(.5, 1.5)) / size).rg;
    vec2 d = texture2D(wetSurface, (cell + 1.5) / size).rg;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 wet = reservoir(vUv);
    float mass = texture2D(pigment, vUv).r + wet.r;
    float fine = hash(floor(vUv * vec2(1900., 1425.)));
    float aggregate = hash(floor(vUv * vec2(720., 540.)));
    float pores = smoothstep(.94, 1., aggregate);

    // Optical depth is evaluated after accumulation. Grain stays in wall space.
    float opacity = 1. - exp(-mass * 26. * (.5 + fine * 1.1 - pores * .08));
    // A restrained fixed-light sheen fades with solvent; grain never animates.
    float sheen = (1. - exp(-wet.g * 3.)) * (.45 + .55 * fine);
    vec3 ink = mix(vec3(.014, .016, .019), vec3(.024, .028, .031), sheen);
    gl_FragColor = vec4(ink, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class CanControlExperience implements IExperience {
  private readonly canvas: HTMLCanvasElement;
  private readonly onStatus: (status: CanStatus) => void;
  private renderer?: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private view?: YardCamera;
  private get camera() {
    return this.view!.camera;
  }
  private readonly yard = new TrainYard();
  private environmentTime = 0;
  private playbackRate: PlaybackRate = 1;
  private inFrame = false;
  private readonly field = new WetPaint();
  private readonly texture = new THREE.DataTexture(
    this.field.density,
    this.field.width,
    this.field.height,
    THREE.RedFormat,
    THREE.FloatType
  );
  private readonly wetTexture = new THREE.DataTexture(
    this.field.surface,
    this.field.wetWidth,
    this.field.wetHeight,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  private readonly drone = new VoxelDrone();
  private readonly raycaster = new THREE.Raycaster();
  private readonly wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly guideGeometry = new THREE.BufferGeometry();
  private guide?: THREE.Line;
  private shadow?: THREE.Mesh;
  private readonly owned: { dispose(): void }[] = [
    this.texture,
    this.wetTexture,
    this.guideGeometry,
    this.drone,
    this.yard,
  ];
  private programme = new Performer(
    styleScore(
      artworkScore('hush', ART_SETTINGS),
      ART_SETTINGS,
      DEFAULT_STROKE_STYLE,
      [0, 6, 8]
    ),
    ART_SETTINGS.cap
  );
  private lastPiece?: {
    paint: PaintSnapshot;
    programme: Performer;
    environmentTime: number;
  };
  private disposed = false;
  private ready = false;
  private paused = false;
  private editing = false;
  private contextLost = false;
  private inView = true;
  private raf = 0;
  private previousTime = 0;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private reducedMotion?: MediaQueryList;
  private lastPhase = '';
  private filmVersion = -1;
  private surfaceVersion = -1;

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: CanStatus) => void
  ) {
    this.canvas = canvas;
    this.onStatus = onStatus;
  }

  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    // Scene-owned background survives WebGLRenderer rebuilding its state.
    this.scene.background = new THREE.Color(0x344951);
    this.scene.fog = new THREE.FogExp2(0x344951, 0.026);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('keydown', this.cameraKeys);
    this.view = new YardCamera(this.canvas, this.invalidateView, () =>
      this.publish()
    );
    this.scene.add(this.yard.root);
    for (const texture of [this.texture, this.wetTexture]) {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
    }
    const geometry = new THREE.PlaneGeometry(WALL.width, WALL.height);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        pigment: { value: this.texture },
        wetSurface: { value: this.wetTexture },
      },
      vertexShader:
        'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader,
    });
    this.owned.push(geometry, material);
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(WALL.width / 2, WALL.height / 2, 0);
    this.scene.add(wall);
    this.scene.add(new THREE.HemisphereLight(0xb7d3e1, 0x414532, 2.2));
    const light = new THREE.DirectionalLight(0xc8dce6, 2.1);
    light.position.set(-4, 9, 6);
    light.target.position.set(1.6, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, {
      left: -9,
      right: 9,
      top: 8,
      bottom: -8,
      near: 0.5,
      far: 35,
    });
    light.shadow.normalBias = 0.035;
    this.owned.push(light.shadow);
    this.scene.add(light.target);
    this.scene.add(light);
    this.makeNozzle();

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.wake();
    });
    this.intersectionObserver.observe(this.canvas);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', this.motionChanged);
    document.addEventListener('visibilitychange', this.wake);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.onContextRestored
    );
    if (this.reducedMotion.matches) {
      this.programme.finish(
        this.field.deposit,
        () => {
          this.field.step();
          this.environmentTime += STEP;
        },
        this.field.isWet
      );
      this.paused = true;
      this.uploadPaint();
    }
    this.ready = true;
    this.resize();
    this.publish();
    this.wake();
  }

  private makeNozzle() {
    this.scene.add(this.drone.root);
    this.drone.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    this.guideGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3)
    );
    const guideMaterial = new THREE.LineBasicMaterial({
      color: 0xff3600,
      transparent: true,
      opacity: 0.35,
    });
    this.owned.push(guideMaterial);
    this.guide = new THREE.Line(this.guideGeometry, guideMaterial);
    this.scene.add(this.guide);
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    const shadowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { strength: { value: 0.18 } },
      vertexShader:
        'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader:
        'varying vec2 vUv; uniform float strength; void main() { float r = length((vUv - .5) * vec2(2., 1.4)); gl_FragColor = vec4(0., 0., 0., strength * exp(-r*r*12.)); }',
    });
    this.owned.push(shadowGeometry, shadowMaterial);
    this.shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.scene.add(this.shadow);
  }

  play(
    preset: Selection,
    settings: Settings,
    customPath?: Path,
    overpaint = false,
    style?: StrokeStyle
  ) {
    if (this.disposed || !this.ready || this.contextLost) return;
    let score = customPath
      ? buildScore(customPath, settings)
      : isArtwork(preset)
        ? artworkScore(preset, settings)
        : buildScore(
            presetPath(preset),
            settings,
            !style && preset === 'flare' ? 'flare' : 'follow',
            !style && preset === 'specimen'
          );
    if (style)
      score = styleScore(
        score,
        settings,
        style,
        customPath
          ? undefined
          : preset === 'hush'
            ? [0, 6, 8]
            : preset === 'specimen'
              ? [presetPath(preset).length - 1]
              : undefined
      );
    this.lastPiece = {
      paint: this.field.snapshot(),
      programme: this.programme,
      environmentTime: this.environmentTime,
    };
    this.programme = new Performer(
      score,
      settings.cap,
      this.programme.flightState
    );
    if (!overpaint) this.field.clear();
    this.uploadPaint();
    this.view?.setEditing(false);
    this.editing = false;
    this.paused = false;
    this.publish();
    this.wake();
  }
  setPlaybackRate(rate: PlaybackRate) {
    this.playbackRate = rate;
  }
  togglePause() {
    if (this.disposed) return;
    this.paused = !this.paused;
    this.publish();
    this.wake();
  }
  setEditing(editing: boolean) {
    this.editing = editing;
    this.view?.setEditing(editing);
    this.render();
    this.publish();
    this.wake();
  }
  showResult() {
    if (this.disposed) return;
    this.programme.finish(
      this.field.deposit,
      () => {
        this.field.step();
        this.environmentTime += STEP;
      },
      this.field.isWet
    );
    this.uploadPaint();
    this.paused = true;
    this.render();
    this.publish();
    this.wake();
  }
  restore() {
    if (!this.lastPiece || this.disposed) return;
    const current = {
      paint: this.field.snapshot(),
      programme: this.programme,
      environmentTime: this.environmentTime,
    };
    this.field.restore(this.lastPiece.paint);
    this.programme = this.lastPiece.programme;
    this.environmentTime = this.lastPiece.environmentTime;
    this.lastPiece = current;
    this.paused = true;
    this.uploadPaint();
    this.render();
    this.publish();
    this.wake();
  }
  wallPoint(x: number, y: number): Point | null {
    this.raycaster.setFromCamera(
      new THREE.Vector2(x * 2 - 1, 1 - y * 2),
      this.camera
    );
    const point = this.raycaster.ray.intersectPlane(
      this.wallPlane,
      new THREE.Vector3()
    );
    if (
      !point ||
      point.x < 0 ||
      point.x > WALL.width ||
      point.y < 0 ||
      point.y > WALL.height
    )
      return null;
    return { x: point.x, y: point.y };
  }
  project(point: Point) {
    const p = new THREE.Vector3(point.x, point.y, 0).project(this.camera);
    return { x: (p.x + 1) * 500, y: (1 - p.y) * 375 };
  }
  private resize = () => {
    if (this.disposed || !this.renderer) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    this.view?.resize(width / height);
    this.render();
    if (this.editing) this.publish();
  };
  private uploadPaint(force = false) {
    if (force || this.filmVersion !== this.field.filmVersion) {
      this.texture.needsUpdate = true;
      this.filmVersion = this.field.filmVersion;
    }
    if (force || this.surfaceVersion !== this.field.surfaceVersion) {
      this.wetTexture.needsUpdate = true;
      this.surfaceVersion = this.field.surfaceVersion;
    }
  }
  private get complete() {
    return this.programme.complete && !this.field.isWet();
  }
  private phaseLabel() {
    const labels = {
      approach: 'Approaching. Valve closed.',
      align: 'Aligning the can. Valve closed.',
      paint: 'Painting.',
      lift: 'Lifting away. Valve closed.',
      inspect: 'Inspecting the specimen. Valve closed.',
      rest: this.field.isWet()
        ? 'Paint drying. Valve closed.'
        : 'Specimen complete.',
    };
    return labels[this.programme.phase];
  }
  private publish() {
    if (this.disposed) return;
    const phase = this.contextLost
      ? 'Graphics interrupted. Waiting to recover.'
      : this.editing
        ? 'Drawing path. Paint is paused.'
        : this.complete
          ? 'Specimen complete.'
          : this.paused
            ? 'Paused.'
            : this.phaseLabel();
    this.lastPhase = phase;
    this.onStatus({
      ready: this.ready && !this.contextLost,
      paused: this.paused,
      complete: this.complete,
      phase,
      recoverable: Boolean(this.lastPiece),
      view: this.view?.view ?? 'yard',
    });
  }
  private motionChanged = () => {
    if (this.reducedMotion?.matches) this.showResult();
  };
  private canAnimate() {
    return (
      this.ready &&
      !this.disposed &&
      !this.contextLost &&
      !document.hidden &&
      this.inView &&
      !this.paused &&
      !this.editing &&
      !this.complete
    );
  }
  private cameraKeys = (event: KeyboardEvent) => {
    if (this.editing) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-0.12, 0],
      ArrowRight: [0.12, 0],
      ArrowUp: [0, -0.1],
      ArrowDown: [0, 0.1],
    };
    if (moves[event.key]) {
      event.preventDefault();
      if (event.shiftKey) this.view?.pan(...moves[event.key]);
      else this.orbit(...moves[event.key]);
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      this.zoom(event.key === '-' ? 1.18 : 0.85);
    } else if (event.key === '0') {
      event.preventDefault();
      this.setView('yard');
    }
  };
  setView(view: Exclude<YardView, 'manual'>) {
    this.view?.setView(view, this.reducedMotion?.matches);
  }
  orbit(horizontal: number, vertical: number) {
    this.view?.nudge(horizontal, vertical);
  }
  zoom(scale: number) {
    this.view?.zoom(scale);
  }
  private canRender() {
    return (
      this.ready &&
      !this.disposed &&
      !this.contextLost &&
      !document.hidden &&
      this.inView
    );
  }
  private invalidateView = () => {
    if (!this.inFrame && this.canRender() && !this.raf)
      this.raf = requestAnimationFrame(this.frame);
  };
  private wake = () => {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.previousTime = 0;
    if (this.canRender() && (this.canAnimate() || this.view?.moving))
      this.raf = requestAnimationFrame(this.frame);
  };
  private frame = (now: number) => {
    this.raf = 0;
    if (!this.canRender()) return;
    this.inFrame = true;
    const dt = this.previousTime
      ? Math.min(0.1, (now - this.previousTime) / 1000)
      : 0;
    this.previousTime = now;
    if (this.canAnimate()) {
      this.programme.advance(
        dt,
        this.field.deposit,
        () => {
          this.field.step();
          this.environmentTime += STEP;
        },
        this.field.isWet,
        this.playbackRate
      );
      if (dt) this.uploadPaint();
    }
    this.view?.update(dt || 1 / 60, this.programme.renderRig.body);
    this.render();
    const phase = this.phaseLabel();
    if (!this.paused && !this.editing && phase !== this.lastPhase)
      this.publish();
    this.inFrame = false;
    if (this.canAnimate() || this.view?.moving)
      this.raf = requestAnimationFrame(this.frame);
  };
  private render() {
    if (this.disposed || this.contextLost || !this.renderer) return;
    const rig = this.programme.renderRig;
    const nozzle = nozzleTransform(rig);
    this.drone.update(rig);
    this.yard.update(this.environmentTime, rig.body);
    this.drone.root.visible = !this.editing;
    if (this.shadow) {
      this.shadow.visible = !this.editing;
      this.shadow.position.set(
        rig.body.x + rig.body.z * 0.15,
        rig.body.y - rig.body.z * 0.23,
        0.002
      );
      this.shadow.scale.setScalar(0.38 + rig.body.z * 0.4);
    }
    if (this.guide) {
      this.guide.visible =
        Boolean(this.programme.valve) &&
        !this.editing &&
        !this.programme.complete;
      const positions = this.guideGeometry.getAttribute('position');
      positions.setXYZ(0, nozzle.origin.x, nozzle.origin.y, nozzle.origin.z);
      positions.setXYZ(1, nozzle.impact.x, nozzle.impact.y, 0.003);
      positions.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.publish();
    this.wake();
  };
  private onContextRestored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    this.uploadPaint(true);
    this.resize();
    this.publish();
    this.wake();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.reducedMotion?.removeEventListener('change', this.motionChanged);
    document.removeEventListener('visibilitychange', this.wake);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.onContextRestored
    );
    this.canvas.removeEventListener('keydown', this.cameraKeys);
    this.view?.dispose();
    this.owned.forEach((resource) => resource.dispose());
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.lastPiece = undefined;
  }
}
