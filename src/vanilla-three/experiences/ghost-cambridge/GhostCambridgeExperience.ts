import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  decodeSurvey,
  acquisitionOffset,
  localPosition,
  type Survey,
  type MapContext,
} from '@/features/ghost-cambridge/survey';
import { SurveyCloud } from './SurveyCloud';
import { SurveyDepthShading } from './SurveyDepthShading';
import { GeographicContext, type ProjectedLandmark } from './GeographicContext';
import { vertexShader, fragmentShader } from './shaders';

export const INITIAL_STATUS = {
  ready: false,
  paused: false,
  reduced: false,
  scan: 0.62,
  relief: 1.4,
  floor: 0,
  palette: 0,
  layer: 0,
  pointSize: 2,
  depthShading: 1,
  depthAvailable: true,
  count: 0,
  fullCount: 0,
  frameMs: 0,
  width: 0,
  height: 0,
  source: '',
  selected: '',
  view: 'cloud' as 'cloud' | 'map' | 'section',
  slice: 0.75,
  replay: 0,
  returnFilter: 0,
  fullTiles: 0,
  totalTiles: 0,
  allPoints: false,
  detailLoading: false,
  detailFailed: false,
  duration: 0,
  replayOffset: 0,
  context: null as MapContext | null,
  labels: [] as ProjectedLandmark[],
  highestPoint: null as Survey['highestPoint'] | null,
  cameraEast: 544425,
  cameraNorth: 258325,
  bearing: 0,
};
export type GhostStatus = typeof INITIAL_STATUS;
type Parameter =
  | 'relief'
  | 'floor'
  | 'pointSize'
  | 'depthShading'
  | 'palette'
  | 'layer'
  | 'slice'
  | 'replay'
  | 'returnFilter';
