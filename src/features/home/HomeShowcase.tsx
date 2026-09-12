import { Link } from 'react-router-dom';
import { editionLabel, type Study } from '../lab/registry';
import './showcase.css';
import { ArtworkPreview, type ArtworkLanding } from './ArtworkPreview';
import { VisitStamp } from '../visit/VisitStamp';

export function HomeShowcase({
  studies,
  landing,
}: {
  studies: readonly Study[];
  landing?: ArtworkLanding;
}) {
  return (
    <div className="home-showcase">
      {studies.map((study, index) => (
        <article key={study.slug} className="home-showcase-piece">
          <ArtworkPreview
            study={study}
            landing={index === 0 ? landing : undefined}
          />
          <Link
            to={`/experiments/${study.slug}`}
            className="home-showcase-link"
          >
            <div className="home-showcase-title">
              <span className="font-meta text-fg-subtle">
                {editionLabel(study.edition)}
                <VisitStamp slug={study.slug} />
              </span>
              <h3 className="font-display">{study.title}</h3>
              <span aria-hidden="true">↗</span>
            </div>
          </Link>
          <p className="home-showcase-summary">{study.summary}</p>
          <p className="mt-4 font-meta text-fg-subtle">
            {study.technique.join(' / ')}
            {study.status === 'wip' && ' · In progress'}
          </p>
        </article>
      ))}
    </div>
  );
}
