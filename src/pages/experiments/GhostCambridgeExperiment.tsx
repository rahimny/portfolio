import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import ThreeCanvas, { type ExperienceFactory } from '@/components/three-canvas';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { editionLabel, getStudy } from '@/features/lab/registry';
import { LocatorMap } from '@/features/ghost-cambridge/LocatorMap';
import {
  GhostCambridgeExperience,
  INITIAL_STATUS,
} from '@/vanilla-three/experiences/ghost-cambridge/GhostCambridgeExperience';
import './GhostCambridgeExperiment.css';

export default function GhostCambridgeExperiment() {
  const location = useLocation();
  const study = getStudy(location.pathname.split('/')[2])!;
  const initialAllPoints = useRef(
    new URLSearchParams(location.search).get('density') === 'all'
  );
  const breadcrumbs = useBreadcrumbFromRoute();
  useDocumentMeta(study.title, study.summary);
  const experience = useRef<GhostCambridgeExperience | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [message, setMessage] = useState('');
  const [labels, setLabels] = useState(true);
  const factory = useCallback<ExperienceFactory>((canvas, options) => {
    const next = new GhostCambridgeExperience(
      canvas,
      setStatus,
      options,
      initialAllPoints.current
    );
    experience.current = next;
    return next;
  }, []);
  const held = status.paused || status.reduced;
  const selected = status.context?.landmarks.find(
    (item) => item.id === status.selected
  );
  const detail = status.detailFailed
    ? 'Some detail unavailable · overview retained'
    : status.allPoints
      ? status.fullTiles === status.totalTiles && status.totalTiles > 0
        ? 'Full survey · every recorded point loaded'
        : `Loading full survey · ${status.fullTiles} / ${status.totalTiles} patches`
      : status.detailLoading
        ? 'Loading original survey detail…'
        : status.fullTiles
          ? `Full-density detail · ${status.fullTiles} patches`
          : 'Overview · zoom in for original detail';
  return (
    <div className="ghost-page">
      <main className="ghost-observatory" data-view={status.view}>
        <div className="ghost-stage" data-artboard>
          <ThreeCanvas
            experienceFactory={factory}
            tabIndex={0}
            ariaLabel="A laser survey of central Cambridge. Drag to orbit, scroll to zoom, click to send a scan pulse. Left and right arrows scrub the scan, Enter sends a pulse, Space pauses, R resets the camera."
          />
          {labels && status.view !== 'section' && (
            <div className="ghost-anchors" data-poster-hide>
              {status.labels
                .filter((anchor) => anchor.visible)
                .map((anchor) =>
                  anchor.id === 'highest-return' ? (
                    <div
                      key={anchor.id}
                      className="ghost-highest-point"
                      style={
                        {
                          left: anchor.x,
                          top: anchor.y,
                          '--ghost-anchor-x': `${anchor.x}px`,
                        } as CSSProperties
                      }
                    >
                      <span className="ghost-highest-point-label">
                        <strong>Highest survey return</strong>
                        <span>
                          {status.highestPoint?.position[2].toFixed(2)} m
                          elevation
                        </span>
                        <small>
                          {status.highestPoint?.heightAboveGround.toFixed(2)} m
                          above estimated ground
                        </small>
                      </span>
                      <i aria-hidden="true" />
                    </div>
                  ) : (
                    <button
                      key={anchor.id}
                      style={{ left: anchor.x, top: anchor.y }}
                      className={
                        status.selected === anchor.id ? 'is-selected' : ''
                      }
                      onClick={() =>
                        experience.current?.focusLandmark(anchor.id)
                      }
                      aria-label={`Explore ${status.context?.landmarks.find((item) => item.id === anchor.id)?.name}`}
                    >
                      <i aria-hidden="true" />
                      {
                        status.context?.landmarks.find(
                          (item) => item.id === anchor.id
                        )?.name
                      }
                    </button>
                  )
                )}
            </div>
          )}
        </div>
        <header className="ghost-header" data-poster-hide>
          <ExperimentBreadcrumb items={breadcrumbs} />
          <span className="font-meta">
            Study {editionLabel(study.edition)} / Field recordings
          </span>
        </header>
        <div className="ghost-title" data-poster-hide>
          <p className="font-meta">Cambridge, England · 13 February 2023</p>
          <h1>
            {study.title}
            <span aria-hidden="true">.</span>
          </h1>
          <p>The Backs, the Cam & the college courts.</p>
        </div>
        <aside
          className="ghost-destinations"
          aria-label="Explore Cambridge landmarks"
          data-poster-hide
        >
          <p className="font-meta">Go somewhere</p>
          <div className="ghost-destination-list">
            {status.context?.landmarks.map((landmark, index) => (
              <button
                key={landmark.id}
                aria-pressed={status.selected === landmark.id}
                onClick={() => experience.current?.focusLandmark(landmark.id)}
              >
                <span className="font-meta">0{index + 1}</span>
                {landmark.name}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="ghost-place-description">
              <p>{selected.description}</p>
              <button onClick={() => experience.current?.resetCamera()}>
                ← Return to overview
              </button>
            </div>
          )}
        </aside>
        {status.context && (
          <aside className="ghost-location" data-poster-hide>
            <LocatorMap
              context={status.context}
              east={status.cameraEast}
              north={status.cameraNorth}
              bearing={status.bearing}
            />
          </aside>
        )}
        {!status.ready && (
          <div className="ghost-loading" role="status">
            Reading the city<span>Loading the measured survey…</span>
          </div>
        )}
        <div className="ghost-stage-note font-meta" data-poster-hide>
          <span>
            {selected
              ? `Cambridge / ${selected.name}`
              : status.view === 'section'
                ? 'Vertical section · 64 m wide band'
                : 'Drag to orbit · Scroll to approach · Tap to echo'}
          </span>
          <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
            Survey labels {labels ? 'on' : 'off'}
          </button>
        </div>
        <fieldset
          className="ghost-console"
          disabled={!status.ready}
          data-poster-hide
        >
          <legend className="sr-only">Survey controls</legend>
          <div className="ghost-console-top">
            <div
              className="ghost-modes"
              role="group"
              aria-label="Colour treatment"
            >
              {['Atlas', 'Height', 'Ghost', 'Reflectance'].map(
                (label, index) => (
                  <button
                    key={label}
                    aria-pressed={status.palette === index}
                    onClick={() =>
                      experience.current?.setParameter('palette', index)
                    }
                  >
                    {label}
                  </button>
                )
              )}
            </div>
            <div
              className="ghost-modes"
              role="group"
              aria-label="Point density"
            >
              {[false, true].map((all) => (
                <button
                  key={String(all)}
                  aria-pressed={status.allPoints === all}
                  onClick={() => experience.current?.setAllPoints(all)}
                >
                  {all ? 'All points' : 'Adaptive'}
                </button>
              ))}
            </div>
            <div
              className="ghost-view-actions"
              role="group"
              aria-label="Camera view"
            >
              {(['map', 'cloud', 'section'] as const).map((view) => (
                <button
                  key={view}
                  aria-pressed={status.view === view}
                  onClick={() => experience.current?.setView(view)}
                >
                  {view === 'map'
                    ? 'Map ↓'
                    : view === 'cloud'
                      ? 'Cloud ↗'
                      : 'Section ⊥'}
                </button>
              ))}
              <button
                onClick={() => {
                  setMessage('Preparing image…');
                  void experience.current
                    ?.saveStill()
                    .then(() => setMessage('Image saved.'))
                    .catch(() =>
                      setMessage('Could not save the image. Please try again.')
                    );
                }}
              >
                Save image ↓
              </button>
            </div>
          </div>
          <div className="ghost-legend font-meta" aria-live="polite">
            {status.palette === 0 ? (
              <>
                <span>
                  <i className="ghost-key-building" />
                  Buildings
                </span>
                <span>
                  <i className="ghost-key-vegetation" />
                  Vegetation
                </span>
                <span>
                  <i className="ghost-key-ground" />
                  Ground
                </span>
                <span>
                  <i className="ghost-key-river" />
                  Mapped river
                </span>
                <small>Survey classifications · not photographic colour</small>
              </>
            ) : status.palette === 1 ? (
              <>
                <span className="ghost-height-ramp" />
                <span>0 → 40+ m above estimated ground</span>
                <small>Height, not temperature</small>
              </>
            ) : status.palette === 2 ? (
              <>
                <span>
                  <i className="ghost-key-river" />
                  Measured returns
                </span>
                <span>
                  <i className="ghost-key-scan" />
                  Scan / echo
                </span>
                <small>Artistic illumination of a static survey</small>
              </>
            ) : (
              <>
                <span className="ghost-intensity-ramp" />
                <span>Low → high recorded intensity</span>
                <small>Normalised laser reflectance</small>
              </>
            )}
          </div>
          <div className="ghost-controls">
            <div className="ghost-control ghost-scan-control">
              <label htmlFor="ghost-scan">
                {status.replay ? 'Acquisition replay' : 'Scan position'}
                <output>
                  {status.replay
                    ? `+${Math.round(status.replayOffset)} s`
                    : `${Math.round(status.scan * 100)}%`}
                </output>
              </label>
              <div className="ghost-scan-row">
                <button
                  disabled={status.reduced}
                  aria-label={held ? 'Resume scan' : 'Pause scan'}
                  onClick={() => experience.current?.setPaused(!status.paused)}
                >
                  {held ? '▶' : 'Ⅱ'}
                </button>
                <input
                  id="ghost-scan"
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={status.scan}
                  onChange={(event) =>
                    experience.current?.setScan(Number(event.target.value))
                  }
                />
                <button onClick={() => experience.current?.ping()}>Echo</button>
              </div>
            </div>
            <div className="ghost-control">
              <label htmlFor="ghost-layer">Show</label>
              <select
                id="ghost-layer"
                value={status.layer}
                onChange={(event) =>
                  experience.current?.setParameter(
                    'layer',
                    Number(event.target.value)
                  )
                }
              >
                <option value="0">All returns</option>
                <option value="3">Buildings</option>
                <option value="1">Vegetation</option>
                <option value="2">Bare earth</option>
              </select>
            </div>
            <div className="ghost-control">
              <label htmlFor="ghost-relief">
                Height exaggeration<output>{status.relief.toFixed(1)}×</output>
              </label>
              <input
                id="ghost-relief"
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={status.relief}
                onChange={(event) =>
                  experience.current?.setParameter(
                    'relief',
                    Number(event.target.value)
                  )
                }
              />
            </div>
            <div className="ghost-control">
              <label htmlFor="ghost-source">Scan source</label>
              <select
                id="ghost-source"
                value={status.replay}
                onChange={(event) =>
                  experience.current?.setParameter(
                    'replay',
                    Number(event.target.value)
                  )
                }
              >
                <option value="0">Artistic sweep</option>
                <option value="1">Recorded flight timing</option>
              </select>
            </div>
          </div>
          {status.view === 'section' && (
            <div className="ghost-section-control">
              <label htmlFor="ghost-slice" className="font-meta">
                Move section · west → east
              </label>
              <input
                id="ghost-slice"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={status.slice}
                onChange={(event) =>
                  experience.current?.setParameter(
                    'slice',
                    Number(event.target.value)
                  )
                }
              />
            </div>
          )}
          <div className="ghost-console-foot font-meta">
            <span>
              {status.reduced
                ? 'Reduced motion · Manual scan'
                : held
                  ? 'Scan held'
                  : status.replay
                    ? 'Replaying acquisition order'
                    : 'Scanning west → east'}
            </span>
            <span role="status">{message || detail}</span>
            <span>
              {status.count.toLocaleString('en-GB')} active survey returns
            </span>
          </div>
        </fieldset>
      </main>
      <footer className="ghost-footnotes" data-poster-hide>
        <div>
          <p>Measured city. Recorded light.</p>
          <p className="ghost-subtle">
            {status.fullCount.toLocaleString('en-GB')} original returns
            available across this patch.
            <br />
            Adaptive loads full-density patches as you approach. All points
            loads the entire survey crop at every zoom level.
          </p>
          <details className="ghost-inspector">
            <summary>
              More ways to inspect <span>+</span>
            </summary>
            <div className="ghost-inspector-controls">
              <label htmlFor="ghost-point-size">
                Point size · {status.pointSize.toFixed(1)} px
                <input
                  id="ghost-point-size"
                  type="range"
                  min="1"
                  max="3"
                  step="0.5"
                  value={status.pointSize}
                  onChange={(event) =>
                    experience.current?.setParameter(
                      'pointSize',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label htmlFor="ghost-depth">
                Depth shading
                <select
                  id="ghost-depth"
                  aria-label="Depth shading"
                  value={status.depthAvailable ? status.depthShading : 0}
                  disabled={!status.depthAvailable}
                  onChange={(event) =>
                    experience.current?.setParameter(
                      'depthShading',
                      Number(event.target.value)
                    )
                  }
                >
                  <option value="1">Soft relief</option>
                  <option value="0">Plain points</option>
                </select>
              </label>
              <label htmlFor="ghost-floor">
                Hide below {status.floor} m above estimated ground
                <input
                  id="ghost-floor"
                  type="range"
                  min="0"
                  max="40"
                  step="0.5"
                  value={status.floor}
                  onChange={(event) =>
                    experience.current?.setParameter(
                      'floor',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label htmlFor="ghost-returns">
                Pulse returns
                <select
                  id="ghost-returns"
                  value={status.returnFilter}
                  onChange={(event) =>
                    experience.current?.setParameter(
                      'returnFilter',
                      Number(event.target.value)
                    )
                  }
                >
                  <option value="0">Every return</option>
                  <option value="1">First returns</option>
                  <option value="2">Last returns</option>
                </select>
              </label>
            </div>
          </details>
        </div>
        <details>
          <summary>
            About the recording <span aria-hidden="true">+</span>
          </summary>
          <div>
            <p>{study.notes?.mechanism}</p>
            <p>
              The overview samples one million returns. At close range, up to
              four 230 m patches load their full original density. Points in
              those patches replace the sample; they are not duplicated or
              reconstructed. Roofs are better recorded than vertical walls in
              this airborne survey. Gaps that remain in the source are retained.
            </p>
            <p>
              Atlas colours use automated building, vegetation and ground
              classes. The blue river and thin streets are OpenStreetMap
              linework, aligned using British National Grid coordinates. Labels
              mark mapped places. The locator arrow shows camera focus and
              viewing direction.
            </p>
            <p>
              Fine points keep a constant size as the scan passes. Soft relief
              uses nearby depth differences to separate overlapping forms;
              compare plain points in the inspection controls. Scan and echo
              change illumination without moving the recorded structures. Map
              view uses plain points.
            </p>
            <p>
              Height colour and filtering use an estimated ground surface
              derived from the lowest classified ground return in each 5 m cell,
              with neighbouring cells filling gaps. This is not the Environment
              Agency’s edited terrain model. The default vertical exaggeration
              is 1.4×. Set 1× for measured proportions.
            </p>
            <p>
              Recorded flight timing uses the point timestamps, compressed into
              the playback. Gaps between passes are skipped; the clock retains
              the original elapsed time. It shows acquisition order across
              flight passes, not activity in Cambridge today. First and last
              returns refer to a laser pulse’s recorded reflections. Reflectance
              is normalised between the source sample’s 2nd and 98th intensity
              percentiles. No photographic colour is present.
            </p>
            <p>
              {status.frameMs.toFixed(1)} ms recent CPU draw/submission average,
              not GPU time. Rendering sleeps when paused, off screen or in a
              hidden tab. Source: {status.source}
            </p>
            <p>
              © Environment Agency copyright and/or database right 2023. All
              rights reserved.{' '}
              <a
                href="https://environment.data.gov.uk/survey"
                target="_blank"
                rel="noreferrer"
              >
                Source survey ↗
              </a>{' '}
              ·{' '}
              <a
                href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
                target="_blank"
                rel="noreferrer"
              >
                OGL v3.0 ↗
              </a>{' '}
              ·{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                © OpenStreetMap contributors ↗
              </a>
            </p>
          </div>
        </details>
      </footer>
    </div>
  );
}
