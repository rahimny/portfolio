import { useCallback, type ReactNode } from 'react';
import { DomEffectOverlay } from '@/features/dom-effects/DomEffectOverlay';
import { usePixelFlowSettings } from './PixelFlowContext';
import { PixelFlowEffect } from './PixelFlowEffect';

interface DomPixelFlowProps {
  children: ReactNode;
  className?: string;
}

/** Pixel Flow treatment for content hosted by the generic DOM effect layer. */
export function DomPixelFlow({ children, className }: DomPixelFlowProps) {
  const settings = usePixelFlowSettings();
  const createEffect = useCallback(
    (canvas: HTMLCanvasElement) => new PixelFlowEffect(canvas, settings),
    [settings]
  );

  return (
    <DomEffectOverlay className={className} createEffect={createEffect}>
      {children}
    </DomEffectOverlay>
  );
}
