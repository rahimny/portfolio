import { LivingNursery } from './LivingNursery';
import { CaretakerRig } from './CaretakerRig';
import { NURSERY_BEDS } from './AtelierFibres';
import {
  DEFAULT_LIVING_CONTROLS,
  livingControls,
  type LivingControls,
} from '@/features/matter-atelier/living';
import { FactoryProduction, type FactoryFrame } from './FactoryProduction';
import { FactoryMechanisms } from './FactoryMechanisms';
import { EditionArchive } from './EditionArchive';
import { CreativeLab } from './CreativeLab';
import { PainterRig } from './PainterRig';
import { PaintedSurface } from './PaintedSurfaceNode';
import { FloorPainting, sampleBrush } from '@/features/matter-atelier/painting';
import {
  PRINTER,
  BRUSH_BASE,
  OBJECT_SCALE,
  type PipelineStage,
  type Treatment,
} from '@/features/matter-atelier/process';
import { batchStaticMeshes, disposeScene } from './sceneResources';
import { PrinterRig } from './PrinterRig';
import { FilamentSculpture } from './FilamentSculpture';
import { Studio } from './Studio';
import {
  FINISH_DURATION,
  FINISH_APPROACH,
  FINISH_SWEEP,
  sampleProcess,
} from '@/features/matter-atelier/process';
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  generateContours,
  planPrint,
  samplePrint,
  type Form,
  type PrintJob,
} from '@/features/matter-atelier/toolpath';

