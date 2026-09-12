import ExperimentLayout from '@/components/ExperimentLayout';
import { MetaShapesExperience } from '@/vanilla-three/experiences/meta-shapes/MetaShapesExperience';

export default function MetaShapesExperiment() {
  return (
    <ExperimentLayout
      experienceClass={MetaShapesExperience}
      showControls={true}
    />
  );
}
