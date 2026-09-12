import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import { STEP, type PressureWorld } from '@/features/pressure-type/model';
import { createWord, WORD } from './glyphs';
import { MembraneSurface } from '@/features/pressure-type/surface';
import { PressureStudio } from './PressureStudio';
import { PressureRemnants } from './PressureRemnants';
import {
  MATERIALS,
  materialName,
  SETTINGS_KEY,
  readSettings,
  type MaterialName,
  type PressureSettings,
} from '@/features/pressure-type/settings';
import type { PressureTuner } from './PressureTuner';
import { PressureProfiler } from './PressureProfiler';
import { PressureAudio } from './PressureAudio';
import { updateNormals } from '@/features/pressure-type/normals';
import { PressureInteraction } from './PressureInteraction';

export const INITIAL_STATUS = {
  ready: false,
  air: 0,
  strokes: 0,
  venting: false,
  paused: false,
  reduced: false,
  settled: true,
  volumeRatio: 1,
  stepMs: 0,
  vertices: 0,
  wireframe: false,
  helium: false,
  burstCount: 0,
  hits: 0,
  material: 'Ink',
  sound: false,
  drawMs: 0,
  gpuMs: 0,
};
export type PressureStatus = typeof INITIAL_STATUS;

export class PressureTypeExperience extends BaseExperience {
  private world?: PressureWorld;
  private renderer?: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  private readonly geometries: THREE.BufferGeometry[] = [];
  private studio?: PressureStudio;
  private readonly surfaces: MembraneSurface[][] = [];
  private readonly letters: THREE.Mesh[] = [];
  private readonly remnants: PressureRemnants[] = [];
  private readonly tethers: THREE.Line[] = [];
  private tetherMaterial?: THREE.LineBasicMaterial;
  private readonly audio = new PressureAudio();
  private lastBurstCount = 0;
  private readonly settings: PressureSettings;
  private tuner?: PressureTuner;
  private tunerRevision = 0;
  private profiler?: PressureProfiler;
  private drawMs = 0;
  private geometryTick = -1;
  private readonly cameraAngles = new THREE.Vector2();
  private interaction?: PressureInteraction;
  private loop?: ExperienceLoop;
  private observer?: ResizeObserver;
  private disposed = false;
  private accumulator = 0;
  private reportClock = 0;
  private stepMs = 0;
  private paused = false;
  private playing = true;
  private wireframe = false;
  private restingSteps = 0;
  private renderedFrames = 0;
  private discreteSteps = 0;
  private readonly onStatus: (status: PressureStatus) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: PressureStatus) => void,
    options?: ExperienceOptions
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
    try {
      this.settings = readSettings(
        JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
      );
    } catch {
      this.settings = readSettings(null);
    }
    this.cameraAngles.set(this.settings.yaw, this.settings.pitch);
  }

  async init(signal?: AbortSignal) {
    await document.fonts.load('900 180px Archivo', WORD);
    if (signal?.aborted || this.disposed) return;
    this.world = createWord(this.settings);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const context = this.renderer.getContext();
    if (context instanceof WebGL2RenderingContext)
      this.profiler = new PressureProfiler(context);
    this.studio = new PressureStudio(this.renderer, this.scene);
    this.studio.update(this.settings, this.renderer, this.scene);
    this.tetherMaterial = new THREE.LineBasicMaterial({ color: 0x85817c });
    for (const body of this.world.bodies) {
      const coarse = new MembraneSurface(body.mesh, true);
      const chain = [coarse];
      if (this.canvas.clientWidth >= 700)
        chain.push(new MembraneSurface(coarse));
      const surface = chain[chain.length - 1];
      this.surfaces.push(chain);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(surface.positions, 3).setUsage(
          THREE.DynamicDrawUsage
        )
      );
      geometry.setIndex(new THREE.BufferAttribute(surface.triangles, 1));
      geometry.computeVertexNormals();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.studio.material);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.letters.push(mesh);
      this.scene.add(mesh);
      this.remnants.push(
        new PressureRemnants(
          geometry,
          this.studio.material,
          body.centerX,
          this.scene
        )
      );
      const tetherGeometry = new THREE.BufferGeometry();
      tetherGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(17 * 3), 3)
      );
      const tether = new THREE.Line(tetherGeometry, this.tetherMaterial);
      tether.frustumCulled = false;
      this.tethers.push(tether);
      this.scene.add(tether);
    }
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.interaction = new PressureInteraction({
      canvas: this.canvas,
      camera: this.camera,
      world: this.world,
      scene: this.scene,
      letters: this.letters,
      settings: this.settings,
      isPaused: () => this.paused,
      wake: (steps) => this.wake(steps),
      orbit: () => {
        this.tuner?.refresh();
        this.loop?.invalidate();
      },
      knock: (air) => this.audio.play('knock', air),
    });
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.setPlaying(false);
    this.report();
  }

  private resize = () => {
    if (!this.renderer || this.disposed) return;
    this.updateSizes();
    const { width, height, pixelRatio } = this.sizes;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.updateCamera();
    this.renderer.setPixelRatio(
      Math.min(pixelRatio, Math.sqrt(1_500_000 / (width * height)))
    );
    this.renderer.setSize(width, height, false);
    this.loop?.invalidate();
  };

  private frame = (delta: number, moving: boolean) => {
    if (this.disposed || !this.world || !this.renderer) return;
    if (this.discreteSteps > 0) {
      const start = performance.now();
      do {
        this.world.step();
        this.discreteSteps--;
      } while (this.discreteSteps > 0 && performance.now() - start < 6);
      if (this.discreteSteps > 0) {
        this.loop?.invalidate();
        return;
      }
    }
    if (moving && !this.paused) {
      this.accumulator = Math.min(this.accumulator + delta, STEP * 6);
      let steps = 0;
      const start = performance.now();
      while (this.accumulator >= STEP) {
        this.world.step();
        this.accumulator -= STEP;
        steps++;
      }
      if (steps) this.stepMs = (performance.now() - start) / steps;
      this.restingSteps = this.world.settled ? this.restingSteps + steps : 0;
      if (this.restingSteps > 30) this.setPlaying(false);
    } else this.accumulator = 0;
    const blend = this.loop?.reducedMotion
      ? 1
      : 1 - Math.exp(-12 * Math.max(delta, 1 / 120));
    this.cameraAngles.x += (this.settings.yaw - this.cameraAngles.x) * blend;
    this.cameraAngles.y += (this.settings.pitch - this.cameraAngles.y) * blend;
    this.updateCamera();
    if (
      Math.abs(this.settings.yaw - this.cameraAngles.x) +
        Math.abs(this.settings.pitch - this.cameraAngles.y) >
      0.0001
    )
      this.loop?.invalidate();
    const burstCount = this.world.bodies.filter(
      (body) => body.burst.active
    ).length;
    if (burstCount > this.lastBurstCount) this.audio.play('burst', 1);
    this.lastBurstCount = burstCount;
    this.draw();
    this.reportClock += delta;
    if (this.reportClock >= 0.1 || !moving || this.restingSteps > 30) {
      this.reportClock = 0;
      this.report();
    }
  };

  private updateCamera() {
    const halfHeight =
      Math.max(1.5, 2.6 / this.camera.aspect) / this.settings.zoom;
    const distance =
      halfHeight / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const yaw = this.cameraAngles.x,
      pitch = this.cameraAngles.y;
    this.camera.position.set(
      distance * Math.sin(yaw) * Math.cos(pitch),
      distance * Math.sin(pitch) + 0.06,
      distance * Math.cos(yaw) * Math.cos(pitch)
    );
    this.camera.lookAt(0, 0.06, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private draw() {
    if (!this.renderer) return;
    const start = performance.now();
    if (this.geometryTick !== this.world?.tick)
      for (let i = 0; i < this.geometries.length; i++) {
        const geometry = this.geometries[i];
        const body = this.world?.bodies[i];
        if (!body) continue;
        if (!body.burst.active) {
          body.toWorld();
          let positions = body.worldPositions;
          for (const surface of this.surfaces[i]) {
            surface.update(positions);
            positions = surface.positions;
          }
          geometry.attributes.position.needsUpdate = true;
          const normal = geometry.getAttribute(
            'normal'
          ) as THREE.BufferAttribute;
          updateNormals(
            geometry.attributes.position.array as Float32Array,
            geometry.index!.array as Uint16Array,
            normal.array as Float32Array
          );
          normal.needsUpdate = true;
        }
        this.letters[i].visible = !body.burst.active;
        this.remnants[i].update(geometry, body.burst);
        const tether = this.tethers[i];
        tether.visible =
          this.world!.helium && body.air > 0.02 && !body.burst.active;
        if (tether.visible) {
          const points = tether.geometry.getAttribute(
            'position'
          ) as THREE.BufferAttribute;
          const x =
            body.centerX +
            body.motion.offset[0] +
            Math.sin(body.motion.angle) * 0.75;
          const y = body.motion.offset[1] - Math.cos(body.motion.angle) * 0.75;
          for (let p = 0; p <= 16; p++) {
            const t = p / 16;
            points.setXYZ(
              p,
              body.centerX + (x - body.centerX) * t,
              -1.12 + (y + 1.12) * t - Math.sin(t * Math.PI) * 0.08,
              body.motion.offset[2] * t - 0.12
            );
          }
          points.needsUpdate = true;
        }
      }
    this.geometryTick = this.world?.tick ?? -1;
    if (this.tuner) this.profiler?.begin();
    this.renderer.render(this.scene, this.camera);
    if (this.tuner) this.profiler?.end();
    this.drawMs = performance.now() - start;
    this.canvas.dataset.drawMs = this.drawMs.toFixed(2);
    this.canvas.dataset.gpuMs = (this.profiler?.gpuMs ?? 0).toFixed(2);
    this.canvas.dataset.frames = String(++this.renderedFrames);
    this.canvas.dataset.tick = String(this.world?.tick ?? 0);
  }

  private report() {
    if (!this.world || this.disposed) return;
    const totalVolume = this.world.bodies.reduce(
      (sum, body) => sum + (body.burst.active ? 0 : body.volume),
      0
    );
    const initialVolume = this.world.bodies.reduce(
      (sum, body) => sum + body.restVolume,
      0
    );
    this.onStatus({
      ready: true,
      air: this.world.air,
      strokes: this.world.strokes,
      venting: this.world.venting,
      paused: this.paused,
      reduced: this.loop?.reducedMotion ?? false,
      settled: this.world.settled,
      volumeRatio: totalVolume / initialVolume,
      stepMs: this.stepMs,
      vertices: this.world.bodies.reduce(
        (sum, body) => sum + body.positions.length / 3,
        0
      ),
      wireframe: this.wireframe,
      helium: this.world.helium,
      burstCount: this.world.bodies.filter((body) => body.burst.active).length,
      hits: this.world.bodies.reduce((sum, body) => sum + body.hits, 0),
      material: materialName(this.settings),
      sound: this.audio.enabled,
      drawMs: this.drawMs,
      gpuMs: this.profiler?.gpuMs ?? 0,
    });
  }

  private setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.loop?.setPlaying(playing);
  }

  private wake(discreteSteps = 180) {
    if (this.disposed || !this.world) return;
    this.restingSteps = 0;
    if (this.loop?.reducedMotion) {
      // Chunk the solve so a discrete result never requires one long main-thread task.
      this.discreteSteps = discreteSteps;
      this.loop.invalidate();
    } else {
      this.setPlaying(!this.paused);
      this.loop?.invalidate();
    }
    this.report();
  }

  setMaterial(name: MaterialName) {
    Object.assign(this.settings, MATERIALS[name]);
    this.tuner?.refresh();
    this.applySettings(false);
  }

  private applySettings = (physics: boolean) => {
    if (!this.renderer || !this.studio || this.disposed) return;
    this.studio.update(this.settings, this.renderer, this.scene);
    for (const remnant of this.remnants) remnant.syncMaterial();
    if (physics && !this.paused) this.wake(600);
    else this.loop?.invalidate();
    this.report();
  };

  async setStudio(container: HTMLElement | null) {
    const revision = ++this.tunerRevision;
    this.tuner?.dispose();
    this.tuner = undefined;
    if (!container || this.disposed) return;
    try {
      const { PressureTuner } = await import('./PressureTuner');
      if (
        this.disposed ||
        revision !== this.tunerRevision ||
        !container.isConnected
      )
        return;
      this.tuner = new PressureTuner(
        container,
        this.settings,
        this.applySettings
      );
      this.loop?.invalidate();
    } catch {
      if (container.isConnected)
        container.textContent =
          'Studio controls could not load. Close and reopen to retry.';
    }
  }

  async toggleSound() {
    await this.audio.toggle();
    if (this.disposed) return;
    this.audio.play('knock', this.world?.air ?? 0);
    this.report();
  }

  tapLetter() {
    if (this.paused || this.disposed || !this.world) return;
    const body = this.world.bodies.find(
      (body) => !body.burst.active && body.air > 0.02
    );
    if (body?.hit(body.centerX + 0.1, 0.1, 0.5)) {
      this.audio.play('knock', body.air);
      this.wake(body.burst.active ? 400 : 8);
    }
  }

  setHelium(helium: boolean) {
    if (this.disposed || !this.world || this.paused) return;
    this.world.helium = helium;
    this.wake(600);
  }

  pump() {
    if (this.world && !this.disposed) {
      this.world.pump();
      this.audio.play('pump', this.world.air);
      this.wake(600);
    }
  }
  vent() {
    if (!this.world || this.disposed) return;
    if (this.loop?.reducedMotion) {
      this.world.venting = false;
      for (const body of this.world.bodies) body.targetAir = 0;
    } else this.world.venting = !this.world.venting;
    this.wake();
  }
  setPaused(paused: boolean) {
    this.interaction?.cancel();
    this.paused = paused;
    this.accumulator = 0;
    this.setPlaying(!paused && !this.world?.settled);
    this.loop?.invalidate();
    this.report();
  }
  setWireframe(wireframe: boolean) {
    this.wireframe = wireframe;
    if (this.studio) this.studio.material.wireframe = wireframe;
    for (const remnant of this.remnants) remnant.syncMaterial();
    this.loop?.invalidate();
    this.report();
  }
  reset() {
    this.interaction?.cancel();
    this.geometryTick = -1;
    this.lastBurstCount = 0;
    this.discreteSteps = 0;
    this.world?.reset();
    this.paused = false;
    this.setPlaying(false);
    this.loop?.invalidate();
    this.report();
  }
  saveStill() {
    if (!this.renderer || this.disposed) return;
    this.draw();
    const link = document.createElement('a');
    link.download = 'pressure-type.png';
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(
      new Error(
        'The graphics context was lost. Reload to restart Pressure Type.'
      )
    );
  };
  dispose() {
    if (this.disposed) return;
    this.interaction?.cancel();
    this.disposed = true;
    this.tunerRevision++;
    this.tuner?.dispose();
    this.profiler?.dispose();
    this.audio.dispose();
    this.loop?.dispose();
    this.observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.interaction?.dispose();
    for (const remnants of this.remnants) remnants.dispose(this.scene);
    for (const tether of this.tethers) tether.geometry.dispose();
    this.tetherMaterial?.dispose();
    this.remnants.length = this.tethers.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    this.studio?.dispose(this.scene);
    this.surfaces.length = 0;
    this.letters.length = 0;
    this.geometries.length = 0;
    this.scene.clear();
    this.renderer?.dispose();
    this.world = undefined;
  }
}
