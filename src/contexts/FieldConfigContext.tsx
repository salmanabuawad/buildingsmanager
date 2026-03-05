import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { clearFieldConfigCache } from '../lib/fieldConfigUtils';

interface FieldConfigContextType {
  /** Increment to force grids to reload field config. Call invalidate() after saving config. */
  configVersion: number;
  /** Clear cache and increment version - grids will reload config on next render */
  invalidate: () => void;
}

const FieldConfigContext = createContext<FieldConfigContextType | undefined>(undefined);

export function FieldConfigProvider({ children }: { children: ReactNode }) {
  const [configVersion, setConfigVersion] = useState(0);

  const invalidate = useCallback(() => {
    clearFieldConfigCache();
    setConfigVersion((v) => v + 1);
  }, []);

  return (
    <FieldConfigContext.Provider value={{ configVersion, invalidate }}>
      {children}
    </FieldConfigContext.Provider>
  );
}

export function useFieldConfigInvalidate() {
  const ctx = useContext(FieldConfigContext);
  return ctx?.invalidate ?? (() => {});
}

export function useFieldConfigVersion() {
  const ctx = useContext(FieldConfigContext);
  return ctx?.configVersion ?? 0;
}
