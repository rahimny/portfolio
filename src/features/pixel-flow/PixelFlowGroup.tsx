import { useEffect, useRef, type ReactNode } from 'react';
import { PixelFlowContext } from './PixelFlowContext';
import { PixelFlowSettingsStore } from './PixelFlowSettings';

interface PixelFlowGroupProps {
  children: ReactNode;
  controlsTitle?: string;
}

/** Shares one parameter set across any number of Pixel Flow surfaces. */
export function PixelFlowGroup({
  children,
  controlsTitle = 'DOM · Pixel Flow',
}: PixelFlowGroupProps) {
  const storeRef = useRef<PixelFlowSettingsStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PixelFlowSettingsStore();
  }
  const store = storeRef.current;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let disposed = false;
    let disposePane: (() => void) | undefined;

    void import('tweakpane').then(({ Pane }) => {
      if (disposed) return;

      const pane = new Pane({ title: controlsTitle, expanded: true });
      const settings = store.values;
      const bindings = [
        pane.addBinding(settings, 'offsetStrength', {
          label: 'Distortion',
          min: 0,
          max: 0.1,
          step: 0.001,
        }),
        pane.addBinding(settings, 'gridSize', {
          label: 'Grid size',
          min: 20,
          max: 160,
          step: 1,
        }),
        pane.addBinding(settings, 'mouseRadius', {
          label: 'Mouse radius',
          min: 20,
          max: 300,
          step: 1,
        }),
        pane.addBinding(settings, 'strength', {
          label: 'Strength',
          min: 0,
          max: 1.5,
          step: 0.01,
        }),
        pane.addBinding(settings, 'relaxation', {
          label: 'Relaxation',
          min: 0.5,
          max: 0.99,
          step: 0.01,
        }),
        pane.addBinding(settings, 'velocitySmoothing', {
          label: 'Velocity damping',
          min: 0,
          max: 1,
          step: 0.01,
        }),
      ];

      bindings.forEach((binding) => binding.on('change', () => store.commit()));
      pane.addButton({ title: 'Reset defaults' }).on('click', () => {
        store.reset();
        pane.refresh();
      });

      disposePane = () => pane.dispose();
    });

    return () => {
      disposed = true;
      disposePane?.();
    };
  }, [controlsTitle, store]);

  return (
    <PixelFlowContext.Provider value={store}>
      {children}
    </PixelFlowContext.Provider>
  );
}
