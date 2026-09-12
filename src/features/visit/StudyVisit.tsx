import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getStudy, getVariant } from '../lab/registry';
import { recordVisit } from './store';

/** Mounted inside Suspense, so an unloaded page does not earn a visit. */
export function StudyVisit({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const [, section, slug, variant, ...rest] = pathname
      .replace(/\/$/, '')
      .split('/');
    if (section !== 'experiments' || rest.length || !getStudy(slug)) return;
    if (variant && !getVariant(slug, variant)) return;
    recordVisit(slug);
  }, [pathname]);
  return children;
}