export type AtelierWorld = 'atelier' | 'bioelectric' | 'signal';
export const INITIAL_STATUS = {
  world: 'atelier' as AtelierWorld,
  flora: true,
  communication: true,
  parentSeed: null as number | null,
  generation: 0,
  livingMessage: 'Preparing a new lineage',
  backend: 'initialising',
  factory: true,
  inFlight: 3,
  ready: false,
  paused: false,
  reduced: false,
  progress: 0.28,
  layer: 28,
  layers: 100,
  extruding: true,
  complete: false,
  x: 0,
  y: 0,
  z: 0,
  frameMs: 0,
  drawCalls: 0,
  pixels: '',
  name: 'Twisted bloom',
  stage: 'printing' as PipelineStage,
  spectral: 0,
  brushLoad: 0,
  seed: 1,
  coating: 0,
  director: false,
  view: 'studio',
  brushPhase: 'Loading pigment',
  artwork: 'Contour gesture',
  editions: 0,
};
export type AtelierStatus = typeof INITIAL_STATUS;
export class MatterAtelierExperience extends BaseExperience {
  private factoryMode = true;
  private factoryTime = 66;
  private production?: FactoryProduction;
  private factoryFrame?: FactoryFrame;
  private mechanisms?: FactoryMechanisms;
  private studio?: Studio;
  private nursery?: LivingNursery;
  private caretakers?: CaretakerRig;
  private world: AtelierWorld = 'atelier';
  private flora = true;
  private communication = true;
  private living: LivingControls = DEFAULT_LIVING_CONTROLS;
  private styleMoving = false;
  private capturing = false;
  private capturePending?: Promise<unknown>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  private renderer?: THREE.WebGPURenderer;
  private pipeline?: THREE.RenderPipeline;
  private scenePass?: ReturnType<typeof pass>;
  private bloom?: ReturnType<typeof bloom>;
  private environment?: THREE.RenderTarget;
  private controls?: OrbitControls;
  private observer?: ResizeObserver;
  private loop?: ExperienceLoop;
  private disposed = false;
  private initialisation?: Promise<void>;
  private slicer?: Worker;
  private cancelSlice?: () => void;
  private job = planPrint(generateContours('bloom'));
  private time = this.job.duration * 0.35;
  private speed = 12;
  private paused = false;
  private seed = 1;
  private form: Form = 'bloom';
  private name = 'Twisted bloom';
  private rig?: PrinterRig;
  private lab?: CreativeLab;
  private archive?: EditionArchive;
  private painter?: PainterRig;
  private painting = new FloorPainting(this.job);
  private paintedSurface?: PaintedSurface;
  private richness = 1;
  private director = false;
  private directedStage?: PipelineStage;
  private view = 'studio';
  private treatment: Treatment = 'prismatic';
  private sculpture?: FilamentSculpture;
  private cameraFlight?: {
    start: THREE.Vector3;
    end: THREE.Vector3;
    target: THREE.Vector3;
    startTarget: THREE.Vector3;
    elapsed: number;
    duration: number;
  };
  private frameMs = 16;
  private lastFrameAt = 0;
  private reportClock = 0;
  private onStatus: (status: AtelierStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: AtelierStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
  }
  public init(signal?: AbortSignal): Promise<void> {
    return (this.initialisation ??= this.initialise(signal));
  }
  private async initialise(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      forceWebGL:
        new URLSearchParams(location.search).get('renderer') === 'webgl',
    });
    this.connectRendererErrors(this.renderer);
    await this.renderer.init();
    signal?.throwIfAborted();
    if (this.disposed) return;
    this.canvas.dataset.backend = (
      this.renderer.backend as unknown as { isWebGPUBackend?: boolean }
    ).isWebGPUBackend
      ? 'webgpu'
      : 'webgl';
    this.renderer.setClearColor(0xdfe8ef);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.3;
    room.dispose();
    pmrem.dispose();
    this.camera.position.set(12, 9.8, 16);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1.3, 0.2);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', this.cancelCameraFlight);
    this.studio = new Studio(this.scene);
    const printerStation = new THREE.Scene();
    printerStation.position.set(PRINTER.x, PRINTER.y, PRINTER.z);
    printerStation.scale.setScalar(OBJECT_SCALE);
    this.scene.add(printerStation);
    this.rig = new PrinterRig(printerStation);
    batchStaticMeshes(printerStation);
    this.archive = new EditionArchive(this.scene);
    this.lab = new CreativeLab(this.scene);
    this.painter = new PainterRig(this.scene);
    this.production = new FactoryProduction(this.scene, this.archive);
    this.mechanisms = new FactoryMechanisms(this.scene);
    this.nursery = new LivingNursery(this.scene);
    this.caretakers = new CaretakerRig(this.scene);
    batchStaticMeshes(this.scene);
    this.sculpture = new FilamentSculpture(this.scene, this.job);
    this.createPaintedSurface();
    this.scenePass = pass(this.scene, this.camera);
    const output = this.scenePass.getTextureNode('output');
    this.bloom = bloom(output, 0.18, 0.45, 1.3);
    this.pipeline = new THREE.RenderPipeline(
      this.renderer,
      output.add(this.bloom)
    );
    this.resize();
    // Warm the committed factory state, including its live materials, before
    // presenting the first frame or allowing an animation loop to run.
    this.frame(0, false, false);
    await this.renderer.compileAsync(this.scene, this.camera);
    signal?.throwIfAborted();
    if (this.disposed) return;
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    await this.loop.start();
  }
  private frame = (delta: number, moving: boolean, present = true) => {
    if (!this.renderer || !this.controls) return;
    const started = performance.now();
    if (moving && !this.paused) {
      if (this.factoryMode) this.factoryTime += (delta * this.speed) / 24;
      else this.time = Math.min(this.duration, this.time + delta * this.speed);
    }
    const factory = this.factoryMode
      ? this.production?.update(
          this.factoryTime,
          this.form,
          this.seed,
          this.treatment,
          this.richness,
          this.living
        )
      : undefined;
    this.factoryFrame = factory;
    this.styleMoving = this.studio?.update(delta) ?? false;
    if (this.nursery) {
      this.nursery.group.visible = !!factory;
      if (factory) this.nursery.update(this.factoryTime, factory.living);
    }
    if (this.caretakers) {
      this.caretakers.group.visible = !!factory && this.flora;
      if (factory) this.caretakers.update(this.factoryTime, factory.living);
    }
    const state = factory?.print ?? samplePrint(this.job, this.time);
    const process = factory?.process ?? sampleProcess(this.job, this.time);
    if (this.director && !factory && this.directedStage !== process.stage) {
      this.directedStage = process.stage;
      this.setView(
        (
          {
            printing: 'detail',
            transfer: 'studio',
            painting: 'brush',
            spectral: 'bath',
            exhibit: 'studio',
            complete: 'edition',
          } as const
        )[process.stage],
        true
      );
    }
    if (factory && this.director && this.view !== factory.rhythm.focus)
      this.setView(factory.rhythm.focus, true);
    this.rig?.update(state, factory?.printerProcess ?? process);
    if (!factory) this.painting.advance(process.elapsed - FINISH_APPROACH);
    if (
      this.canvas.dataset.paintVersion !==
      String(this.painting.paint.surfaceVersion)
    ) {
      this.canvas.dataset.paintMass = this.painting.paint.mass.toFixed(8);
      this.canvas.dataset.paintVersion = String(
        this.painting.paint.surfaceVersion
      );
    }
    const pigmentMass = Number(this.canvas.dataset.paintMass ?? 0);
    this.sculpture?.update(
      state,
      process,
      this.time,
      this.treatment,
      this.seed,
      pigmentMass
    );
    if (this.sculpture) {
      this.sculpture.mesh.visible = !factory;
      this.sculpture.preview.visible = !factory && process.stage === 'printing';
    }
    this.lab?.setSoftness(
      factory?.living.controls.fusion ?? this.living.fusion
    );
    this.lab?.update(
      process,
      factory?.treatment ?? this.treatment,
      factory?.seed ?? this.seed,
      factory?.job ?? this.job,
      factory?.mass ?? pigmentMass,
      factory?.carrier,
      this.factoryMode ? this.factoryTime : undefined
    );
    const brushPose =
      factory?.pose ?? sampleBrush(this.painting.paths, process.sweep);
    const brushLoad =
      factory?.current.paint.brush.load ?? this.painting.brush.load;
    this.painter?.update(brushPose, brushLoad, factory ? 0.12 : 1);
    if (this.paintedSurface) {
      this.paintedSurface.mesh.visible = !factory;
      if (!factory) this.paintedSurface.upload();
    }
    if (factory) this.mechanisms?.update(this.factoryTime, factory);
    else if (this.mechanisms) this.mechanisms.group.visible = false;
    this.canvas.dataset.factory = String(this.factoryMode);
    this.canvas.dataset.factoryTime = this.factoryTime.toFixed(4);
    this.canvas.dataset.artwork =
      factory?.current.paint.artwork ?? this.painting.artwork;
    this.canvas.dataset.inFlight = String(factory?.count ?? 1);
    this.canvas.dataset.printingEdition = String(
      factory?.current.seed ?? this.seed
    );
    this.canvas.dataset.finishingEdition = String(factory?.seed ?? this.seed);
    this.canvas.dataset.editions = String(this.archive?.count ?? 0);
    this.canvas.dataset.director = String(this.director);
    this.canvas.dataset.brushPhase = brushPose.phase;
    this.canvas.dataset.brushLoad = brushLoad.toFixed(6);
    this.canvas.dataset.brushContact = String(
      brushPose.contact && (!!factory || process.stage === 'painting')
    );
    this.canvas.dataset.objectPosition = [
      process.object.x,
      process.object.y,
      process.object.z,
    ]
      .map((v) => v.toFixed(3))
      .join(',');
    this.canvas.dataset.spectral = process.spectral.toFixed(6);
    this.canvas.dataset.treatment = this.treatment;
    this.canvas.dataset.world = this.world;
    this.canvas.dataset.flora = String(this.flora);
    this.canvas.dataset.communication = String(this.communication);
    this.canvas.dataset.parentSeed = String(
      factory?.current.recipe.genome.parentSeed ?? ''
    );
    this.canvas.dataset.generation = String(
      factory?.current.recipe.genome.generation ?? 0
    );
    this.canvas.dataset.recipe = JSON.stringify(
      factory?.current.recipe ?? null
    );
    this.canvas.dataset.feedProgress = String(
      factory?.living.feed.progress ?? 0
    );
    this.canvas.dataset.bloom = String(
      factory?.living.colonies.reduce((n, c) => Math.max(n, c.bloom), 0) ?? 0
    );
    this.canvas.dataset.progress = (this.time / this.duration).toFixed(6);
    this.canvas.dataset.layer = String(state.move.layer + 1);
    this.canvas.dataset.extruding = String(
      state.move.extrude &&
        (factory?.printerProcess.stage ?? process.stage) === 'printing'
    );
    this.canvas.dataset.stage = process.stage;
    this.canvas.dataset.coating = process.sweep.toFixed(6);
    this.canvas.dataset.printEnd = (this.job.duration / this.duration).toFixed(
      6
    );
    if (this.cameraFlight) {
      this.cameraFlight.elapsed += delta;
      const t = Math.min(
        1,
        this.cameraFlight.elapsed / this.cameraFlight.duration
      );
      const eased = t * t * t * (10 + t * (-15 + 6 * t));
      this.camera.position.lerpVectors(
        this.cameraFlight.start,
        this.cameraFlight.end,
        eased
      );
      this.controls.target.lerpVectors(
        this.cameraFlight.startTarget,
        this.cameraFlight.target,
        eased
      );
      if (t === 1) {
        this.cameraFlight = undefined;
        this.loop?.setPlaying(
          !!this.cameraFlight ||
            (!this.paused && (this.factoryMode || this.time < this.duration))
        );
      }
    }
    this.controls.enableDamping = moving && !this.cameraFlight;
    this.controls.update();
    if (!present) return;
    this.renderer.info.reset();
    this.pipeline?.render();
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.drawCalls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    this.canvas.dataset.geometries = String(
      this.renderer.info.memory.geometries
    );
    this.canvas.dataset.cameraMoving = String(!!this.cameraFlight);
    if (delta > 0)
      this.frameMs += (started - this.lastFrameAt - this.frameMs) * 0.05;
    this.lastFrameAt = started;
    this.reportClock += delta;
    if (
      this.reportClock > 0.15 ||
      delta === 0 ||
      (!factory && this.time === this.duration)
    ) {
      this.reportClock = 0;
      const unfolding = factory?.living.colonies.find(
        (c) => c.bloom > 0 && c.bloom < 1
      );
      const editionLabel = (seed: number) =>
        `Edition ${String(seed).padStart(3, '0')}`;
      this.onStatus({
        world: this.world,
        flora: this.flora,
        communication: this.communication,
        parentSeed: factory?.current.recipe.genome.parentSeed ?? null,
        generation: factory?.current.recipe.genome.generation ?? 0,
        livingMessage: factory
          ? factory.living.recovery.active
            ? `${editionLabel(factory.living.recovery.seed)} · Returning energy to the nursery`
            : factory.living.feed.active
              ? `${editionLabel(factory.living.feed.seed)} · Delivering its painted signature`
              : factory.living.care.active
                ? `Nursery ${factory.living.care.bed + 1} · ${
                    {
                      idle: 'Resting',
                      notice: 'A colony requests support',
                      aim: 'Preparing a measured dose',
                      meter: 'Tending a growing colony',
                      wait: 'Waiting for nutrient arrival',
                      acknowledge: 'The colony has received its dose',
                    }[factory.living.care.phase]
                  }`
                : unfolding
                  ? `${editionLabel(unfolding.seed)} · A new trait is unfolding`
                  : process.stage === 'spectral'
                    ? `${editionLabel(factory.seed)} · Fusing its painted signature`
                    : 'Growing the next generation'
          : 'Inspecting a single edition',
        backend: this.canvas.dataset.backend ?? 'webgpu',
        factory: this.factoryMode,
        inFlight: factory?.count ?? 1,
        ready: true,
        paused: this.paused,
        reduced: this.loop?.reducedMotion ?? false,
        progress: factory ? factory.age / 30 : this.time / this.duration,
        layer: state.move.layer + 1,
        layers: this.job.layers,
        extruding:
          state.move.extrude &&
          (factory?.printerProcess.stage ?? process.stage) === 'printing',
        stage: process.stage,
        coating: process.sweep,
        spectral: process.spectral,
        brushLoad,
        seed: factory?.current.seed ?? this.seed,
        director: this.director,
        view: this.view,
        brushPhase: brushPose.phase,
        artwork: factory?.current.paint.artwork ?? this.painting.artwork,
        editions: this.archive?.count ?? 0,
        complete: !factory && process.stage === 'complete',
        ...state.position,
        frameMs: this.frameMs,
        drawCalls: this.renderer.info.render.drawCalls,
        pixels: `${this.canvas.width} × ${this.canvas.height}`,
        name: factory
          ? {
              bloom: 'Twisted bloom',
              ribbon: 'Wave vessel',
              orbit: 'Orbital stack',
              terrain: 'Interference terrain',
            }[factory.current.form]
          : this.name,
      });
    }
    if (moving && this.paused && !this.styleMoving && !this.cameraFlight)
      this.loop?.setPlaying(false);
    this.canvas.dataset.renderMs = (performance.now() - started).toFixed(2);
    if (
      !this.factoryMode &&
      this.time >= this.duration &&
      moving &&
      !this.cameraFlight
    )
      this.loop?.setPlaying(false);
  };
  private get duration() {
    return this.job.duration + FINISH_DURATION;
  }
  public previewFinish() {
    this.setFactory(false);
    this.setDirector(true);
    this.time =
      this.job.duration +
      FINISH_APPROACH +
      FINISH_SWEEP * (this.loop?.reducedMotion ? 0.45 : 0.02);
    this.paused = false;
    this.loop?.setPlaying(true);
    this.invalidate();
  }
  public setFactory(enabled: boolean) {
    if (this.factoryMode === enabled) return;
    this.factoryMode = enabled;
    if (!enabled) {
      this.production?.clear(true);
      this.factoryFrame = undefined;
    }
    this.directedStage = undefined;
    this.loop?.setPlaying(
      !!this.cameraFlight ||
        (!this.paused && (enabled || this.time < this.duration))
    );
    this.invalidate();
  }
  public setWorld(world: AtelierWorld) {
    this.world = world;
    this.studio?.setStyle(world, this.loop?.reducedMotion);
    this.production?.setWorld(world);
    this.sculpture?.setWorld(world);
    this.lab?.setWorld(world);
    this.nursery?.setOptions({ style: world });
    this.styleMoving = !this.loop?.reducedMotion;
    this.loop?.setPlaying(this.styleMoving || !this.paused);
    this.invalidate();
  }
  public setLivingControl(key: keyof LivingControls, value: number) {
    this.living = livingControls({ ...this.living, [key]: value });
    if (!this.factoryMode && key === 'fusion') {
      this.sculpture?.setSoftness(this.living.fusion);
      this.lab?.setSoftness(this.living.fusion);
    }
    this.invalidate();
  }
  public setFlora(enabled: boolean) {
    this.flora = enabled;
    this.mechanisms?.setFlora(enabled);
    this.nursery?.setOptions({ flora: enabled });
    this.invalidate();
  }
  public setCommunication(enabled: boolean) {
    this.communication = enabled;
    this.nursery?.setOptions({ communication: enabled });
    this.mechanisms?.setCommunication(enabled);
    this.invalidate();
  }
  public setTreatment(treatment: Treatment) {
    this.treatment = treatment;
    this.invalidate();
  }
  public previewStage(stage: PipelineStage) {
    this.setFactory(false);
    const offsets = {
      printing: -this.job.duration * 0.65,
      transfer: 12,
      painting: FINISH_APPROACH + FINISH_SWEEP * 0.45,
      spectral: FINISH_APPROACH + FINISH_SWEEP + 48,
      exhibit: FINISH_DURATION - 18,
      complete: FINISH_DURATION,
    };
    this.time = this.job.duration + offsets[stage];
    this.loop?.setPlaying(
      !!this.cameraFlight ||
        (!this.paused && (this.factoryMode || this.time < this.duration))
    );
    this.invalidate();
  }
  private createPaintedSurface() {
    this.paintedSurface?.dispose();
    this.paintedSurface = new PaintedSurface(this.painting.paint);
    this.paintedSurface.mesh.position.set(BRUSH_BASE.x, 0.098, BRUSH_BASE.z);
    this.scene.add(this.paintedSurface.mesh);
  }
  public setPaused(value: boolean) {
    this.paused = value;
    this.loop?.setPlaying(
      this.styleMoving ||
        !!this.cameraFlight ||
        (!value && (this.factoryMode || this.time < this.duration))
    );
    this.invalidate();
  }
  public setSpeed(value: number) {
    this.speed = Math.max(1, Math.min(48, value));
  }
  public restart() {
    if (!this.factoryMode) {
      this.seek(0);
      return;
    }
    this.factoryTime = 60;
    this.production?.clear();
    this.loop?.setPlaying(!this.paused);
    this.invalidate();
  }
  public seek(progress: number) {
    this.setFactory(false);
    this.time = Math.max(0, Math.min(1, progress)) * this.duration;
    this.loop?.setPlaying(
      !!this.cameraFlight ||
        (!this.paused && (this.factoryMode || this.time < this.duration))
    );
    this.invalidate();
  }
  private archiveComplete() {
    if (!this.factoryMode && this.time >= this.duration)
      this.archive?.capture(
        this.job,
        this.painting.paint,
        this.seed,
        this.treatment
      );
  }
  public setForm(form: Form, variation = false) {
    this.archiveComplete();
    if (variation) this.seed++;
    this.form = form;
    this.name = {
      bloom: 'Twisted bloom',
      ribbon: 'Wave vessel',
      orbit: 'Orbital stack',
      terrain: 'Interference terrain',
    }[form];
    this.setJob(planPrint(generateContours(form, this.seed)), 0.48);
  }
  public vary() {
    this.setForm(this.form, true);
  }
  private setJob(job: PrintJob, progress: number) {
    this.job = job;
    this.time = job.duration * progress;
    this.sculpture?.dispose();
    this.sculpture = new FilamentSculpture(this.scene, this.job);
    this.sculpture.setWorld(this.world);
    this.sculpture.setSoftness(this.living.fusion);
    this.painting = new FloorPainting(job, this.richness);
    delete this.canvas.dataset.paintVersion;
    this.createPaintedSurface();
    this.loop?.setPlaying(!!this.cameraFlight || !this.paused);
    this.invalidate();
  }
  public async loadSTL(file: File) {
    this.setFactory(false);
    if (file.size > 15 * 1024 * 1024)
      throw new Error('Please use an STL smaller than 15 MB.');
    const buffer = await file.arrayBuffer();
    if (this.disposed) return;
    let geometry: THREE.BufferGeometry;
    try {
      geometry = new STLLoader().parse(buffer);
    } catch {
      throw new Error(
        'This STL could not be read. Use a binary or ASCII STL containing triangle faces.'
      );
    }
    try {
      this.cancelSlice?.();
      const positions = new Float32Array(
        geometry.getAttribute('position').array
      );
      const worker = new Worker(
        new URL(
          '../../../features/matter-atelier/slicer.worker.ts',
          import.meta.url
        ),
        { type: 'module' }
      );
      this.slicer = worker;
      const job = await new Promise<PrintJob>((resolve, reject) => {
        this.cancelSlice = () => {
          worker.terminate();
          reject(new Error('Slicing cancelled.'));
        };
        worker.onmessage = (
          event: MessageEvent<{ job?: PrintJob; error?: string }>
        ) => {
          worker.terminate();
          this.slicer = undefined;
          this.cancelSlice = undefined;
          if (event.data.job) resolve(event.data.job);
          else
            reject(new Error(event.data.error ?? 'Unable to slice this STL.'));
        };
        worker.onerror = () => {
          worker.terminate();
          this.slicer = undefined;
          this.cancelSlice = undefined;
          reject(new Error('Unable to slice this STL.'));
        };
        worker.postMessage(positions, [positions.buffer]);
      });
      if (this.disposed) return;
      this.archiveComplete();
      this.name = file.name.replace(/\.stl$/i, '').slice(0, 48);
      this.setJob(job, 0);
    } finally {
      geometry.dispose();
    }
  }
  public setView(
    view:
      | 'studio'
      | 'detail'
      | 'top'
      | 'brush'
      | 'bath'
      | 'edition'
      | 'nursery',
    directed = false
  ) {
    if (!directed) this.director = false;
    this.view = view;
    const positions = {
      studio: [12, 9.8, 16],
      detail: [-1.8, 4.4, 5.3],
      top: [0.01, 25, 0.21],
      brush: [3.2, 4.1, 10.1],
      bath: [8.0, 3.8, 3.4],
      nursery: [3.2, 2.9, 4.1],
      edition: [10.5, 3.2, 9.3],
    };
    const colony = this.factoryFrame?.living.colonies.reduce(
      (best, next) =>
        next.growth + next.bloom > best.growth + best.bloom ? next : best,
      this.factoryFrame.living.colonies[0]
    );
    const bed = NURSERY_BEDS[colony ? ((colony.id % 3) + 3) % 3 : 0];
    if (view === 'nursery')
      positions.nursery = [bed[0] + 3.1, 2.8, bed[1] + 4.2];
    const p = positions[view];
    const end = new THREE.Vector3(p[0], p[1], p[2]);
    const targets = {
      studio: [0, 1.3, 0.2],
      detail: [-5, 1.5, -2.4],
      top: [0, 0, 0.2],
      brush: [-0.7, 1.05, 3.2],
      bath: [4, 1.2, -2.4],
      nursery: [bed[0], 0.72, bed[1]],
      edition: [6.3, 1.25, 3.8],
    };
    const target = new THREE.Vector3(
      ...(targets[view] as [number, number, number])
    );
    if (this.loop?.reducedMotion) {
      this.cameraFlight = undefined;
      this.camera.position.copy(end);
      this.controls?.target.copy(target);
      this.controls?.update();
    } else {
      this.cameraFlight = {
        start: this.camera.position.clone(),
        end,
        target,
        startTarget: this.controls?.target.clone() ?? new THREE.Vector3(),
        elapsed: 0,
        duration: directed && this.factoryMode ? 3.4 : 0.85,
      };
      this.loop?.setPlaying(true);
    }
    this.canvas.dataset.cameraMoving = String(!!this.cameraFlight);
    this.invalidate();
  }
  public setDirector(enabled: boolean) {
    if (!enabled) this.cancelCameraFlight();
    this.director = enabled;
    this.directedStage = undefined;
    this.invalidate();
  }
  public setRichness(value: number) {
    this.richness = Math.max(0.6, Math.min(1.4, value));
    if (!this.factoryMode) {
      this.painting = new FloorPainting(this.job, this.richness);
      delete this.canvas.dataset.paintVersion;
      this.createPaintedSurface();
    }
    this.invalidate();
  }
  private cancelCameraFlight = () => {
    this.director = false;
    this.cameraFlight = undefined;
    this.loop?.setPlaying(
      !!this.cameraFlight ||
        (!this.paused && (this.factoryMode || this.time < this.duration))
    );
  };
  public savePainting() {
    const field = this.factoryFrame?.current.paint.paint ?? this.painting.paint;
    const canvas = document.createElement('canvas');
    canvas.width = field.width;
    canvas.height = field.height;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(field.width, field.height);
    for (let y = 0; y < field.height; y++)
      for (let x = 0; x < field.width; x++) {
        const coverage =
          1 -
          Math.exp(
            -field.pigmentAt(
              (x + 0.5) / field.width,
              (y + 0.5) / field.height
            ) * 460
          );
        const out = ((field.height - 1 - y) * field.width + x) * 4;
        pixels.data[out] = Math.round(240 + (23 - 240) * coverage);
        pixels.data[out + 1] = Math.round(238 + (42 - 238) * coverage);
        pixels.data[out + 2] = Math.round(221 + (174 - 221) * coverage);
        pixels.data[out + 3] = 255;
      }
    context.putImageData(pixels, 0, 0);
    const a = document.createElement('a');
    const art =
      this.factoryFrame?.current.paint.artwork ?? this.painting.artwork;
    const edition = this.factoryFrame?.current.seed ?? this.seed;
    a.download = `matter-atelier-${art.toLowerCase().replace(/ /g, '-')}-${edition}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
  public async saveStill() {
    const renderer = this.renderer;
    if (!renderer || !this.pipeline || this.disposed || this.capturing) return;
    this.capturing = true;
    const width = this.canvas.width,
      height = this.canvas.height;
    const edition = this.factoryFrame?.current.seed ?? this.seed;
    const target = new THREE.RenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
    });
    const previous = renderer.getRenderTarget();
    try {
      try {
        renderer.setRenderTarget(target);
        this.pipeline.render();
      } finally {
        renderer.setRenderTarget(previous);
      }
      const reading = renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        width,
        height
      );
      this.capturePending = reading;
      const pixels = await reading;
      if (this.disposed) throw new Error('Capture cancelled');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      const output = context.createImageData(width, height);
      const bytes = new Uint8Array(
        pixels.buffer,
        pixels.byteOffset,
        pixels.byteLength
      );
      const native = this.canvas.dataset.backend === 'webgpu';
      const stride = native ? Math.ceil((width * 4) / 256) * 256 : width * 4;
      for (let y = 0; y < height; y++) {
        const source = (native ? y : height - y - 1) * stride;
        output.data.set(
          bytes.subarray(source, source + width * 4),
          y * width * 4
        );
      }
      context.putImageData(output, 0, 0);
      const link = document.createElement('a');
      link.download = `matter-atelier-${edition}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      target.dispose();
      this.capturing = false;
      this.capturePending = undefined;
    }
  }
  private invalidate = () => this.loop?.invalidate();
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    const ratio = Math.min(
      window.devicePixelRatio,
      1.5,
      Math.sqrt(1600000 / Math.max(1, width * height))
    );
    this.renderer?.setPixelRatio(ratio);
    this.renderer?.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = width < 600 ? 57 : 38;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelSlice?.();
    this.cancelSlice = undefined;
    this.slicer?.terminate();
    this.loop?.dispose();
    this.observer?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('start', this.cancelCameraFlight);
    this.controls?.dispose();
    // Backend initialisation and compilation can create GPU resources after
    // an await. Stop interaction now, then release their owners once they settle.
    void Promise.allSettled([this.initialisation, this.capturePending]).then(
      () => {
        this.sculpture?.dispose();
        this.production?.dispose();
        this.archive?.dispose();
        this.nursery?.dispose();
        this.caretakers?.dispose();
        this.lab?.dispose();
        this.mechanisms?.dispose();
        this.paintedSurface?.dispose();
        disposeScene(this.scene);
        this.environment?.dispose();
        this.bloom?.dispose();
        this.scenePass?.dispose();
        this.pipeline?.dispose();
        this.scene.clear();
        this.renderer?.dispose();
      }
    );
  }
}
