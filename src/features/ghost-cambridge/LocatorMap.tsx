import { memo } from 'react';
import type { MapContext } from './survey';
const MapLines = memo(function MapLines({ context }: { context: MapContext }) {
  return (
    <>
      {context.features.map((feature) => (
        <polyline
          key={feature.id}
          points={feature.points.map(([x, y]) => `${x},${-y}`).join(' ')}
          className={`ghost-map-${feature.kind}`}
        />
      ))}
    </>
  );
});
export function LocatorMap({
  context,
  east,
  north,
  bearing,
}: {
  context: MapContext;
  east: number;
  north: number;
  bearing: number;
}) {
  const [west, south, right, top] = context.bounds;
  return (
    <div className="ghost-locator">
      <div className="ghost-locator-heading font-meta">
        <span>Cambridge / location</span>
        <span>N ↑</span>
      </div>
      <svg
        viewBox={`${west} ${-top} ${right - west} ${top - south}`}
        role="img"
        aria-label="Locator map of Cambridge. The highlighted square is the survey, and the arrow marks the camera's focus and viewing direction."
      >
        <MapLines context={context} />
        <rect
          x="543850"
          y="-258900"
          width="1150"
          height="1150"
          className="ghost-map-crop"
        />
        <g
          transform={`translate(${east} ${-north}) rotate(${-bearing})`}
          className="ghost-map-camera"
        >
          <path d="M0 -85 L45 50 L0 25 L-45 50 Z" />
        </g>
        <text x="545130" y="-258530" className="ghost-map-city">
          CITY
        </text>
        <text x="545130" y="-258365" className="ghost-map-city">
          CENTRE
        </text>
        <path d="M543490 -257200 h1000" className="ghost-map-scale" />
        <text x="543490" y="-257040" className="ghost-map-city">
          1 km
        </text>
      </svg>
      <div className="ghost-locator-foot font-meta">
        <span>Survey footprint · 1.15 × 1.15 km</span>
      </div>
      <a href={context.licence} target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
