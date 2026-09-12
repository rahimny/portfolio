import { useEffect } from 'react';
import type { ParticleTextSettingsStore } from './settings';

interface Binding {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const GROUPS: { title: string; bindings: Binding[] }[] = [
  {
    title: 'Ink',
    bindings: [
      {
        key: 'particles',
        label: 'Particles',
        min: 2000,
        max: 40000,
        step: 500,
      },
      { key: 'coverage', label: 'Coverage', min: 0.1, max: 1.4, step: 0.01 },
      { key: 'alpha', label: 'Opacity', min: 0.2, max: 1, step: 0.01 },
      { key: 'sizeJitter', label: 'Size spread', min: 0, max: 1, step: 0.01 },
      { key: 'minPointSize', label: 'Min size', min: 0.5, max: 4, step: 0.05 },
      { key: 'maxPointSize', label: 'Max size', min: 1, max: 10, step: 0.1 },
    ],
  },
  {
    title: 'Assembly',
    bindings: [
      { key: 'attraction', label: 'Attraction', min: 10, max: 400, step: 1 },
      { key: 'damping', label: 'Damping', min: 0, max: 40, step: 0.1 },
      { key: 'settle', label: 'Settle', min: 0, max: 80, step: 0.5 },
      { key: 'travel', label: 'Travel', min: 0.05, max: 2, step: 0.01 },
      { key: 'burst', label: 'Edit burst', min: 0, max: 12, step: 0.1 },
      { key: 'burstSpan', label: 'Burst span', min: 0.1, max: 3, step: 0.05 },
      { key: 'burstSpread', label: 'Burst spread', min: 0, max: 8, step: 0.1 },
      { key: 'burstSpeed', label: 'Burst speed', min: 1, max: 40, step: 0.5 },
      { key: 'editGlide', label: 'Edit glide', min: 0, max: 1.5, step: 0.01 },
      { key: 'editCurl', label: 'Edit curl', min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'Cohesion',
    bindings: [
      { key: 'cohesion', label: 'Amount', min: 0, max: 40, step: 0.5 },
      { key: 'cohesionCell', label: 'Cell', min: 0.03, max: 0.5, step: 0.005 },
      { key: 'cohesionSmoothing', label: 'Smoothing', min: 0, max: 3, step: 1 },
    ],
  },
  {
    title: 'Turbulence',
    bindings: [
      { key: 'turbulence', label: 'Amount', min: 0, max: 20, step: 0.05 },
      { key: 'turbulenceScale', label: 'Cell', min: 0.05, max: 2, step: 0.01 },
      {
        key: 'turbulenceDetail',
        label: 'Detail',
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      { key: 'turbulenceDrift', label: 'Drift', min: 0, max: 8, step: 0.05 },
      {
        key: 'turbulenceDetailDrift',
        label: 'Detail drift',
        min: 0,
        max: 4,
        step: 0.05,
      },
      { key: 'churn', label: 'Churn', min: 0, max: 1.5, step: 0.01 },
      { key: 'churnGlide', label: 'Churn glide', min: 0, max: 4, step: 0.05 },
    ],
  },
  {
    title: 'Pointer',
    bindings: [
      { key: 'pointerRadius', label: 'Radius', min: 0.1, max: 3, step: 0.01 },
      { key: 'pointerFalloff', label: 'Falloff', min: 0.5, max: 6, step: 0.1 },
      { key: 'pointerRepel', label: 'Repel', min: 0, max: 30, step: 0.1 },
      { key: 'pointerDrag', label: 'Drag', min: 0, max: 1.5, step: 0.01 },
      { key: 'pointerVortex', label: 'Vortex', min: 0, max: 40, step: 0.1 },
      { key: 'pointerYield', label: 'Yield', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Organic pointer',
    bindings: [
      { key: 'organicDelay', label: 'Idle wait', min: 0, max: 12, step: 0.1 },
      { key: 'organicSpeed', label: 'Speed', min: 0.01, max: 0.3, step: 0.005 },
      { key: 'organicStrength', label: 'Force', min: 0, max: 1, step: 0.01 },
      { key: 'organicRadius', label: 'Radius x', min: 0.5, max: 4, step: 0.05 },
      {
        key: 'organicAttention',
        label: 'Ink attention',
        min: 0,
        max: 3,
        step: 0.05,
      },
      { key: 'organicDepth', label: 'Depth', min: 0, max: 0.6, step: 0.01 },
    ],
  },
  {
    title: 'Depth',
    bindings: [
      { key: 'restDepth', label: 'Rest depth', min: 0, max: 0.3, step: 0.005 },
      {
        key: 'looseDepth',
        label: 'Loose depth',
        min: 0.1,
        max: 0.9,
        step: 0.01,
      },
      { key: 'perspective', label: 'Perspective', min: 4, max: 14, step: 0.1 },
      {
        key: 'pointerParallax',
        label: 'Pointer parallax',
        min: 0,
        max: 0.25,
        step: 0.005,
      },
      {
        key: 'depthContrast',
        label: 'Layer contrast',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: 'Performance',
    bindings: [
      { key: 'idleInterval', label: 'Idle wait (s)', min: 0, max: 60, step: 1 },
      { key: 'idlePerformances', label: 'Repeats', min: 0, max: 10, step: 1 },
    ],
  },
  {
    title: 'Signal',
    bindings: [
      {
        key: 'tintTravel',
        label: 'Tint travel',
        min: 0.01,
        max: 0.6,
        step: 0.005,
      },
      { key: 'tintDecay', label: 'Tint decay', min: 0.05, max: 3, step: 0.01 },
      { key: 'caretBlink', label: 'Caret blink', min: 0.1, max: 2, step: 0.01 },
    ],
  },
  {
    title: 'Vessel',
    bindings: [
      {
        key: 'vesselHeadroom',
        label: 'Headroom',
        min: 0,
        max: 1.5,
        step: 0.01,
      },
      { key: 'ruleAlpha', label: 'Rule opacity', min: 0, max: 0.6, step: 0.01 },
      {
        key: 'perimeterImpact',
        label: 'Impact threshold',
        min: 0.2,
        max: 12,
        step: 0.1,
      },
      {
        key: 'perimeterDecay',
        label: 'Impact decay',
        min: 0.05,
        max: 3,
        step: 0.01,
      },
      {
        key: 'perimeterAlpha',
        label: 'Impact opacity',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
];

/**
 * The dev panel, in development only.
 *
 * Nothing in the engine knows Tweakpane exists: the panel mutates the store's
 * plain values and calls `commit()`, which is the same path the defaults take.
 * That is what makes the parameter set worth having — the middle ground between
 * "one hard-coded look" and "a scene format" is a tuner that ships as nothing.
 */
export function useParticleTextControls(
  store: ParticleTextSettingsStore,
  title: string | null
): void {
  useEffect(() => {
    if (!import.meta.env.DEV || !title) return;

    let disposed = false;
    let dispose: (() => void) | undefined;

    void import('tweakpane').then(({ Pane }) => {
      if (disposed) return;

      const pane = new Pane({ title, expanded: false });
      const values = store.values as unknown as Record<string, number>;

      for (const group of GROUPS) {
        const folder = pane.addFolder({ title: group.title, expanded: false });
        for (const binding of group.bindings) {
          folder
            .addBinding(values, binding.key, {
              label: binding.label,
              min: binding.min,
              max: binding.max,
              step: binding.step,
            })
            .on('change', () => store.commit());
        }
      }

      pane
        .addBinding(store.values, 'caret', { label: 'Caret' })
        .on('change', () => store.commit());
      pane
        .addBinding(store.values, 'rules', { label: 'Baseline rules' })
        .on('change', () => store.commit());
      pane
        .addBinding(store.values, 'perimeter', { label: 'Perimeter impact' })
        .on('change', () => store.commit());
      pane
        .addBinding(store.values, 'organicMotion', { label: 'Organic pointer' })
        .on('change', () => store.commit());
      pane.addButton({ title: 'Reset defaults' }).on('click', () => {
        store.reset();
        pane.refresh();
      });
      pane.addButton({ title: 'Copy settings' }).on('click', () => {
        const json = `${JSON.stringify(store.values, null, 2)}\n`;
        console.info(json);
        void navigator.clipboard.writeText(json).catch(() => {
          // The console copy remains available when clipboard permission is
          // unavailable, which is common on a non-secure dev origin.
        });
      });

      dispose = () => pane.dispose();
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [store, title]);
}
