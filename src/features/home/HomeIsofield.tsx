import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { getStudy, getVariant } from '../lab/registry';
import type { TargetImpact } from '../particle-text/MastheadTarget';
import { IsofieldState } from './IsofieldState';
import './home.css';

const IsofieldCanvas = lazy(() => import('./IsofieldCanvas'));
const study = getStudy('shader-gallery')!;
const variant = getVariant(study.slug, 'isofield')!;

export function HomeIsofield({
  impact,
  selection,
  onEcho,
}: {
  impact: TargetImpact | null;
  selection: number;
  onEcho: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(new IsofieldState()).current;
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [near, setNear] = useState(false);
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        setNear(entries[entries.length - 1]?.isIntersecting ?? false),
      { rootMargin: '600px' }
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (impact) {
      state.excite(impact);
    }
  }, [impact, state]);

  useEffect(() => {
    if (!selection) return;
    state.seed = selection;
    state.focus(
      Math.sin(selection * 0.9) * 0.65,
      Math.cos(selection * 0.9) * 0.45
    );
    state.excite();
  }, [selection, state]);
  const excite = () => {
    state.excite();
    onEcho();
  };
  return (
    <section className="home-isofield" aria-label="Interactive contour field">
      <div
        ref={host}
        className="home-isofield-stage"
        onPointerMove={(event) => {
          if (event.pointerType === 'touch') return;
          const box = event.currentTarget.getBoundingClientRect();
          state.focus(
            ((event.clientX - box.left) / box.width) * 2 - 1,
            1 - ((event.clientY - box.top) / box.height) * 2
          );
        }}
        onPointerDown={(event) => {
          gesture.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onPointerLeave={() => {
          gesture.current = null;
          state.focus(0, 0);
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (
            !start ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
          )
            return;
          const box = event.currentTarget.getBoundingClientRect();
          state.focus(
            ((event.clientX - box.left) / box.width) * 2 - 1,
            1 - ((event.clientY - box.top) / box.height) * 2
          );
          excite();
        }}
      >
        <svg
          className="home-isofield-fallback"
          viewBox="0 0 600 340"
          aria-hidden="true"
        >
          {Array.from({ length: 14 }, (_, i) => (
            <ellipse
              key={i}
              cx="300"
              cy={220 - i * 6}
              rx={220 - i * 12}
              ry={85 - i * 4}
            />
          ))}
        </svg>
        {near && !unavailable && (
          <Suspense fallback={null}>
            <IsofieldCanvas state={state} onUnavailable={onUnavailable} />
          </Suspense>
        )}
      </div>
      <div className="home-encounter-footer">
        <div className="home-encounter-actions">
          <button
            type="button"
            disabled={unavailable}
            onClick={excite}
            className="home-wave-button"
          >
            Send a wave <span aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            aria-pressed={paused}
            disabled={unavailable}
            onClick={() => {
              state.paused = !paused;
              setPaused(!paused);
              state.invalidate?.();
            }}
            className="home-motion-button"
          >
            {paused ? 'Resume motion' : 'Pause motion'}
          </button>
        </div>
        {unavailable && (
          <p className="sr-only" role="status">
            Live graphics are unavailable. Open the full study below.
          </p>
        )}
        <Link
          className="home-study-link font-meta"
          to={`/experiments/${study.slug}/${variant.slug}`}
        >
          Look closer <span aria-hidden="true">↗</span>
          <span className="sr-only"> · {variant.title}</span>
        </Link>
      </div>
    </section>
  );
}
