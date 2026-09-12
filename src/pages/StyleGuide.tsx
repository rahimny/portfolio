import { useEffect, useState, type ReactNode } from 'react';
import {
  Section,
  Prose,
  Surface,
  TechTag,
  TagRow,
  Reveal,
  Wordmark,
} from '@/components/primitives';
import { Button } from '@/components/ui/button';
import { ArcFigure } from '@/features/marks/ArcFigure';
import { collectionRings, studyRings } from '@/features/marks/studyFigures';
import { studies, featuredStudy } from '@/features/lab/registry';

/* ---------------------------------------------------------------- helpers */

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <header className="mb-6">
        <h2 className="font-mono text-2xs uppercase tracking-[0.18em] text-fg-subtle">
          {title}
        </h2>
        {note && (
          <Prose size="sm" className="mt-2 text-fg-muted">
            {note}
          </Prose>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Resolves a token to the sRGB hex the browser actually paints.
 *
 * Read from the DOM rather than written into this file as a literal: a hex in
 * source is a second source of truth that drifts the moment the token moves,
 * and `pnpm check:tokens` bans hex literals in src/ for exactly that reason.
 */
function useTokenHex(token: string): string | null {
  const [hex, setHex] = useState<string | null>(null);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
    if (!raw) return;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    setHex(
      [r, g, b].reduce((acc, c) => acc + c.toString(16).padStart(2, '0'), '#')
    );
  }, [token]);

  return hex;
}

