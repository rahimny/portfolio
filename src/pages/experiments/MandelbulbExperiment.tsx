import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import { ConstructionPlate } from '@/features/lab/ConstructionPlate';
import {
  NUMERIC_LIMITS,
  type NumericSetting,
  type MotionPattern,
} from '@/features/mandelbulb/model';
import {
  MandelbulbExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/mandelbulb/MandelbulbExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './MandelbulbExperiment.css';

const PATTERN_LABELS: {
  id: MotionPattern;
  label: string;
  description: string;
}[] = [
  {
    id: 'cycle',
    label: 'Living cycle',
    description:
      'Breathing gives way to travelling waves, then a slow unfurling.',
  },
  {
    id: 'breathe',
    label: 'Breathe',
    description: 'Two overlapping rhythms expand and compress the body.',
  },
  {
    id: 'tide',
    label: 'Tide',
    description:
      'Travelling waves carry a sideways current through the branches.',
  },
  {
    id: 'unfurl',
    label: 'Unfurl',
    description: 'A changing twist winds and opens the recursive structure.',
  },
];

export default function MandelbulbExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<MandelbulbExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new MandelbulbExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  const slider = (
    key: NumericSetting,
    label: string,
    step = 0.01,
    suffix = ''
  ) => (
    <label key={key} className="mandelbulb-slider">
      <span>{label}</span>
      <output aria-live="off">
        {status[key].toFixed(step === 1 ? 0 : 2)}
        {suffix}
      </output>
      <input
        aria-label={label}
        type="range"
        min={NUMERIC_LIMITS[key][0]}
        max={NUMERIC_LIMITS[key][1]}
        step={step}
        value={status[key]}
        onChange={(event) =>
          experience.current?.configure(key, Number(event.target.value))
        }
      />
    </label>
  );
  return (
    <div className="mandelbulb-page">
      <header className="mandelbulb-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <div className="mandelbulb-intro" data-poster-hide>
        <h1 className="font-display">{study.title}</h1>
        <p>
          One seed. A thousand smaller worlds.
          <br />
          <span>Let it grow. Give it a nudge.</span>
        </p>
      </div>
      <section
        className="mandelbulb-stage"
        aria-label="Living fractal sculpture"
      >
        <ThreeCanvas
          experienceFactory={factory}
          ariaLabel="A growing, cel-shaded Mandelbulb. Hover to slice along X and Y; press C to clear cuts, or E for a ripple. Drag or use arrow keys to orbit, plus and minus to zoom, and Space to pause."
          tabIndex={0}
        />
        <div className="mandelbulb-readout font-meta" data-poster-hide>
          <span>
            {!status.ready
              ? 'Germinating'
              : status.reduced
                ? 'Still / reduced motion'
                : status.paused
                  ? 'Held for inspection'
                  : status.phase}
          </span>
          <span>
            {status.growth < 100
              ? `${Math.round(status.growth)}% grown`
              : `${status.time.toFixed(1)} s / ${PATTERN_LABELS.find((p) => p.id === status.pattern)?.label}`}
          </span>
          <i>
            <b style={{ transform: `scaleX(${status.growth / 100})` }} />
          </i>
        </div>
        <div className="mandelbulb-caption" data-poster-hide>
          <p>Move across the surface. Look inside.</p>
          <span className="font-meta">
            Hover to slice X / Y · C clears cuts · Drag to orbit
          </span>
        </div>
      </section>
      <fieldset
        className="mandelbulb-toolbar"
        disabled={!status.ready}
        data-poster-hide
      >
        <legend className="sr-only">Playback and export</legend>
        <button onClick={() => experience.current?.replayGrowth()}>
          ↻ Replay growth
        </button>
        <button onClick={() => experience.current?.excite()}>↯ Excite</button>
        <button onClick={() => experience.current?.clearCuts()}>
          Clear cuts
        </button>
        <button
          aria-pressed={status.paused || status.reduced}
          disabled={status.reduced}
          onClick={() => experience.current?.setPaused(!status.paused)}
        >
          {status.reduced ? 'Motion held' : status.paused ? 'Resume' : 'Pause'}
        </button>
        <label className="mandelbulb-timeline">
          <span>Growth</span>
          <input
            type="range"
            aria-label="Growth progress"
            min="0"
            max="100"
            step="0.1"
            value={status.growth}
            onChange={(event) =>
              experience.current?.setGrowthProgress(Number(event.target.value))
            }
          />
          <output aria-live="off">{Math.round(status.growth)}%</output>
        </label>
        <button
          className="mandelbulb-save"
          disabled={saving}
          onClick={async () => {
            const owner = experience.current;
            if (!owner) return;
            setSaving(true);
            setMessage('Preparing the still…');
            try {
              const saved = await owner.saveStill();
              if (experience.current === owner)
                setMessage(
                  saved
                    ? 'Saved a 2400 px PNG of this moment.'
                    : 'The still could not be saved.'
                );
            } catch {
              if (experience.current === owner)
                setMessage('The still could not be saved. Try again.');
            } finally {
              if (experience.current === owner) setSaving(false);
            }
          }}
        >
          {saving ? 'Resolving…' : 'Save still ↗'}
        </button>
      </fieldset>
      <details className="mandelbulb-settings" data-poster-hide>
        <summary className="font-meta">
          Growth & motion{' '}
          <span>
            {PATTERN_LABELS.find((p) => p.id === status.pattern)?.label} ↗
          </span>
        </summary>
        <fieldset disabled={!status.ready}>
          <legend className="sr-only">Growth and movement settings</legend>
          <div className="mandelbulb-presets">
            {PATTERN_LABELS.map(({ id, label }) => (
              <button
                key={id}
                aria-pressed={status.pattern === id}
                onClick={() => experience.current?.setPattern(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mandelbulb-pattern-note">
            {PATTERN_LABELS.find((p) => p.id === status.pattern)?.description}
          </p>
          <div className="mandelbulb-sliders">
            {slider('power', 'Fractal power')}
            {slider('complexity', 'Branch depth', 0.1)}
            {slider('growthDuration', 'Growth duration', 1, ' s')}
            {slider('speed', 'Motion speed')}
            {slider('amplitude', 'Motion amount')}
            {slider('morph', 'Shape oscillation')}
            {slider('response', 'Cursor response')}
          </div>
          <div className="mandelbulb-presets mandelbulb-secondary">
            <button
              aria-pressed={status.turntable}
              onClick={() =>
                experience.current?.setTurntable(!status.turntable)
              }
            >
              Turntable
            </button>
            <button onClick={() => experience.current?.reset()}>Reset</button>
          </div>
          {status.reduced && (
            <p className="mandelbulb-pattern-note">
              Reduced motion: scrub Growth to inspect each stage. Excite and
              hover give a still response.
            </p>
          )}
        </fieldset>
      </details>
      <details className="mandelbulb-settings" data-poster-hide>
        <summary className="font-meta">
          Surface & section <span>{status.finish} ↗</span>
        </summary>
        <fieldset disabled={!status.ready}>
          <legend className="sr-only">Rendering settings</legend>
          <div className="mandelbulb-presets">
            {(['cel', 'ink', 'arcade'] as const).map((finish) => (
              <button
                key={finish}
                aria-pressed={status.finish === finish}
                onClick={() => experience.current?.setFinish(finish)}
              >
                {finish === 'cel' ? 'Cel' : finish === 'ink' ? 'Ink' : 'Arcade'}
              </button>
            ))}
            <button
              aria-pressed={status.detail === 'fine'}
              onClick={() =>
                experience.current?.setDetail(
                  status.detail === 'fine' ? 'balanced' : 'fine'
                )
              }
            >
              Fine detail
            </button>
          </div>
          <div
            className="mandelbulb-presets mandelbulb-secondary"
            role="group"
            aria-label="Cursor slicing axes"
          >
            {(['xy', 'x', 'y', 'off'] as const).map((axis) => (
              <button
                key={axis}
                aria-pressed={status.slicing === axis}
                onClick={() => experience.current?.setSlicing(axis)}
              >
                {axis === 'xy'
                  ? 'Slice X + Y'
                  : axis === 'x'
                    ? 'Slice X'
                    : axis === 'y'
                      ? 'Slice Y'
                      : 'Slicing off'}
              </button>
            ))}
          </div>
          <p className="mandelbulb-pattern-note">
            Move horizontally for X, vertically for Y. Both axes open a corner
            of the form. Moving away keeps the cut for inspection; Clear cuts
            closes it.
          </p>
          <div className="mandelbulb-sliders">
            {slider('sliceX', 'X slice', 1, '%')}
            {slider('sliceY', 'Y slice', 1, '%')}
            {slider('cutAccent', 'Cut warmth')}
            {slider('ink', 'Ink contours')}
            {slider('hatch', 'Hatching')}
            {slider('section', 'Section depth', 1, '%')}
          </div>
          <div className="mandelbulb-presets mandelbulb-secondary">
            <button
              aria-pressed={status.section === 0}
              onClick={() => experience.current?.setSection(0)}
            >
              Whole
            </button>
            <button
              aria-pressed={status.section === 65}
              onClick={() => experience.current?.setSection(65)}
            >
              Open the core
            </button>
          </div>
        </fieldset>
      </details>
      <footer className="mandelbulb-notes" data-poster-hide>
        <p>
          A little life from a repeated rule.
          <br />
          <span>Your gesture becomes part of its rhythm.</span>
        </p>
        <details>
          <summary className="font-meta">Inside the rule ↗</summary>
          <ConstructionPlate construction={study.construction} />
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.interaction}</p>
          <p>{study.notes?.decision}</p>
          <p className="font-meta">
            {status.width} × {status.height} render pixels · Up to{' '}
            {status.complexity.toFixed(1)} recursive steps ·{' '}
            {status.detail === 'fine' ? 240 : 176} maximum ray steps.
            <br />
            {status.frameMs
              ? `${status.frameMs.toFixed(1)} ms recent frame interval`
              : 'Frame timing available during motion'}
            ; browser pacing, not isolated GPU time.
          </p>
        </details>
      </footer>
      <p className="mandelbulb-message" role="status">
        {message}
      </p>
    </div>
  );
}
