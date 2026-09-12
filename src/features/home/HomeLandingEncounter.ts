import type { RefObject } from 'react';

/** DOM registration and an accessible command; the world never sees a component. */
export interface HomeLandingEncounter {
  target: RefObject<HTMLButtonElement | null>;
  request: RefObject<(() => boolean) | null>;
  onArrive: () => void;
}
