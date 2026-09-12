/**
 * The record, drawn to scale.
 *
 * Same principle as the study marks: geometry that comes out of data rather
 * than geometry placed to look like something. Every bar's offset and length is
 * a percentage computed from its real start and end month against one shared
 * axis, so the three-year degree really is about three times the length of the
 * graduate scheme. Nothing is nudged.
 *
 * Laid out in CSS rather than as a scaled SVG. A viewBox stretched to fit a
 * responsive width needs `preserveAspectRatio="none"`, which distorts exactly
 * the thing a diagram is claiming to be honest about — the bars turn into
 * lozenges of the wrong proportion and the round point-events turn into
 * ellipses. Percentage offsets keep the horizontal axis true and leave the
 * vertical rhythm to the type scale, where it belongs.
 */

export interface Span {
  label: string;
  /** The workplace or institution: a primary part of the record. */
  organisation?: string;
  /** A secondary qualifier, such as a team or result. */
  detail?: string;
  /** ISO year-month. */
  from: string;
  /** ISO year-month. Omit for ongoing. */
  to?: string;
  /** A qualification is a moment, not a duration. */
  point?: boolean;
  current?: boolean;
}

function months(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function Timeline({ spans }: { spans: readonly Span[] }) {
  const now = new Date();
  const nowMonths = now.getFullYear() * 12 + now.getMonth();

  const starts = spans.map((s) => months(s.from));
  const ends = spans.map((s) => (s.to ? months(s.to) : nowMonths));
  // Six months before the first event lets it enter the field. Thirty months
  // after today gives the future a clean quarter of the composition: enough
  // room for a distinct visual idea without compressing the recorded years.
  const min = Math.min(...starts) - 6;
  const max = Math.max(...ends, nowMonths) + 30;
  const total = max - min;

  const pct = (m: number) => ((m - min) / total) * 100;
  const nowPct = pct(nowMonths);

  const years: number[] = [];
  for (let y = Math.ceil(min / 12); y * 12 <= max; y++) {
    years.push(y);
  }

  return (
    <figure className="w-full">
      <div className="relative isolate border-y border-current/25">
        {/* A hard inversion starts at today. The single geometric sunrise uses
            the diagram's existing circle, hairline and signal-fill vocabulary;
            it suggests a beginning without turning the graph into an
            illustration. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 z-0 overflow-hidden bg-ink"
          style={{ width: `${100 - nowPct}%` }}
        >
          <div className="absolute inset-x-0 bottom-[22%] border-t border-on-ink/40">
            <span className="absolute bottom-0 left-1/2 aspect-[2/1] w-[62%] -translate-x-1/2 rounded-t-full bg-brand" />
          </div>
        </div>

        {/* Year grid, behind the bars. */}
        <div aria-hidden="true" className="absolute inset-0 z-10">
          {years.map((y) => (
            <span
              key={y}
              className={`absolute inset-y-0 w-px ${
                y > now.getFullYear()
                  ? 'bg-on-ink opacity-20'
                  : 'bg-current opacity-20'
              }`}
              style={{ left: `${pct(y * 12)}%` }}
            />
          ))}
        </div>

        <ul className="relative z-20 py-3">
          {spans.map((s) => {
            const left = pct(months(s.from));
            const right = pct(s.to ? months(s.to) : nowMonths);

            return (
              <li key={s.label} className="py-4">
                <div className="relative h-4">
                  {s.point ? (
                    <span
                      className="absolute top-0 size-4 -translate-x-1/2 rounded-full bg-current ring-4 ring-bg"
                      style={{ left: `${left}%` }}
                    />
                  ) : (
                    <span
                      className={`absolute top-0 h-4 rounded-full ${
                        s.current ? 'bg-brand' : 'bg-current'
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(right - left, 1.5)}%`,
                      }}
                    />
                  )}
                </div>

                {/* The label starts where its bar starts, so the pairing is
                    unambiguous without a leader line. Flattened to the left
                    edge below md, where the offset would leave a two-word
                    label wrapping down four lines. */}
                <div
                  className="mt-3 flex min-w-0 flex-col gap-1 pr-4 md:max-w-[var(--label-end)] md:pl-[var(--offset)]"
                  style={
                    {
                      '--offset': `${left}%`,
                      '--label-end': `${Math.max(nowPct - 1.5, 72)}%`,
                    } as React.CSSProperties
                  }
                >
                  <span className="font-display text-lg uppercase leading-none">
                    {s.label}
                  </span>
                  {s.organisation && (
                    <span className="text-sm font-bold uppercase tracking-[0.04em]">
                      {s.organisation}
                    </span>
                  )}
                  {s.detail && (
                    <span className="font-meta text-fg-subtle">{s.detail}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Today is both an axis value and the boundary between recorded and
            unrecorded time, so it gets the strongest rule in the diagram. */}
        <div
          aria-label={`Now, ${now.toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric',
          })}`}
          className="absolute inset-y-0 z-30 border-l-2 border-brand"
          style={{ left: `${nowPct}%` }}
        >
          <time
            dateTime={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
            className="absolute left-0 top-0 -translate-x-full bg-brand px-2 py-1 font-meta text-on-brand"
          >
            Now
          </time>
        </div>
      </div>

      {/* The axis, labelled under the same percentages the bars use. */}
      <div className="relative mt-4 h-4 border-t border-current/25">
        {years.map((y) => (
          <span
            key={y}
            className={`absolute top-2 -translate-x-1/2 font-meta text-dim ${
              y % 2 === 0 ? 'hidden lg:block' : ''
            }`}
            style={{ left: `${pct(y * 12)}%` }}
          >
            {y}
          </span>
        ))}
      </div>

      <figcaption className="sr-only">
        Bars are drawn to scale from their real start and end dates. A marker
        indicates the current month; the field after it represents future time.
      </figcaption>
    </figure>
  );
}
