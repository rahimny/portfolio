import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** The home link uses the metadata type and a compact name on narrow screens. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Rahim Neal Yakoob, home"
      className={cn(
        'group inline-flex items-center gap-2 font-meta transition-opacity duration-(--dur-fast) hover:opacity-60',
        className
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-brand" />
      {/* The full name needs ~15ch of mono; a 390px bar does not have it and
          wrapped it onto two lines. Surname only below sm. */}
      <span className="whitespace-nowrap sm:hidden">Yakoob</span>
      <span className="hidden whitespace-nowrap sm:inline">
        Rahim Neal Yakoob
      </span>
    </Link>
  );
}
