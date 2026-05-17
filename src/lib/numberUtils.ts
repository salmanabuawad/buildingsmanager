/**
 * Number utility functions for consistent number formatting throughout the system
 */

/**
 * Formats a number to 2 decimal places
 * Handles null, undefined, empty strings, and invalid numbers
 * Returns empty string for invalid/zero values if allowZero is false
 */
export function formatNumberToTwoDecimals(
  value: number | string | null | undefined,
  allowZero: boolean = true
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) {
    return '';
  }

  // If allowZero is false and value is 0, return empty string
  if (!allowZero && num === 0) {
    return '';
  }

  return num.toFixed(2);
}

/**
 * Formats a number to exactly 2 decimal places with locale thousand
 * separators: 9070.7 → "9,070.70", 144.81034 → "144.81", 100 → "100.00".
 * Use for grid cells where the underlying value can be a long-decimal
 * float but the column should render consistently with two decimals.
 *
 * Returns '' for null / undefined / empty string / NaN / 0 (matching the
 * existing AssetsList behaviour where 0 is hidden in the grid).
 */
export function formatNumberMaxTwoDecimals(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Use as valueParser for numeric AG Grid columns (float).
 * When the user clears the cell, returns 0 instead of null.
 * Otherwise parses with Number() and returns the value, or 0 if invalid.
 */
export function numericValueParser(params: { newValue?: unknown } | null): number {
  if (!params) return 0;
  const v = params.newValue;
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Use as valueParser for integer AG Grid columns (e.g. tax_region).
 * When the user clears the cell, returns 0 instead of null.
 * Otherwise parses with parseInt(radix) and returns the value, or 0 if invalid.
 */
export function numericValueParserInt(
  params: { newValue?: unknown } | null,
  radix: number = 10
): number {
  if (!params) return 0;
  const v = params.newValue;
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseInt(String(v), radix);
  return isNaN(n) ? 0 : n;
}
