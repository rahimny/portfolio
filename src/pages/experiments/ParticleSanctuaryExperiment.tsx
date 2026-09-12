import ExperimentLayout from '@/components/ExperimentLayout';
import { ParticleSanctuaryExperience } from '@/vanilla-three/experiences/particle-sanctuary/ParticleSanctuaryExperience';

export default function ParticleSanctuaryExperiment() {
  return (
    <ExperimentLayout
      experienceClass={ParticleSanctuaryExperience}
      showControls={true}
      canvasTabIndex={0}
      collapsibleNotes
    >
      <p
        data-poster-hide
        className="pointer-events-none absolute bottom-14 left-4 right-4 text-center font-meta text-on-ink-muted md:bottom-14 md:left-auto md:right-6"
      >
        Drag to bend · Click / Enter to scatter · Space to pause
      </p>
    </ExperimentLayout>
  );
}
