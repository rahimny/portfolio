import { Link } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { Plate } from '@/components/primitives/Plate';
import { PlateHeader } from '@/components/primitives/PlateHeader';
import { LocalTime } from '@/components/LocalTime';
import { ContactPlate, Colophon } from '@/components/SitePlates';
import { StudyRow } from '@/features/lab/StudyRow';
import { studies, editionLabel } from '@/features/lab/registry';
import { ParticleText } from '@/features/particle-text/ParticleText';
import { HomeShowcase } from '@/features/home/HomeShowcase';
import { HomeNereid } from '@/features/home/HomeNereid';
import { HomeEncounterSpace } from '@/features/home/HomeEncounterSpace';
import '@/features/home/masthead.css';

const selected = studies
  .filter((s) => s.homeOrder !== undefined)
  .sort((a, b) => a.homeOrder! - b.homeOrder!);
const showcase = selected.slice(0, 2);
const rest = [
  ...selected.slice(2),
  ...studies.filter((s) => s.homeOrder === undefined && s.status === 'live'),
];

export default function Home() {
  const encounterSpace = useMemo(() => new HomeEncounterSpace(), []);
  const landingTarget = useRef<HTMLButtonElement>(null);
  const requestLanding = useRef<(() => boolean) | null>(null);
  const [landed, setLanded] = useState(false);
  const landingEncounter = useMemo(
    () => ({
      target: landingTarget,
      request: requestLanding,
      onArrive: () => setLanded(true),
    }),
    []
  );
  return (
    <>
      {/* ═══════════════════════════════════════════════════════ masthead */}
      <Plate tone="paper" spacing="none" marks className="home-masthead">
        {/* Mobile uses the same three-line measure for the semantic name and
            its particle mask, so the host does not reserve an extra line. */}
        {/* The font mask owns particle targets; an ordered stroke score makes
            the drone's nozzle and each particle's arrival share a clock. */}
        <ParticleText
          text="Rahim Neal Yakoob"
          droneWriting
          landingEncounter={landingEncounter}
          encounterSpace={encounterSpace}
          demo={false}
          settings={{ idleInterval: 0 }}
          className="font-hero text-hero"
          landingLayout
          enableGraphMode
          caption={
            <>
              <span aria-hidden="true">↳ </span>Hold and drag to smear it · type
              to reshape it
            </>
          }
        >
          <div className="home-intro field">
            <div className="home-intro-content">
              <p className="home-intro-copy">
                Software developer and creative technologist.
              </p>
            </div>
            <div className="home-context">
              <p>Based in Cambridge, UK.</p>
              <p className="home-employment">At Cambridge Intelligence.</p>
              <p className="home-specialism">
                Graph &amp; network visualisation
              </p>
              <div className="home-record font-meta">
                <span>Since 2023</span>
                <span aria-hidden="true">·</span>
                <LocalTime />
              </div>
            </div>
          </div>
        </ParticleText>
      </Plate>

      <HomeNereid encounterSpace={encounterSpace} />

      {/* ══════════════════════════════════════════════════════════ index */}
      <Plate
        id="selected-work"
        tone="paper"
        spacing="default"
        marks
        className="home-work"
      >
        <PlateHeader
          title="Selected studies"
          context="Finished work & open explorations"
          meta={`${editionLabel(rest.length + showcase.length)} studies`}
        />
        <HomeShowcase
          studies={showcase}
          landing={{
            encounter: landingEncounter,
            revealed: landed,
            close: () => setLanded(false),
          }}
        />

        {/* Index entries stay visible without waiting for a scroll observer. */}
        <div className="border-b border-border">
          {rest.map((study) => (
            <StudyRow key={study.slug} study={study} />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between font-meta text-fg-subtle">
          <Link to="/experiments" className="hover:text-fg">
            All studies →
          </Link>
        </div>
      </Plate>

      <ContactPlate />
      <Colophon />
    </>
  );
}
