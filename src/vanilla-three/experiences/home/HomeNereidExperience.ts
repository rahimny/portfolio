import * as T from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { NereidAssembly } from '../nereid/NereidAssembly';
import { SwimDeformation } from '../nereid/SwimDeformation';
import { SwimScore } from '@/features/nereid/SwimScore';
import {
  NereidGreeting,
  type HomeEncounterSpace,
} from '@/features/home/HomeEncounterSpace';
import {
  dampNereidScroll,
  nereidScrollPose,
  nereidScrollProgress,
  type NereidChapter,
} from '@/features/home/nereidScroll';

export class HomeNereidExperience extends BaseExperience {
  private host: HTMLElement;
  private stage: HTMLElement;
  private scene = new T.Scene();
  private camera = new T.OrthographicCamera();
  private renderer?: T.WebGLRenderer;
  private assembly?: NereidAssembly;
  private deformation?: SwimDeformation;
  private score = new SwimScore();
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private progress = -1;
  private chapter?: NereidChapter;
  private readonly onChapterChange?: (chapter: NereidChapter) => void;
  private disposed = false;
  private right = new T.Vector3();
  private up = new T.Vector3();
  private frameCount = 0;
  private playing = true;
  private readonly greeting = new NereidGreeting();
  private readonly screenPoint = new T.Vector3();
  private unsubscribePresence?: () => void;
  private readonly encounterSpace?: HomeEncounterSpace;
  private frameElapsed = 0;
  private readonly frameInterval =
    1 / (navigator.hardwareConcurrency <= 4 ? 30 : 60);

  constructor(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    stage: HTMLElement,
    options?: ExperienceOptions & {
      onChapterChange?: (chapter: NereidChapter) => void;
    },
    encounterSpace?: HomeEncounterSpace
  ) {
    super(canvas, options);
    this.host = host;
    this.stage = stage;
    this.encounterSpace = encounterSpace;
    this.onChapterChange = options?.onChapterChange;
  }

