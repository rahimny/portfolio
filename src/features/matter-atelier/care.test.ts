import { describe, expect, it } from 'vitest';
import { CARE_TIMING, sampleNurseryCare } from './care';
import {
  bloomReadyAt,
  createEditionRecipe,
  DEFAULT_LIVING_CONTROLS,
  sampleEditionLife,
} from './living';

const recipe = createEditionRecipe(0, {
  form: 'bloom',
  seed: 1,
  richness: 1,
  treatment: 'prismatic',
  controls: DEFAULT_LIVING_CONTROLS,
});

describe('contingent nursery care', () => {
  it('services a real nutrient deficit and leaves a well-supplied colony alone', () => {
    const deficient = sampleEditionLife(recipe, 53, 0).colony.care;
    const supplied = sampleEditionLife(recipe, 53, 0.15).colony.care;
    expect(deficient.requested).toBe(true);
    expect(deficient.phase).toBe('meter');
    expect(deficient.flow).toBeGreaterThan(0);
    expect(supplied.requested).toBe(false);
    expect(supplied.phase).toBe('idle');
    expect(supplied.dose).toBe(0);
  });

  it('separates dispensing from arrival and conserves the complete aliquot', () => {
    for (let time = 50; time < 57; time += 0.025) {
      const life = sampleEditionLife(recipe, time, 0);
      const care = life.colony.care;
      expect(care.received).toBeLessThanOrEqual(care.dispensed + 1e-12);
      expect(care.dispensed).toBeLessThanOrEqual(care.reserve + 1e-12);
      expect(care.inTransit).toBeGreaterThanOrEqual(0);
      const { allocated, ...owners } = life.ledger;
      expect(
        Object.values(owners).reduce((sum, value) => sum + value, 0)
      ).toBeCloseTo(allocated, 12);
    }
    const inFlight = sampleEditionLife(
      recipe,
      CARE_TIMING.meter + CARE_TIMING.flight * 0.5,
      0
    ).colony.care;
    expect(inFlight.dispensed).toBeGreaterThan(0);
    expect(inFlight.received).toBe(0);
    expect(inFlight.acknowledgement).toBe(0);
  });

  it('requires a received dose for recovery and acknowledgement', () => {
    const helped = sampleEditionLife(recipe, 55, 0);
    const waiting = sampleEditionLife(recipe, 55, 0, false);
    expect(helped.colony.care.receipt).toBe(1);
    expect(helped.colony.growth).toBeGreaterThan(waiting.colony.growth);
    expect(helped.colony.energy).toBeGreaterThan(waiting.colony.energy);
    expect(helped.colony.care.acknowledgement).toBeGreaterThan(0);
    expect(waiting.colony.care.phase).toBe('wait');
    expect(waiting.colony.care.acknowledgement).toBe(0);
    expect(
      sampleEditionLife(recipe, bloomReadyAt(recipe), 0).colony.ready
    ).toBe(true);
    expect(
      sampleEditionLife(recipe, bloomReadyAt(recipe), 0, false).colony.ready
    ).toBe(false);
  });

  it('replays every receipt exactly and settles before the earliest descendant commitment', () => {
    const future = sampleNurseryCare(recipe, 55, 0.00216);
    sampleNurseryCare(recipe, 51, 0.00216);
    expect(sampleNurseryCare(recipe, 55, 0.00216)).toEqual(future);
    for (const growth of [0, 0.6, 1]) {
      const specimen = createEditionRecipe(0, {
        form: 'bloom',
        seed: 1,
        richness: 1,
        treatment: 'prismatic',
        controls: { ...DEFAULT_LIVING_CONTROLS, growth },
      });
      expect(
        sampleEditionLife(specimen, bloomReadyAt(specimen), 0).colony.ready
      ).toBe(true);
      const settled = sampleEditionLife(specimen, 60, 0).colony.care;
      expect(settled.active).toBe(false);
      expect(settled.approach).toBe(0);
      expect(settled.receipt).toBe(1);
    }
  });
});
