import { useId, useState } from 'react';
import './portrait.css';

/** A trainer outsole outline from two profile curves — a width envelope with a
 * forefoot swell and an arch waist, offset by a curved centre line. Generated,
 * not traced; nothing here is drawn by hand. */
const SOLE_LENGTH = 6.6;
function soleWidth(v: number) {
  const cap = Math.pow(Math.max(0.003, Math.sin(Math.PI * v)), 0.45);
  return (
    cap *
    (1.02 +
      0.3 * Math.exp(-(((v - 0.24) / 0.19) ** 2)) -
      0.12 * Math.exp(-(((v - 0.6) / 0.16) ** 2)))
  );
}
function solePoint(u: number, v: number) {
  return {
    x: (u * 2 - 1) * soleWidth(v) + 0.14 * Math.sin(v * Math.PI * 1.5) - 0.08,
    z: (v - 0.5) * SOLE_LENGTH,
  };
}

const silhouette =
  [
    ...Array.from({ length: 65 }, (_, i) => solePoint(0, i / 64)),
    ...Array.from({ length: 65 }, (_, i) => solePoint(1, 1 - i / 64)),
  ]
    .map(
      (p, i) =>
        `${i ? 'L' : 'M'}${(p.x * 26).toFixed(2)},${(p.z * 26).toFixed(2)}`
    )
    .join(' ') + 'Z';

export function Portrait() {
  const [turned, setTurned] = useState(false);
  const id = useId();
  return (
    <figure
      className="portrait col-span-12 mx-auto w-full max-w-[22rem] md:col-span-4 md:col-start-9 md:mx-0 md:max-w-none"
      data-turned={turned}
    >
      <div
        className="portrait-mount"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setTurned(false);
        }}
      >
        <div className="portrait-sides">
          <div className="portrait-front" aria-hidden={turned}>
            <picture>
              <source
                type="image/avif"
                sizes="(min-width: 768px) 480px, 352px"
                srcSet="/images/me-480.avif 480w, /images/me-960.avif 960w, /images/me-1440.avif 1440w"
              />
              <source
                type="image/webp"
                sizes="(min-width: 768px) 480px, 352px"
                srcSet="/images/me-480.webp 480w, /images/me-960.webp 960w, /images/me-1440.webp 1440w"
              />
              <img
                src="/images/me-1440.png"
                alt="Rahim Neal Yakoob"
                width={640}
                height={800}
              />
            </picture>
          </div>
          <div
            id={id}
            className="portrait-back"
            aria-hidden={!turned}
            inert={!turned}
          >
            <p className="font-meta">Away from the keyboard</p>
            <p className="portrait-back-title">Off duty.</p>
            <svg
              viewBox="0 0 300 200"
              aria-hidden="true"
              className="portrait-sole"
            >
              <g transform="translate(150 100) rotate(58)">
                {Array.from({ length: 8 }, (_, i) => (
                  <path
                    key={i}
                    d={silhouette}
                    transform={`scale(${1 - i * 0.085})`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={i === 0 ? 2 : 0.8}
                  />
                ))}
              </g>
            </svg>
            <ul>
              <li>Trainer silhouettes</li>
              <li>Generative art &amp; 3D printing</li>
              <li>Old School RuneScape</li>
            </ul>
          </div>
        </div>
        <button
          type="button"
          className="portrait-turn font-meta"
          aria-expanded={turned}
          aria-controls={id}
          onClick={() => setTurned(!turned)}
        >
          <span aria-hidden="true">↶</span> {turned ? 'Portrait' : 'Turn over'}
        </button>
      </div>
      <figcaption className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-2">
        <span className="font-meta text-fg-subtle">
          {turned ? 'A few things I like' : 'Portrait'}
        </span>
        <span className="font-meta text-fg-muted">Cambridge, 2025</span>
      </figcaption>
    </figure>
  );
}
