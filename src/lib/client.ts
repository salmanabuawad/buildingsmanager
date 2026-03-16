/**
 * HTTP client for the FastAPI backend.
 * Routes all RPC, REST table, and file-storage calls to VITE_API_URL.
 */

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

function sessionHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("buildingsmanager_users_table_session");
    if (raw) {
      const s = JSON.parse(raw) as { user_id?: number; access_token?: string };
      const headers: Record<string, string> = {};
      if (s?.user_id) headers["X-User-Id"] = String(s.user_id);
      if (s?.access_token) headers["Authorization"] = `Bearer ${s.access_token}`;
      if (Object.keys(headers).length > 0) return headers;
    }
  } catch { /* ignore */ }
  return {};
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...sessionHeaders(), ...(init?.headers ?? {}) },
    credentials: "include",
  });
}

function toError(msg: string): { message: string } {
  return { message: msg };
}

// ── RPC ───────────────────────────────────────────────────────────────────────

async function rpc(fnName: string, params?: Record<string, unknown>) {
  try {
    const res = await apiFetch(`/api/rpc/${fnName}`, {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: toError(json?.detail ?? json?.message ?? res.statusText) };
    }
    if (json && typeof json === "object" && "data" in json) {
      return { data: json.data, error: json.error ?? null };
    }
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
  }
}

// ── Query builder (PostgREST-compatible) ──────────────────────────────────────

type QueryResult<T = unknown> = { data: T | null; error: { message: string } | null };

class QueryBuilder {
  private _table: string;
  private _params: URLSearchParams = new URLSearchParams();
  private _method: "GET" | "POST" | "PATCH" | "DELETE" = "GET";
  private _body: unknown = undefined;
  private _upsert = false;

  constructor(table: string) { this._table = table; }

  select(cols: string = "*"): this { this._params.set("select", cols); return this; }
  eq(col: string, val: unknown): this { this._params.append(col, `eq.${val}`); return this; }
  neq(col: string, val: unknown): this { this._params.append(col, `neq.${val}`); return this; }
  gt(col: string, val: unknown): this { this._params.append(col, `gt.${val}`); return this; }
  gte(col: string, val: unknown): this { this._params.append(col, `gte.${val}`); return this; }
  lt(col: string, val: unknown): this { this._params.append(col, `lt.${val}`); return this; }
  lte(col: string, val: unknown): this { this._params.append(col, `lte.${val}`); return this; }
  like(col: string, val: string): this { this._params.append(col, `like.${val}`); return this; }
  ilike(col: string, val: string): this { this._params.append(col, `ilike.${val}`); return this; }

  is(col: string, val: null | boolean): this {
    this._params.append(col, `is.${val}`);
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    this._params.append(col, `not.${op}.${val}`);
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this._params.append(col, `in.(${vals.join(",")})`);
    return this;
  }

  or(filters: string): this { this._params.set("or", `(${filters})`); return this; }

  order(col: string, opts?: { ascending?: boolean }): this {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const existing = this._params.get("order");
    this._params.set("order", existing ? `${existing},${col}.${dir}` : `${col}.${dir}`);
    return this;
  }

  limit(n: number): this { this._params.set("limit", String(n)); return this; }
  offset(n: number): this { this._params.set("offset", String(n)); return this; }

  insert(data: unknown): this { this._method = "POST"; this._body = data; return this; }
  update(data: unknown): this { this._method = "PATCH"; this._body = data; return this; }
  upsert(data: unknown): this { this._method = "POST"; this._body = data; this._upsert = true; return this; }
  delete(): this { this._method = "DELETE"; return this; }

  single(): QueryBuilderSingle { return new QueryBuilderSingle(this); }
  maybeSingle(): QueryBuilderMaybeSingle { return new QueryBuilderMaybeSingle(this); }