function Swatch({
  token,
  label,
  onDark,
}: {
  token: string;
  label?: string;
  onDark?: boolean;
}) {
  const hex = useTokenHex(token);

  return (
    <div className="min-w-0">
      <div
        className="h-16 w-full border border-border"
        style={{ background: `var(${token})` }}
      >
        {label && (
          <span
            className="flex h-full items-center justify-center font-mono text-2xs"
            style={{ color: `var(${onDark ? '--on-brand' : '--fg'})` }}
          >
            {label}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate font-mono text-2xs text-fg-subtle">
        {token}
      </p>
      <p className="truncate font-mono text-2xs uppercase text-fg-muted">
        {hex ?? '\u00a0'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- data */

const TYPE_SCALE = [
  { cls: 'text-hero font-hero', name: '--text-hero', sample: 'Grown' },
  {
    cls: 'text-display font-display uppercase',
    name: '--text-display',
    sample: 'Not drawn',
  },
  {
    cls: 'text-4xl font-display uppercase',
    name: '--text-4xl',
    sample: 'Real-time graphics',
  },
  {
    cls: 'text-3xl font-display uppercase',
    name: '--text-3xl',
    sample: 'Meta shapes',
  },
  {
    cls: 'text-2xl font-medium',
    name: '--text-2xl',
    sample: 'Section heading',
  },
  { cls: 'text-xl', name: '--text-xl', sample: 'Lead paragraph size' },
  { cls: 'text-base', name: '--text-base', sample: 'Body copy, the default' },
  { cls: 'text-sm', name: '--text-sm', sample: 'Secondary and captions' },
  {
    cls: 'text-xs font-mono uppercase tracking-[0.08em]',
    name: '--text-xs',
    sample: 'Metadata · mono',
  },
];

const SPACE = ['1', '2', '3', '4', '6', '8', '12', '16', '24'];
const RADII = ['xs', 'sm', 'md', 'lg', 'xl'];

/* ------------------------------------------------------------------- page */

export default function StyleGuide() {
  return (
    <div className="min-h-dvh bg-bg pt-[var(--navbar-height)]">
      <Section width="content" spacing="tight">
        <Wordmark className="mb-10" />
        <h1 className="font-display text-4xl uppercase text-fg">
          Design system
        </h1>
        <Prose size="lead" className="mt-4">
          Paper, ink and one signal orange, on a 12-column field. There is no
          theme toggle: inversion is a composition device the page controls, not
          a preference. Every value below is a token: nothing in{' '}
          <code className="font-mono text-sm text-brand-ink">src/</code>{' '}
          references a raw Tailwind palette colour.
        </Prose>
      </Section>

      <Section width="content" spacing="none" className="space-y-14 pb-32">
        {/* ------------------------------------------------------ colour */}
        <Block
          title="Signal orange"
          note="One accent, rationed to one plate per screen. Note the -ink split: the brand orange reaches only 3.63:1 on paper, fine as a fill under black type (5.78:1), not safe as text. Fills use --brand; text uses --brand-ink."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Swatch token="--brand" label="Aa" onDark />
            <Swatch token="--brand-hover" />
            <Swatch token="--brand-ink" />
            <Swatch token="--brand-subtle" />
            <Swatch token="--on-brand" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="bg-brand px-3 py-1.5 text-sm font-medium text-on-brand">
              Filled - on-brand text
            </span>
            <a
              href="#"
              className="text-sm font-medium text-brand-ink underline underline-offset-4"
            >
              Link - brand-ink
            </a>
          </div>
        </Block>

        <Block
          title="Grounds"
          note="Three, and a plate sits on exactly one of them. Paper is the default; ink and orange are events. Text colour comes from the ground, which is why the marks and rules inside a plate are drawn in currentColor."
        >
          <div className="grid gap-0 sm:grid-cols-3">
            <div className="flex h-28 flex-col justify-between bg-bg p-4 text-fg">
              <span className="font-meta text-fg-subtle">Paper</span>
              <span className="font-display text-xl uppercase">Default</span>
            </div>
            <div className="flex h-28 flex-col justify-between bg-ink p-4 text-on-ink">
              <span className="font-meta text-on-ink-muted">Ink</span>
              <span className="font-display text-xl uppercase">Weight</span>
            </div>
            <div className="flex h-28 flex-col justify-between bg-brand p-4 text-on-brand">
              <span className="font-meta text-on-brand-muted">Signal</span>
              <span className="font-display text-xl uppercase">Event</span>
            </div>
          </div>
        </Block>

        <Block
          title="Neutrals"
          note="Each carries a trace of warm chroma so the page reads as stock rather than as a screen. --surface is true white and sits above --bg, which is what gives a panel presence against the paper."
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Swatch token="--bg" />
            <Swatch token="--surface" />
            <Swatch token="--surface-2" />
            <Swatch token="--surface-3" />
            <Swatch token="--border" />
            <Swatch token="--border-strong" />
          </div>
          <div className="mt-4 space-y-1">
            <p className="text-fg">--fg · primary text</p>
            <p className="text-fg-muted">--fg-muted · secondary text</p>
            <p className="text-fg-subtle">--fg-subtle · tertiary, metadata</p>
          </div>
        </Block>

        <Block
          title="Status"
          note="'Live' is the brand on purpose: active === brand. 'WIP' is ink rather than a second hue: a status does not earn a colour of its own."
        >
          <TagRow>
            <TechTag variant="live" size="md">
              Live
            </TechTag>
            <TechTag variant="wip" size="md">
              WIP
            </TechTag>
            <TechTag size="md">WebGL</TechTag>
            <TechTag size="md">WebGPU</TechTag>
            <TechTag size="md">TSL</TechTag>
          </TagRow>
        </Block>

        {/* -------------------------------------------------------- type */}
        <Block
          title="Type"
          note="Archivo for display, Inter for text, Geist Mono for technical metadata. Sizes are fluid clamp(); the old four-breakpoint-per-heading pattern is gone. .font-hero pulls tracking to -0.045em, because the -0.02em that looks tight at 3rem looks loose at 15rem."
        >
          <div className="space-y-6">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.name}
                className="flex flex-col gap-1 border-b border-border pb-5 last:border-0"
              >
                <span className="font-mono text-2xs text-fg-subtle">
                  {t.name}
                </span>
                <span className={`${t.cls} text-fg`}>{t.sample}</span>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <p className="mb-2 font-mono text-2xs text-fg-subtle">
              --measure · 68ch
            </p>
            <Prose>
              Enforced measure. The old hero paragraph had no max-width and ran
              roughly 95 characters per line at 1440px; anything past ~75 costs
              the reader the line return, which is why long lines feel tiring
              even when the type itself is comfortable.
            </Prose>
          </div>
        </Block>

        {/* -------------------------------------------------------- grid */}
        <Block
          title="The field"
          note="Twelve columns, one gap token, three named placements. White space is made by leaving columns EMPTY, not by padding boxes, which is why there are only three placements and no ad-hoc spans. Everything is full width below md; a phone has no columns to spare."
        >
          <div className="field gap-y-2">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="h-16 bg-surface-2 text-center font-mono text-2xs leading-[4rem] text-fg-subtle"
              >
                {i + 1}
              </div>
            ))}
          </div>

          <div className="field mt-2 gap-y-2">
            <div className="col-lead bg-ink py-2 text-center font-meta text-on-ink">
              .col-lead · 1–5
            </div>
            <div className="col-aside bg-brand py-2 text-center font-meta text-on-brand">
              .col-aside · 9–12
            </div>
          </div>
          <div className="field mt-2">
            <div className="col-inset bg-surface-3 py-2 text-center font-meta text-fg-muted">
              .col-inset · 1–9
            </div>
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-2 font-mono text-2xs text-fg-subtle sm:grid-cols-2">
            {[
              [
                '--content-max',
                '92rem · was 110rem, which left no page margin',
              ],
              ['--gutter', 'clamp(1.25rem, 4vw, 4.5rem)'],
              ['--gap', 'clamp(1rem, 1.6vw, 2rem)'],
              ['--section-y', 'clamp(5rem, 12vh, 11rem)'],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 border-b border-border py-1.5"
              >
                <dt className="text-fg-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Block>

        {/* ----------------------------------------------------- figures */}
        <Block
          title="Figures"
          note="Concentric hairline circles, thick partial arcs, a disc at the centre. Every radius, sweep and weight is read off the study registry; nothing is placed. Rings share a start angle at twelve o'clock and a common radial step, which is what makes the sweeps comparable; the hairline circle behind each arc is the whole it is a fraction of."
        >
          <div className="grid gap-8 sm:grid-cols-3">
            <figure>
              <div className="bg-ink p-6 text-on-ink">
                <ArcFigure rings={collectionRings(studies)} centre="accent" />
              </div>
              <figcaption className="mt-2 font-meta text-fg-subtle">
                The collection · one ring per study
              </figcaption>
            </figure>

            {featuredStudy && (
              <figure>
                <div className="bg-surface-2 p-6 text-fg">
                  <ArcFigure
                    rings={studyRings(featuredStudy, studies)}
                    centre="ink"
                  />
                </div>
                <figcaption className="mt-2 font-meta text-fg-subtle">
                  One study · its ring picked out
                </figcaption>
              </figure>
            )}

            <figure>
              <div className="bg-brand p-6 text-on-brand">
                <ArcFigure rings={collectionRings(studies)} centre="ink" />
              </div>
              <figcaption className="mt-2 font-meta text-fg-subtle">
                On the orange plate · currentColor throughout
              </figcaption>
            </figure>
          </div>

          <Prose size="sm" className="mt-6 text-fg-muted">
            An earlier version filled a 3×3 grid with a different geometric
            glyph per cell, seeded by the edition number. It was generative and
            it was useless: a scatter of unrelated shapes tells a viewer
            nothing, and &ldquo;grown from a system&rdquo; is not a defence if
            the system&rsquo;s output carries no meaning. One construction whose
            parts can be measured against each other is the correction.
          </Prose>
        </Block>

        {/* ------------------------------------------------------ layout */}
        <Block title="Space" note="4px base. Nothing outside this scale.">
          <div className="flex flex-wrap items-end gap-4">
            {SPACE.map((s) => (
              <div key={s} className="text-center">
                <div
                  className="bg-brand"
                  style={{
                    width: `var(--space-${s}, ${Number(s) * 0.25}rem)`,
                    height: '2rem',
                  }}
                />
                <span className="mt-1 block font-mono text-2xs text-fg-subtle">
                  {s}
                </span>
              </div>
            ))}
          </div>
        </Block>

        <Block
          title="Radius"
          note="All zero. The corner is a decision the grid already made; the tokens survive so `rounded-md` left in a generated primitive resolves to square."
        >
          <div className="flex flex-wrap gap-4">
            {RADII.map((r) => (
              <div key={r} className="text-center">
                <div
                  className="h-16 w-16 border border-border-strong bg-surface-2"
                  style={{ borderRadius: `var(--radius-${r})` }}
                />
                <span className="mt-1 block font-mono text-2xs text-fg-subtle">
                  {r}
                </span>
              </div>
            ))}
          </div>
        </Block>

        <Block
          title="Elevation"
          note="There is none. Depth is a rule and a change of ground; a shadow under a hairline grid reads as a mistake. The tokens resolve to `none` so generated primitives asking for a shadow get nothing."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {(['sm', 'md', 'lg'] as const).map((s) => (
              <div
                key={s}
                className="flex h-24 items-center justify-center border border-border bg-surface font-mono text-2xs text-fg-subtle"
                style={{ boxShadow: `var(--shadow-${s})` }}
              >
                --shadow-{s}
              </div>
            ))}
          </div>
        </Block>

        {/* -------------------------------------------------- components */}
        <Block
          title="Surface"
          note="One card style. Previously this class string was hardcoded in three separate components."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Surface tone="raised">
              <h3 className="mb-1 font-medium text-fg">Raised</h3>
              <Prose size="sm" className="text-fg-muted">
                Default. Sits above the page.
              </Prose>
            </Surface>
            <Surface tone="sunken">
              <h3 className="mb-1 font-medium text-fg">Sunken</h3>
              <Prose size="sm" className="text-fg-muted">
                Recessed, for nested content.
              </Prose>
            </Surface>
            <Surface tone="outline" interactive>
              <h3 className="mb-1 font-medium text-fg">Interactive</h3>
              <Prose size="sm" className="text-fg-muted">
                Hover me. Lift is disabled under reduced motion.
              </Prose>
            </Surface>
          </div>
        </Block>

        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </Block>

        <Block
          title="Motion"
          note="One easing system. Reveal uses IntersectionObserver, never scroll listeners: driving transforms from scroll events is the most reliable way to make a page feel janky. Scroll this section to retrigger."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 80, 160].map((d) => (
              <Reveal key={d} delay={d} repeat>
                <Surface tone="sunken" padding="sm">
                  <span className="font-mono text-2xs text-fg-subtle">
                    delay {d}ms
                  </span>
                </Surface>
              </Reveal>
            ))}
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-2 font-mono text-2xs text-fg-subtle sm:grid-cols-2">
            {[
              ['--dur-fast', '150ms · hover, focus'],
              ['--dur-base', '300ms · surface, colour'],
              ['--dur-slow', '600ms · entrances'],
              ['--dur-cine', '1200ms · scene transitions'],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 border-b border-border py-1.5"
              >
                <dt className="text-fg-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Block>
      </Section>
    </div>
  );
}
