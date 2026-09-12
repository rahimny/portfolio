import type { Ring } from './ArcFigure';
import type { Study } from '@/features/lab/registry';

/**
 * The mapping from the registry to the geometry.
 *
 * Kept separate from `ArcFigure`, which knows about arcs and nothing about
 * studies. Every number below is read off a record — none of it is chosen to
 * make the picture look a particular way, which is the whole claim the figures
 * make.
 */

/**
 * The whole collection as one construction.
 *
 * One ring per study, innermost first, so the figure reads outward in the order
 * the work was made. Arc length is the study's technique count against the
 * richest study in the collection, weight is the renderer, and the one accent
 * ring is the featured study — the same thing the orange plate on the index
 * says, said again in geometry.
 */
export function collectionRings(
  studies: readonly Study[],
  /** Slug to pick out in the accent, instead of the featured study. */
  highlight?: string
): Ring[] {
  const oldestFirst = [...studies].sort((a, b) => a.edition - b.edition);
  const richest = Math.max(...studies.map((s) => s.technique.length), 1);

  return oldestFirst.map((study) => {
    // Scaled into 0.25–0.85 rather than mapped straight onto 0–1. Raw
    // count/richest sends every study that ties for richest to a complete
    // circle, and a ring with no gap has nothing left to be a fraction of —
    // three of the six closed and the figure stopped being comparative.
    const t = richest > 1 ? (study.technique.length - 1) / (richest - 1) : 1;
    const isHighlight = highlight ? study.slug === highlight : study.featured;

    return {
      sweep: 0.25 + 0.6 * t,
      weight: study.renderer === 'webgl' ? 'heavy' : 'light',
      accent: isHighlight,
    };
  });
}

/** The collection in the order the rings are drawn, for the legend. */
export function ringOrder(studies: readonly Study[]): Study[] {
  return [...studies].sort((a, b) => a.edition - b.edition);
}

/**
 * A single study, for the cards and rows that have no capture.
 *
 * The same construction as the collection, with this study's ring picked out in
 * the accent and every other ring dropped to light. A first version drew one
 * ring per technique instead, which collapsed to a single lonely arc for
 * `particle-sanctuary` — one technique, one ring, nothing to compare it to.
 * Showing the whole series and marking the study's place in it says the one
 * useful thing about a study you cannot yet see, and it is the same figure
 * everywhere rather than a second visual language.
 */
export function studyRings(study: Study, all: readonly Study[]): Ring[] {
  return collectionRings(all, study.slug).map((ring) => ({
    ...ring,
    weight: ring.accent ? 'heavy' : 'light',
  }));
}
