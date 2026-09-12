import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowDownToLine,
  Layers3,
  RotateCcw,
  Scan,
  Fingerprint,
} from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getStudy, editionLabel } from '@/features/lab/registry';
import {
  DEFAULT_POSE,
  type OctopusPose,
  type OctopusView,
} from '@/features/octopus/model';
import { OctopusExperience } from '@/vanilla-three/experiences/octopus/OctopusExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import './NereidExperiment.css';
import './OctopusExperiment.css';

const CHAPTERS = {
  specimen: {
    number: '01',
    label: 'Complete assembly',
    title: 'Anatomy of the abyss.',
    body: 'A pressure-balanced research concept. Swept ceramic armour above eight hexagonal lattice tentacles.',
  },
  anatomy: {
    number: '02',
    label: 'Exploded assembly',
    title: 'An architecture of pressure.',
    body: 'Lift each armour panel. Separate the reservoirs, sensor gimbals and tendon drives to reveal the machinery within.',
  },
  arm: {
    number: '03',
    label: 'Arm / isolated',
    title: 'Strength through structure.',
    body: 'An open hexagonal envelope surrounds three helical tendons. Suction plumbing and ceramic collars follow its continuous bend.',
  },
} as const;

export default function OctopusExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const reduced = useReducedMotion();
  const experience = useRef<OctopusExperience | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<OctopusView>('specimen');
  const [separation, setSeparation] = useState(0);
  const [pose, setPose] = useState<OctopusPose>({ ...DEFAULT_POSE });
  const [xray, setXray] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [message, setMessage] = useState('');
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new OctopusExperience(canvas, () => setReady(true), options);
      experience.current = next;
      return next;
    },
    []
  );
  const select = (next: OctopusView) => {
    setView(next);
    const amount = next === 'anatomy' ? 1 : 0;
    setSeparation(amount);
    experience.current?.setView(next);
    experience.current?.setSeparation(amount);
  };
  const chapter = CHAPTERS[view];
  return (
    <div className="nereid-page octopus-page">
      <header className="nereid-header" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span>PELAGIC SYSTEMS / CONCEPT DIVISION</span>
        <span>
          STUDY {editionLabel(study.edition)} · {study.year}
        </span>
      </header>
      <section className="nereid-workbench" aria-label="Octopus design viewer">
        <div className="nereid-identity" data-poster-hide>
          <p>
            <span className="nereid-signal" />
            BENTHIC RESEARCH UNIT
          </p>
          <h1>{study.title}</h1>
          <div className="nereid-model">OC–08 / CEPHALOPOD SERIES</div>
        </div>
        <div className="nereid-stage">
          <ThreeCanvas
            experienceFactory={factory}
            tabIndex={0}
            ariaLabel="Deep-sea research octopus with eight hexagonal lattice tentacles, recessed side optics and swept ceramic armour. Drag to orbit, scroll to zoom. Arrow keys orbit, plus and minus zoom, R resets the camera."
          />
        </div>
        <aside className="nereid-editorial" data-poster-hide>
          <span className="nereid-kicker">
            {chapter.number} / {chapter.label}
          </span>
          <h2>{chapter.title}</h2>
          <p>{chapter.body}</p>
          <div className="nereid-depth">
            <span>RESEARCH ENVELOPE</span>
            <strong>
              11,000<span>m</span>
            </strong>
            <p>Speculative hadal-zone design</p>
          </div>
          <div className="octopus-section-drawing" aria-hidden="true">
            <svg viewBox="0 0 170 110">
              <ellipse cx="85" cy="32" rx="24" ry="27" />
              <ellipse cx="85" cy="32" rx="12" ry="27" />
              <path d="M61 32H109M63 19H107M63 45H107M72 57C29 63 16 101 33 98C50 95 31 80 47 71M80 58C57 81 77 108 64 103M90 58C117 82 94 112 108 100M98 56C141 63 160 100 142 97C126 94 143 80 126 73M85 5V104M16 106H155" />
            </svg>
            <span>HEXAGONAL NANOSTRUCTURE / OC–08</span>
          </div>
        </aside>
        <div className="nereid-orbit-note" data-poster-hide>
          <span>
            DRAG TO ORBIT
            <br />
            SCROLL TO EXPLORE
          </span>
        </div>
        <div className="nereid-caption" data-poster-hide>
          <span>
            <i />
            {ready
              ? view === 'arm'
                ? 'HEX-CELL TENTACLE / ENLARGED STRUCTURE'
                : 'OC–08 / BIOMIMETIC EXPLORER'
              : 'ASSEMBLING SPECIMEN…'}
          </span>
          <span>FIG. {chapter.number}</span>
        </div>
      </section>
      <fieldset className="nereid-console" disabled={!ready} data-poster-hide>
        <legend className="sr-only">Octopus inspection controls</legend>
        <div className="nereid-views">
          {(['specimen', 'anatomy', 'arm'] as const).map((item, i) => {
            const Icon = [Scan, Layers3, Fingerprint][i];
            return (
              <button
                key={item}
                aria-pressed={view === item}
                onClick={() => select(item)}
              >
                <Icon size={18} strokeWidth={1.25} />
                <span>
                  <small>0{i + 1}</small>
                  {['Specimen', 'Explode', 'Lattice detail'][i]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="nereid-separation">
          <label htmlFor="octopus-separation">
            ASSEMBLY SEPARATION <output>{Math.round(separation * 100)}%</output>
          </label>
          <input
            id="octopus-separation"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={separation}
            disabled={view === 'arm'}
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
            onClick={() => experience.current?.resetCamera()}
          >
            <RotateCcw size={16} />
          </button>
          <button
            aria-label="Save specimen image"
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
      <fieldset
        className="octopus-behaviour"
        disabled={!ready}
        data-poster-hide
      >
        <legend className="sr-only">Arm behaviour</legend>
        <div>
          <span className="nereid-kicker">04 / Behaviour</span>
          <h2>Tentacle dynamics.</h2>
          <p>Slow strokes. Delayed follow-through.</p>
        </div>
        {(
          [
            ['curl', 'Tip curl'],
            ['spread', 'Arm spread'],
            ['current', 'Current response'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>
              {label}
              <output>{Math.round(pose[key] * 100)}%</output>
            </span>
            <input
              aria-label={label}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={pose[key]}
              onChange={(event) => {
                const next = { ...pose, [key]: Number(event.target.value) };
                setPose(next);
                experience.current?.setPose(next);
              }}
            />
          </label>
        ))}
        <button
          disabled={!paused && !reduced}
          onClick={() => experience.current?.step()}
        >
          Advance 0.1 s
        </button>
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
          <span>01 / RETICULATED MANTLE</span>
          <p>A fine cage around seven reservoirs.</p>
        </div>
        <div>
          <span>02 / PRESSURE-BALANCED CORE</span>
          <p>Reservoirs, gimbals and hydraulic drives.</p>
        </div>
        <div>
          <span>03 / HEX-CELL TENTACLES</span>
          <p>Helical tendons inside an open lattice.</p>
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
              ? 'Reduced motion is enabled. Advance time explicitly to inspect a new pose.'
              : 'Hold motion freezes the creature while keeping inspection available.'}
          </p>
        </details>
        <span role="status">{message}</span>
      </div>
    </div>
  );
}
