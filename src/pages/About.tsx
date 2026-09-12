import { Plate } from '@/components/primitives/Plate';
import { IndexRow } from '@/components/primitives/IndexRow';
import { PlateHeader } from '@/components/primitives/PlateHeader';
import { ContactPlate, Colophon } from '@/components/SitePlates';
import { Timeline, type Span } from '@/features/about/Timeline';
import { Portrait } from '@/features/about/Portrait';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

const SPANS: readonly Span[] = [
  {
    label: 'BSc (Hons) Software Development',
    organisation: 'Anglia Ruskin University',
    detail: 'First Class Honours',
    from: '2019-09',
    to: '2022-05',
  },
  {
    label: 'Graduate Software Developer',
    organisation: 'Cambridge Intelligence',
    from: '2023-02',
    to: '2024-01',
  },
  {
    label: 'Software Developer',
    organisation: 'Cambridge Intelligence',
    from: '2024-01',
    current: true,
  },
  {
    label: 'Google UX Design Certificate',
    from: '2024-11',
    point: true,
  },
];

const CONTRIBUTIONS: readonly (readonly [string, string])[] = [
  [
    'Product development',
    'Delivered new features and enhancements for data visualisation products through agile, collaborative development with product managers, designers and QAs.',
  ],
  [
    'Performance',
    'Improved SDK performance using browser profiling tools to investigate rendering and data-processing bottlenecks, implementing optimisations that increased frame rates and responsiveness.',
  ],
  [
    'Maintainability',
    'Refactored TypeScript code to improve maintainability and reduce technical debt.',
  ],
  [
    'Developer experience',
    'Redesigned and implemented the SDK documentation site to improve content discoverability for external developers.',
  ],
  [
    'Testing and CI/CD',
    'Built automated browser tests and continuous integration workflows.',
  ],
  [
    'Innovation',
    'Worked on innovation projects experimenting with AI-driven workflows for data visualisation, prototyping tooling and testing where it holds up.',
  ],
];

type Discipline = {
  readonly group: string;
  readonly items: readonly string[];
  /** Optional gloss, for a group whose list of names undersells it. */
  readonly note?: string;
};

const DISCIPLINES: readonly Discipline[] = [
  {
    group: 'Front-end and graphics',
    items: [
      'React',
      'TypeScript',
      'Three.js',
      'WebGL',
      'React Three Fiber',
      'D3.js',
      'Tailwind CSS',
    ],
  },
  {
    group: 'Back-end',
    items: ['Node.js', 'Express', 'Firebase', 'SQL', 'Python', 'Java'],
  },
  {
    group: 'AI and agents',
    items: ['Claude Code', 'Codex', 'Agentic development'],
    note: 'Self-directed rather than day-job work: steering agents across a codebase, and generative models as part of a creative process rather than only a coding one.',
  },
  {
    group: 'Platform',
    items: [
      'Vite',
      'Webpack',
      'Storybook',
      'Git',
      'CI/CD',
      'Docker',
      'Linux',
      'Jest',
      'Playwright',
    ],
  },
  { group: 'Design', items: ['UI/UX', 'Figma', 'Photoshop', 'Illustrator'] },
];

export default function About() {
  useDocumentMeta(
    'About',
    'Education and employment record, and the practice behind the studies.'
  );

  return (
    <>
      {/* ══════════════════════════════════════════════════════ masthead */}
      <Plate
        tone="paper"
        spacing="none"
        marks
        className="pt-[calc(var(--navbar-height)+var(--section-y)*0.6)] pb-[var(--section-y)]"
      >
        <div className="field items-start gap-y-10">
          <div className="col-span-12 md:col-span-7">
            <h1 className="font-hero text-display">
              i'm
              <br />
              Rahim
            </h1>

            <p className="mt-8 max-w-[var(--measure)] text-lg leading-relaxed md:text-xl">
              Software developer and creative technologist in Cambridge. At
              Cambridge Intelligence, I build web-based graph and network
              visualisation SDKs in TypeScript, React and WebGL. In my free time
              I'm addicted to experimental creative processes and pushing the
              browser to its limits.
            </p>
          </div>

          {/* A specimen mounted on white, hairline frame, captioned in mono
              underneath — the same label/value split as every other record
              on the page. */}
          <Portrait />
        </div>

        <div className="mt-[calc(var(--section-y)*0.7)] border-t border-border pt-8">
          <PlateHeader
            title="Record"
            context="Education and employment"
            meta="2019 - present"
          />

          <div className="mt-10">
            <Timeline spans={SPANS} />
          </div>
        </div>
      </Plate>

      {/* ══════════════════════════════════════════════════ contributions */}
      <Plate tone="paper" spacing="default" marks>
        <PlateHeader
          title="Contributions"
          context="Software development"
          meta="Feb 2023 - present"
        />

        <div className="border-b border-border">
          {CONTRIBUTIONS.map(([title, detail], i) => (
            <IndexRow key={title} index={i + 1} title={title}>
              {detail}
            </IndexRow>
          ))}
        </div>
      </Plate>

      {/* ══════════════════════════════════════════════════════════ stack */}
      <Plate tone="paper" spacing="default" marks>
        <PlateHeader
          title="Practice"
          context="Tools, and how the work gets made"
        />

        <dl className="field gap-y-0 border-t border-border">
          {DISCIPLINES.map(({ group, items, note }) => (
            <div
              key={group}
              className="field col-span-12 items-baseline gap-y-2 border-b border-border py-5"
            >
              <dt className="col-span-12 font-meta text-fg-subtle md:col-span-3">
                {group}
              </dt>
              <dd className="col-span-12 md:col-span-9">
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="font-mono text-sm uppercase tracking-[0.04em] text-dim"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                {note ? (
                  <p className="mt-3 max-w-[var(--measure)] text-sm leading-relaxed text-fg-subtle">
                    {note}
                  </p>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </Plate>

      <ContactPlate />
      <Colophon />
    </>
  );
}
