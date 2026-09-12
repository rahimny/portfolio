import { useVisits } from './store';
import './visit.css';

export function VisitStamp({ slug }: { slug: string }) {
  const visited = useVisits().includes(slug);
  if (!visited) return null;
  return (
    <span className="visit-stamp" title="Visited this session">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 3.5c7-1 12.5 4.5 12 12s-4 12.5-12 12S3 23 4 16 9 4.5 16 3.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="24 1 8 2"
        />
        <path
          d="m10 16 4 4 8-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="28" cy="26" r="1" fill="currentColor" />
      </svg>
      <span className="sr-only">Visited this session</span>
    </span>
  );
}
