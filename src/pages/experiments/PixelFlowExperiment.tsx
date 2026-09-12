import ExperimentLayout from '@/components/ExperimentLayout';
import { PixelFlowExperience } from '@/vanilla-three/experiences/pixel-flow/PixelFlowExperience';

export default function PixelFlowExperiment() {
  return (
    <ExperimentLayout
      experienceClass={PixelFlowExperience}
      showControls={true}
      collapsibleNotes
    />
  );
}
