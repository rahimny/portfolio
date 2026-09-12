import type { StudyConstruction } from './registry';
import './construction.css';

export function ConstructionPlate({
  construction,
}: {
  construction?: StudyConstruction;
}) {
  if (!construction) return null;
  return (
    <figure className="construction-plate">
      <img
        src={construction.image}
        alt={construction.alt}
        width={1200}
        height={1200}
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <strong>{construction.title}</strong>
        <span>{construction.caption}</span>
      </figcaption>
    </figure>
  );
}
