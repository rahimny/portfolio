import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  featuredStudy,
  getStudy,
  getVariant,
  studies,
  type StudySlug,
} from './registry';
import { getStudyLoader } from './studyRoutes';

describe('study registry', () => {
  it('keeps stable identifiers unique', () => {
    expect(new Set(studies.map((study) => study.slug)).size).toBe(
      studies.length
    );
    expect(new Set(studies.map((study) => study.edition)).size).toBe(
      studies.length
    );
  });

  it('is ordered newest first and has at most one featured study', () => {
    expect(studies.map((study) => study.edition)).toEqual(
      [...studies]
        .sort((left, right) => right.edition - left.edition)
        .map((study) => study.edition)
    );

    const featured = studies.filter((study) => study.featured);
    expect(featured.length).toBeLessThanOrEqual(1);
    expect(featuredStudy).toBe(featured[0]);
  });

  it('resolves every study and variant through the registry API', () => {
    for (const study of studies) {
      expect(getStudy(study.slug)).toBe(study);

      for (const variant of study.variants ?? []) {
        expect(getVariant(study.slug, variant.slug)).toBe(variant);
      }
    }
  });

  // A registry path that no longer resolves renders a broken frame on the
  // index, and nothing else catches it — retiring a study deletes its poster,
  // adding one can forget to capture it.
  it('points every image path at a file that exists', () => {
    const missing: string[] = [];

    for (const study of studies) {
      const paths = [
        study.poster,
        study.encounterPoster,
        study.construction?.image,
        ...(study.variants ?? []).map((variant) => variant.poster),
      ];

      for (const path of paths) {
        if (path && !existsSync(`public${path}`)) {
          missing.push(`${study.slug}: ${path}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('has a conventionally named page for every registered study', () => {
    for (const study of studies) {
      expect(() => getStudyLoader(study.slug as StudySlug)).not.toThrow();
    }
  });
});
