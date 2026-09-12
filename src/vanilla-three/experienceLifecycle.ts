import type { IExperience } from './types';

export interface ExperienceLifecycle {
  readonly ready: Promise<void>;
  cancel(): void;
}

/**
 * Own the asynchronous seam between React and an imperative experience.
 *
 * Disposal waits for pending initialisation so a half-built experience is not
 * torn down underneath its own async work. Implementations can honour the
 * signal to stop sooner; either way, cleanup runs exactly once.
 */
export function startExperience(
  experience: IExperience,
  onError: (error: unknown) => void
): ExperienceLifecycle {
  const controller = new AbortController();
  let settled = false;
  let cleanupRequested = false;
  let disposed = false;

  const disposeOnce = () => {
    if (disposed) return;
    disposed = true;
    experience.dispose();
  };

  const ready = Promise.resolve()
    .then(() => {
      // StrictMode can cancel this host before the setup microtask runs.
      // Starting it anyway lets two renderers mutate the same WebGL context.
      if (controller.signal.aborted) return;
      return experience.init(controller.signal);
    })
    .catch((error: unknown) => {
      disposeOnce();
      if (!controller.signal.aborted) onError(error);
    })
    .finally(() => {
      settled = true;
      if (cleanupRequested) disposeOnce();
    });

  return {
    ready,
    cancel() {
      cleanupRequested = true;
      controller.abort();
      if (settled) disposeOnce();
    },
  };
}
