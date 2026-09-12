import type { ComponentType } from 'react';
import type { StudySlug } from './registry';

type StudyModule = { default: ComponentType };
type StudyLoader = () => Promise<StudyModule>;

const modules = import.meta.glob<StudyModule>(
  '../../pages/experiments/*Experiment.tsx'
);

function componentName(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Resolve a registered study through the page-file naming convention.
 *
 * Keeping implementation discovery separate from study metadata means adding
 * a study requires one registry record and one conventionally named page; no
 * hand-written route table can drift from the index.
 */
export function getStudyLoader(slug: StudySlug): StudyLoader {
  const path = `../../pages/experiments/${componentName(slug)}Experiment.tsx`;
  const loader = modules[path];

  if (!loader) {
    throw new Error(
      `No study page found for "${slug}". Expected ${path.replace('../../', 'src/')}`
    );
  }

  return loader;
}
