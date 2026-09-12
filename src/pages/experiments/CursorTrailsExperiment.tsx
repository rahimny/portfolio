import ExperimentLayout from '@/components/ExperimentLayout';
import { CursorTrailsExperience } from '@/vanilla-three/experiences/cursor-trails/CursorTrailsExperience';

export default function CursorTrailsExperiment() {
  return (
    <ExperimentLayout
      experienceClass={CursorTrailsExperience}
      showControls={true}
    />
  );
}
