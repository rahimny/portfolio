import { NavLink } from 'react-router-dom';
import { Wordmark } from './primitives/Wordmark';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  /* The wordmark already goes home, so Index is redundant on a phone. */
  { name: 'Index', href: '/', narrow: false },
  { name: 'Lab', href: '/experiments', narrow: true },
  { name: 'About', href: '/about', narrow: true },
];

/** Fixed navigation with an opaque ground to keep labels readable over studies. */
export function Navbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-[var(--navbar-height)] border-b border-border bg-bg">
      <div className="mx-auto flex h-full max-w-[var(--content-max)] items-center justify-between gap-4 px-[var(--gutter)]">
        <Wordmark />

        <div className="flex items-center gap-3 sm:gap-6">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.name}
              to={link.href}
              end={link.href === '/'}
              className={({ isActive }) =>
                cn(
                  'font-meta transition-opacity duration-(--dur-fast)',
                  link.narrow ? '' : 'hidden sm:inline',
                  isActive
                    ? 'text-fg'
                    : 'text-fg-subtle hover:text-fg hover:opacity-100'
                )
              }
            >
              {link.name}
            </NavLink>
          ))}
          <a
            href="mailto:rahimny99@gmail.com"
            className="group flex items-center gap-2 font-meta text-fg transition-opacity duration-(--dur-fast) hover:opacity-60"
          >
            Contact
            <span
              aria-hidden="true"
              className="size-2 shrink-0 bg-brand transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-150 motion-reduce:group-hover:scale-100"
            />
          </a>
        </div>
      </div>
    </nav>
  );
}
