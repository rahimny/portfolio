import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { WatcherRig } from './WatcherRig';
import { observationPosition } from '@/features/surveillance/observation';
import { advanceMotion, createMotion } from '@/features/surveillance/motion';

export interface SurveillanceStatus {
  ready: boolean;
  paused: boolean;
  reduced: boolean;
  mode: string;
  x: number;
  y: number;
}
export const INITIAL_STATUS: SurveillanceStatus = {
  ready: false,
  paused: false,
  reduced: false,
  mode: 'Initialising',
  x: 0,
  y: 0,
};

export class SurveillanceExperience extends BaseExperience {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  private renderer?: THREE.WebGLRenderer;
  private rig?: WatcherRig;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private disposed = false;
  private paused = false;
  private active = false;
  private pointer = new THREE.Vector2();
  private motion = createMotion();
  private target = new THREE.Vector3();
  private travelTarget = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private aimPlane = new THREE.Plane();
  private lastReport = -1;
  private readonly onStatus: (status: SurveillanceStatus) => void;
  private readonly motionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: SurveillanceStatus) => void,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }

  async init(signal?: AbortSignal) {
    if (signal?.aborted || this.disposed) return;
    this.scene.background = new THREE.Color('#cc141a');
    this.scene.fog = new THREE.Fog('#cc141a', 19, 40);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.camera.position.set(6.5, 7.2, 12);
    this.camera.lookAt(0, 1.7, 0);
    this.scene.add(new THREE.HemisphereLight('#eddfd1', '#4c0b0d', 1.8));
    const key = new THREE.DirectionalLight('#fff0df', 4.5);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -6;
    key.shadow.camera.right = key.shadow.camera.top = 6;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0002;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#ffc4b0', 3.5);
    rim.position.set(2, 4, -4);
    this.scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: '#cc141a', toneMapped: false })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.32 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    this.rig = new WatcherRig();
    this.scene.add(this.rig.group);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.canvas.addEventListener('pointermove', this.onPointer);
    this.canvas.addEventListener('pointerdown', this.onPress);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    this.canvas.addEventListener('pointercancel', this.onLeave);
    this.canvas.addEventListener('keydown', this.onKey);
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.report();
  }

  private onPointer = (event: PointerEvent) => {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2
    );
    this.active = true;
    this.motion.idle = 0;
    this.loop?.invalidate();
  };
  private onPress = (event: PointerEvent) => {
    this.onPointer(event);
    this.canvas.focus({ preventScroll: true });
    this.startle();
  };
  private onLeave = (event: PointerEvent) => {
    // A lifted finger leaves no hovering pointer; retain its last deliberate target.
    if (event.type === 'pointerleave' && event.pointerType === 'touch') return;
    this.active = false;
    this.loop?.invalidate();
  };
  private onMotionChange = () => {
    this.report();
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault();
      this.setPaused(!this.paused);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.startle();
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-0.15, 0],
      ArrowRight: [0.15, 0],
      ArrowUp: [0, 0.15],
      ArrowDown: [0, -0.15],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    this.pointer.x = THREE.MathUtils.clamp(
      this.pointer.x + direction[0],
      -1,
      1
    );
    this.pointer.y = THREE.MathUtils.clamp(
      this.pointer.y + direction[1],
      -1,
      1
    );
    this.active = true;
    this.motion.idle = 0;
    this.loop?.invalidate();
  };
  public startle() {
    if (this.disposed || this.paused || this.motionQuery.matches) return;
    this.motion.startled = 1;
    this.motion.idle = 0;
    this.loop?.invalidate();
  }
  public setPaused(paused: boolean) {
    this.paused = paused;
    this.canvas.dataset.paused = String(paused);
    this.loop?.setPlaying(!paused);
    this.report();
  }
  public saveStill() {
    if (!this.renderer || this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.canvas.toBlob((blob) => {
      if (!blob || this.disposed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'surveillance.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  }
  private report() {
    if (this.disposed) return;
    this.onStatus({
      ready: true,
      paused: this.paused,
      reduced: this.motionQuery.matches,
      mode: this.motionQuery.matches
        ? 'Still observation'
        : this.paused
          ? 'Suspended'
          : this.rig?.mechanism.phase === 'bracing'
            ? 'Shifting load'
            : this.rig?.mechanism.phase === 'stepping'
              ? 'Stalking'
              : this.rig?.mechanism.phase === 'settling'
                ? 'Settling'
                : !this.active
                  ? 'Searching'
                  : this.motion.idle > 2
                    ? 'Fixated'
                    : 'Tracking',
      x: this.pointer.x,
      y: this.pointer.y,
    });
  }
  private frame = (dt: number, moving: boolean) => {
    if (!this.renderer || !this.rig || this.disposed) return;
    advanceMotion(this.motion, dt, this.pointer, this.active);
    if (this.motionQuery.matches && !this.paused) {
      this.motion.gazeX = this.pointer.x;
      this.motion.gazeY = this.pointer.y;
    }
    if (!this.paused) {
      const normal = this.camera.getWorldDirection(new THREE.Vector3());
      const centre = new THREE.Vector3(0, 2.7, 0).addScaledVector(normal, -6.5);
      this.aimPlane.setFromNormalAndCoplanarPoint(normal, centre);
      this.ray.setFromCamera(
        new THREE.Vector2(this.motion.gazeX, this.motion.gazeY),
        this.camera
      );
      this.ray.ray.intersectPlane(this.aimPlane, this.target);
      const right = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(this.camera.quaternion)
        .setY(0)
        .normalize();
      const forward = normal.clone().setY(0).normalize();
      const mobile = this.sizes.width / this.sizes.height < 0.75;
      if (this.active) {
        this.travelTarget
          .copy(right)
          .multiplyScalar(this.motion.gazeX * (mobile ? 0.85 : 2.7))
          .addScaledVector(forward, this.motion.gazeY * (mobile ? 1.25 : 2.4));
      } else {
        this.travelTarget
          .copy(right)
          .multiplyScalar(
            Math.sin(this.motion.time * 0.18) * (mobile ? 0.65 : 1.6)
          )
          .addScaledVector(forward, Math.sin(this.motion.time * 0.27) * 0.75);
      }
      if (this.active) {
        observationPosition(
          this.target,
          this.travelTarget.clone(),
          right,
          forward,
          mobile ? 0.85 : 3.2,
          3.94,
          this.travelTarget
        );
      }
    }
    this.rig.update(
      this.motion,
      this.target,
      dt,
      moving,
      this.motionQuery.matches && !this.paused,
      this.travelTarget
    );
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.gaze = this.motion.gazeX.toFixed(3);
    this.canvas.dataset.time = this.motion.time.toFixed(3);
    this.canvas.dataset.paused = String(this.paused);
    const mechanics = this.rig.mechanism;
    this.canvas.dataset.mechanics = JSON.stringify({
      yaw: mechanics.yaw.position,
      bodyPitch: mechanics.pitch.position,
      target: this.target.toArray(),
      aimError: this.rig.eye
        .getWorldDirection(new THREE.Vector3())
        .angleTo(
          this.target
            .clone()
            .sub(this.rig.eye.getWorldPosition(new THREE.Vector3()))
        ),
      destination: this.travelTarget.toArray(),
      position: mechanics.translation.toArray(),
      travel: mechanics.travelDistance,
      swingGroup: mechanics.swingGroup,
      speed: mechanics.velocity.length(),
      headYaw: mechanics.headYaw.position,
      headPitch: mechanics.headPitch.position,
      phase: mechanics.phase,
      steps: mechanics.stepCount,
      support: mechanics.supportMargin,
      feet: mechanics.legs.map((leg) => leg.foot.toArray()),
    });
    if (this.motion.time - this.lastReport > 0.15 || !moving) {
      this.lastReport = this.motion.time;
      this.report();
    }
  };
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const aspect = this.sizes.width / this.sizes.height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.75 ? 57 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(
      Math.min(
        this.sizes.pixelRatio,
        1.7,
        Math.sqrt(1800000 / (this.sizes.width * this.sizes.height))
      )
    );
    this.renderer?.setSize(this.sizes.width, this.sizes.height);
    this.loop?.invalidate();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerdown', this.onPress);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointercancel', this.onLeave);
    this.canvas.removeEventListener('keydown', this.onKey);
    this.motionQuery.removeEventListener('change', this.onMotionChange);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
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
      }
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    const textures = new Set<THREE.Texture>();
    materials.forEach((material) => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    this.scene.clear();
    this.renderer?.dispose();
  }
}
