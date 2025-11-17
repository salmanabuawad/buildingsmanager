/**
 * Sanitize user input to prevent XSS attacks
 */

/**
 * Escapes HTML special characters in a string
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe == null) return '';

  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes a string to be used as a filename
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (filename == null) return 'download';

  return String(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

/**
 * Validates and sanitizes a URL
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (url == null) return '';

  const urlStr = String(url).trim();

  // Check if it's a valid HTTP(S) URL or data URL
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:') {
      return urlStr;
    }
  } catch {
    // Invalid URL
  }

  return '';
}

/**
 * Sanitizes numeric input to ensure it's a valid number
 */
export function sanitizeNumber(value: any): number {
  const num = Number(value);
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

/**
 * Sanitizes integer input to ensure it's a valid integer
 */
export function sanitizeInteger(value: any): number {
  return Math.floor(sanitizeNumber(value));
}

/**
 * Validates and sanitizes a date string
 */
export function sanitizeDate(dateStr: string | null | undefined): string {
  if (dateStr == null) return '';

  const str = String(dateStr).trim();

  // Check if it matches ISO date format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return str;
    }
  }

  return '';
}

/**
 * Sanitizes text input by removing potentially dangerous characters
 */
export function sanitizeText(text: string | null | undefined): string {
  if (text == null) return '';

  return String(text)
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .substring(0, 10000); // Limit length
}