  async init(signal?: AbortSignal) {
    const response = await fetch('/nereid/home-swim.bin', { signal });
    if (!response.ok)
      throw new Error('Nereid swimming recording is unavailable.');
    const recording = await response.arrayBuffer();
    if (signal?.aborted || this.disposed) return;
    this.score.loadFrames(recording);
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.scene.add(new T.HemisphereLight(0xf9fff2, 0x647b83, 1.5));
    const key = new T.DirectionalLight(0xfff7e5, 2.1);
    key.position.set(-4, 9, 7);
    const rim = new T.DirectionalLight(0xcde5e6, 1);
    rim.position.set(6, 3, -4);
    this.scene.add(key, rim);
    this.assembly = await NereidAssembly.create(signal);
    if (signal?.aborted || this.disposed) {
      this.assembly.dispose();
      return;
    }
    this.deformation = new SwimDeformation(this.assembly, this.score.model);
    this.scene.add(this.assembly.root);
    this.camera.position.set(8.3, 4.5, 13);
    this.camera.lookAt(0, -0.7, 0);
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    // Yield after shader preparation without retaining compileAsync's polling
    // loop, which cannot be cancelled if the context is lost during loading.
    this.renderer.compile(this.scene, this.camera);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted || this.disposed) return;
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.unsubscribePresence = this.encounterSpace?.subscribe(this.invalidate);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.stage);
    this.observer.observe(this.host);
    window.addEventListener('scroll', this.invalidate, { passive: true });
    window.addEventListener('resize', this.resize);
    this.resize();
    await this.loop.start();
  }

  private invalidate = () => this.loop?.invalidate();
  private resize = () => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height, pixelRatio } = this.sizes;
    const pixelBudget =
      navigator.hardwareConcurrency <= 4 ? 1_800_000 : 4_000_000;
    this.renderer?.setPixelRatio(
      Math.min(
        pixelRatio,
        2,
        Math.sqrt(pixelBudget / Math.max(1, width * height))
      )
    );
    this.renderer?.setSize(width, height, false);
    this.invalidate();
  };

  private frame = (delta: number) => {
    if (this.disposed || !this.renderer || !this.assembly) return;
    if (delta > 0) {
      this.frameElapsed += delta;
      if (this.frameElapsed + 0.0001 < this.frameInterval) return;
      delta = this.frameElapsed;
    }
    this.frameElapsed = 0;
    const rect = this.host.getBoundingClientRect();
    const stickyTop = parseFloat(getComputedStyle(this.stage).top) || 0;
    const target = nereidScrollProgress(
      rect.top,
      rect.height,
      window.innerHeight,
      this.stage.clientHeight,
      stickyTop
    );
    this.progress =
      this.progress < 0 || this.loop?.reducedMotion
        ? target
        : dampNereidScroll(this.progress, target, delta || 1 / 60);
    const pose = nereidScrollPose(this.progress);
    if (pose.chapter !== this.chapter) {
      this.chapter = pose.chapter;
      this.onChapterChange?.(pose.chapter);
    }
    const model = this.score.sample(pose.swim);
    this.deformation?.update(model, pose.swimWeight, pose.limbWeight);
    this.assembly.apply(
      pose.separation,
      false,
      0,
      model.bell * pose.swimWeight + this.greeting.amount * 0.035,
      model.margin * pose.swimWeight,
      model.stroke,
      model.distance
    );
    const { width, height } = this.sizes;
    const mobile = width < 768;
    const aspect = width / Math.max(1, height);
    const span = Math.max(
      pose.span * (mobile ? 1.25 : 1),
      mobile ? 8.4 / aspect : 0
    );
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.updateProjectionMatrix();
    const x =
      (1 - pose.arrival) * span * aspect * 0.53 +
      (mobile ? 0 : span * aspect * 0.13);
    const y = -(1 - pose.arrival) * span * 0.64 - (mobile ? span * 0.06 : 0);
    this.assembly.root.position
      .copy(this.right)
      .multiplyScalar(x)
      .addScaledVector(this.up, y);
    if (this.encounterSpace) {
      const surface = this.canvas.getBoundingClientRect();
      this.camera.updateMatrixWorld();
      this.screenPoint.copy(this.assembly.root.position).project(this.camera);
      this.encounterSpace.updateNereid(
        surface.left + window.scrollX + ((this.screenPoint.x + 1) * width) / 2,
        surface.top + window.scrollY + ((1 - this.screenPoint.y) * height) / 2,
        Math.min(width * 0.48, height * 0.42),
        surface.bottom > 0 &&
          surface.top < window.innerHeight &&
          pose.arrival > 0.15
      );
      this.greeting.advance(
        delta || 1 / 60,
        this.encounterSpace.proximity,
        this.encounterSpace.side
      );
    }
    this.assembly.root.rotation.set(
      pose.pitch - this.greeting.amount * 0.045,
      pose.yaw + this.greeting.turn * 0.16,
      pose.roll - this.greeting.turn * 0.035
    );
    let tier = 0;
    for (const part of this.assembly.parts) {
      if (part.kind !== 'shell') continue;
      part.group.rotation.y = pose.shellTwist * (tier++ % 2 === 0 ? -1 : 0.65);
    }
    this.renderer.render(this.scene, this.camera);
    this.stage.style.setProperty('--nereid-progress', this.progress.toFixed(5));
    this.canvas.dataset.progress = this.progress.toFixed(5);
    this.canvas.dataset.separation = pose.separation.toFixed(5);
    this.canvas.dataset.yaw = pose.yaw.toFixed(5);
    this.canvas.dataset.shellTwist = pose.shellTwist.toFixed(5);
    this.canvas.dataset.phase = pose.phase;
    this.canvas.dataset.greeting = this.greeting.amount.toFixed(4);
    if (this.encounterSpace) {
      this.canvas.dataset.visitorX = this.encounterSpace.nereid.x.toFixed(1);
      this.canvas.dataset.visitorY = this.encounterSpace.nereid.y.toFixed(1);
    }
    this.canvas.dataset.frames = String(++this.frameCount);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    // No idle simulation: keep ticking only until the damped scroll pose settles.
    const playing =
      Math.abs(target - this.progress) > 0.00005 || this.greeting.moving;
    this.canvas.dataset.settled = String(!playing);
    if (playing !== this.playing) {
      this.playing = playing;
      this.loop?.setPlaying(playing);
    }
  };

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(new Error('Nereid preview is unavailable.'));
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribePresence?.();
    this.encounterSpace?.updateNereid(0, 0, 1, false);
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.invalidate);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.stage.style.removeProperty('--nereid-progress');
    const release = () => {
      this.deformation?.dispose();
      this.assembly?.dispose();
      this.renderer?.dispose();
      this.scene.clear();
    };
    if (this.loop) this.loop.dispose(release);
    else release();
  }
}
