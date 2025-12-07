/**
 * Date utility functions for consistent DD/MM/YYYY formatting throughout the system
 */

/**
 * Formats a date string to DD/MM/YYYY format
 * Accepts various input formats and converts to DD/MM/YYYY
 */
export function formatDateToDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === '' || dateStr === '01/01/1900') return '';

  const str = String(dateStr).trim();

  // If already in DD/MM/YYYY format, return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) &&
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year) {
      return str;
    }
  }

  // Try to parse ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      }
    }
  }

  // Try to parse as Date object
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    // Parsing failed
  }

  // If no valid format found, return empty string
  return '';
}

/**
 * Parses a date string from DD/MM/YYYY format to a Date object
 */
export function parseDateFromDDMMYYYY(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === '' || dateStr === '01/01/1900') return null;

  const str = String(dateStr).trim();

  // Check if it matches DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) &&
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year) {
      return date;
    }
  }

  return null;
}

/**
 * Validates if a string is in DD/MM/YYYY format
 */
export function isValidDDMMYYYY(dateStr: string | null | undefined): boolean {
  if (!dateStr || dateStr === '' || dateStr === '01/01/1900') return false;

  const str = String(dateStr).trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return false;

  const [day, month, year] = str.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  
  return !isNaN(date.getTime()) &&
         date.getDate() === day &&
         date.getMonth() === month - 1 &&
         date.getFullYear() === year;
}

