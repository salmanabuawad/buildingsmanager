/**
 * REST helpers used by the regression suite.
 * All helpers acquire a JWT via /api/auth/session with the same
 * TEST_USER_NAME / TEST_PASSWORD env vars that the login() helper reads.
 */

import { APIRequestContext, request as pwRequest } from '@playwright/test';

export interface AuthedApi {
  ctx: APIRequestContext;
  token: string;
  baseURL: string;
  /** Close the underlying APIRequestContext. */
  close(): Promise<void>;
}

function baseUrlFromEnv(): string {
  const base = process.env.TEST_BASE_URL || 'http://test.profile.wavelync.com/';
  return base.replace(/\/$/, '');
}

export async function loginViaApi(): Promise<AuthedApi> {
  const baseURL = baseUrlFromEnv();
  const username = process.env.TEST_USER_NAME || 'tester';
  const password = process.env.TEST_PASSWORD || 'tester123';
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post('/api/auth/session', {
    data: { user_name: username, password },
  });
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}): ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('No access_token in login response');
  return {
    ctx,
    token: body.access_token,
    baseURL,
    close: () => ctx.dispose(),
  };
}

/** Small helpers that reuse the logged-in context. */
export async function apiGet<T = any>(api: AuthedApi, path: string): Promise<T> {
  const res = await api.ctx.get(path, { headers: { Authorization: `Bearer ${api.token}` } });
  if (!res.ok()) throw new Error(`GET ${path} -> ${res.status()}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function apiPost<T = any>(api: AuthedApi, path: string, body?: unknown): Promise<T> {
  const res = await api.ctx.post(path, {
    headers: { Authorization: `Bearer ${api.token}` },
    data: body ?? {},
  });
  if (!res.ok()) throw new Error(`POST ${path} -> ${res.status()}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function apiDelete<T = any>(api: AuthedApi, path: string): Promise<T> {
  const res = await api.ctx.delete(path, { headers: { Authorization: `Bearer ${api.token}` } });
  if (!res.ok()) throw new Error(`DELETE ${path} -> ${res.status()}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Clean up any buildings / assets a test created by building_number. */
export async function deleteBuildingIfExists(api: AuthedApi, buildingNumber: number): Promise<void> {
  const res = await api.ctx.delete(`/api/buildings/by-number/${buildingNumber}`, {
    headers: { Authorization: `Bearer ${api.token}` },
  });
  if (res.ok() || res.status() === 404) return;
  throw new Error(`Cleanup of building ${buildingNumber} failed: ${res.status()}`);
}
