import { Link } from 'react-router-dom';
import { Plate } from '@/components/primitives/Plate';
import { VisitSouvenir } from '@/features/visit/VisitSouvenir';

/**
 * The two plates that close every page.
 *
 * They were written inline in `Home` and then wanted by `/lab` and `/about` on
 * the same day, which is the usual signal. Keeping them here means the orange
 * contact plate stays literally the same object on all three pages — the fixed
 * half of the series model, applied to the frame rather than to the work.
 */

const CONTACT = [
  {
    label: 'Email',
    value: 'rahimny99@gmail.com',
    href: 'mailto:rahimny99@gmail.com',
  },
  {
    label: 'GitHub',
    value: 'github.com/rahimny',
    href: 'https://github.com/rahimny',
  },
  {
    label: 'LinkedIn',
    value: 'in/rahim-neal-yakoob',
    href: 'https://www.linkedin.com/in/rahim-neal-yakoob/',
  },
] as const;

export function ContactPlate() {
  return (
    <Plate as="section" tone="brand" spacing="default" marks id="contact">
      <div className="flex items-baseline justify-between gap-4 border-b border-current pb-3">
        <p className="font-meta">Contact</p>
        <p className="font-meta">Open to interesting problems</p>
      </div>

      <div className="field mt-10 gap-y-10">
        <h2 className="col-span-12 font-hero text-display md:col-span-6">
          Get in touch
        </h2>

        <ul className="col-span-12 md:col-span-5 md:col-start-8">
          {CONTACT.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                className="group flex items-baseline justify-between gap-4 border-b border-current/40 py-3 transition-opacity duration-(--dur-fast) hover:opacity-60"
              >
                <span className="font-meta text-dim">{link.label}</span>
                <span className="font-display text-xl">{link.value}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Plate>
  );
}

export function Colophon() {
  return (
    /* No marks: `tight` spacing puts them straight through the text, and the
       ink plate closing the page is registration enough. */
    <Plate as="footer" tone="ink" spacing="tight">
      <div className="field gap-y-4">
        <p className="col-span-12 font-meta text-dim md:col-span-4">
          © {new Date().getFullYear()} Rahim Neal Yakoob
        </p>
        <p className="col-span-12 font-meta text-dim md:col-span-4">
          Archivo · Inter · Geist Mono
        </p>
        <p className="col-span-12 font-meta md:col-span-4 md:text-right">
          <Link to="/style-guide" className="hover:opacity-60">
            Design system →
          </Link>
        </p>
      </div>
      <VisitSouvenir />
    </Plate>
  );
}