export class GhostCambridgeExperience extends BaseExperience {
  private scene = new THREE.Scene();
  private contextScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.02, 160);
  private renderer?: THREE.WebGLRenderer;
  private depthShading?: SurveyDepthShading;
  private controls?: OrbitControls;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private material?: THREE.ShaderMaterial;
  private cloud?: SurveyCloud;
  private geography?: GeographicContext;
  private survey?: Survey;
  private plane?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private status = { ...INITIAL_STATUS };
  private disposed = false;
  private time = 0;
  private lastFocusCheck = 0;
  private mapAmount = 0;
  private travel?: {
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromMap: number;
    toMap: number;
  };
  private down?: { x: number; y: number };
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
  private hit = new THREE.Vector3();
  private pointer = new THREE.Vector2();
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private onStatus: (status: GhostStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: GhostStatus) => void,
    options?: ExperienceOptions,
    allPoints = false
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
    this.status.allPoints = allPoints;
  }
  public async init(signal?: AbortSignal): Promise<void> {
    if (this.disposed || signal?.aborted) return;
    const [metadataResponse, pointResponse, contextResponse] =
      await Promise.all([
        fetch('/ghost-cambridge/survey.json', { signal }),
        fetch('/ghost-cambridge/points.bin', { signal }),
        fetch('/ghost-cambridge/context.json', { signal }),
      ]);
    if (!metadataResponse.ok || !pointResponse.ok || !contextResponse.ok)
      throw new Error(
        'The Cambridge survey could not be loaded. Please reload to try again.'
      );
    const [survey, buffer, context] = await Promise.all([
      metadataResponse.json() as Promise<Survey>,
      pointResponse.arrayBuffer(),
      contextResponse.json() as Promise<MapContext>,
    ]);
    if (this.disposed || signal?.aborted) return;
    this.survey = survey;
    const data = decodeSurvey(buffer, survey);
    Object.assign(this.status, {
      count: survey.count,
      fullCount: survey.cropCount,
      width: survey.bounds[2] - survey.bounds[0],
      height: survey.bounds[3] - survey.bounds[1],
      source: survey.sourceFile,
      context,
      highestPoint: survey.highestPoint,
      duration: (survey.gpsRange?.[1] ?? 0) - (survey.gpsRange?.[0] ?? 0),
      reduced: this.motion.matches,
    });
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setClearColor(0x050d10);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.depthShading = new SurveyDepthShading(this.renderer);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      alphaToCoverage: true,
      uniforms: {
        uRelief: { value: this.status.relief },
        uPointSize: { value: this.status.pointSize },
        uPointScale: { value: 1 },
        uScan: { value: this.status.scan },
        uWidth: { value: this.status.width / 100 },
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector2() },
        uPingTime: { value: -100 },
        uFloor: { value: 0 },
        uLayer: { value: 0 },
        uPalette: { value: 0 },
        uMap: { value: 0 },
        uSection: { value: 0 },
        uSlice: { value: this.status.slice },
        uReplay: { value: 0 },
        uReturnFilter: { value: 0 },
      },
    });
    this.cloud = new SurveyCloud(
      this.scene,
      this.material,
      survey,
      data,
      this.cloudChanged
    );
    this.status.totalTiles = survey.tiles?.length ?? 0;
    this.cloud.setAllPoints(this.status.allPoints);
    this.geography = new GeographicContext(
      this.contextScene,
      context,
      survey,
      data
    );
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.status.height / 100, 0.9),
      new THREE.MeshBasicMaterial({
        color: 0xefae73,
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.plane.rotation.y = Math.PI / 2;
    this.plane.position.y = 0.45;
    this.contextScene.add(this.plane);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 35;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.zoomSpeed = 0.7;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', this.cancelTravel);
    this.resetCamera(false, true);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerCancel);
    this.canvas.addEventListener('keydown', this.keyDown);
    this.motion.addEventListener('change', this.motionChange);
    this.resize();
    await this.loop.start();
    if (this.disposed || signal?.aborted) return;
    this.status.ready = true;
    this.report();
  }
  public setAllPoints(enabled: boolean) {
    this.status.allPoints = enabled;
    this.cloud?.setAllPoints(enabled);
    this.report();
    this.invalidate();
  }
  private cloudChanged = () => {
    if (this.disposed) return;
    const state = this.cloud?.state;
    if (state)
      Object.assign(this.status, {
        count: state.count,
        fullTiles: state.fullTiles,
        detailLoading: state.loading,
        detailFailed: state.failed,
      });
    this.report();
    this.invalidate();
  };
  private frame = (delta: number, moving: boolean): void => {
    if (!this.renderer || !this.material || !this.controls) return;
    const start = performance.now();
    if (moving) {
      this.time += delta;
      this.status.scan =
        (this.status.scan + delta * (this.status.replay ? 0.035 : 0.027)) % 1;
    }
    if (this.travel) {
      const travel = this.travel;
      const t = this.status.reduced
        ? 1
        : Math.min(1, (performance.now() - travel.start) / 900);
      const eased = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(travel.from, travel.to, eased);
      this.controls.target.lerpVectors(
        travel.fromTarget,
        travel.toTarget,
        eased
      );
      this.mapAmount = THREE.MathUtils.lerp(
        travel.fromMap,
        travel.toMap,
        eased
      );
      if (t === 1) this.travel = undefined;
      else this.invalidate();
    }
    this.controls.enableDamping = moving && !this.travel;
    this.controls.update();
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uScan.value = this.status.scan;
    this.material.uniforms.uMap.value = this.mapAmount;
    this.geography?.update(
      this.mapAmount,
      this.status.relief,
      this.status.palette,
      this.status.view === 'section'
    );
    if (this.plane) {
      this.plane.visible = this.status.view !== 'map' && !this.status.replay;
      this.plane.position.x =
        (((this.status.view === 'section'
          ? this.status.slice
          : this.status.scan) -
          0.5) *
          this.status.width) /
        100;
    }
    this.draw();
    this.status.frameMs =
      this.status.frameMs * 0.94 + (performance.now() - start) * 0.06;
    Object.assign(this.canvas.dataset, {
      scan: this.status.scan.toFixed(3),
      time: this.time.toFixed(3),
      points: String(this.status.count),
      fullTiles: String(this.status.fullTiles),
      allPoints: String(this.status.allPoints),
      floor: String(this.status.floor),
      layer: String(this.status.layer),
      palette: String(this.status.palette),
      view: this.status.view,
      selected: this.status.selected,
      replay: String(this.status.replay),
      slice: this.status.slice.toFixed(3),
      returnFilter: String(this.status.returnFilter),
      pointSize: String(this.status.pointSize),
      depthShading: String(
        this.status.depthAvailable ? this.status.depthShading : 0
      ),
    });
    if (
      !moving ||
      this.travel ||
      performance.now() - this.lastFocusCheck > 120
    ) {
      this.lastFocusCheck = performance.now();
      if (this.survey) {
        this.status.cameraEast =
          this.controls.target.x * 100 + this.survey.origin[0];
        this.status.cameraNorth =
          -this.controls.target.z * 100 + this.survey.origin[1];
        this.status.bearing =
          (this.controls.getAzimuthalAngle() * 180) / Math.PI;
        this.cloud?.updateFocus(
          this.status.cameraEast,
          this.status.cameraNorth,
          this.camera.position.distanceTo(this.controls.target)
        );
      }
    }
    this.status.bearing = (this.controls.getAzimuthalAngle() * 180) / Math.PI;
    this.report();
  };
  private report() {
    if (this.disposed) return;
    if (this.survey)
      this.status.replayOffset = acquisitionOffset(
        this.status.scan,
        this.survey
      );
    if (this.geography)
      this.status.labels = this.geography.project(
        this.camera,
        this.mapAmount,
        this.status.relief,
        this.sizes.width,
        this.sizes.height,
        this.status.selected,
        this.isHighestPointVisible()
      );
    this.onStatus({ ...this.status });
  }
  private isHighestPointVisible() {
    const point = this.status.highestPoint;
    if (!point || point.heightAboveGround < this.status.floor) return false;
    const { layer, returnFilter } = this.status;
    if (layer === 1 && ![3, 4, 5].includes(point.classification)) return false;
    if (layer === 2 && point.classification !== 2) return false;
    if (layer === 3 && point.classification !== 6) return false;
    return returnFilter === 0 || (point.returnKind & returnFilter) !== 0;
  }
  private invalidate = () => {
    this.loop?.invalidate();
  };
  private cancelTravel = () => {
    this.travel = undefined;
  };
  private motionChange = () => {
    this.status.reduced = this.motion.matches;
    this.report();
    this.invalidate();
  };
  public setPaused(paused: boolean) {
    this.status.paused = paused;
    this.loop?.setPlaying(!paused);
    this.report();
    this.invalidate();
  }
  public setScan(value: number) {
    this.status.scan = THREE.MathUtils.clamp(value, 0, 1);
    this.setPaused(true);
  }
  public setParameter(key: Parameter, value: number) {
    if (!Number.isFinite(value)) return;
    const limits = {
      relief: [1, 4],
      floor: [0, 40],
      pointSize: [1, 3],
      depthShading: [0, 1],
      palette: [0, 3],
      layer: [0, 3],
      slice: [0, 1],
      replay: [0, 1],
      returnFilter: [0, 2],
    };
    value = THREE.MathUtils.clamp(value, limits[key][0], limits[key][1]);
    if (['palette', 'layer', 'replay', 'returnFilter'].includes(key))
      value = Math.round(value);
    this.status[key] = value;
    if (this.material && key !== 'depthShading')
      this.material.uniforms['u' + key[0].toUpperCase() + key.slice(1)].value =
        value;
    this.report();
    this.invalidate();
  }
  private moveCamera(
    to: THREE.Vector3,
    target: THREE.Vector3,
    map: number,
    immediate = false
  ) {
    if (!this.controls) return;
    this.controls.enableDamping = false;
    this.controls.update();
    if (immediate || this.status.reduced) {
      this.camera.position.copy(to);
      this.controls.target.copy(target);
      this.mapAmount = map;
      this.travel = undefined;
      this.controls.update();
    } else
      this.travel = {
        start: performance.now(),
        from: this.camera.position.clone(),
        to,
        fromTarget: this.controls.target.clone(),
        toTarget: target,
        fromMap: this.mapAmount,
        toMap: map,
      };
    // A paused frame still loads detail after a direct landmark jump.
    if (this.survey)
      this.cloud?.updateFocus(
        target.x * 100 + this.survey.origin[0],
        -target.z * 100 + this.survey.origin[1],
        to.distanceTo(target)
      );
    this.report();
    this.invalidate();
  }
  public resetCamera(top = false, immediate = false) {
    this.status.selected = '';
    this.status.view = top ? 'map' : 'cloud';
    if (this.material) this.material.uniforms.uSection.value = 0;
    const position = new THREE.Vector3(
      top ? 0 : 9,
      top ? 19 : 10,
      top ? 0.01 : 12
    );
    if (this.sizes.width < 650)
      position.multiplyScalar(
        Math.max(1.05, (1.3 * this.sizes.height) / this.sizes.width)
      );
    this.moveCamera(
      position,
      new THREE.Vector3(0, 0.1, 0),
      top ? 1 : 0,
      immediate
    );
  }
  public focusLandmark(id: string) {
    const landmark = this.status.context?.landmarks.find(
      (item) => item.id === id
    );
    if (!landmark || !this.survey) return;
    this.status.selected = id;
    this.status.view = 'cloud';
    this.status.layer = 0;
    this.status.floor = 0;
    if (this.material) {
      this.material.uniforms.uSection.value = 0;
      this.material.uniforms.uLayer.value = 0;
      this.material.uniforms.uFloor.value = 0;
    }
    const target = new THREE.Vector3(
      ...localPosition(...landmark.position, 13, this.survey)
    );
    const distance = landmark.distance * (this.sizes.width < 650 ? 1.15 : 1);
    const offset = new THREE.Vector3(0.35, 0.65, 0.85)
      .normalize()
      .multiplyScalar(distance);
    this.moveCamera(target.clone().add(offset), target, 0);
  }
  public setView(view: GhostStatus['view']) {
    if (view === 'map' || view === 'cloud') {
      this.resetCamera(view === 'map');
      return;
    }
    this.status.view = 'section';
    this.status.selected = '';
    if (this.material) this.material.uniforms.uSection.value = 1;
    const x = ((this.status.slice - 0.5) * this.status.width) / 100;
    this.moveCamera(
      new THREE.Vector3(x + 8, 2.3, 0.01),
      new THREE.Vector3(x, 0.2, 0),
      0
    );
  }
  public ping(x = 0, z = 0) {
    if (!this.material) return;
    this.material.uniforms.uOrigin.value.set(x, z);
    this.material.uniforms.uPingTime.value =
      this.time - (this.status.paused || this.status.reduced ? 0.65 : 0);
    this.invalidate();
  }
  private pointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
  };
  private pointerCancel = () => {
    this.down = undefined;
  };
  private pointerUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = undefined;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5)
      return;
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.ground, this.hit))
      this.ping(this.hit.x, this.hit.z);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault();
      this.setPaused(!this.status.paused);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.setScan(
        this.status.scan + (event.key === 'ArrowLeft' ? -0.02 : 0.02)
      );
    } else if (event.key.toLowerCase() === 'r') this.resetCamera();
    else if (event.key === 'Enter') {
      event.preventDefault();
      this.ping(this.controls?.target.x, this.controls?.target.z);
    }
  };
  private resize = () => {
    if (this.disposed || !this.renderer) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    // A departing or temporarily hidden host can report an empty layout.
    // Preserve the last valid drawing buffer until a visible resize arrives.
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(
      this.sizes.pixelRatio,
      Math.sqrt(2200000 / Math.max(1, width * height))
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    if (this.material) this.material.uniforms.uPointScale.value = 1;
    this.depthShading?.resize(this.canvas.width, this.canvas.height, ratio);
    this.status.depthAvailable = this.depthShading?.available ?? false;
    this.report();
    this.invalidate();
  };
  private draw() {
    this.depthShading?.render(
      this.scene,
      this.contextScene,
      this.camera,
      this.status.depthShading * (1 - this.mapAmount)
    );
  }
  public async saveStill(): Promise<void> {
    if (!this.renderer || !this.material || this.disposed) return;
    const renderer = this.renderer,
      width = Math.round(2400 * Math.min(1, this.camera.aspect)),
      height = Math.round(width / this.camera.aspect),
      pointScale = width / this.canvas.width,
      exportRatio = renderer.getPixelRatio() * pointScale;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      this.material.uniforms.uPointScale.value = pointScale;
      this.depthShading?.resize(width, height, exportRatio);
      this.draw();
      const blob = await new Promise<Blob | null>((resolve) =>
        this.canvas.toBlob(resolve, 'image/png')
      );
      if (this.disposed) return;
      if (!blob) throw new Error('Image encoding failed');
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ghost-cambridge.png';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      if (!this.disposed) this.resize();
    }
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.travel = undefined;
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('start', this.cancelTravel);
    this.controls?.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('keydown', this.keyDown);
    this.motion.removeEventListener('change', this.motionChange);
    this.cloud?.dispose();
    this.geography?.dispose();
    this.material?.dispose();
    this.depthShading?.dispose();
    this.plane?.geometry.dispose();
    this.plane?.material.dispose();
    this.scene.clear();
    this.contextScene.clear();
    this.renderer?.dispose();
  }
}
