import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  OrdinalEngine,
  type OrdinalStatus,
} from '@/features/ordinal/OrdinalEngine';
import { MOOD_NAMES, type OrdinalMoodName } from '@/features/ordinal/mood';
import { ordinalString } from '@/features/ordinal/ramp';
import './OrdinalExperiment.css';

const INITIAL: OrdinalStatus = {
  ready: false,
  error: null,
  columns: 0,
  rows: 0,
  corpusLines: 0,
  mood: 'Gathering',
  moodNote: '',
  moodOverride: null,
  metric: 0.4,
  metricOverride: null,
  band: [32, 122],
  paused: false,
  reduced: false,
  showRuler: true,
  tick: 0,
  seed: 1,
  agitation: 0,
  resolved: 0,
  correlation: 0,
  ramp: '',
  stepMs: 0,
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function OrdinalExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const reduced = useReducedMotion();

  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<OrdinalEngine | null>(null);
  const [status, setStatus] = useState<OrdinalStatus>(INITIAL);
  const [message, setMessage] = useState('');
  const [seed, setSeed] = useState('1');

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let live = true;
    const next = new OrdinalEngine(
      element,
      (update) => {
        if (live) setStatus(update);
      },
      { reduced }
    );
    engine.current = next;
    return () => {
      live = false;
      engine.current = null;
      next.dispose();
    };
  }, [reduced]);

  const announce = useCallback((text: string) => setMessage(text), []);

  const ordinal = ordinalString();

  return (
    <div className="ordinal-page">
      <header className="ordinal-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>

      <section className="ordinal-masthead" data-poster-hide>
        <div>
          <p className="font-meta">Printable ASCII, 32 to 126</p>
          <h1 className="font-display">{study.title}</h1>
        </div>
        <div className="ordinal-standfirst">
          <p>
            The character is not a picture of the state.
            <br />
            <span>It is the state.</span>
          </p>
          <div className="ordinal-readout font-meta">
            <span>Seed {String(status.seed).padStart(4, '0')}</span>
            <span>Step {String(status.tick).padStart(5, '0')}</span>
            <span>
              {status.error
                ? 'Unavailable'
                : !status.ready
                  ? 'Measuring the face'
                  : status.paused || status.reduced
                    ? 'Time held'
                    : status.mood}
            </span>
          </div>
        </div>
      </section>

      <div className="ordinal-work">
        <div className="ordinal-figure">
          <section
            className="ordinal-stage"
            aria-label="A field of characters dissolving and reforming the studies index"
          >
            <canvas
              ref={canvas}
              tabIndex={0}
              data-ready={status.ready ? 'true' : undefined}
              aria-label="Character field. Drag to raise a wave. Type to inject characters. Arrow keys move the caret."
            />
            {status.error && (
              <p className="ordinal-unavailable" role="alert">
                {status.error}
              </p>
            )}
          </section>

          <figcaption className="ordinal-caption" data-poster-hide>
            <span>Drag to dissolve · Click, then type into the field</span>
            <span className="ordinal-key">
              <i className="is-ink" /> field
              <i className="is-accent" /> touched
            </span>
          </figcaption>
        </div>

        <section className="ordinal-orderings" data-poster-hide>
          <h2 className="font-meta">The two orderings</h2>
          <p>
            Every ASCII renderer needs a map from tone to character, and the
            usual answer is a ramp string copied from somewhere. This one is
            measured off Geist Mono at load, with the same coverage sampler the
            masthead uses to decide where its particles go.
          </p>

          <div className="ordinal-ordering">
            <span className="font-meta">Ordinal · the table</span>
            <code>{ordinal}</code>
          </div>
          <div className="ordinal-ordering">
            <span className="font-meta">Ink · measured coverage</span>
            <code>{status.ramp || ordinal}</code>
          </div>

          <dl className="ordinal-stats">
            <div>
              <dt className="font-meta">Rank correlation</dt>
              <dd>{status.ramp ? status.correlation.toFixed(3) : '—'}</dd>
            </div>
            <div>
              <dt className="font-meta">Characters</dt>
              <dd>{status.ramp ? status.ramp.length : '—'}</dd>
            </div>
            <div>
              <dt className="font-meta">Heaviest</dt>
              <dd>
                <code>{status.ramp ? status.ramp.slice(-6) : '—'}</code>
              </dd>
            </div>
          </dl>

          <p className="ordinal-hint">
            Spearman's ρ between the two. At 1 the table would already be sorted
            by weight and there would be nothing here to build. Diffusion that
            is smooth in one of these orderings is violent in the other, and the
            metric control below crossfades between running the field in each.
          </p>

          <div className="ordinal-state">
            <h3 className="font-meta">State</h3>
            <dl>
              <div>
                <dt>Resolved onto the index</dt>
                <dd>{percent(status.resolved)}</dd>
              </div>
              <div>
                <dt>Dissolved</dt>
                <dd>{percent(status.agitation)}</dd>
              </div>
              <div>
                <dt>Vocabulary in play</dt>
                <dd>
                  {status.band[0]}–{status.band[1]}
                </dd>
              </div>
            </dl>
            <p>{status.moodNote}</p>
          </div>
        </section>
      </div>

      <fieldset
        className="ordinal-console"
        disabled={!status.ready}
        data-poster-hide
      >
        <legend className="sr-only">Ordinal controls</legend>

        <div className="ordinal-control-group">
          <span className="font-meta">01 / The metric</span>
          <label htmlFor="ordinal-metric">
            Diffuse in{' '}
            <output>
              {status.metricOverride === null
                ? `${status.metric.toFixed(2)} — the phrase is choosing`
                : status.metric.toFixed(2)}
            </output>
          </label>
          <input
            id="ordinal-metric"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={status.metric}
            onChange={(event) =>
              engine.current?.setMetric(Number(event.target.value))
            }
          />
          <p className="ordinal-hint">
            0 averages the codepoints of neighbouring cells, so values travel
            smoothly along the table and the field drifts through digits, then
            capitals, then lowercase. 1 averages their measured ink instead, so
            the field is smooth in tone and jumps around the table to stay that
            way.
          </p>
          <div className="ordinal-buttons">
            <button onClick={() => engine.current?.setMetric(null)}>
              Hand it back to the phrase
            </button>
          </div>
        </div>

        <div className="ordinal-control-group">
          <span className="font-meta">02 / The phrase</span>
          <div className="ordinal-buttons">
            <button
              aria-pressed={status.moodOverride === null}
              onClick={() => engine.current?.setMoodOverride(null)}
            >
              Auto
            </button>
            {MOOD_NAMES.map((name: OrdinalMoodName) => (
              <button
                key={name}
                aria-pressed={status.moodOverride === name}
                onClick={() => engine.current?.setMoodOverride(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="ordinal-hint">
            A twenty-eight second clock, the same one Helion's field runs on.
            Its output here is a character set, not a tempo, which is why you
            can read the mood off the glyphs instead of inferring it from speed.
          </p>
          <div className="ordinal-buttons">
            <button
              disabled={status.reduced}
              onClick={() => engine.current?.setPaused(!status.paused)}
            >
              {status.paused || status.reduced ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => engine.current?.stepOnce(24)}>
              Step 24
            </button>
            <button
              aria-pressed={status.showRuler}
              onClick={() => engine.current?.setRuler(!status.showRuler)}
            >
              {status.showRuler ? 'Hide ruler' : 'Show ruler'}
            </button>
          </div>
          {status.reduced && (
            <p className="ordinal-hint">
              Reduced motion: the field is held. Use Step 24 to advance it, or
              drag on it directly.
            </p>
          )}
        </div>

        <div className="ordinal-control-group">
          <span className="font-meta">03 / The edition</span>
          <form
            className="ordinal-buttons"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(seed);
              if (Number.isInteger(value) && value >= 1 && value <= 999999)
                engine.current?.reset(value);
            }}
          >
            <label className="sr-only" htmlFor="ordinal-seed">
              Seed
            </label>
            <input
              id="ordinal-seed"
              type="number"
              min="1"
              max="999999"
              required
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
            <button type="submit">Dissolve again</button>
            <button
              type="button"
              onClick={() => {
                const next = (status.seed % 999999) + 1;
                setSeed(String(next));
                engine.current?.reset(next);
              }}
            >
              Next
            </button>
          </form>
          <div className="ordinal-buttons">
            <button
              onClick={() => {
                try {
                  engine.current?.saveText();
                  announce(
                    'Frame saved as plain text: the grid, with its seed, step and ramp in the header.'
                  );
                } catch {
                  announce('The frame could not be saved. Try again.');
                }
              }}
            >
              Save text
            </button>
            <button
              onClick={() => {
                engine.current
                  ?.copyText()
                  .then(() => announce('Frame copied to the clipboard.'))
                  .catch(() =>
                    announce(
                      'The clipboard refused. Use Save text and open the file instead.'
                    )
                  );
              }}
            >
              Copy frame
            </button>
            <button
              onClick={() => {
                engine.current?.savePng();
                announce('Still requested.');
              }}
            >
              Save still
            </button>
          </div>
          <p className="ordinal-hint">
            The text file is the artefact and it needs no renderer to read. Its
            header carries the seed, step, grid and measured ramp, so a frame
            states what it is without this page.
          </p>
        </div>
      </fieldset>

      <footer className="ordinal-notes" data-poster-hide>
        <p>
          The ASCII table is a bad palette.
          <br />
          <span>That disagreement is the piece.</span>
        </p>
        <details>
          <summary>Inside the rule</summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.interaction}</p>
          <p>{study.notes?.decision}</p>
          <p className="font-meta">
            {status.columns} × {status.rows} cells ·{' '}
            {(status.columns * status.rows).toLocaleString()} codepoints ·
            corpus {status.corpusLines} lines, tiled to fill
            <br />
            Last step: {status.stepMs.toFixed(2)} ms · simulation and render
            both fixed at 42 ms
          </p>
          <p>
            That is a live CPU measurement on this machine, not a device
            guarantee. The 42 ms gate is taken from the page this study starts
            from and kept on purpose: a monospace field redrawn at 60 fps reads
            as noise, and at 24 it reads as a mechanism advancing. Nothing is
            interpolated between steps because the output is discrete. Pointer
            and keyboard input are not recorded in the seed, so a field you have
            stirred is not reproducible from its header — only an untouched one
            is.
          </p>
        </details>
      </footer>

      <p className="ordinal-message" role="status">
        {message}
      </p>
    </div>
  );
}
