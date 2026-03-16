/**
 * Supabase compatibility shim — routes all calls to FastAPI backend.
 * No @supabase/supabase-js dependency.
 *
 * supabase.from()     → /api/data/{table}   (chainable query builder)
 * supabase.rpc()      → /api/rpc/{name}     (POST)
 * supabase.storage    → /api/files/
 * supabase.auth       → sessionStorage stub
 */
import { api, ApiError } from './apiClient';
import { getApiBaseUrl } from './appConfig';
import { getAccessToken } from './usersTableAuth';

/** POST /api/rpc/{name} — maps supabase.rpc() calls to FastAPI RPC endpoint. */
async function rpc(
  name: string,
  params?: Record<string, unknown>
): Promise<{ data: unknown; error: ApiError | null }> {
  const base = getApiBaseUrl();
  const url = `${base}/api/rpc/${name}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params ?? {}),
      credentials: 'include',
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const raw = (data as { detail?: string | unknown[] } | null)?.detail;
      const message =
        Array.isArray(raw) && raw.length > 0
          ? (raw[0] as { msg?: string })?.msg ?? JSON.stringify(raw[0])
          : typeof raw === 'string'
            ? raw
            : res.statusText ?? 'RPC failed';
      return { data: null, error: { message } };
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export const supabase = {
  from: api.from,
  storage: api.storage,
  auth: api.auth,
  rpc,
};

export interface Building {
  id: string;
  name: string;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}
