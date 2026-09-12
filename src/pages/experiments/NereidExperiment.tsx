import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Layers3,
  MoveUpRight,
  RotateCcw,
  Scan,
  Snowflake,
} from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getStudy, editionLabel } from '@/features/lab/registry';
import {
  DEFAULT_SWIM,
  SWIM_CONTROLS,
  SWIM_PRESETS,
  pulseAt,
  type SwimParameters,
} from '@/features/nereid/swimming';
import type { NereidView } from '@/features/nereid/model';
import {
  NereidExperience,
  type SwimReadout,
} from '@/vanilla-three/experiences/nereid/NereidExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './NereidExperiment.css';

const CHAPTERS = {
  specimen: {
    number: '01',
    title: 'Built for the quietest place on Earth.',
    body: 'A soft silhouette. An uncompromising interior. Meet a new species of deep-sea research machine.',
    label: 'Complete assembly',
  },
  anatomy: {
    number: '02',
    title: 'A world beneath the membrane.',
    body: 'Separate the bell to expose the sonar crown, pressure-balanced reservoirs and six-axis sampling spine.',
    label: 'Exploded assembly',
  },
  lattice: {
    number: '03',
    title: 'Strength, in every cell.',
    body: 'A hexagonal exoskeleton surrounds three helical tendons. Ceramic collars bridge the lattice; the centre carries power and samples.',
    label: 'Tendril / isolated',
  },
} as const;

