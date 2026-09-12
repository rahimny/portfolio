import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Study } from '../lab/registry';
import type { HomeLandingEncounter } from './HomeLandingEncounter';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface ArtworkLanding {
  encounter: HomeLandingEncounter;
  revealed: boolean;
  close: () => void;
}

export function ArtworkPreview({
  study,
  landing,
}: {
  study: Study;
  landing?: ArtworkLanding;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  const id = useId();
  const revealed =
    !!study.construction && (open || hovered || !!landing?.revealed);
  return (
    <div className="artwork-preview" data-revealed={revealed}>
      <Link
        to={`/experiments/${study.slug}`}
        className="home-showcase-image"
        aria-label={`Open ${study.title}`}
      >
        <img src={study.poster} alt="" loading="lazy" decoding="async" />
      </Link>
      {study.construction && (
        <>
          {landing && (
            <button
              ref={landing.encounter.target}
              type="button"
              className="artwork-landing font-meta"
              aria-label={
                reducedMotion
                  ? `Reveal ${study.title} construction`
                  : `Land the drone to reveal ${study.title}`
              }
              aria-controls={id}
              aria-expanded={revealed}
              onClick={() => {
                if (!landing.encounter.request.current?.())
                  landing.encounter.onArrive();
              }}
            >
              <span aria-hidden="true">⌁</span>{' '}
              {reducedMotion
                ? 'Look inside'
                : landing.revealed
                  ? 'Inside revealed'
                  : 'Land here · look inside'}
            </button>
          )}
          <div id={id} className="artwork-inside" hidden={!revealed}>
            <img
              src={study.construction.image}
              alt={study.construction.alt}
              width={1200}
              height={1200}
              loading="lazy"
              decoding="async"
            />
            <p>
              <strong>{study.construction.title}</strong>
              {study.construction.caption}
            </p>
          </div>
          <button
            type="button"
            className="artwork-peek font-meta"
            aria-controls={id}
            aria-expanded={revealed}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') setHovered(true);
            }}
            onPointerLeave={() => setHovered(false)}
            onClick={() => {
              setOpen((value) => !(value || landing?.revealed));
              landing?.close();
              setHovered(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                landing?.close();
                setHovered(false);
              }
            }}
          >
            <span aria-hidden="true">{revealed ? '−' : '+'}</span>{' '}
            {revealed ? 'Outside' : 'Inside'}
          </button>
        </>
      )}
    </div>
  );
}
