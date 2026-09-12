import {
  ExperienceUnavailableError,
  type IExperience,
} from '@/vanilla-three/types';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import {
  startExperience,
  type ExperienceLifecycle,
} from '@/vanilla-three/experienceLifecycle';
import { useEffect, useRef, useState, type RefObject } from 'react';

// Type for a simple initialization function that returns a cleanup function
type ThreeInitFn = (canvas: HTMLCanvasElement) => (() => void) | void;

export type ExperienceConstructor = new (
  canvas: HTMLCanvasElement,
  options?: ExperienceOptions
) => IExperience;

export type ExperienceFactory = (
  canvas: HTMLCanvasElement,
  options?: ExperienceOptions
) => IExperience;

interface ThreeCanvasProps {
  experienceClass?: ExperienceConstructor;
  experienceFactory?: ExperienceFactory;
  initFn?: ThreeInitFn;
  controlsContainerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  ariaLabel?: string;
  tabIndex?: number;
}

/** Reads the `state` query param a share link carries, if any. */
function readSharedState(): unknown {
  const raw = new URLSearchParams(window.location.search).get('state');
  if (!raw) return undefined;
  try {
    return JSON.parse(decodeURIComponent(atob(raw)));
  } catch {
    return undefined;
  }
}

export default function ThreeCanvas({
  experienceClass,
  experienceFactory,
  initFn,
  controlsContainerRef,
  className = 'size-full',
  ariaLabel,
  tabIndex,
}: ThreeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<IExperience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(shareTimer.current), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) {
      throw new Error('Canvas not found');
    }

    setError(null);
    setShareCopied(false);
    clearTimeout(shareTimer.current);
    setCanShare(false);
    experienceRef.current = null;
    delete canvas.dataset.ready;
    delete canvas.dataset.unavailable;

    if (experienceClass || experienceFactory) {
      let cancelled = false;
      let failed = false;
      let lifecycle: ExperienceLifecycle | undefined;
      const reportError = (cause: unknown) => {
        if (cancelled || failed) return;
        failed = true;
        delete canvas.dataset.ready;
        if (cause instanceof ExperienceUnavailableError)
          canvas.dataset.unavailable = cause.capability;
        experienceRef.current = null;
        setCanShare(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'This study could not be initialised.'
        );
        lifecycle?.cancel();
      };
      const options: ExperienceOptions = {
        controlsContainer: controlsContainerRef?.current ?? null,
        onError: reportError,
      };

      try {
        const experience = experienceFactory
          ? experienceFactory(canvas, options)
          : new experienceClass!(canvas, options);
        lifecycle = startExperience(experience, reportError);

        // A route check that only waits for the canvas to attach cannot tell
        // a study that rendered from one that threw before its first frame —
        // this is the signal that init() actually resolved. `ready` settles
        // on failure too (the error already routed through onError above),
        // so only mark the canvas ready when init genuinely succeeded.
        void lifecycle.ready
          .then(() => {
            if (failed || cancelled || canvasRef.current !== canvas) return;
            experienceRef.current = experience;

            if (experience.setShareableState) {
              const shared = readSharedState();
              if (shared !== undefined) experience.setShareableState(shared);
            }
            canvas.dataset.ready = 'true';
            setCanShare(typeof experience.getShareableState === 'function');
          })
          .catch(reportError);

        return () => {
          cancelled = true;
          lifecycle?.cancel();
        };
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'This study could not be initialised.'
        );
      }
    } else if (initFn) {
      try {
        // Function-based approach - cleanup captured by closure
        const cleanup = initFn(canvas);

        return () => {
          cleanup?.();
        };
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'This study could not be initialised.'
        );
      }
    } else {
      throw new Error(
        'Either experienceClass, experienceFactory, or initFn must be provided'
      );
    }
  }, [experienceClass, experienceFactory, initFn, controlsContainerRef]);

  const copyShareLink = async () => {
    const state = experienceRef.current?.getShareableState?.();
    if (state === undefined) return;

    const url = new URL(window.location.href);
    url.searchParams.set(
      'state',
      btoa(encodeURIComponent(JSON.stringify(state)))
    );

    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
      clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the link is still in the URL bar's
      // history via replaceState, so nothing is lost, just not auto-copied.
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
        tabIndex={tabIndex}
      />
      {canShare && (
        <button
          type="button"
          onClick={copyShareLink}
          data-poster-hide
          className="pointer-events-auto absolute bottom-2 right-2 border border-current/30 bg-bg/85 px-3 py-2 font-meta text-fg backdrop-blur-sm transition-colors duration-(--dur-fast) hover:border-current"
        >
          {shareCopied ? 'Link copied' : 'Copy share link'}
        </button>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-ink p-6 text-center text-on-ink"
        >
          <div className="max-w-[var(--measure-tight)]">
            <p className="font-display text-2xl uppercase">Study unavailable</p>
            <p className="mt-3 font-meta text-on-ink-muted">{error}</p>
          </div>
        </div>
      )}
    </>
  );
}
