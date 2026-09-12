import { clamp, ease } from './process';
import type { EditionRecipe } from './living';

export type CarePhase =
  | 'idle'
  | 'notice'
  | 'aim'
  | 'meter'
  | 'wait'
  | 'acknowledge';
export interface NurseryCareState {
  editionId: number;
  bed: number;
  phase: CarePhase;
  requested: boolean;
  active: boolean;
  deficit: number;
  reserve: number;
  dose: number;
  dispensed: number;
  received: number;
  inTransit: number;
  receipt: number;
  receiptRate: number;
  attention: number;
  approach: number;
  flow: number;
  acknowledgement: number;
}

export const CARE_TIMING = Object.freeze({
  notice: 51.15,
  aim: 51.7,
  meter: 52.55,
  deliveryDuration: 1.15,
  flight: 0.2,
  inspect: 54.05,
  acknowledge: 54.55,
  settle: 55.15,
  rest: 55.85,
});
const unit = (value: number) => clamp(Number.isFinite(value) ? value : 0);
const valveRate = (progress: number) =>
  progress > 0 && progress < 1 ? 16 * progress ** 2 * (1 - progress) ** 2 : 0;

/** A small concentrate reserve belongs to the returned aliquot. A deficient
 * colony requests its metered release; the source, flying dose and receipt are
 * sampled separately, so reversing time cannot credit the same delivery twice.
 * Values describe an artistic nutrient system, not a cultivation model. */
export function sampleNurseryCare(
  recipe: EditionRecipe,
  time: number,
  returnedAmount: number,
  canDeliver = true
): NurseryCareState {
  const available = Math.max(
    0,
    Number.isFinite(returnedAmount) ? returnedAmount : 0
  );
  const candidateReserve = available * 0.26;
  const demand = (0.0024 + recipe.genome.branching * 0.0032) * recipe.richness;
  const deficit = unit(
    (demand - (available - candidateReserve)) / Math.max(demand, 1e-8)
  );
  const requested = available > 0 && deficit > 0.055;
  const reserve = requested ? candidateReserve : 0;
  const dose = requested
    ? Math.min(reserve, demand - (available - reserve))
    : 0;
  const age = time - recipe.born;
  const valveProgress = unit(
    (age - CARE_TIMING.meter) / CARE_TIMING.deliveryDuration
  );
  const receiveProgress = unit(
    (age - CARE_TIMING.meter - CARE_TIMING.flight) /
      CARE_TIMING.deliveryDuration
  );
  const dispensed = canDeliver ? dose * ease(valveProgress) : 0;
  const received = canDeliver ? dose * ease(receiveProgress) : 0;
  const receipt = dose > 0 ? unit(received / dose) : 0;
  const completed = receipt >= 1;
  const notice = ease(
    (age - CARE_TIMING.notice) / (CARE_TIMING.aim - CARE_TIMING.notice)
  );
  const release = completed
    ? ease((age - CARE_TIMING.settle) / (CARE_TIMING.rest - CARE_TIMING.settle))
    : 0;
  const approach =
    ease((age - CARE_TIMING.aim) / (CARE_TIMING.meter - CARE_TIMING.aim)) *
    (1 - release);
  const acknowledgement = completed
    ? Math.sin(
        Math.PI *
          ease(
            (age - CARE_TIMING.acknowledge) /
              (CARE_TIMING.settle - CARE_TIMING.acknowledge)
          )
      )
    : 0;
  let phase: CarePhase = 'idle';
  if (
    requested &&
    age >= CARE_TIMING.notice &&
    (age < CARE_TIMING.rest || !completed)
  ) {
    phase =
      age < CARE_TIMING.aim
        ? 'notice'
        : age < CARE_TIMING.meter
          ? 'aim'
          : age < CARE_TIMING.meter + CARE_TIMING.deliveryDuration && canDeliver
            ? 'meter'
            : age < CARE_TIMING.acknowledge || !completed
              ? 'wait'
              : 'acknowledge';
  }
  return {
    editionId: recipe.id,
    bed: ((recipe.id % 3) + 3) % 3,
    phase,
    requested,
    active: phase !== 'idle',
    deficit: requested ? deficit : 0,
    reserve,
    dose,
    dispensed,
    received,
    inTransit: Math.max(0, dispensed - received),
    receipt,
    receiptRate: requested && canDeliver ? valveRate(receiveProgress) : 0,
    attention: requested ? notice * (1 - release) : 0,
    approach: requested ? approach : 0,
    flow: requested && canDeliver ? valveRate(valveProgress) : 0,
    acknowledgement: requested ? acknowledgement : 0,
  };
}

/** Receipt restores the nursery's metabolic clock. Withheld support really
 * delays opening; a hard deadline never forces an unmet colony to be ready. */
export function supportedNurseryAge(age: number, care: NurseryCareState) {
  return age - 51 - care.deficit * 0.85 * (1 - care.receipt);
}
