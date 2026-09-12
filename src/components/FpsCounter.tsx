import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SAMPLE_WINDOW_MS = 500;

/**
 * Frame-rate readout, toggled by a `?fps` query param so it can be dropped
 * onto any page link without a build flag. Mounted once in App, above the
 * router, so the toggle survives route changes.
 */
export function FpsCounter() {
  const [searchParams] = useSearchParams();
  const [fps, setFps] = useState<number | null>(null);
  const enabled = searchParams.has('fps');

  useEffect(() => {
    if (!enabled) return;

    let frameCount = 0;
    let windowStart = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      frameCount += 1;
      const elapsed = now - windowStart;

      if (elapsed >= SAMPLE_WINDOW_MS) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        windowStart = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="font-meta fixed bottom-4 right-4 z-50 rounded-sm border border-border bg-bg/90 px-2 py-1 text-fg-subtle backdrop-blur-sm pointer-events-none"
      aria-hidden="true"
    >
      {fps ?? '—'} fps
    </div>
  );
}
