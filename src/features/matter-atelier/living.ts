import { clamp, ease, type Treatment } from './process';
import type { Form } from './types';
import {
  sampleNurseryCare,
  supportedNurseryAge,
  type NurseryCareState,
} from './care';

export interface LivingControls {
  readonly inheritance: number;
  readonly fusion: number;
  readonly growth: number;
  readonly expression: number;
}
export const DEFAULT_LIVING_CONTROLS: LivingControls = Object.freeze({
  inheritance: 0.6,
  fusion: 0.6,
  growth: 0.6,
  expression: 0.55,
});
export interface EditionGenome {
  readonly seed: number;
  readonly parentSeed: number | null;
  readonly generation: number;
  readonly lobes: number;
  readonly twist: number;
  readonly asymmetry: number;
  readonly phase: number;
  readonly branching: number;
}
export interface EditionRecipe {
  readonly id: number;
  readonly born: number;
  readonly seed: number;
  readonly form: Form;
  readonly treatment: Treatment;
  readonly richness: number;
  readonly controls: LivingControls;
  readonly genome: EditionGenome;
}
export interface EditionInput {
  form: Form;
  seed: number;
  treatment: Treatment;
  richness: number;
  controls?: LivingControls;
}
export interface LivingPacket {
  id: string;
  editionId: number;
  seed: number;
  progress: number;
  active: boolean;
  arrived: boolean;
  amount: number;
}
export interface LivingColony {
  id: number;
  seed: number;
  genome: EditionGenome;
  expression: number;
  care: NurseryCareState;
  growth: number;
  bloom: number;
  energy: number;
  ready: boolean;
  activity: number;
}
export interface LivingState {
  time: number;
  genome: EditionGenome;
  controls: LivingControls;
  feed: LivingPacket;
  recovery: LivingPacket;
  colonies: readonly LivingColony[];
  care: NurseryCareState;
  activity: number;
}

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const unit = (value: number, fallback: number) =>
  clamp(finite(value, fallback));
