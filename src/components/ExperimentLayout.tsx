import ThreeCanvas, {
  type ExperienceConstructor,
  type ExperienceFactory,
} from '@/components/three-canvas';
import { type ReactNode, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { StudyNotes } from '@/components/StudyNotes';
import { getStudy, getVariant } from '@/features/lab/registry';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

interface ExperimentLayoutProps {
  experienceClass?: ExperienceConstructor;
  experienceFactory?: ExperienceFactory;
  breadcrumb?: ReactNode;
  children?: ReactNode;
  showControls?: boolean;
  canvasTabIndex?: number;
  collapsibleNotes?: boolean;
}

export default function ExperimentLayout({
  experienceClass,
  experienceFactory,
  breadcrumb,
  children,
  showControls = true,
  canvasTabIndex,
  collapsibleNotes = false,
}: ExperimentLayoutProps) {
  const controlsContainerRef = useRef<HTMLDivElement>(null);
  const breadcrumbItems = useBreadcrumbFromRoute();
  const segments = useLocation().pathname.split('/');
  const study = getStudy(segments[2] ?? '');
  const variant = segments[3]
    ? getVariant(segments[2], segments[3])
    : undefined;
  const notes = variant?.notes ?? study?.notes;
  useDocumentMeta(
    variant ? `${study?.title} — ${variant.title}` : (study?.title ?? 'Lab'),
    variant?.summary ?? study?.summary ?? 'A study in the lab.'
  );

  const hasOtherContent = breadcrumb || children;
  const hasBreadcrumbItems = breadcrumbItems.length > 0;

  // Determine what to show in the left overlay
  const shouldShowOverlay = hasBreadcrumbItems || hasOtherContent;

  let overlayContent: ReactNode = null;
  if (hasBreadcrumbItems && !breadcrumb) {
    // Use route-based breadcrumb
    overlayContent = <ExperimentBreadcrumb items={breadcrumbItems} />;
  } else if (breadcrumb) {
    // Legacy breadcrumb prop support
    overlayContent = breadcrumb;
  } else if (children) {
    // Other content
    overlayContent = children;
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <ThreeCanvas
        experienceClass={experienceClass}
        experienceFactory={experienceFactory}
        controlsContainerRef={showControls ? controlsContainerRef : undefined}
        ariaLabel={variant?.summary ?? study?.summary}
        tabIndex={canvasTabIndex}
      />

      {/* data-poster-hide: chrome is not part of the work. capture-posters.mjs
          hides everything carrying this attribute before shooting. */}
      <div
        data-poster-hide
        className="absolute inset-0 flex flex-col justify-between pt-[calc(var(--navbar-height)+0.5rem)] p-2 pointer-events-none"
      >
        <div className="flex justify-between items-start gap-2">
          {shouldShowOverlay && (
            <div className="hidden sm:block bg-background/60 backdrop-blur-sm px-4 py-2 rounded-lg border shadow-lg pointer-events-auto max-w-[calc(100vw-16rem)] min-w-0">
              {overlayContent}
            </div>
          )}

          {showControls && (
            <div
              ref={controlsContainerRef}
              className="pointer-events-auto ml-auto max-h-[calc(100vh-var(--navbar-height)-2rem)] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden"
            />
          )}
        </div>

        {notes && (variant?.notes || collapsibleNotes) ? (
          <details className="pointer-events-auto self-start max-w-[calc(100vw-1rem)]">
            <summary className="w-fit cursor-pointer border border-border bg-bg/95 px-4 py-3 font-meta">
              About this study
            </summary>
            <div className="max-h-[50dvh] overflow-y-auto">
              <StudyNotes notes={notes} construction={study?.construction} />
            </div>
          </details>
        ) : notes ? (
          <div className="pointer-events-auto hidden self-start md:block">
            <StudyNotes notes={notes} construction={study?.construction} />
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
