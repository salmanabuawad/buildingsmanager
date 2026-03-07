/**
 * Font size context - used to scale column widths when "גדול" (large) is selected.
 */
import { createContext, useContext, ReactNode } from 'react';

export type FontSize = 'small' | 'normal' | 'large';

const FontSizeContext = createContext<FontSize | undefined>(undefined);

export function FontSizeProvider({ children, value }: { children: ReactNode; value: FontSize }) {
  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSize {
  const ctx = useContext(FontSizeContext);
  return ctx ?? 'normal';
}
