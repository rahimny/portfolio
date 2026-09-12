import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { londonSky, skyPosition } from '@/features/local-sky/model';
import '@/features/local-sky/sky.css';

const dayPath = Array.from({ length: 49 }, (_, i) => {
  const p = skyPosition(i / 48);
  return `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
}).join(' ');

export function LocalTime() {
  const [now, setNow] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const sheet = useRef<HTMLSpanElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      if (!root.current || !sheet.current) return;
      const trigger = root.current.getBoundingClientRect();
      const width = sheet.current.offsetWidth;
      const viewport = document.documentElement.clientWidth;
      const left = Math.max(
        16,
        Math.min(
          trigger.left + (trigger.width - width) / 2,
          viewport - width - 16
        )
      );
      sheet.current.style.left = `${left - trigger.left}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const sky = now ? londonSky(now) : null;
  return (
    <span
      ref={root}
      className="local-sky"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="local-sky-trigger"
        aria-label="A little sky over Cambridge"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <time dateTime={now?.toISOString()}>{sky?.time ?? '--:--'}</time>
        <svg viewBox="0 0 32 26" aria-hidden="true">
          <path d="M2 13H30" stroke="currentColor" strokeWidth="1" />
          {sky && (
            <circle
              cx={4 + sky.fraction * 24}
              cy={13 + Math.cos(sky.fraction * Math.PI * 2) * 8}
              r="3.5"
              fill="currentColor"
            />
          )}
        </svg>
      </button>
      <span ref={sheet} id={id} className="local-sky-sheet" hidden={!open}>
        <span className="local-sky-title">
          {sky?.period ?? 'A moment'} in Cambridge.
        </span>
        <svg
          viewBox="0 0 240 140"
          role="img"
          aria-label="A day drawn from the local clock"
        >
          <path
            d={dayPath}
            stroke="currentColor"
            opacity=".2"
            fill="none"
            strokeDasharray="2 5"
          />
          <path d="M10 65H230" stroke="currentColor" opacity=".4" />
          {sky && (
            <circle cx={sky.x} cy={sky.y} r="13" className="local-sky-disc" />
          )}
          <text x="10" y="132">
            00
          </text>
          <text x="111" y="132">
            12
          </text>
          <text x="211" y="132">
            24
          </text>
        </svg>
        <span className="local-sky-note">
          A day, drawn from the local clock.
        </span>
      </span>
    </span>
  );
}
