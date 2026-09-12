import { useLocation } from 'react-router-dom';
import type { BreadcrumbItem } from '@/components/ExperimentBreadcrumb';
import { getStudy, getVariant } from '@/features/lab/registry';

const EXPERIMENTS_BASE_PATH = '/experiments';

export function useBreadcrumbFromRoute(): BreadcrumbItem[] {
  const location = useLocation();
  const pathname = location.pathname;

  // Only generate breadcrumbs for experiment routes
  if (!pathname.startsWith(EXPERIMENTS_BASE_PATH)) {
    return [];
  }

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 1) {
    // Just /experiments - no breadcrumb needed for grid page
    return [];
  }

  const breadcrumbs: BreadcrumbItem[] = [];

  // Handle experiment-specific routes
  if (segments.length >= 2) {
    const experimentSlug = segments[1];
    const study = getStudy(experimentSlug);
    const experimentName = study?.title ?? experimentSlug;

    if (study?.variants?.length && segments.length === 3) {
      breadcrumbs.push({
        label: experimentName,
        href: `/experiments/${experimentSlug}`,
      });

      const variantSlug = segments[2];
      const variantName =
        getVariant(experimentSlug, variantSlug)?.title ?? variantSlug;
      breadcrumbs.push({
        label: variantName,
      });
    } else if (study?.variants?.length) {
      breadcrumbs.push({
        label: experimentName,
      });
    } else {
      // /experiments/other-experiment
      breadcrumbs.push({
        label: experimentName,
      });
    }
  }

  return breadcrumbs;
}
