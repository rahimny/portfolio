import * as THREE from 'three';
import {
  factoryIds,
  factoryProcess,
  editionTime,
  factoryCarrier,
  factoryRhythm,
  brushProgress,
  FACTORY_PERIOD,
} from '@/features/matter-atelier/factory';
import {
  generateContours,
  planPrint,
  samplePrint,
  type Form,
  type PrintJob,
} from '@/features/matter-atelier/toolpath';
import { FloorPainting, sampleBrush } from '@/features/matter-atelier/painting';
import {
  FINISH_SWEEP,
  BRUSH_BASE,
  ease,
  type Treatment,
} from '@/features/matter-atelier/process';
import { FilamentSculpture } from './FilamentSculpture';
import { PaintedSurface } from './PaintedSurfaceNode';
import { EditionArchive } from './EditionArchive';
import {
  EditionSequence,
  sampleLivingState,
  sampleEditionLife,
  DEFAULT_LIVING_CONTROLS,
  type EditionRecipe,
  type LivingControls,
} from '@/features/matter-atelier/living';

type Edition = {
  recipe: EditionRecipe;
  id: number;
  seed: number;
  form: Form;
  job: PrintJob;
  paint: FloorPainting;
  raw: FilamentSculpture;
  fused: FilamentSculpture;
  version: number;
  mass: number;
};
export class FactoryProduction {
  private entries = new Map<number, Edition>();
  private scene: THREE.Scene;
  private archive: EditionArchive;
  private surface?: PaintedSurface;
  private surfaceId = -1;
  private sequence = new EditionSequence();
  private world: 'atelier' | 'bioelectric' | 'signal' = 'atelier';
  constructor(scene: THREE.Scene, archive: EditionArchive) {
    this.scene = scene;
    this.archive = archive;
  }
  update(
    time: number,
    baseForm: Form,
    baseSeed: number,
    treatment: Treatment,
    richness: number,
    controls: LivingControls = DEFAULT_LIVING_CONTROLS
  ) {
    const ids = factoryIds(time);
    const recipes = this.sequence.commitThrough(ids[ids.length - 1], {
      form: baseForm,
      seed: baseSeed,
      treatment,
      richness,
      controls,
    });
    for (const [id, entry] of this.entries)
      if (!ids.includes(id)) {
        if (time - id * FACTORY_PERIOD >= 80)
          this.archive.capture(
            entry.job,
            entry.paint.paint,
            entry.seed,
            entry.recipe.treatment
          );
        this.release(entry);
        this.entries.delete(id);
      }
    for (const id of ids)
      if (!this.entries.has(id)) {
        const recipe = recipes.find((candidate) => candidate.id === id)!;
        const { seed, form, genome } = recipe;
        const contours = generateContours(form, seed, genome)
          .filter((_, i) => i % 2 === 0)
          .map((c) => c.filter((_, i) => i % 2 === 0));
        const job = planPrint(contours);
        const entry: Edition = {
          recipe,
          id,
          seed,
          form,
          job,
          paint: new FloorPainting(job, recipe.richness, seed, genome),
          raw: new FilamentSculpture(this.scene, job),
          fused: new FilamentSculpture(this.scene, job, true),
          version: -1,
          mass: 0,
        };
        entry.raw.setWorld(this.world);
        entry.fused.setWorld(this.world);
        entry.raw.setSoftness(recipe.controls.fusion);
        entry.fused.setSoftness(recipe.controls.fusion);
        this.entries.set(id, entry);
      }
    const current = this.entries.get(ids[ids.length - 1])!;
    for (const entry of this.entries.values()) {
      const age = time - entry.id * FACTORY_PERIOD;
      entry.paint.advance(brushProgress(age) * FINISH_SWEEP);
      // Wet levelling redistributes this mass. Scan the fine field only when
      // a deposit or reset changes its total, not while older editions dry.
      if (entry.version !== entry.paint.paint.filmVersion) {
        entry.version = entry.paint.paint.filmVersion;
        entry.mass = entry.paint.paint.mass;
      }
      const local = editionTime(entry.job, age),
        process = factoryProcess(entry.job, age),
        print = samplePrint(entry.job, local);
      if (!sampleEditionLife(entry.recipe, time, entry.mass).bathReady)
        process.spectral = 0;
      entry.raw.update(
        print,
        process,
        local,
        entry.recipe.treatment,
        entry.seed,
        entry.mass
      );
      entry.fused.update(
        print,
        process,
        local,
        entry.recipe.treatment,
        entry.seed,
        entry.mass
      );
      entry.raw.mesh.visible = age < 31;
      entry.raw.preview.visible = age < 24;
      entry.fused.mesh.visible = age >= 29.5;
      entry.fused.preview.visible = false;
      entry.fused.mesh.material.transparent = age < 31;
      entry.fused.mesh.material.opacity = ease((age - 29.5) / 1.5);
      const turn = age >= 51 ? Math.PI * 2 * ease((age - 52) / 22) : 0;
      entry.fused.mesh.rotation.y = turn;
    }
    if (this.surfaceId !== current.id) {
      this.surface?.dispose();
      this.surface = new PaintedSurface(current.paint.paint, 0.0012);
      this.scene.add(this.surface.mesh);
      this.surfaceId = current.id;
    }
    const phase = time - current.id * FACTORY_PERIOD;
    this.surface!.mesh.position.set(BRUSH_BASE.x, 0.119, BRUSH_BASE.z);
    this.surface!.upload();
    const finishing = [...this.entries.values()].find(
      (e) =>
        time - e.id * FACTORY_PERIOD >= 30 && time - e.id * FACTORY_PERIOD < 51
    );
    const bath = finishing ?? current;
    const bathAge = finishing ? time - finishing.id * FACTORY_PERIOD : phase;
    const process = factoryProcess(bath.job, bathAge);
    if (!sampleEditionLife(bath.recipe, time, bath.mass).bathReady)
      process.spectral = 0;
    const local = editionTime(current.job, phase),
      printerProcess = factoryProcess(current.job, phase);
    // The small inspection head tracks the building layers, then acknowledges release.
    printerProcess.arm = {
      x: -2.2 + 0.18 * Math.sin(phase * 0.4),
      y: 0.9 + 1.6 * ease(phase / 24),
      z: 0.35,
    };
    const pose = sampleBrush(current.paint.paths, brushProgress(phase), true);
    return {
      current,
      process,
      printerProcess,
      print: samplePrint(current.job, local),
      pose,
      job: bath.job,
      seed: bath.seed,
      mass: bath.mass,
      treatment: bath.recipe.treatment,
      living: sampleLivingState(time, [...this.entries.values()]),
      carrier: factoryCarrier(current.job, time),
      rhythm: factoryRhythm(time),
      age: phase,
      count: this.entries.size,
    };
  }
  setWorld(world: 'atelier' | 'bioelectric' | 'signal') {
    this.world = world;
    for (const entry of this.entries.values()) {
      entry.raw.setWorld(world);
      entry.fused.setWorld(world);
    }
  }
  private release(entry: Edition) {
    entry.raw.dispose();
    entry.fused.dispose();
  }
  clear(preserveRecipes = false) {
    this.entries.forEach((e) => this.release(e));
    this.entries.clear();
    if (!preserveRecipes) this.sequence.clear();
    this.surface?.dispose();
    this.surface = undefined;
    this.surfaceId = -1;
  }
  dispose() {
    this.clear();
  }
}
export type FactoryFrame = ReturnType<FactoryProduction['update']>;