const random = (seed: number, salt: number) => {
  let value = Math.imul((seed + salt * 374761393) | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};
export function livingControls(
  values = DEFAULT_LIVING_CONTROLS
): LivingControls {
  return Object.freeze({
    inheritance: unit(values.inheritance, DEFAULT_LIVING_CONTROLS.inheritance),
    fusion: unit(values.fusion, DEFAULT_LIVING_CONTROLS.fusion),
    growth: unit(values.growth, DEFAULT_LIVING_CONTROLS.growth),
    expression: unit(values.expression, DEFAULT_LIVING_CONTROLS.expression),
  });
}

// Recovery reaches the nursery at age 51. Metered support arrives before 54,
// earlier than the fastest opening. This is the guaranteed readiness bound
// under the available caretaker; colony.ready still checks actual receipt-driven growth.
export const bloomReadyAt = (recipe: EditionRecipe) =>
  recipe.born + 59 - recipe.controls.growth * 3;

export function createEditionRecipe(
  id: number,
  input: EditionInput,
  candidates: readonly EditionRecipe[] = []
): EditionRecipe {
  const born = id * 30;
  const controls = livingControls(input.controls);
  const parent = [...candidates]
    // Check receipt-driven maturity at commitment. The minimum return (no
    // pigment mass) is conservative; a larger completed painting cannot make
    // this parent later, and a future care-timing change cannot bypass readiness.
    .filter(
      (candidate) =>
        candidate.id < id && sampleEditionLife(candidate, born).colony.ready
    )
    .sort((a, b) => b.id - a.id)[0];
  const seed = Math.trunc(finite(input.seed, 1)) + id;
  const families: Form[] =
    input.form === 'terrain'
      ? ['bloom', 'ribbon', 'orbit']
      : [
          input.form,
          ...(['bloom', 'ribbon', 'orbit'] as Form[]).filter(
            (f) => f !== input.form
          ),
        ];
  const form = families[id % families.length];
  const inherit = controls.inheritance;
  const blend = (fresh: number, previous: number) =>
    fresh * (1 - inherit) + previous * inherit;
  const naturalLobes = { bloom: 5, ribbon: 3, orbit: 7, terrain: 5 }[form];
  const source = parent?.genome;
  const lobes = Math.max(
    3,
    Math.min(
      9,
      Math.round(
        blend(
          naturalLobes + Math.round((random(seed, 1) - 0.5) * 2),
          source?.lobes ?? naturalLobes
        )
      )
    )
  );
  const genome: EditionGenome = Object.freeze({
    seed,
    parentSeed: source?.seed ?? null,
    generation: source ? source.generation + 1 : 0,
    lobes,
    twist: blend(0.6 + random(seed, 2) * 0.8, source?.twist ?? 1),
    asymmetry: blend(random(seed, 3) * 0.14, source?.asymmetry ?? 0.04),
    phase:
      ((source?.phase ?? random(seed, 4)) +
        (random(seed, 5) - 0.5) * (0.08 + (1 - inherit) * 0.18) +
        1) %
      1,
    branching: blend(0.25 + random(seed, 6) * 0.65, source?.branching ?? 0.5),
  });
  return Object.freeze({
    id,
    born,
    seed,
    form,
    genome,
    controls,
    treatment: input.treatment,
    richness: Math.max(0.6, Math.min(1.4, finite(input.richness, 1))),
  });
}

/** Immutable births, with only the three most recent recipe records retained.
 * A checkpoint carries the ancestry needed to continue; no historical GPU
 * objects or full-session event log is necessary. Inspection samples recipes. */
export class EditionSequence {
  private recipes: EditionRecipe[] = [];
  private newest = -1;
  commitThrough(id: number, input: EditionInput) {
    for (let next = this.newest + 1; next <= id; next++) {
      this.recipes.push(createEditionRecipe(next, input, this.recipes));
      if (this.recipes.length > 3) this.recipes.shift();
      this.newest = next;
    }
    return this.recipes;
  }
  clear() {
    this.recipes = [];
    this.newest = -1;
  }
  checkpoint() {
    return { newest: this.newest, recipes: [...this.recipes] };
  }
  restore(checkpoint: ReturnType<EditionSequence['checkpoint']>) {
    this.newest = checkpoint.newest;
    this.recipes = checkpoint.recipes.slice(-3);
  }
}

function packet(
  recipe: EditionRecipe,
  time: number,
  kind: 'feed' | 'recovery',
  amount: number
): LivingPacket {
  const start = recipe.born + (kind === 'feed' ? 24 : 46);
  const end = recipe.born + (kind === 'feed' ? 29.5 : 51);
  return {
    id: `${recipe.seed}:${recipe.id}:${kind}`,
    editionId: recipe.id,
    seed: recipe.seed,
    progress: clamp((time - start) / (end - start)),
    active: time >= start && time < end,
    arrived: time >= end,
    amount,
  };
}

/** A finishing aliquot is separate from pigment already fixed on the paper.
 * Its sampled ledger conserves allocation across feed, bath, coating and return;
 * replay recomputes ownership rather than crediting a receipt a second time. */
export function sampleEditionLife(
  recipe: EditionRecipe,
  time: number,
  paintMass = 0,
  canDeliverCare = true
) {
  const allocated =
    (0.012 + Math.min(0.15, Math.max(0, paintMass)) * 0.5) * recipe.richness;
  const feed = packet(recipe, time, 'feed', allocated);
  const recovery = packet(recipe, time, 'recovery', allocated * 0.18);
  const processed = time >= recipe.born + 46;
  const readyAt = bloomReadyAt(recipe);
  const age = time - recipe.born;
  const care = sampleNurseryCare(recipe, time, recovery.amount, canDeliverCare);
  const supportedAge = supportedNurseryAge(age, care);
  const growth = recovery.arrived
    ? ease(supportedAge / (readyAt - recipe.born - 51))
    : 0;
  const bloom = recovery.arrived
    ? ease((supportedAge - 2) / (readyAt - recipe.born - 53))
    : 0;
  const presence = 1 - ease((age - 77) / 3);
  const colony: LivingColony = {
    id: recipe.id,
    seed: recipe.seed,
    genome: recipe.genome,
    expression: recipe.controls.expression,
    care,
    growth: growth * presence,
    bloom: bloom * presence,
    energy: recovery.arrived
      ? recovery.amount - care.reserve + care.received
      : 0,
    ready: growth >= 1 && bloom >= 1,
    activity: recovery.active
      ? Math.sin(Math.PI * recovery.progress)
      : Math.sin(Math.PI * growth) * presence,
  };
  return {
    feed,
    recovery,
    colony,
    bathReady: feed.arrived,
    ledger: {
      allocated,
      source: time < recipe.born + 24 ? allocated : 0,
      feed: feed.active ? allocated : 0,
      bath: feed.arrived && !processed ? allocated : 0,
      coating: processed ? allocated * 0.82 : 0,
      recovery: recovery.active ? recovery.amount : 0,
      nursery: recovery.arrived
        ? recovery.amount - care.reserve + care.received
        : 0,
      careReserve: recovery.arrived ? care.reserve - care.dispensed : 0,
      careInTransit: recovery.arrived ? care.inTransit : 0,
    },
  };
}

export function sampleLivingState(
  time: number,
  editions: readonly { recipe: EditionRecipe; mass: number }[]
): LivingState {
  const latest = editions[editions.length - 1];
  if (!latest) throw new Error('A living atelier needs an edition.');
  const samples = editions.map((edition) =>
    sampleEditionLife(edition.recipe, time, edition.mass)
  );
  const activeBath =
    editions.find(
      (edition) =>
        time - edition.recipe.born >= 30 && time - edition.recipe.born < 51
    ) ?? latest;
  const newestSample = samples[samples.length - 1];
  // Retain the last dispatched identity after arrival, until a later packet
  // takes its place. An acknowledgement must not disappear at the boundary.
  const feed =
    samples.filter((sample) => sample.feed.active || sample.feed.arrived).at(-1)
      ?.feed ?? newestSample.feed;
  const recovery =
    samples
      .filter((sample) => sample.recovery.active || sample.recovery.arrived)
      .at(-1)?.recovery ?? newestSample.recovery;
  return {
    time,
    genome: activeBath.recipe.genome,
    controls: activeBath.recipe.controls,
    feed,
    recovery,
    colonies: samples.map((sample) => sample.colony),
    care:
      samples.find((sample) => sample.colony.care.active)?.colony.care ??
      samples
        .filter(
          (sample) =>
            sample.colony.care.requested && time >= sample.colony.id * 30 + 51
        )
        .at(-1)?.colony.care ??
      newestSample.colony.care,
    activity: Math.max(
      ...samples.map((sample) => sample.colony.activity),
      feed.active ? Math.sin(Math.PI * feed.progress) : 0
    ),
  };
}
