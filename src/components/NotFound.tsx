import { Link } from 'react-router-dom';
import { Plate } from '@/components/primitives/Plate';
import { PlateHeader } from '@/components/primitives/PlateHeader';

interface NotFoundProps {
  message?: string;
  backTo?: string;
  backLabel?: string;
}

export function NotFound({
  message = "There's nothing at this address.",
  backTo = '/',
  backLabel = 'Back home',
}: NotFoundProps) {
  return (
    <Plate
      tone="paper"
      spacing="none"
      marks
      className="flex min-h-dvh flex-col justify-center pt-[var(--navbar-height)]"
    >
      <PlateHeader title="Not found" context="404" />
      <div className="field mt-8">
        <p className="col-lead text-lg leading-relaxed text-balance">
          {message}
        </p>
      </div>
      <Link
        to={backTo}
        className="group mt-8 inline-flex w-fit items-center gap-3 border border-current px-5 py-3 font-meta transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-ink hover:text-on-ink"
      >
        {backLabel}
        <span
          aria-hidden="true"
          className="transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
        >
          →
        </span>
      </Link>
    </Plate>
  );
}
