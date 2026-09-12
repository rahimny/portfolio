import * as THREE from 'three';
import { MastheadHandView } from './MastheadHandView';
import { MastheadProjectileView } from './MastheadProjectileView';
import type { HomeWorld } from '../../features/home/HomeWorld';
import { VoxelDrone } from '../experiences/can-control/VoxelDrone';
import { WRITING_NOZZLE_OFFSET } from '../../features/particle-text/DroneWriting';
import { HomeWatcherView } from './HomeWatcherView';
import { actorViewport } from '../../features/home/actorViewport';

function createPilot() {
  const drone = new VoxelDrone();
  const geometry = new THREE.BufferGeometry();
  const data = new Float32Array(80 * 3);
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(data, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const material = new THREE.PointsMaterial({
    color: 0x242628,
    size: 1.8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const plume = new THREE.Points(geometry, material);
  plume.frustumCulled = false;
  return { drone, geometry, data, material, plume };
}

/** Writers and hand share one renderer; the particle host owns their clock. */
export class MastheadActorsRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(
    0,
    1,
    1,
    0,
    -2000,
    2000
  );
  private readonly pilots: ReturnType<typeof createPilot>[] = [];
  private hand: MastheadHandView | null = null;
  private projectiles: MastheadProjectileView | null = null;
  private watcher: HomeWatcherView | null = null;
  private watcherRevision = -1;
  private pageTop = 0;
  private scrollY = NaN;
  private viewportHeight = 0;
  private bufferHeight = 0;
  private bufferWidth = 0;
  private bufferRatio = 0;
  private readonly modestDevice = navigator.hardwareConcurrency <= 4;
  private width = 1;
  private height = 1;
  private originX = 0;
  private originY = 0;
  private scale = 100;
  private disposed = false;
  private hidden = false;
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  constructor(canvas: HTMLCanvasElement, watcher = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5c5450, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-300, 500, 800);
    this.scene.add(key);
    for (let i = 0; i < 2; i++) {
      const pilot = createPilot();
      this.pilots.push(pilot);
      this.scene.add(pilot.drone.root, pilot.plume);
    }
    try {
      this.hand = new MastheadHandView();
      this.projectiles = new MastheadProjectileView();
      this.scene.add(this.hand.root, this.projectiles.root);
      if (watcher) {
        this.watcher = new HomeWatcherView();
        this.scene.add(this.watcher.root);
      }
      // Compile the skin/teleport programme before the writing clock begins.
      this.hand.root.visible = true;
      this.projectiles.root.visible = true;
      this.renderer.compile(this.scene, this.camera);
      this.hand.root.visible = false;
      this.projectiles.root.visible = false;
    } catch (error) {
      this.dispose();
      throw error;
    }
    canvas.style.opacity = '1';
  }

  setSize(
    width: number,
    height: number,
    originX: number,
    originY: number,
    scale: number,
    pageTop: number
  ) {
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
    this.scale = scale;
    this.pageTop = pageTop;
    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.left = `${-originX}px`;
    this.camera.right = width;
    this.updateViewport(true);
    this.pilots.forEach((pilot, id) => {
      pilot.drone.root.scale.setScalar(
        Math.max(57, Math.min(135, scale * (id ? 0.78 : 0.86)))
      );
      pilot.material.size = Math.max(1, scale * 0.01);
    });
  }

  private updateViewport(force = false) {
    if (
      !force &&
      this.scrollY === window.scrollY &&
      this.viewportHeight === window.innerHeight
    )
      return;
    this.scrollY = window.scrollY;
    this.viewportHeight = window.innerHeight;
    const view = actorViewport(
      this.width,
      this.height,
      this.pageTop,
      this.scrollY,
      this.viewportHeight,
      window.devicePixelRatio,
      this.modestDevice
    );
    if (
      this.bufferHeight !== view.height ||
      this.bufferWidth !== this.width ||
      this.bufferRatio !== view.ratio
    ) {
      this.renderer.setPixelRatio(view.ratio);
      this.renderer.setSize(this.width, view.height, false);
      this.bufferHeight = view.height;
      this.bufferWidth = this.width;
      this.bufferRatio = view.ratio;
    }
    this.renderer.domElement.style.height = `${view.height}px`;
    this.renderer.domElement.style.top = `${view.top - this.originY}px`;
    this.camera.top = this.height - view.top;
    this.camera.bottom = this.camera.top - view.height;
    this.camera.updateProjectionMatrix();
  }

  frameWorld(world: HomeWorld, headingVisible = true) {
    if (this.disposed) return;
    this.updateViewport();
    if (!world.active || !world.enabled) {
      this.hide();
      return;
    }
    this.pilots.forEach((pilot, id) => {
      const drone = world.drones[id];
      pilot.drone.root.visible =
        drone.visible && drone.x > -200 && drone.x < this.width + 200;
      pilot.plume.visible = false;
      if (!drone.visible) return;
      pilot.drone.root.scale.setScalar(drone.size);
      pilot.drone.update({
        body: {
          x: this.originX + drone.x,
          y: this.height - this.originY - drone.y,
          z: drone.depth,
        },
        angles: {
          x: 0.24 + drone.pitch,
          y: -0.35 + drone.roll * 0.65,
          z: drone.roll,
        },
        mountPitch: -0.3 - drone.pitch * 0.75 + drone.gazePitch,
        mountYaw: -drone.roll * 0.35 + drone.gazeYaw,
        rotor: drone.rotor,
      });
      if (drone.spray) {
        const bursting = world.writing?.burstStart != null;
        const x = this.originX + drone.nozzle.x;
        const y = this.height - this.originY - drone.nozzle.y;
        pilot.plume.visible = true;
        pilot.geometry.setDrawRange(0, 80);
        pilot.material.size = Math.max(1, this.scale * 0.01);
        for (let i = 0; i < 80; i++) {
          const t = (i / 80 + drone.time * 6.5) % 1;
          const angle = i * 2.39996 + id;
          const radius = t * this.scale * (bursting ? 0.36 : 0.08);
          pilot.data[i * 3] =
            x -
            t * this.scale * WRITING_NOZZLE_OFFSET.x +
            Math.cos(angle) * radius;
          pilot.data[i * 3 + 1] =
            y +
            t * this.scale * WRITING_NOZZLE_OFFSET.y +
            Math.sin(angle) * radius;
          pilot.data[i * 3 + 2] = 20;
        }
        pilot.geometry.attributes.position.needsUpdate = true;
        pilot.material.opacity =
          (bursting ? 0.3 : 0.17) + Math.sin(drone.time * 63 + id * 4) * 0.06;
      }
      // Reuse the writer's point pool for dirt, returning droplets towards
      // the last ink contact instead of running another particle renderer.
      if (drone.ink.dirt > 0.025) {
        const count = 3 + Math.floor(drone.ink.dirt * 9);
        const progress = Math.max(0, Math.min(1, drone.ink.age - 0.14));
        const travel = progress * progress * (3 - 2 * progress);
        const root = pilot.drone.root.position;
        const destinationX = this.originX + drone.ink.origin.x;
        const destinationY = this.height - this.originY - drone.ink.origin.y;
        for (let i = 0; i < count; i++) {
          const spread = Math.sin(i * 7.3) * 13;
          const x = root.x + spread;
          const y = root.y - 9 - (i % 3) * 3;
          pilot.data[i * 3] =
            x +
            (destinationX + spread - x) * travel +
            Math.sin(progress * Math.PI) * spread * 1.5;
          pilot.data[i * 3 + 1] =
            y +
            (destinationY - y) * travel -
            Math.sin(progress * Math.PI) * (16 + i * 2);
          pilot.data[i * 3 + 2] = 90;
        }
        pilot.geometry.setDrawRange(0, count);
        pilot.geometry.attributes.position.needsUpdate = true;
        pilot.material.size = 2.8;
        pilot.material.opacity =
          0.9 * (1 - Math.max(0, (progress - 0.8) / 0.2));
        pilot.plume.visible = true;
      }
    });
    const score = world.hand;
    const flights = world.projectiles;
    if (score)
      this.hand?.frame(score, this.originX, this.height - this.originY);
    else if (this.hand) this.hand.root.visible = false;
    this.projectiles?.frame(
      flights,
      this.originX,
      this.height - this.originY,
      this.scale
    );
    const canvas = this.renderer.domElement;
    this.watcher?.frame(
      world.watcher,
      this.originX,
      this.height - this.originY
    );
    if (this.watcher && this.watcherRevision !== world.watcher.revision) {
      this.watcherRevision = world.watcher.revision;
      canvas.dataset.watcher = world.watcher.moving ? 'stepping' : 'watching';
      canvas.dataset.watcherX = world.watcher.x.toFixed(2);
      canvas.dataset.watcherSteps = String(world.watcher.steps);
      canvas.dataset.watcherRevision = String(world.watcher.revision);
    }
    canvas.dataset.phase = world.writing
      ? 'writing'
      : (score?.phase ?? (flights.active ? 'seekers' : 'idle'));
    if (world.writing) canvas.dataset.shots = '0';
    else if (score) canvas.dataset.shots = String(score.shots);
    canvas.dataset.seekers = String(flights.launched);
    canvas.dataset.affected = String(flights.affected);
    canvas.dataset.activeSeekers = String(
      flights.items.filter((p) => p.active && p.kind === 'seeker').length
    );
    canvas.dataset.activeBullets = String(
      flights.items.filter((p) => p.active && p.kind === 'bullet').length
    );
    if (!headingVisible) {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(
        this.projection.multiplyMatrices(
          this.camera.projectionMatrix,
          this.camera.matrixWorldInverse
        )
      );
      let visible = false;
      this.scene.traverseVisible((object) => {
        if (
          !visible &&
          (object instanceof THREE.Mesh ||
            object instanceof THREE.Points ||
            object instanceof THREE.Line)
        )
          visible =
            !object.frustumCulled || this.frustum.intersectsObject(object);
      });
      if (!visible) {
        this.hide();
        return;
      }
    }
    canvas.style.opacity = '1';
    this.hidden = false;
    this.renderer.render(this.scene, this.camera);
  }

  hide() {
    if (this.disposed) return;
    if (!this.hidden) this.renderer.clear();
    this.hidden = true;
    this.renderer.domElement.style.opacity = '0';
    this.renderer.domElement.dataset.phase = 'idle';
    this.renderer.domElement.dataset.activeSeekers = '0';
    this.renderer.domElement.dataset.activeBullets = '0';
  }

  dispose() {
    if (this.disposed) return;
    this.hide();
    this.disposed = true;
    this.hand?.dispose();
    this.projectiles?.dispose();
    this.watcher?.dispose();
    for (const pilot of this.pilots) {
      pilot.drone.dispose();
      pilot.geometry.dispose();
      pilot.material.dispose();
    }
    this.scene.clear();
    this.renderer.dispose();
    if (!this.renderer.domElement.isConnected) this.renderer.forceContextLoss();
  }
}
