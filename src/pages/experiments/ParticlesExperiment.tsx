import ExperimentLayout from '@/components/ExperimentLayout';
import { ParticlesExperience } from '@/vanilla-three/experiences/particles/ParticlesExperience';

export default function ParticlesExperiment() {
  return (
    <ExperimentLayout
      experienceClass={ParticlesExperience}
      showControls={true}
    />
  );
}
