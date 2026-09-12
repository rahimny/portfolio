import { useCallback, type RefObject } from 'react';
import ThreeCanvas from '@/components/three-canvas';
import { HomeNereidExperience } from '@/vanilla-three/experiences/home/HomeNereidExperience';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import type { HomeEncounterSpace } from './HomeEncounterSpace';
import type { NereidChapter } from './nereidScroll';

export default function NereidCanvas({
  host,
  stage,
  onUnavailable,
  encounterSpace,
  onChapterChange,
}: {
  host: RefObject<HTMLElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  onUnavailable: () => void;
  encounterSpace?: HomeEncounterSpace;
  onChapterChange: (chapter: NereidChapter) => void;
}) {
  const factory = useCallback(
    (canvas: HTMLCanvasElement, options?: ExperienceOptions) => {
      const experience = new HomeNereidExperience(
        canvas,
        host.current!,
        stage.current!,
        {
          ...options,
          onChapterChange,
          onError: (cause) => {
            onUnavailable();
            options?.onError?.(cause);
          },
        },
        encounterSpace
      );
      return {
        async init(signal?: AbortSignal) {
          try {
            await experience.init(signal);
          } catch (cause) {
            if (!signal?.aborted) onUnavailable();
            throw cause;
          }
        },
        dispose: () => experience.dispose(),
      };
    },
    [host, stage, onUnavailable, encounterSpace, onChapterChange]
  );
  return (
    <ThreeCanvas experienceFactory={factory} className="home-nereid-canvas" />
  );
}
