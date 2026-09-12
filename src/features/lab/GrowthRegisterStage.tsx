import ThreeCanvas from '@/components/three-canvas';
import { GrowthRegisterExperience } from '@/vanilla-three/experiences/growth-register/GrowthRegisterExperience';

/**
 * The lab's collection figure.
 *
 * Kept behind a lazy React boundary in `Experiments.tsx`, so Three.js and the
 * simulation stay out of the route chunk until the specimen itself is needed.
 */
export default function GrowthRegisterStage() {
  return (
    <ThreeCanvas
      experienceClass={GrowthRegisterExperience}
      ariaLabel="A live wireframe surface grown from the study registry. Press and drag, or use the arrow keys and Enter, to seed a new reaction front."
      className="size-full touch-none"
      tabIndex={0}
    />
  );
}
