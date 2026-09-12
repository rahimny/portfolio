import { createContext, useContext } from 'react';
import type { PixelFlowSettingsStore } from './PixelFlowSettings';

export const PixelFlowContext = createContext<PixelFlowSettingsStore | null>(
  null
);

export function usePixelFlowSettings(): PixelFlowSettingsStore {
  const store = useContext(PixelFlowContext);
  if (!store) {
    throw new Error('DomPixelFlow must be rendered inside PixelFlowGroup');
  }
  return store;
}
