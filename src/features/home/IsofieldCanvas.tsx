import { useCallback } from 'react';
import ThreeCanvas from '@/components/three-canvas';
import { IsofieldPreview } from '@/vanilla-three/experiences/home/IsofieldPreview';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import type { IsofieldState } from './IsofieldState';

export default function IsofieldCanvas({
  state,
  onUnavailable,
}: {
  state: IsofieldState;
  onUnavailable: () => void;
}) {
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const preview = new IsofieldPreview(canvas, state, {
        ...options,
        onError: (cause) => {
          onUnavailable();
          options?.onError?.(cause);
        },
      });
      return {
        async init(signal?: AbortSignal) {
          try {
            await preview.init(signal);
          } catch (cause) {
            onUnavailable();
            throw cause;
          }
        },
        dispose: () => preview.dispose(),
      };
    },
    [state, onUnavailable]
  );
  return (
    <ThreeCanvas
      experienceFactory={factory}
      className="home-isofield-canvas"
      ariaLabel="An island of moving contours. Use Send a wave below to disturb it."
    />
  );
}
