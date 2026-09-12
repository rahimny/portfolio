import ExperimentLayout from '@/components/ExperimentLayout';
// @ts-expect-error -- create-experiment replaces the template token below.
import { EXPERIMENT_CLASS_NAME } from '@/vanilla-three/experiences/EXPERIMENT_FILE_NAME';

export default function EXPERIMENT_COMPONENT_NAME() {
  return (
    <ExperimentLayout
      experienceClass={EXPERIMENT_CLASS_NAME}
      showControls={true}
    />
  );
}
