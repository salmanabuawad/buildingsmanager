/**
 * Runtime app config. Backend URL is set by the startup script (e.g. config.js)
 * so the same build can be deployed with different API bases.
 */

declare global {
  interface Window {
    __APP_CONFIG__?: { apiBaseUrl?: string };
  }
}

function computeBaseUrl(): string {
  const fromScript = typeof window !== 'undefined' && window.__APP_CONFIG__?.apiBaseUrl;
  if (fromScript != null && fromScript !== '') {
    return String(fromScript).replace(/\/$/, '');
  }
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  return (fromEnv ?? '').replace(/\/$/, '');
}

let cached: string | null = null;

/** Base URL for API requests (no trailing slash). Same origin by default (''). From config.js else VITE_API_BASE_URL. Cached after first read. */
export function getApiBaseUrl(): string {
  if (cached !== null) return cached;
  cached = computeBaseUrl();
  return cached;
}
