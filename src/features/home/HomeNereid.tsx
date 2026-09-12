import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { getStudy, editionLabel } from '@/features/lab/registry';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './nereid.css';
import type { HomeEncounterSpace } from './HomeEncounterSpace';
import type { NereidChapter } from './nereidScroll';

const NereidCanvas = lazy(() => import('./NereidCanvas'));
const study = getStudy('nereid')!;
const chapters = [
  {
    title: 'I build for\nthe web.',
    body: 'I’m Rahim, a software developer and creative technologist in Cambridge. I make interactive experiences for the web.',
  },
  {
    title: 'Behind the\ninteraction.',
    body: 'At Cambridge Intelligence, I build graph and network visualisation SDKs. My work spans product features, rendering performance and developer experience.',
  },
  {
    title: 'Room to\nexperiment.',
    body: 'The lab is where I explore real-time graphics and generative form. Here, the shell opens around its core while the tendrils keep moving.',
  },
] as const;

export function HomeNereid({
  encounterSpace,
}: {
  encounterSpace?: HomeEncounterSpace;
}) {
  const host = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [near, setNear] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [chapter, setChapter] = useState<NereidChapter>(0);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const staticView = reducedMotion || unavailable;

  useEffect(() => {
    if (!stage.current || staticView) return;
    // Prepare the encounter below the opening viewport before scrolling begins.
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: '700px' }
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [staticView]);

  return (
    <section
      ref={host}
      className="home-nereid"
      data-static={staticView}
      aria-labelledby="home-nereid-title"
    >
      <div ref={stage} className="home-nereid-stage">
        <div className="home-nereid-art" aria-hidden="true">
          {staticView && (
            <img
              className="home-nereid-poster"
              src={study.encounterPoster ?? study.poster}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
          {near && !staticView && (
            <Suspense fallback={null}>
              <NereidCanvas
                host={host}
                stage={stage}
                onUnavailable={onUnavailable}
                encounterSpace={encounterSpace}
                onChapterChange={setChapter}
              />
            </Suspense>
          )}
        </div>
        <div className="home-nereid-layout">
          <div className="home-nereid-heading">
            <p className="font-meta">
              Study {editionLabel(study.edition)} / {study.title}
            </p>
            <h2 id="home-nereid-title" className="sr-only">
              About my work
            </h2>
            <div className="sr-only">
              {chapters.map((entry) => (
                <p key={entry.title}>{entry.body}</p>
              ))}
            </div>
            <div className="home-nereid-story" aria-hidden="true">
              {chapters.map((entry, index) => (
                <div
                  key={entry.title}
                  className="home-nereid-chapter"
                  data-active={index === (staticView ? 0 : chapter)}
                  data-chapter={index}
                >
                  <h3>{entry.title}</h3>
                  <p className="home-nereid-description">{entry.body}</p>
                </div>
              ))}
            </div>
            <Link
              to={`/experiments/${study.slug}`}
              className="home-nereid-link"
            >
              Explore the study <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="home-nereid-footer font-meta">
            <span className="home-nereid-instruction">
              {staticView ? 'Form / Anatomy' : 'Scroll to unfold'}
            </span>
            <span className="home-nereid-measure" aria-hidden="true">
              <span />
            </span>
            <a href="#selected-work">
              Selected studies <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