  async _execute(): Promise<QueryResult<unknown[]>> {
    const qs = this._params.toString();
    const path = `/api/rest/${this._table}${qs ? `?${qs}` : ""}`;
    try {
      const extraHeaders: Record<string, string> = {};
      if (this._upsert) extraHeaders["Prefer"] = "resolution=merge-duplicates";
      const res = await apiFetch(path, {
        method: this._method,
        body: this._body !== undefined ? JSON.stringify(this._body) : undefined,
        headers: extraHeaders,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return { data: null, error: toError(j?.detail ?? res.statusText) };
      }
      const data = await res.json();
      return { data: Array.isArray(data) ? data : [data], error: null };
    } catch (e) {
      return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
    }
  }

  then(resolve: (v: QueryResult<unknown[]>) => unknown, reject?: (e: unknown) => unknown) {
    return this._execute().then(resolve, reject);
  }
}

class QueryBuilderSingle {
  constructor(private _p: QueryBuilder) {}
  then(resolve: (v: QueryResult<unknown>) => unknown, reject?: (e: unknown) => unknown) {
    return this._p._execute().then((r) => {
      if (r.error) return resolve({ data: null, error: r.error });
      const arr = r.data as unknown[];
      if (!arr || arr.length === 0) return resolve({ data: null, error: toError("PGRST116") });
      return resolve({ data: arr[0], error: null });
    }, reject);
  }
}

class QueryBuilderMaybeSingle {
  constructor(private _p: QueryBuilder) {}
  then(resolve: (v: QueryResult<unknown>) => unknown, reject?: (e: unknown) => unknown) {
    return this._p._execute().then((r) => {
      if (r.error) return resolve({ data: null, error: r.error });
      const arr = r.data as unknown[];
      return resolve({ data: arr?.[0] ?? null, error: null });
    }, reject);
  }
}

function fromTable(table: string): QueryBuilder {
  return new QueryBuilder(table);
}

// ── File storage ──────────────────────────────────────────────────────────────

function storageFrom(bucket: string) {
  return {
    upload: async (path: string, file: File | Blob, _opts?: { upsert?: boolean; contentType?: string }) => {
      const formData = new FormData();
      formData.append("file", file, (file as File).name ?? "upload");
      const qs = new URLSearchParams({ path }).toString();
      try {
        const res = await fetch(`${API_URL}/api/files/${bucket}/upload?${qs}`, {
          method: "POST",
          headers: sessionHeaders(),
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { data: null, error: toError(j?.detail ?? res.statusText) };
        }
        const j = await res.json();
        return { data: j.data ?? { path: `${bucket}/${path}` }, error: null };
      } catch (e) {
        return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
      }
    },

    getPublicUrl: (path: string) => ({
      data: { publicUrl: `${API_URL}/uploads/${bucket}/${path.replace(/^\//, "")}` },
    }),

    createSignedUrl: async (path: string, expiresIn: number = 3600) => {
      try {
        const qs = new URLSearchParams({ path, expires_in: String(expiresIn) }).toString();
        const res = await apiFetch(`/api/files/${bucket}/signed-url?${qs}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { data: null, error: toError(j?.detail ?? res.statusText) };
        }
        const j = await res.json();
        return { data: { signedUrl: `${API_URL}${j.data?.signedUrl ?? ""}` }, error: null };
      } catch (e) {
        return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
      }
    },

    download: async (path: string) => {
      try {
        const res = await fetch(`${API_URL}/api/files/${bucket}/${path.replace(/^\//, "")}`, {
          headers: sessionHeaders(),
          credentials: "include",
        });
        if (!res.ok) return { data: null, error: toError(res.statusText) };
        const blob = await res.blob();
        return { data: blob, error: null };
      } catch (e) {
        return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
      }
    },

    remove: async (paths: string[]) => {
      try {
        const res = await apiFetch(`/api/files/${bucket}/remove`, {
          method: "POST",
          body: JSON.stringify({ paths }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { data: null, error: toError(j?.detail ?? res.statusText) };
        }
        return { data: {}, error: null };
      } catch (e) {
        return { data: null, error: toError(e instanceof Error ? e.message : String(e)) };
      }
    },
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const client = {
  rpc,
  from: fromTable,
  storage: { from: storageFrom },
};
