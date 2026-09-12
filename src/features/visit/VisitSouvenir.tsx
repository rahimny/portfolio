import { Link } from 'react-router-dom';
import { useState } from 'react';
import { editionLabel, getStudy } from '../lab/registry';
import { useVisits } from './store';
import { visitReceipt } from './model';
import './visit.css';

export function VisitSouvenir() {
  const [palette] = useState(() => {
    if (typeof document === 'undefined')
      return { paper: 'white', ink: 'black' };
    const tokens = getComputedStyle(document.documentElement);
    return {
      paper: tokens.getPropertyValue('--paper').trim(),
      ink: tokens.getPropertyValue('--ink').trim(),
    };
  });
  const visits = useVisits();
  const editions = visits.flatMap((slug) => {
    const study = getStudy(slug);
    return study ? [study] : [];
  });
  if (!editions.length) return null;
  const download = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visitReceipt(editions, palette))}`;
  return (
    <details className="visit-souvenir">
      <summary className="font-meta">
        Your visit <span aria-hidden="true">↗</span>
      </summary>
      <div className="visit-receipt">
        <p className="font-meta">A small record of being here.</p>
        <p className="visit-receipt-title">You found these.</p>
        <ol>
          {editions.map((study) => (
            <li key={study.slug}>
              <Link to={`/experiments/${study.slug}`}>
                <span className="font-meta">{editionLabel(study.edition)}</span>
                <span>{study.title}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ol>
        <a
          className="visit-download font-meta"
          href={download}
          download="rahimny-your-visit.svg"
        >
          Keep this visit · SVG ↓
        </a>
        <p className="visit-receipt-note">
          In order of discovery. Remembered in this tab.
        </p>
      </div>
    </details>
  );
}