export default function NereidExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const reduced = useReducedMotion();
  const experience = useRef<NereidExperience | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<NereidView>('specimen');
  const [separation, setSeparation] = useState(0);
  const [xray, setXray] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState('');
  const [swim, setSwim] = useState<SwimParameters>({ ...DEFAULT_SWIM });
  const [swimReadout, setSwimReadout] = useState<SwimReadout>({
    stage: 'Contract',
    phase: 0,
    contraction: 0,
  });
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new NereidExperience(
        canvas,
        () => setReady(true),
        options,
        setSwimReadout
      );
      experience.current = next;
      return next;
    },
    []
  );
  const select = (next: NereidView) => {
    setView(next);
    const amount = next === 'anatomy' ? 1 : 0;
    setSeparation(amount);
    experience.current?.setView(next);
    experience.current?.setSeparation(amount);
  };
  const chapter = CHAPTERS[view];
  const setParameters = (next: SwimParameters) => {
    setSwim(next);
    experience.current?.setSwimming(next);
  };
  const cyclePath = Array.from(
    { length: 101 },
    (_, i) =>
      `${i === 0 ? 'M' : 'L'}${i * 2},${35 - pulseAt(i / 100, swim.glide).activation * 29}`
  ).join(' ');

  return (
    <div className="nereid-page">
      <header className="nereid-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span>PELAGIC SYSTEMS / CONCEPT DIVISION</span>
        <span>
          STUDY {editionLabel(study.edition)} · {study.year}
        </span>
      </header>
      <section
        className="nereid-workbench"
        aria-label="Deep-sea robot design viewer"
      >
        <div className="nereid-identity" data-poster-hide>
          <p>
            <span className="nereid-signal" /> ABYSSAL RESEARCH UNIT
          </p>
          <h1>
            {study.title}
            <span>深海</span>
          </h1>
          <div className="nereid-model">
            NR–07 / <span>非有人探査機</span>
          </div>
        </div>
        <div className="nereid-stage">
          <ThreeCanvas
            experienceFactory={factory}
            tabIndex={0}
            ariaLabel="Three-dimensional jellyfish research robot. Drag to orbit, scroll to zoom. Arrow keys orbit, plus and minus zoom, R resets the camera. Use the controls below to reveal its anatomy."
          />
        </div>
        <aside className="nereid-editorial" data-poster-hide>
          <span className="nereid-kicker">
            {chapter.number} / {chapter.label}
          </span>
          <h2>{chapter.title}</h2>
          <p>{chapter.body}</p>
          <div className="nereid-depth">
            <span>DESIGN DEPTH</span>
            <strong>
              11,000<span>m</span>
            </strong>
            <p>Hadal zone · speculative concept</p>
          </div>
          <div className="nereid-drawing" aria-hidden="true">
            <svg viewBox="0 0 160 70">
              <path d="M20 50 Q20 6 80 6 Q140 6 140 50 Z M20 50H140 M35 50Q35 15 80 6Q125 15 125 50 M55 50Q55 20 80 6Q105 20 105 50 M80 6V62 M12 57H148 M20 54V60 M140 54V60" />
              <path d="M45 50L35 68M65 50L62 68M95 50L98 68M115 50L125 68" />
            </svg>
            <span>RADIAL SYMMETRY / 8 LIMBS</span>
          </div>
        </aside>
        <div className="nereid-orbit-note" data-poster-hide>
          <MoveUpRight size={16} strokeWidth={1} />
          <span>
            DRAG TO ORBIT
            <br />
            SCROLL TO DISCOVER
          </span>
        </div>
        <div className="nereid-side-label" data-poster-hide>
          外殻 / 内部構造 / 触手
        </div>
        <div className="nereid-caption" data-poster-hide>
          <span>
            <i />{' '}
            {ready
              ? view === 'lattice'
                ? 'HEX-CELL TENDRIL / ENLARGED STRUCTURE'
                : 'NR–07 / BIOMIMETIC EXPLORER'
              : 'ASSEMBLING SPECIMEN…'}
          </span>
          <span>
            FIG. {chapter.number} <ArrowUpRight size={13} />
          </span>
        </div>
      </section>
      <fieldset className="nereid-console" disabled={!ready} data-poster-hide>
        <legend className="sr-only">Robot inspection controls</legend>
        <div className="nereid-views">
          {(['specimen', 'anatomy', 'lattice'] as const).map((item, i) => {
            const Icon = [Scan, Layers3, Snowflake][i];
            return (
              <button
                key={item}
                aria-pressed={view === item}
                onClick={() => select(item)}
              >
                <Icon size={18} strokeWidth={1.25} />
                <span>
                  <small>0{i + 1}</small>
                  {item === 'specimen'
                    ? 'Specimen'
                    : item === 'anatomy'
                      ? 'Explode'
                      : 'Lattice'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="nereid-separation">
          <label htmlFor="nereid-separation">
            ASSEMBLY SEPARATION <output>{Math.round(separation * 100)}%</output>
          </label>
          <input
            id="nereid-separation"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={separation}
            disabled={view === 'lattice'}
            onChange={(event) => {
              const amount = Number(event.target.value);
              if (view !== 'anatomy') {
                setView('anatomy');
                experience.current?.setView('anatomy');
              }
              setSeparation(amount);
              experience.current?.setSeparation(amount);
            }}
          />
          <div>
            <span>ASSEMBLED</span>
            <span>DISASSEMBLED</span>
          </div>
        </div>
        <div className="nereid-tools">
          <button
            aria-pressed={xray}
            onClick={() => {
              setXray(!xray);
              experience.current?.setXray(!xray);
            }}
          >
            X-ray shell
          </button>
          <button
            aria-pressed={rotate}
            disabled={reduced || paused}
            onClick={() => {
              setRotate(!rotate);
              experience.current?.setRotate(!rotate);
            }}
          >
            Auto-orbit
          </button>
          <button
            aria-pressed={paused}
            disabled={reduced}
            onClick={() => {
              setPaused(!paused);
              experience.current?.setPaused(!paused);
            }}
          >
            {paused || reduced ? 'Motion held' : 'Hold motion'}
          </button>
          <button
            aria-label="Reset camera"
            title="Reset camera"
            onClick={() => experience.current?.resetCamera()}
          >
            <RotateCcw size={16} />
          </button>
          <button
            aria-label="Save specimen image"
            title="Save specimen image"
            onClick={() => {
              void experience.current
                ?.saveStill()
                .then(() => setMessage('Specimen image saved.'))
                .catch(() =>
                  setMessage('Could not save the image. Please try again.')
                );
            }}
          >
            <ArrowDownToLine size={16} />
          </button>
        </div>
      </fieldset>
      <fieldset className="nereid-swimming" disabled={!ready} data-poster-hide>
        <legend className="sr-only">Swimming dynamics</legend>
        <div className="nereid-swim-heading">
          <div>
            <span className="nereid-kicker">04 / Behaviour</span>
            <h2>Swimming dynamics</h2>
            <p>One pulse. A whole body responding.</p>
          </div>
          <div className="nereid-cycle">
            <svg
              viewBox="0 0 200 40"
              aria-label="Bell activation: quick contraction, slower recovery, then glide"
              role="img"
            >
              <path d={cyclePath} />
              <line
                x1={swimReadout.phase * 200}
                x2={swimReadout.phase * 200}
                y1="0"
                y2="40"
              />
            </svg>
            <div>
              <span>
                {paused || reduced
                  ? 'Time held'
                  : separation > 0.5
                    ? 'Assembly inspection'
                    : swimReadout.stage}
              </span>
              <output>
                {Math.round(swimReadout.contraction * 100)}% contraction
              </output>
            </div>
          </div>
          <div className="nereid-swim-actions">
            <div className="nereid-presets" aria-label="Swimming presets">
              {Object.entries(SWIM_PRESETS).map(([name, values]) => (
                <button
                  key={name}
                  aria-pressed={SWIM_CONTROLS.every(
                    ({ key }) => swim[key] === values[key]
                  )}
                  onClick={() => setParameters({ ...values })}
                >
                  {name}
                </button>
              ))}
            </div>
            <div>
              <button
                disabled={!paused && !reduced}
                onClick={() => experience.current?.stepSwimming()}
              >
                Advance 0.1 s
              </button>
              <button onClick={() => experience.current?.resetSwimming()}>
                Reset motion
              </button>
            </div>
          </div>
        </div>
        <div className="nereid-swim-parameters">
          {SWIM_CONTROLS.map((control) => (
            <label key={control.key} htmlFor={`nereid-${control.key}`}>
              <span>
                {control.label}
                <output>
                  {control.unit === '%'
                    ? Math.round(swim[control.key] * 100)
                    : swim[control.key].toFixed(2)}
                  {control.unit && ` ${control.unit}`}
                </output>
              </span>
              <input
                id={`nereid-${control.key}`}
                aria-label={control.label}
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={swim[control.key]}
                onChange={(event) =>
                  setParameters({
                    ...swim,
                    [control.key]: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="nereid-swim-note">
          {paused || reduced
            ? 'Time is held. Adjust the parameters, then advance in 0.1-second steps.'
            : 'Contract → recover → glide. The tendrils follow the bell and the surrounding water.'}{' '}
          <span>Cross-current and eddies are relative strengths.</span>
        </p>
      </fieldset>
      <footer className="nereid-footer" data-poster-hide>
        <p>
          <b>
            ENGINEERED LIKE A MACHINE.
            <br />
            IMAGINED LIKE A LIFEFORM.
          </b>
        </p>
        <div>
          <span>01 / CERAMIC EXOSHELL</span>
          <p>Overlapping armour. Exposed actuators.</p>
        </div>
        <div>
          <span>02 / PRESSURE-BALANCED CORE</span>
          <p>Spherical reservoirs. Isolated optical spine.</p>
        </div>
        <div>
          <span>03 / HEX-CELL TENDRILS</span>
          <p>Nanostructure imagined at a visible scale.</p>
        </div>
      </footer>
      <div className="nereid-notes" data-poster-hide>
        <details>
          <summary>Design & construction notes</summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.decision}</p>
          <p>
            Arrow keys orbit; + / − zoom; R resets the camera.{' '}
            {reduced
              ? 'Reduced motion is enabled: assembly changes are immediate and the specimen stays still.'
              : 'Hold motion freezes the specimen. Inspection controls remain available.'}
          </p>
        </details>
        <span role="status">{message}</span>
      </div>
    </div>
  );
}
