import type { Study } from '@/features/lab/registry';
import { ConstructionPlate } from '@/features/lab/ConstructionPlate';

interface StudyNotesProps {
  notes: NonNullable<Study['notes']>;
  construction?: Study['construction'];
}

/**
 * The compact explanation every study is missing on its own page: what it
 * does, how to touch it, and one decision worth naming. `cost` only appears
 * once it's a real number measured on real hardware — see registry.ts.
 */
export function StudyNotes({ notes, construction }: StudyNotesProps) {
  return (
    <dl className="max-w-[min(28rem,calc(100vw-2rem))] space-y-3 border border-border bg-bg/85 p-4 font-meta backdrop-blur-sm">
      <div>
        <dt className="text-dim">Mechanism</dt>
        <dd className="mt-1 normal-case tracking-normal">{notes.mechanism}</dd>
      </div>
      <div>
        <dt className="text-dim">Interaction</dt>
        <dd className="mt-1 normal-case tracking-normal">
          {notes.interaction}
        </dd>
      </div>
      <div>
        <dt className="text-dim">Decision</dt>
        <dd className="mt-1 normal-case tracking-normal">{notes.decision}</dd>
      </div>
      <div>
        <dt className="text-dim">Cost</dt>
        <dd className="mt-1 normal-case tracking-normal">
          {notes.cost ?? 'Not yet measured on real hardware'}
        </dd>
      </div>
      {notes.sourceHref && (
        <a
          href={notes.sourceHref}
          target="_blank"
          rel="noreferrer"
          className="inline-block underline decoration-current/40 underline-offset-4 hover:decoration-current"
        >
          Source →
        </a>
      )}
      {construction && (
        <div>
          <dt className="sr-only">Construction</dt>
          <dd>
            <ConstructionPlate construction={construction} />
          </dd>
        </div>
      )}
    </dl>
  );
}
