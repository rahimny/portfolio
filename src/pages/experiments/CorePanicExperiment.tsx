import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, Pause, Volume2, VolumeX } from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  CorePanicExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/core-panic/CorePanicExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './CorePanicExperiment.css';

function savedSound(): boolean {
  try {
    return localStorage.getItem('core-panic-sound') === 'true';
  } catch {
    return false;
  }
}
export default function CorePanicExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<CorePanicExperience | null>(null);
  const root = useRef<HTMLDivElement>(null),
    retry = useRef<HTMLButtonElement>(null),
    helpClose = useRef<HTMLButtonElement>(null);
  const activePointer = useRef<number | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [sound, setSound] = useState(savedSound);
  const [help, setHelp] = useState(false);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new CorePanicExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  const play = () => {
    experience.current?.setSound(sound);
    if (status.phase === 'paused') experience.current?.resume();
    else experience.current?.start();
    root.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    activePointer.current = null;
    if (help || (status.phase !== 'over' && status.phase !== 'paused')) return;
    const timer = window.setTimeout(
      () => retry.current?.focus({ preventScroll: true }),
      status.phase === 'over' ? 220 : 0
    );
    return () => window.clearTimeout(timer);
  }, [status.phase, help]);
  useEffect(() => {
    if (help) helpClose.current?.focus();
  }, [help]);
  const running = status.phase === 'playing';
  const overlay = status.phase === 'paused' || status.phase === 'over';
  const instruction =
    status.feedback ||
    (status.time < 9
      ? 'Hold to gather. Aim at an opening. Release.'
      : status.pressure > 75
        ? 'Critical · collapse knots before they rupture'
        : 'An implosion opens nearby knots. Follow it up.');
  return (
    <div
      ref={root}
      className="core-panic"
      tabIndex={0}
      role="region"
      aria-label={`${study.title} arcade game`}
      data-phase={status.phase}
      data-danger={status.pressure >= 75}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          experience.current?.cancel();
      }}
      onKeyDown={(event) => {
        const key = event.key.toLowerCase();
        if (help) {
          if (key === 'tab') {
            event.preventDefault();
            helpClose.current?.focus();
          }
          if (key === 'escape') {
            event.preventDefault();
            setHelp(false);
            (retry.current ?? root.current)?.focus();
          }
          return;
        }
        if (overlay && key === 'tab') {
          const buttons = Array.from(
            root.current?.querySelectorAll<HTMLButtonElement>(
              '.core-dialog button'
            ) ?? []
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement
          );
          event.preventDefault();
          buttons[
            (index + (event.shiftKey ? -1 : 1) + buttons.length) %
              buttons.length
          ]?.focus();
          return;
        }
        if (key === 'escape' || key === 'p') {
          event.preventDefault();
          experience.current?.keyDown(
            event.key === 'Escape' ? 'Escape' : key,
            event.repeat
          );
          return;
        }
        if ((event.target as HTMLElement).closest('button')) return;
        if (
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            ' ',
            '1',
            '2',
            '3',
            '4',
            '5',
          ].includes(event.key)
        ) {
          event.preventDefault();
          experience.current?.keyDown(event.key, event.repeat);
        }
      }}
    >
      <div
        className="core-stage"
        onPointerMove={(event) => {
          if (
            running &&
            !help &&
            (event.pointerType === 'mouse' ||
              activePointer.current === event.pointerId)
          )
            experience.current?.aim(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (
            !running ||
            help ||
            event.button !== 0 ||
            activePointer.current !== null
          )
            return;
          event.preventDefault();
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          const button = (
            event.target as HTMLElement
          ).closest<HTMLButtonElement>('[data-knot]');
          const slot = button
            ? Number(button.dataset.knot)
            : (experience.current?.aim(event.clientX, event.clientY) ?? -1);
          if (slot >= 0) experience.current?.select(slot);
          root.current?.focus({ preventScroll: true });
          experience.current?.begin('pointer');
        }}
        onPointerUp={(event) => {
          if (activePointer.current === event.pointerId) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const inside =
              event.clientX >= bounds.left &&
              event.clientX <= bounds.right &&
              event.clientY >= bounds.top &&
              event.clientY <= bounds.bottom;
            if (inside) {
              experience.current?.aim(event.clientX, event.clientY);
              experience.current?.release('pointer');
            } else experience.current?.cancel();
            activePointer.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          activePointer.current = null;
          experience.current?.pause();
        }}
        onLostPointerCapture={() => {
          if (activePointer.current !== null) {
            activePointer.current = null;
            experience.current?.pause();
          }
        }}
      >
        <ThreeCanvas
          experienceFactory={factory}
          ariaLabel="A living liquid reactor. Hold to gather missiles, aim at an open aperture and release. Successful implosions expose nearby knots."
        />
        {running &&
          status.targets.map((target) => (
            <button
              key={target.slot}
              className="core-target"
              data-knot={target.slot}
              data-active={target.active}
              data-open={target.open}
              data-exposed={target.exposed}
              aria-label={`Target knot ${target.slot + 1}, ${target.open ? 'open' : 'closed'}${target.growth > 0.8 ? ', urgent' : ''}`}
              aria-disabled={!target.active}
              style={{ left: `${target.x}%`, top: `${target.y}%` }}
              onFocus={() => experience.current?.select(target.slot)}
              onClick={(event) => {
                if (event.detail === 0)
                  experience.current?.toggleGather(target.slot);
              }}
            >
              <span className="sr-only">
                {target.growth > 0.55 ? 'Ripe' : 'Growing'}
              </span>
            </button>
          ))}
      </div>
      <header className="core-topline" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="core-edition">
          ARCADE / {editionLabel(study.edition)}
        </span>
        <div className="core-utilities">
          <button
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            aria-pressed={sound}
            onClick={() => {
              const next = !sound;
              setSound(next);
              experience.current?.setSound(next);
              try {
                localStorage.setItem('core-panic-sound', String(next));
              } catch {
                /* Optional preference. */
              }
            }}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            aria-label="Pause game"
            disabled={!running}
            onClick={() => experience.current?.pause()}
          >
            <Pause size={18} />
          </button>
        </div>
      </header>
      <div className="core-wordmark" data-poster-hide>
        <h1 aria-label={study.title}>
          <span>{study.title.split(' ')[0]}</span>
          <span>{study.title.split(' ').slice(1).join(' ')}</span>
        </h1>
        <p>
          LIVING MATTER
          <br />
          CONTROL THE SURGE.
        </p>
      </div>
      <aside className="core-score" aria-label="Score" data-poster-hide>
        <span>{String(status.score).padStart(6, '0')}</span>
        <small>BEST {String(status.best).padStart(6, '0')}</small>
      </aside>
      {status.phase === 'idle' && (
        <div className="core-intro" data-poster-hide>
          <span className="core-eyebrow">
            A LIQUID REACTOR / UNDER YOUR CONTROL
          </span>
          <p>Find the knot. Feel it collapse.</p>
          <button
            className="core-primary"
            disabled={!status.ready}
            onClick={play}
          >
            {status.ready ? 'Enter the core' : 'Preparing reactor'}{' '}
            <ArrowRight size={18} />
          </button>
          <span>Hold · aim · release into an opening</span>
        </div>
      )}
      <footer className="core-console" data-poster-hide>
        <div className="core-feedback" aria-hidden="true">
          {running ? instruction : 'Collapse the knots before they rupture.'}
        </div>
        {running && (
          <div className="core-charge-console">
            <div className="core-charge-pips" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} data-filled={status.gathering && i < status.salvo} />
              ))}
            </div>
            <button
              className="core-gather"
              aria-label={
                status.gathering ? 'Release salvo' : 'Gather missiles'
              }
              onClick={() => experience.current?.toggleGather()}
            >
              {status.gathering
                ? `${status.salvo} MISSILES · ${status.opening >= 0.65 ? 'RELEASE' : 'WAIT FOR OPENING'}`
                : 'HOLD TO GATHER'}
            </button>
            <span className="core-opening" data-open={status.opening >= 0.65}>
              {status.opening < 0
                ? 'SELECT A KNOT'
                : status.opening >= 0.65
                  ? `OPEN · ${status.required} MISSILES TO BREAK`
                  : 'MEMBRANE CLOSED'}
            </span>
          </div>
        )}
        <div className="core-pressure-readout">
          <span>
            INSTABILITY{' '}
            <strong>
              {Math.round(status.pressure)}
              <small>%</small>
            </strong>
          </span>
          <div
            className="core-pressure-meter"
            role="meter"
            aria-label="Core instability"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(status.pressure)}
          >
            <i style={{ transform: `scaleX(${status.pressure / 100})` }} />
          </div>
          <strong className="core-multiplier">×{status.multiplier}</strong>
        </div>
        <div className="core-console-meta">
          <span>
            {status.combo > 1
              ? `${status.combo} IN A ROW`
              : 'HOLD / AIM / RELEASE'}{' '}
            <span className="core-desktop-hint">· ← → AIM / HOLD SPACE</span>
          </span>
          {!overlay && (
            <button
              onClick={() => {
                if (running) experience.current?.pause();
                setHelp(true);
              }}
              aria-expanded={help}
            >
              How to play
            </button>
          )}
        </div>
      </footer>
      {overlay && (
        <div className="core-overlay" data-poster-hide>
          <section
            className="core-dialog"
            role="dialog"
            aria-modal="true"
            inert={help}
            aria-label={status.phase === 'over' ? 'Run results' : 'Game paused'}
          >
            <span className="core-eyebrow">
              {status.phase === 'over' ? 'CONTAINMENT LOST' : 'TAKE A BREATH'}
            </span>
            <h2>
              {status.phase === 'over'
                ? String(status.score).padStart(6, '0')
                : 'Suspended.'}
            </h2>
            <p>
              {status.phase === 'over'
                ? status.feedback
                : 'The reactor can wait.'}
            </p>
            {status.phase === 'over' && (
              <p className="core-result-detail">
                {status.hits} implosions · {status.followups} follow-ups ·{' '}
                {Math.floor(status.time)} seconds
              </p>
            )}
            <button ref={retry} className="core-primary" onClick={play}>
              {status.phase === 'over' ? 'One more run' : 'Resume'}{' '}
              <ArrowRight size={18} />
            </button>
            <button className="core-dialog-help" onClick={() => setHelp(true)}>
              How to play
            </button>
          </section>
        </div>
      )}
      {help && (
        <div
          className="core-help"
          role="dialog"
          aria-modal="true"
          aria-label="How to play Core Panic"
          data-poster-hide
        >
          <h2>Feel the collapse.</h2>
          <p>
            Hold anywhere on the reactor to gather up to six missiles. Move your
            aim onto a knot and release when its liquid aperture opens. Four
            missiles break a swollen knot in one hit; a smaller salvo cracks it
            for a follow-up.
          </p>
          <p>
            The thin arc shows how close a knot is to rupture. The liquid lips
            open and brighten when it is safe to release. A closed membrane
            deflects the salvo and raises instability. Timing is judged at
            release.
          </p>
          <p>
            An implosion pulls nearby knots in and holds them open for a short
            follow-up. A heavy salvo into a ripe linked knot triggers a chain.
            Knots keep growing during missile flight. At 100% instability the
            run ends.
          </p>
          <p>
            Mouse or touch: hold, aim, release. Keyboard: arrows or 1–5 select;
            hold Space and release to fire. Esc pauses and cancels charging. You
            can also click Gather missiles, choose a knot, then click Release
            salvo.
          </p>
          <button
            ref={helpClose}
            className="core-primary"
            onClick={() => {
              setHelp(false);
              (retry.current ?? root.current)?.focus();
            }}
          >
            Got it
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {status.phase === 'over'
          ? `Run ended. Score ${status.score}. ${status.feedback}`
          : status.phase === 'paused'
            ? 'Game paused.'
            : ''}
      </span>
    </div>
  );
}
