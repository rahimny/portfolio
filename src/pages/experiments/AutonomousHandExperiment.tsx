import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { getStudy, editionLabel } from '@/features/lab/registry';
import {
  AutonomousHandExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/autonomous-hand/AutonomousHandExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import {
  GESTURES,
  type GestureKind,
} from '@/features/autonomous-hand/commands';
import type { Personality } from '@/features/autonomous-hand/actor';
import type { PoseName } from '@/features/autonomous-hand/rig';
import './AutonomousHandExperiment.css';

export default function AutonomousHandExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<AutonomousHandExperience | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [action, setAction] = useState<GestureKind>('shoot');
  const [target, setTarget] = useState('ink');
  const [seed, setSeed] = useState(15926);
  const [pose, setPose] = useState<PoseName | 'performance'>('performance');
  const loadVersion = useRef(0);
  const [message, setMessage] = useState('');
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new AutonomousHandExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  function reset() {
    loadVersion.current++;
    experience.current?.reset(seed);
    setPose('performance');
    setMessage('Reset to the same seed.');
  }
  function exportPerformance() {
    const tape = experience.current?.exportTape();
    if (!tape) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(tape, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `autonomous-hand-${tape.seed}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="autonomous-hand bg-bg text-fg">
      <header className="hand-heading" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <div className="hand-title">
          <h1 className="font-display">{study.title}</h1>
          <span className="font-meta text-fg-muted">
            {editionLabel(study.edition)} / Motion specimen / WIP
          </span>
        </div>
        <p>A little control. Absolutely no restraint.</p>
      </header>
      <div className="hand-layout">
        <div className="hand-work">
          <div className="hand-stage" ref={stage}>
            <ThreeCanvas
              experienceFactory={factory}
              ariaLabel={study.summary}
            />
          </div>
          <div className="hand-encounter" data-poster-hide>
            <p className="hand-opinion" role="status">
              {status.intention}
            </p>
            <button
              type="button"
              className="hand-move"
              aria-describedby="hand-move-help"
              disabled={
                !status.ready ||
                status.paused ||
                status.reduced ||
                status.replaying ||
                pose !== 'performance'
              }
              onClick={() => {
                const result = experience.current?.movePuck(-0.85, 0.55);
                setMessage(
                  result === 'accepted'
                    ? 'Puck moved. Watch the hand.'
                    : (result ?? 'Not ready.')
                );
              }}
              onKeyDown={(e) => {
                const directions: Record<string, [number, number]> = {
                  ArrowLeft: [-0.25, 0],
                  ArrowRight: [0.25, 0],
                  ArrowUp: [0, 0.25],
                  ArrowDown: [0, -0.25],
                };
                const d = directions[e.key];
                if (!d) return;
                e.preventDefault();
                experience.current?.movePuck(...d);
              }}
            >
              Move puck <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p id="hand-move-help" className="hand-help">
            Drag the black puck. Or focus Move puck and use the arrow keys. Each
            placement leaves an ink mark.
          </p>
          <div className="hand-caption font-meta" data-poster-hide>
            <span>
              {status.reduced
                ? 'Static / Reduced motion'
                : pose !== 'performance'
                  ? `Pose / ${pose}`
                  : status.paused
                    ? 'Paused'
                    : `${status.phase} / ${status.gesture || status.personality}`}
            </span>
            <span>
              {status.time.toFixed(1)} s · {status.result}
            </span>
          </div>
          <p className="hand-description">
            Move the puck. Let go. A sharp tap sends it straight back home. Keep
            interfering and the hand loses its patience; leave it alone and it
            slowly forgives you.
          </p>
          <p className="hand-description text-fg-muted">
            An original procedural hand with authored motion and swept fingertip
            contact. Save the marks as a vector print, or keep the complete
            encounter as a replayable record.
          </p>
        </div>
        <aside
          className="hand-controls"
          aria-label="Hand controls"
          data-poster-hide
        >
          <div className="hand-memory">
            <div className="font-meta">
              {status.gesture === 'shoot'
                ? 'Unleashed'
                : status.agitation > 0.55
                  ? 'Insistent'
                  : status.agitation > 0.2
                    ? 'Watchful'
                    : 'Content'}
            </div>
            <meter
              min="0"
              max="1"
              value={status.agitation}
              aria-label="Agitation"
            />
            <p>
              {status.interruptions} disturbances · {status.corrections} returns
              · {status.stamps} / 256 marks
            </p>
          </div>
          <fieldset disabled={!status.ready}>
            <legend className="font-meta">Performance</legend>
            <label>
              Mode
              <select
                aria-label="Mode"
                value={status.automatic ? 'auto' : 'manual'}
                disabled={status.replaying}
                onChange={(e) =>
                  experience.current?.input({
                    kind: 'auto',
                    value: e.target.value === 'auto',
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              Personality
              <select
                value={status.pending}
                disabled={status.replaying}
                onChange={(e) =>
                  experience.current?.input({
                    kind: 'personality',
                    value: e.target.value as Personality,
                  })
                }
              >
                <option value="deliberate">Deliberate</option>
                <option value="erratic">Erratic</option>
              </select>
            </label>
            {status.pending !== status.personality && (
              <p>Changes after recovery.</p>
            )}
            <div className="hand-buttons">
              <button
                type="button"
                onClick={() => experience.current?.setPaused(!status.paused)}
                disabled={status.reduced}
              >
                {status.paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={reset}>
                Reset
              </button>
            </div>
            {status.reduced && (
              <p>
                Reduced motion is active. Use pose inspection for still views;
                autoplay is stopped.
              </p>
            )}
          </fieldset>
          <fieldset disabled={!status.ready || status.replaying}>
            <legend className="font-meta">Give an instruction</legend>
            <label>
              Action
              <select
                aria-label="Action"
                value={action}
                onChange={(e) => {
                  const next = e.target.value as GestureKind;
                  setAction(next);
                  if (next === 'return') setTarget('puck');
                }}
              >
                {GESTURES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="ink" disabled={action === 'return'}>
                  Ink word
                </option>
                <option value="puck">Solid puck</option>
              </select>
            </label>
            <button
              type="button"
              className="hand-primary"
              disabled={
                status.reduced ||
                status.paused ||
                status.phase !== 'rest' ||
                pose !== 'performance'
              }
              onClick={() => {
                const r = experience.current?.perform(action, target);
                if (r === 'accepted')
                  stage.current?.scrollIntoView({ block: 'center' });
                setMessage(
                  r === 'accepted'
                    ? `${action === 'shoot' ? 'Finger-gun barrage' : action} requested for ${target}.`
                    : (r ?? 'Not ready.')
                );
              }}
            >
              Perform gesture
            </button>
            <p>
              Instructions wait for a resting hand. Manual mode lets the current
              gesture finish.
            </p>
          </fieldset>
          <details>
            <summary className="font-meta">Inspect & record</summary>
            <label>
              Pose inspection
              <select
                value={pose}
                onChange={(e) => {
                  const value = e.target.value as typeof pose;
                  setPose(value);
                  experience.current?.setPose(value);
                }}
              >
                <option value="performance">Performance</option>
                <option value="open">Open palm</option>
                <option value="fist">Fist</option>
                <option value="point">Point</option>
                <option value="gun">Finger gun</option>
                <option value="pinch">Pinch</option>
                <option value="beckon">Beckoning hand</option>
                <option value="palm-up">Palm up</option>
                <option value="thumbs-up">Thumbs up</option>
              </select>
            </label>
            <label className="hand-check">
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) =>
                  experience.current?.setFeedback(e.target.checked)
                }
              />
              Material response
            </label>
            <label className="hand-check">
              <input
                type="checkbox"
                onChange={(e) => experience.current?.setDebug(e.target.checked)}
              />
              Rig, socket & collision proxies
            </label>
            <label>
              Seed
              <input
                type="number"
                min="1"
                max="2147483647"
                value={seed}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isFinite(n))
                    setSeed(Math.max(1, Math.min(2147483647, Math.round(n))));
                }}
              />
            </label>
            <p>
              Reset applies the seed. Save a still and the command record to
              keep this performance.
            </p>
            <div className="hand-buttons">
              <button
                type="button"
                disabled={!status.ready}
                onClick={() => experience.current?.saveStill()}
              >
                Save still
              </button>
              <button
                type="button"
                disabled={!status.ready}
                onClick={exportPerformance}
              >
                Save record
              </button>
            </div>
            <button
              type="button"
              disabled={!status.ready || status.stamps === 0}
              onClick={() => experience.current?.saveComposition()}
            >
              Save composition · SVG
            </button>
            <button
              type="button"
              disabled={!status.ready || status.reduced}
              onClick={() => {
                const tape = experience.current?.exportTape();
                if (tape) {
                  experience.current?.replay(tape);
                  stage.current?.scrollIntoView({ block: 'center' });
                  setPose('performance');
                  setMessage('Replaying the recorded seed and instructions.');
                }
              }}
            >
              Replay record
            </button>
            <label>
              Load record
              <input
                type="file"
                accept=".json,application/json"
                disabled={status.reduced}
                onChange={async (e) => {
                  const element = e.currentTarget;
                  const file = element.files?.[0];
                  if (!file) return;
                  const version = ++loadVersion.current;
                  const current = experience.current;
                  try {
                    if (file.size > 2000000)
                      throw new Error('Record is too large.');
                    const tape = JSON.parse(await file.text());
                    if (
                      version !== loadVersion.current ||
                      current !== experience.current ||
                      !element.isConnected
                    )
                      return;
                    current?.replay(tape);
                    stage.current?.scrollIntoView({ block: 'center' });
                    setPose('performance');
                    setMessage('Playing the loaded record.');
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : 'Could not load that record.'
                    );
                  }
                  element.value = '';
                }}
              />
            </label>
            <p>
              {status.triangles.toLocaleString()} triangles / 120 Hz simulation
              / capped pixel density. Device frame time remains unmeasured.
            </p>
            <ol className="hand-events" aria-label="Recent action events">
              {status.events.map((event, i) => (
                <li key={`${i}-${event}`}>{event}</li>
              ))}
            </ol>
          </details>
          <p className="hand-message" role="status">
            {message || (status.replaying ? 'Replaying record.' : '')}
          </p>
        </aside>
      </div>
    </div>
  );
}
