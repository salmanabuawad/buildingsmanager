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

