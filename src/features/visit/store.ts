import { useSyncExternalStore } from 'react';
import { studies } from '../lab/registry';
import { addVisit, readVisits } from './model';

const KEY = 'rahimny:visited-editions:v1';
const valid = new Set(studies.map((study) => study.slug));
const empty: readonly string[] = [];
let snapshot: readonly string[] | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): readonly string[] {
  if (snapshot) return snapshot;
  try {
    snapshot = readVisits(sessionStorage.getItem(KEY), valid);
  } catch {
    snapshot = empty;
  }
  return snapshot;
}

export function recordVisit(slug: string) {
  if (!valid.has(slug)) return;
  const previous = getSnapshot();
  snapshot = addVisit(previous, slug);
  if (snapshot === previous) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // In-memory visits still work when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVisits() {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty);
}
