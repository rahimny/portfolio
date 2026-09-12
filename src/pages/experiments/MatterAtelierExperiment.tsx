import {
  STAGE_LABELS,
  type Treatment,
  type PipelineStage,
} from '@/features/matter-atelier/process';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_LIVING_CONTROLS,
  type LivingControls,
} from '@/features/matter-atelier/living';
import { useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Upload,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import ThreeCanvas from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import {
  MatterAtelierExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/matter-atelier/MatterAtelierExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import type { Form } from '@/features/matter-atelier/toolpath';
import './MatterAtelierExperiment.css';

export default function MatterAtelierExperiment() {
  const study = getStudy(useLocation().pathname.split('/')[2])!;
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<MatterAtelierExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [form, setForm] = useState<Form | 'custom'>('bloom');
  const [speed, setSpeed] = useState(12);
  const [richness, setRichness] = useState(1);
  const [treatment, setTreatment] = useState<Treatment>('prismatic');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [living, setLiving] = useState(DEFAULT_LIVING_CONTROLS);
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [immersive]);
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const next = new MatterAtelierExperience(canvas, setStatus, options);
      experience.current = next;
      return next;
    },
    []
  );
  return (
    <div
      className="atelier-page"
      data-immersive={immersive}
      data-world={status.world}
    >
      <header className="atelier-heading" data-poster-hide>
        <ExperimentBreadcrumb items={breadcrumbs} />
        <span className="font-meta">
          Study {editionLabel(study.edition)} / {study.year}
        </span>
      </header>
      <section className="atelier" aria-label="Generative fabrication studio">
        <div
          className="atelier-mode"
          role="group"
          aria-label="Production mode"
          data-poster-hide
        >
          <button
            aria-pressed={status.factory}
            onClick={() => experience.current?.setFactory(true)}
          >
            Live factory
          </button>
          <button
            aria-pressed={!status.factory}
            onClick={() => experience.current?.setFactory(false)}
          >
            Inspect edition
          </button>
          <span className="font-meta">
            {status.factory
              ? `${status.inFlight} editions in flight / continuous production`
              : 'One edition / reversible inspection'}
          </span>
        </div>
        <div className="atelier-topbar" data-poster-hide>
          <div>
            <span className="atelier-wordmark font-display">
              MATTER ATELIER
            </span>
            <span className="atelier-divider">/</span>
            <span className="atelier-descriptor">An ecology of making.</span>
          </div>
          <span className="atelier-system font-meta">
            <i aria-hidden="true" />
            {!status.ready
              ? 'Initialising'
              : status.reduced
                ? 'Reduced motion'
                : status.factory
                  ? status.paused
                    ? 'Production paused'
                    : 'Living production'
                  : status.complete
                    ? 'Object complete'
                    : status.paused || status.reduced
                      ? 'Inspection mode'
                      : STAGE_LABELS[status.stage]}
          </span>
        </div>
        <div className="atelier-worlds" data-poster-hide>
          <div role="group" aria-label="World style">
            {(['atelier', 'bioelectric', 'signal'] as const).map((world) => (
              <button
                key={world}
                aria-pressed={status.world === world}
                disabled={!status.ready}
                onClick={() => experience.current?.setWorld(world)}
              >
                <i data-tone={world} aria-hidden="true" />
                {world === 'signal'
                  ? 'Signal dream'
                  : world === 'bioelectric'
                    ? 'Bioelectric'
                    : 'Atelier'}
              </button>
            ))}
          </div>
          <div className="atelier-world-actions">
            {immersive && (
              <button
                aria-label={
                  status.paused ? 'Resume simulation' : 'Pause simulation'
                }
                disabled={!status.ready}
                onClick={() => experience.current?.setPaused(!status.paused)}
              >
                {status.paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
            )}
            <button
              aria-pressed={status.flora}
              onClick={() => experience.current?.setFlora(!status.flora)}
              disabled={!status.ready}
            >
              Nursery
            </button>
            <button
              aria-pressed={status.communication}
              onClick={() =>
                experience.current?.setCommunication(!status.communication)
              }
              disabled={!status.ready}
            >
              Signals
            </button>
            <button
              aria-label={
                immersive ? 'Leave immersive view' : 'Enter immersive view'
              }
              onClick={() => setImmersive(!immersive)}
            >
              {immersive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
        <div
          className="atelier-stage"
          data-close={status.view !== 'studio' && status.view !== 'top'}
        >
          <ThreeCanvas
            experienceFactory={factory}
            ariaLabel={study.summary}
            tabIndex={0}
          />
          <div className="atelier-title" data-poster-hide>
            <p className="font-meta">
              <span lang="ja" className="atelier-japanese">
                造形
              </span>{' '}
              / Autonomous editions
            </p>
            <h1 className="font-display">
              A living <br />
              atelier.
            </h1>
            <p>
              Matter learns a new shape.
              <br />
              The garden remembers.
            </p>
          </div>
          <div
            className="atelier-views"
            aria-label="Camera views"
            data-poster-hide
          >
            <button
              aria-pressed={status.director}
              onClick={() => experience.current?.setDirector(!status.director)}
            >
              Follow
            </button>
            {(
              ['studio', 'detail', 'brush', 'bath', 'nursery', 'top'] as const
            ).map((value) => (
              <button
                key={value}
                aria-pressed={!status.director && status.view === value}
                onClick={() => {
                  experience.current?.setView(value);
                }}
              >
                {value === 'top'
                  ? 'Plan'
                  : value === 'detail'
                    ? 'Printer'
                    : value}
              </button>
            ))}
          </div>
          <div className="atelier-caption" data-poster-hide>
            <span className="font-meta">
              {status.name} / Edition {String(status.seed).padStart(3, '0')}
              {status.parentSeed !== null &&
                ` · From ${String(status.parentSeed).padStart(3, '0')}`}
            </span>
            <span>
              {status.factory
                ? status.livingMessage
                : status.stage === 'painting'
                  ? `${status.brushPhase} · ${Math.round((status.brushLoad / (0.05 * richness)) * 100)}% brush load`
                  : status.director
                    ? 'Following the process · Drag to take control'
                    : 'Drag to orbit · Scroll to approach'}
            </span>
          </div>
          <div
            className="atelier-coordinates font-meta"
            aria-hidden="true"
            data-poster-hide
          >
            <span>X {status.x.toFixed(2)}</span>
            <span>Y {status.z.toFixed(2)}</span>
            <span>Z {(status.y - 0.86).toFixed(2)}</span>
          </div>
        </div>
        <div className="atelier-console" data-poster-hide>
          <div className="atelier-object">
            <label className="font-meta" htmlFor="atelier-form">
              01 / Select a form
            </label>
            <div className="atelier-selection">
              <select
                id="atelier-form"
                value={form}
                disabled={!status.ready || loading}
                onChange={(e) => {
                  const value = e.target.value as Form;
                  setForm(value);
                  experience.current?.setForm(value);
                  setMessage('');
                }}
              >
                <option value="bloom">Twisted bloom</option>
                <option value="ribbon">Wave vessel</option>
                <option value="orbit">Orbital stack</option>
                <option value="terrain" disabled={status.factory}>
                  Interference terrain
                </option>
                {form === 'custom' && (
                  <option value="custom">{status.name}</option>
                )}
              </select>
              <button
                aria-label="Generate variation"
                title="Generate variation"
                disabled={!status.ready || loading || form === 'custom'}
                onClick={() => experience.current?.vary()}
              >
                <Shuffle size={16} />
              </button>
              <label
                className={`atelier-upload ${!status.ready || loading ? 'atelier-disabled' : ''}`}
                title="Upload STL"
              >
                <Upload size={16} />
                <span>{loading ? 'Slicing…' : 'STL'}</span>
                <input
                  aria-label="Upload STL"
                  type="file"
                  accept=".stl"
                  disabled={!status.ready || loading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const owner = experience.current;
                    setLoading(true);
                    setMessage('Slicing your model into horizontal contours…');
                    try {
                      await owner?.loadSTL(file);
                      if (experience.current === owner) {
                        setForm('custom');
                        setMessage(
                          'STL loaded. Fitted to the bed, Z-up. Perimeters only; supports are not generated.'
                        );
                      }
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'This STL could not be read.'
                      );
                    } finally {
                      setLoading(false);
                      event.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
          </div>
          <div className="atelier-process">
            <div className="atelier-process-label">
              <label className="font-meta" htmlFor="atelier-progress">
                02 /{' '}
                {status.factory
                  ? 'Production cycle'
                  : STAGE_LABELS[status.stage]}
              </label>
              <span className="font-meta">
                {status.factory
                  ? `${status.inFlight} editions / overlapping processes`
                  : status.stage === 'printing'
                    ? `Layer ${String(status.layer).padStart(3, '0')} / ${status.layers}`
                    : `${status.stage === 'spectral' ? 'Exposure' : 'Coating'} ${Math.round((status.stage === 'spectral' ? status.spectral : status.coating) * 100)}%`}
              </span>
            </div>
            <div className="atelier-transport">
              <button
                className="atelier-play"
                aria-label={status.paused ? 'Resume print' : 'Pause print'}
                disabled={!status.ready || status.reduced || status.complete}
                onClick={() => experience.current?.setPaused(!status.paused)}
              >
                {status.paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <input
                id="atelier-progress"
                aria-label="Print progress"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={status.progress}
                disabled={status.factory || !status.ready || loading}
                onChange={(e) => {
                  const progress = Number(e.target.value);
                  setStatus((previous) => ({ ...previous, progress }));
                  experience.current?.seek(progress);
                }}
              />
              <output>{Math.round(status.progress * 100)}%</output>
              <button
                aria-label="Restart print"
                title="Restart print"
                disabled={!status.ready || loading}
                onClick={() => experience.current?.restart()}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="atelier-speed">
            <label className="font-meta" htmlFor="atelier-speed">
              Simulation speed
            </label>
            <div>
              <select
                id="atelier-speed"
                value={speed}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setSpeed(value);
                  experience.current?.setSpeed(value);
                }}
              >
                <option value="1">1× / Real pace</option>
                <option value="12">12× / Studio pace</option>
                <option value="48">48× / Fast study</option>
              </select>
              <button
                aria-label="Save still"
                title="Save still"
                disabled={!status.ready}
                onClick={() => {
                  void experience.current?.saveStill().then(
                    () => setMessage('Scene saved as a PNG.'),
                    () =>
                      setMessage(
                        'This frame could not be saved. Please try again.'
                      )
                  );
                }}
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="atelier-recipe" data-poster-hide>
          <label className="font-meta" htmlFor="atelier-treatment">
            Treatment recipe
          </label>
          <select
            id="atelier-treatment"
            value={treatment}
            disabled={!status.ready}
            onChange={(e) => {
              const next = e.target.value as Treatment;
              setTreatment(next);
              experience.current?.setTreatment(next);
            }}
          >
            <option value="prismatic">Prismatic / spectral flow</option>
            <option value="recursive">Recursive / folded interference</option>
            <option value="glitch">Signal fracture / quantised bands</option>
          </select>
          <label className="font-meta" htmlFor="atelier-pigment">
            Brush load
          </label>
          <select
            id="atelier-pigment"
            value={richness}
            disabled={!status.ready}
            onChange={(event) => {
              const value = Number(event.target.value);
              setRichness(value);
              experience.current?.setRichness(value);
            }}
          >
            <option value={0.6}>Dry trails</option>
            <option value={1}>Loaded brush</option>
            <option value={1.4}>Heavy pigment</option>
          </select>
          <span className="atelier-recipe-note">
            {status.editions
              ? `${status.editions} completed editions in the studio.`
              : status.factory
                ? 'Recipe changes enter the next edition.'
                : 'Pigment changes the trace and spectral finish.'}
          </span>
          <button
            disabled={!status.ready || status.coating === 0}
            onClick={() => {
              experience.current?.savePainting();
              setMessage('Contour painting saved as a PNG.');
            }}
          >
            Save painting <Download size={14} />
          </button>
        </div>
        <details className="atelier-genome" data-poster-hide>
          <summary>
            <span>Shape the next generation</span>
            <span className="font-meta">INHERIT / FUSE / GROW</span>
          </summary>
          <div className="atelier-genome-controls">
            {(
              [
                ['inheritance', 'Inheritance', 'Family resemblance'],
                ['fusion', 'Fusion', 'Elasticity of matter'],
                ['growth', 'Growth', 'Time to unfold'],
                ['expression', 'Expression', 'Living motion'],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key}>
                <span>
                  {label}
                  <output>{Math.round(living[key] * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={living[key]}
                  aria-label={label}
                  disabled={!status.ready}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setLiving((previous) => ({ ...previous, [key]: value }));
                    experience.current?.setLivingControl(
                      key as keyof LivingControls,
                      value
                    );
                  }}
                />
                <small>{hint}</small>
              </label>
            ))}
          </div>
          <p>
            {status.factory
              ? 'These choices belong to the next edition. Each finished specimen keeps its own recipe.'
              : 'Fusion can be inspected here. Lineage and growth shape new editions in Live factory.'}
          </p>
        </details>
        <div className="atelier-bottom" data-poster-hide>
          <div
            className="atelier-stages font-meta"
            aria-label="Pipeline stages"
          >
            {(
              [
                'printing',
                'transfer',
                'painting',
                'spectral',
                'complete',
              ] as PipelineStage[]
            ).map((stage, index) => (
              <button
                key={stage}
                aria-current={
                  status.stage === stage ||
                  (stage === 'complete' && status.stage === 'exhibit')
                    ? 'step'
                    : undefined
                }
                disabled={!status.ready || loading}
                onClick={() => {
                  if (status.factory)
                    experience.current?.setView(
                      (
                        {
                          printing: 'detail',
                          transfer: 'studio',
                          painting: 'brush',
                          spectral: 'bath',
                          exhibit: 'studio',
                          complete: 'edition',
                        } as const
                      )[stage]
                    );
                  else experience.current?.previewStage(stage);
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>{' '}
                {STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
          <button
            className="atelier-finish"
            disabled={!status.ready || loading}
            onClick={() =>
              status.factory
                ? experience.current?.setView('brush')
                : experience.current?.previewFinish()
            }
          >
            Watch the brush <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
      <footer className="atelier-notes" data-poster-hide>
        <p>
          Fabrication, gesture and experimental surface treatments.
          <br />
          <span>
            A sculpture and a painted contour edition from the same seed.
          </span>
        </p>
        <details>
          <summary>
            Inside the process <ArrowUpRight size={14} />
          </summary>
          <p>{study.notes?.mechanism}</p>
          <p>{study.notes?.interaction}</p>
          <p>{study.notes?.decision}</p>
          <p>
            WebGPU and TSL give the atelier a shared material language. Live
            factory overlaps a new print and companion painting with the
            previous edition’s spectral treatment and a finished specimen’s
            display. A shared thirty-second cadence schedules clearance, release
            and return. Inspect edition retains the original reversible
            timeline.
          </p>
          <p>
            The brush has a finite pigment reservoir. Its pressure changes
            contact width; wet paint spreads across the floor and settles as it
            dries. The shared surface model also powers Can Control’s
            gravity-driven wall drips.
          </p>
          <p>
            Edition recipes remain fixed after birth. Painted signatures travel
            to the bath, recovered energy grows a nursery colony, and mature
            colonies pass traits to a later edition. The spectral bath couples
            an analytic folded field to displaced surface waves and timed drops
            released from the object’s lower contour. It is a visual treatment,
            not a volumetric fluid or fractal-growth solver. Scrubbing
            reconstructs paint with fixed simulation steps. Reduced motion
            supports manual stage inspection.
          </p>
          <p>
            STL upload: binary or ASCII, Z-up, automatically fitted to the bed.
            Up to 15 MB and 100,000 triangles. This is a visual perimeter
            simulation, not a fabrication slicer or a guarantee of printability.
            No infill, support generation or G-code export.
          </p>
          <p className="font-meta">
            {status.backend.toUpperCase()} / {status.pixels} px /{' '}
            {status.frameMs.toFixed(1)} ms observed frame interval
          </p>
          <p>
            Frame interval includes browser scheduling, not GPU time. Rendering
            is capped at 1.6 million pixels.
          </p>
        </details>
      </footer>
      <p className="atelier-message" role="status">
        {message}
      </p>
    </div>
  );
}
