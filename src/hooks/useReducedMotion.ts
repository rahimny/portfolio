import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Live-updating reduced-motion preference.
 *
 * The CSS media query in index.css handles transitions and animations, but it
 * cannot stop a requestAnimationFrame loop. Anything that animates in JS — the
 * scroll stage, the render loop, scroll-triggered reveals — must consult this.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false // SSR: assume motion is fine, CSS catches it on the client
  );
}
