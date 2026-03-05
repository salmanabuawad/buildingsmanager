/**
 * API client for the local FastAPI + Postgres backend.
 * API base URL: same origin by default (config.js apiBaseUrl '' or VITE_API_BASE_URL). All requests go to current host /api/...
 */

import { getApiBaseUrl } from './appConfig';
import { getSession, setFileSessionCookie, getAccessToken } from './usersTableAuth';

export interface ApiError {
  message: string;
  details?: string;
  code?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ data: T | null; error: ApiError | null }> {
  const url = `${getApiBaseUrl()}/api${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const raw = (data as { detail?: string | unknown[] })?.detail;
      const message =
        Array.isArray(raw) && raw.length > 0
          ? (raw[0] as { msg?: string })?.msg ?? JSON.stringify(raw[0])
          : typeof raw === 'string'
            ? raw
            : res.statusText ?? 'Request failed';
      const err: ApiError = {
        message,
        code: String(res.status),
      };
      return { data: null, error: err };
    }
    return { data, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message } };
  }
}

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      // Use comma-separated to avoid 422 from repeated keys with some proxies/servers
      q.set(k, v.map((e) => String(e)).join(','));
    } else {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

type QueryState = {
  table: string;
  select: string;
  filters: Record<string, string | number>;
  orClauses?: string[];
  limit?: number;
  offset?: number;
  order?: string;
};

function from(table: string) {
  const state: QueryState = {
    table,
    select: '*',
    filters: {},
  };
  const chain = {
    select(columns: string) {
      state.select = columns || '*';
      return chain;
    },
    eq(col: string, val: string | number) {
      state.filters[col] = val;
      return chain;
    },
    not(col: string, op: string, val: string | number | null) {
      if (op === 'is' && (val === null || val === 'null')) {
        state.filters[col + '__notnull'] = 1;
      }
      return chain;
    },
    neq(col: string, val: string | number) {
      state.filters[col + '__neq'] = val;
      return chain;
    },
    is(col: string, val: string | number | null) {
      if (val === null || val === 'null') {
        state.filters[col + '__isnull'] = 1;
      }
      return chain;
    },
    or(clause: string) {
      state.orClauses = state.orClauses ?? [];
      state.orClauses.push(clause);
      return chain;
    },
    in(col: string, vals: (string | number)[]) {
      if (vals.length === 1) state.filters[col] = vals[0];
      else if (vals.length > 0) state.filters[col + '__in'] = vals.join(',');
      return chain;
    },
    limit(n: number) {
      state.limit = n;
      return chain;
    },
    offset(n: number) {
      state.offset = n;
      return chain;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.order = opts?.ascending === false ? `${col}.desc` : col;
      return chain;
    },
    async then<T>(onFulfilled?: (value: { data: T | null; error: ApiError | null }) => T | Promise<T>) {
      const q: Record<string, string | number | string[] | undefined> = {
        select: state.select,
        limit: state.limit ?? 1000,
        offset: state.offset ?? 0,
        ...state.filters,
      };
      if (state.order) q.order = state.order;
      if (state.orClauses?.length) q.or = state.orClauses;
      const path = `/data/${state.table}${buildQuery(q)}`;
      const out = await request<unknown[]>('GET', path);
      return onFulfilled ? onFulfilled(out as { data: T | null; error: ApiError | null }) : (out as T);
    },
    async single() {
      const q: Record<string, string | number | string[] | undefined> = { ...state.filters, select: state.select, limit: 1 };
      if (state.orClauses?.length) q.or = state.orClauses;
      const path = `/data/${state.table}${buildQuery(q)}`;
      const out = await request('GET', path);
      if (out.error) return out;
      const arr = Array.isArray(out.data) ? out.data : out.data ? [out.data] : [];
      if (arr.length === 0) return { data: null, error: { message: 'No rows found' } };
      return { data: arr[0], error: null };
    },
    async maybeSingle() {
      const q: Record<string, string | number | string[] | undefined> = { ...state.filters, select: state.select, limit: 2 };
      if (state.orClauses?.length) q.or = state.orClauses;
      const path = `/data/${state.table}${buildQuery(q)}`;
      const out = await request('GET', path);
      if (out.error) return out;
      const arr = Array.isArray(out.data) ? out.data : out.data ? [out.data] : [];
      if (arr.length === 0) return { data: null, error: null };
      if (arr.length > 1) return { data: null, error: { message: 'Multiple rows found' } };
      return { data: arr[0], error: null };
    },
    insert(row: Record<string, unknown>) {
      const promise = request('POST', `/data/${state.table}`, row);
      // Allow Supabase-style chain: .insert().select().single() (backend returns inserted row)
      return Object.assign(promise, {
        select: () => Object.assign(promise, { single: () => promise }),
        single: () => promise,
      });
    },
    update(updates: Record<string, unknown>) {
      const body = { ...state.filters, ...updates };
      const promise = request('PATCH', `/data/${state.table}`, body);
      // Allow Supabase-style chain: .eq().update().select().single() (select/single no-op; backend returns row)
      return Object.assign(promise, {
        select: () => Object.assign(promise, { single: () => promise }),
        single: () => promise,
      });
    },
    delete() {
      const table = state.table;
      type DeleteFilterVal = string | number | (string | number)[];
      const deleteFilters: Record<string, DeleteFilterVal> = {};
      // DELETE with query params (comma-separated for IN); backend supports entity_id=1,2,3
      const runDelete = (filters: Record<string, DeleteFilterVal>) =>
        request('DELETE', `/data/${table}${buildQuery(filters)}`);
      const deleteChain: {
        eq: (col: string, val: string | number) => typeof deleteChain;
        in: (col: string, vals: (string | number)[]) => Promise<{ data: unknown; error: ApiError | null }>;
        then: (resolve?: (r: { data: unknown; error: ApiError | null }) => unknown, reject?: (e: unknown) => void) => Promise<unknown>;
        catch: (fn: (e: unknown) => void) => Promise<unknown>;
      } = {
        eq(col: string, val: string | number) {
          deleteFilters[col] = val;
          return deleteChain;
        },
        in(col: string, vals: (string | number)[]) {
          if (vals.length === 0) return Promise.resolve({ data: null, error: null });
          // Single request with col=val1&col=val2 (backend builds IN clause)
          return runDelete({ ...deleteFilters, [col]: vals });
        },
        then(
          resolve?: (r: { data: unknown; error: ApiError | null }) => unknown,
          reject?: (e: unknown) => void
        ) {
          const filters = Object.keys(deleteFilters).length ? deleteFilters : state.filters;
          if (Object.keys(filters).length === 0)
            return Promise.resolve({ data: null, error: { message: 'Delete requires eq(col, value)' } }).then(resolve, reject);
          return runDelete(filters).then(resolve, reject);
        },
        catch(fn: (e: unknown) => void) {
          const filters = Object.keys(deleteFilters).length ? deleteFilters : state.filters;
          if (Object.keys(filters).length === 0)
            return Promise.resolve({ data: null, error: { message: 'Delete requires eq(col, value)' } }).catch(fn);
          return runDelete(filters).catch(fn);
        },
      };
      return deleteChain;
    },
    upsert(rowOrRows: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict: string }) {
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const body = { rows, onConflict: opts?.onConflict };
      const promise = request<unknown>('POST', `/data/${state.table}/upsert`, body).then((out) => {
        if (out.error) return out;
        const data = Array.isArray(out.data) ? out.data : out.data != null ? [out.data] : [];
        return { data, error: null as ApiError | null };
      });
      const singleResult = () =>
        promise.then((res) =>
          res.error ? res : { data: (Array.isArray(res.data) ? res.data[0] : res.data) ?? null, error: null }
        );
      const upsertChain = {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        select: () => upsertChain,
        single: singleResult,
      };
      return upsertChain;
    },
  };
  return chain;
}

// Auth stub for code that calls api.auth.getSession()
const auth = {
  getSession: async () => {
    try {
      const raw = sessionStorage.getItem('buildingsmanager_users_table_session');
      if (!raw) return { data: { session: null } };
      const s = JSON.parse(raw);
      return { data: { session: s ? { access_token: 'local', user: s } : null } };
    } catch {
      return { data: { session: null } };
    }
  },
};

/** Headers for file/inspection API: Bearer token from session login, else legacy auth_token, else X-Users-Table-Session fallback. */
export function getFileApiHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const legacyToken = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (legacyToken) {
    return { Authorization: `Bearer ${legacyToken}` };
  }
  const s = getSession();
  if (s) {
    if (typeof document !== 'undefined') setFileSessionCookie(s);
    return { 'X-Users-Table-Session': btoa(unescape(encodeURIComponent(JSON.stringify({ user_id: s.user_id, user_name: s.user_name, user_role: s.user_role })))) };
  }
  return {};
}

/** Result of getting a view URL: url when ok, else status for fallback/error message. */
export type GetFileViewUrlResult = { url: string } | { status: number; error?: string };

/** Get a short-lived view URL for a file path (opens in new tab without auth; for print like ref_only). */
export async function getFileViewUrl(path: string): Promise<GetFileViewUrlResult> {
  const session = getSession();
  if (session && typeof document !== 'undefined') setFileSessionCookie(session);
  const base = `${getApiBaseUrl()}/api/files`.replace(/\/+$/, '');
  const url = base ? `${base}/view-url` : '/api/files/view-url';
  const res = await fetch(`${url}?path=${encodeURIComponent(path)}`, {
    credentials: 'include',
    headers: getFileApiHeaders(),
  });
  if (!res.ok) {
    let error = '';
    try {
      const body = await res.json();
      error = (body as { detail?: string })?.detail ?? '';
    } catch {
      error = await res.text();
    }
    return { status: res.status, error: error || res.statusText };
  }
  const data = (await res.json()) as { url?: string };
  const viewUrl = data?.url ?? null;
  if (viewUrl) return { url: viewUrl };
  return { status: res.status, error: 'No url in response' };
}

// Storage: proxy to backend file endpoints
function storageFrom(bucket: string) {
  const base = `${getApiBaseUrl()}/api/files`;
  return {
    upload: async (path: string, file: File | Blob, opts?: { upsert?: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      // path is "assetId/filename" or "assetId/sub/filename" — first segment is asset_id (integer)
      const firstSegment = path.split('/')[0];
      const assetId = firstSegment && /^\d+$/.test(firstSegment) ? firstSegment : '0';
      const url = `${base}/upload/${assetId}?path=${encodeURIComponent(path)}`;
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: getFileApiHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return { data: { path, ...data }, error: null };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${base}/download?path=${encodeURIComponent(path)}` } }),
    createSignedUrl: async (path: string, _expirySeconds?: number) => {
      const result = await getFileViewUrl(path);
      const signedUrl = 'url' in result ? result.url : `${base}/download?path=${encodeURIComponent(path)}`;
      return {
        data: { signedUrl },
        error: null,
      };
    },
    download: async (path: string) => {
      const res = await fetch(`${base}/download?path=${encodeURIComponent(path)}`, {
        credentials: 'include',
        headers: getFileApiHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      return { data: blob, error: null };
    },
    remove: async (paths: string[]) => {
      const res = await fetch(`${base}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getFileApiHeaders() },
        body: JSON.stringify({ paths }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return { data: {}, error: null };
    },
  };
}

const storage = {
  from: storageFrom,
};

/** Delete by filters using POST body. Prefer resource endpoints (e.g. deleteBuildingWithRelated) for app flows. */
async function deleteByQuery(table: string, filters: Record<string, string | number | (string | number)[]>): Promise<{ data: unknown; error: ApiError | null }> {
  return request('POST', '/data/bulk/delete-by-query', { table, filters });
}

/** REST: DELETE building and all related data (assets, audit). Backend owns business logic. */
async function deleteBuildingWithRelated(buildingNumber: number): Promise<{ data: { success?: boolean; building_number?: number; deleted_assets_count?: number } | null; error: ApiError | null }> {
  return request('DELETE', `/buildings/by-number/${buildingNumber}`);
}

export const api = {
  from,
  auth,
  storage,
  deleteByQuery,
  deleteBuildingWithRelated,
};
