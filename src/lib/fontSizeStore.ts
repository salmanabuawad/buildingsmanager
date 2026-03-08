/**
 * Font size store - used to scale column widths when "גדול" (large) is selected.
 * App updates this when user changes font size; useFieldConfig reads it for the 1.5x multiplier.
 * Using a store ensures the value is always available (no context tree dependency).
 */
type FontSize = 'small' | 'normal' | 'large';

function getInitialFontSize(): FontSize {
  if (typeof localStorage === 'undefined') return 'normal';
  const v = localStorage.getItem('app-font-size');
  return (v === 'small' || v === 'normal' || v === 'large') ? v : 'normal';
}

let currentFontSize: FontSize = getInitialFontSize();
const listeners = new Set<() => void>();

export function setFontSizeStore(fontSize: FontSize) {
  if (currentFontSize !== fontSize) {
    currentFontSize = fontSize;
    listeners.forEach((l) => l());
  }
}

export function getFontSizeStore(): FontSize {
  return currentFontSize;
}

export function isLargeFont(): boolean {
  return currentFontSize === 'large';
}

/** Multiplier for column width by font size (small=0.85, normal=1, large=1.55). Base 1.65 applied separately. */
export function getFontSizeWidthMultiplier(): number {
  switch (currentFontSize) {
    case 'small': return 0.85;
    case 'large': return 1.55;
    default: return 1;
  }
}

export function subscribeFontSize(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
