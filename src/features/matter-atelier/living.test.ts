import { describe, expect, it } from 'vitest';
import {
  bloomReadyAt,
  createEditionRecipe,
  DEFAULT_LIVING_CONTROLS,
  EditionSequence,
  sampleEditionLife,
  sampleLivingState,
  type EditionInput,
} from './living';
import { generateContours, planPrint } from './toolpath';
import { artComposition } from './patterns';
import { BRUSH_BASE } from './process';

const input: EditionInput = {
  form: 'bloom',
  seed: 1,
  treatment: 'prismatic',
  richness: 1,
  controls: DEFAULT_LIVING_CONTROLS,
};

describe('the atelier resource and inheritance cycle', () => {
  it('keeps an older colony’s expression when a different recipe enters the bath', () => {
    const sequence = new EditionSequence();
    const first = sequence
      .commitThrough(0, {
        ...input,
        controls: { ...DEFAULT_LIVING_CONTROLS, expression: 0.15 },
      })
      .slice();
    const recipes = sequence.commitThrough(2, {
      ...input,
      controls: { ...DEFAULT_LIVING_CONTROLS, expression: 0.9 },
    });
    const state = sampleLivingState(
      66,
      recipes.map((recipe) => ({ recipe, mass: 0.07 }))
    );
    expect(state.controls.expression).toBe(0.9);
    expect(
      state.colonies.find((colony) => colony.seed === first[0].seed)?.expression
    ).toBe(0.15);
  });
  it('retains deterministic inherited terrain instead of ignoring its genome', () => {
    const terrain = createEditionRecipe(0, { ...input, form: 'terrain' });
    const a = generateContours('terrain', terrain.seed, terrain.genome);
    const b = generateContours('terrain', terrain.seed, {
      ...terrain.genome,
      twist: 1.35,
      phase: 0.8,
      lobes: 8,
    });
    expect(a).toEqual(
      generateContours('terrain', terrain.seed, terrain.genome)
    );
    expect(b).not.toEqual(a);
    const job = planPrint(b);
    expect(job.moves.length).toBeGreaterThan(100);
    expect(
      job.moves.every((move) => Number.isFinite(move.length + move.offset))
    ).toBe(true);
  });
  it('commits recipes once and applies changed controls only to later births', () => {
    const sequence = new EditionSequence();
    const first = sequence.commitThrough(2, input).slice();
    const changed: EditionInput = {
      ...input,
      treatment: 'glitch',
      richness: 0.6,
      controls: { ...DEFAULT_LIVING_CONTROLS, inheritance: 1, growth: 0 },
    };
    expect(sequence.commitThrough(2, changed)).toEqual(first);
    const next = sequence.commitThrough(3, changed);
    expect(next.slice(0, 2)).toEqual(first.slice(1));
    expect(next[2].treatment).toBe('glitch');
    expect(next[2].richness).toBe(0.6);
    expect(Object.isFrozen(next[2])).toBe(true);
    expect(Object.isFrozen(next[2].genome)).toBe(true);
    expect(Object.isFrozen(next[2].controls)).toBe(true);
  });

  it('admits feedback only after a flower is ready, without rewriting a printing descendant', () => {
    for (const growth of [0, 0.6, 1]) {
      const options = {
        ...input,
        controls: { ...DEFAULT_LIVING_CONTROLS, growth, inheritance: 1 },
      };
      const first = createEditionRecipe(0, options);
      const overlapping = createEditionRecipe(1, options, [first]);
      const later = createEditionRecipe(2, options, [first, overlapping]);
      expect(overlapping.genome.parentSeed).toBeNull();
      expect(bloomReadyAt(first)).toBeGreaterThan(overlapping.born);
      expect(sampleEditionLife(first, later.born).colony.ready).toBe(true);
      expect(later.genome.parentSeed).toBe(first.seed);
      expect(later.genome.lobes).toBe(first.genome.lobes);
      expect(later.genome.branching).toBe(first.genome.branching);
      expect(later.genome.generation).toBe(1);
    }
  });

  it('conserves the finishing aliquot through persistent arrivals and reversal', () => {
    const recipe = createEditionRecipe(0, input);
    let previous = sampleEditionLife(recipe, 24, 0.08);
    for (let time = 0; time <= 80; time += 0.125) {
      const state = sampleEditionLife(recipe, time, 0.08);
      const { allocated, ...owners } = state.ledger;
      expect(
        Object.values(owners).reduce((total, value) => total + value, 0)
      ).toBeCloseTo(allocated, 12);
      expect(state.feed.id).toBe(previous.feed.id);
      expect(state.recovery.id).toBe(previous.recovery.id);
      if (time < 29.5) expect(state.bathReady).toBe(false);
      if (time < 51) {
        expect(state.colony.energy).toBe(0);
        expect(state.colony.growth).toBe(0);
      }
      previous = state;
    }
    expect(sampleEditionLife(recipe, 29.5, 0.08).feed).toMatchObject({
      arrived: true,
      active: false,
      progress: 1,
    });
    expect(sampleEditionLife(recipe, 51, 0.08).recovery.arrived).toBe(true);
    const future = sampleEditionLife(recipe, 58, 0.08);
    sampleEditionLife(recipe, 8, 0.08);
    expect(sampleEditionLife(recipe, 58, 0.08)).toEqual(future);
    expect(future.colony.bloom).toBeGreaterThan(0.9);
  });

  it('retains bounded ancestry and resumes reproducibly from a checkpoint', () => {
    const sequence = new EditionSequence();
    const recipes = sequence.commitThrough(12, input);
    expect(recipes).toHaveLength(3);
    const checkpoint = sequence.checkpoint();
    const expected = sequence.commitThrough(15, input).slice();
    const restored = new EditionSequence();
    restored.restore(checkpoint);
    expect(restored.commitThrough(15, input)).toEqual(expected);
    const state = sampleLivingState(
      15 * 30 + 25,
      expected.map((recipe) => ({ recipe, mass: 0.07 }))
    );
    expect(state.colonies).toHaveLength(3);
    expect(new Set(state.colonies.map((colony) => colony.id % 3)).size).toBe(3);
    expect(state.feed.editionId).toBe(15);
    expect(state.feed.active).toBe(true);
    expect(state.genome.seed).toBe(expected[2].seed);
    const afterReturn = sampleLivingState(
      15 * 30 + 21,
      expected.map((recipe) => ({ recipe, mass: 0.07 }))
    );
    expect(afterReturn.recovery).toMatchObject({
      editionId: 14,
      active: false,
      arrived: true,
      progress: 1,
    });
  });

  it('keeps inherited contours closed and every linked drawing within the arm annulus', () => {
    const sequence = new EditionSequence();
    for (let id = 0; id < 9; id++) {
      const recipe = sequence.commitThrough(id, input).at(-1)!;
      const contours = generateContours(
        recipe.form,
        recipe.seed,
        recipe.genome
      );
      for (const contour of contours) {
        expect(
          Math.hypot(
            contour[0].x - contour.at(-1)!.x,
            contour[0].z - contour.at(-1)!.z
          )
        ).toBeLessThan(1e-8);
        expect(
          contour.every((point) => Number.isFinite(point.x + point.y + point.z))
        ).toBe(true);
      }
      const job = planPrint(contours);
      const art = artComposition(job, recipe.seed, recipe.genome);
      const changed = artComposition(
        planPrint(generateContours('orbit', 13)),
        recipe.seed,
        recipe.genome
      );
      expect(art.paths).not.toEqual(changed.paths);
      for (const path of art.paths) {
        for (const point of path) {
          const radius = Math.hypot(
            point.x - BRUSH_BASE.x,
            point.z - BRUSH_BASE.z
          );
          expect(radius).toBeGreaterThan(0.95);
          expect(radius).toBeLessThan(2.95);
        }
      }
    }
  });
});
