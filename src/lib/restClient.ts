/**
 * REST API client for FastAPI backend.
 * API base URL: same origin by default (config.js or VITE_API_BASE_URL). All requests go to current host /api/...
 */
import { getApiBaseUrl } from './appConfig';

export interface RestError {
  message: string;
  detail?: string;
  code?: string;
}

import { getAccessToken, logoutUsersTable } from './usersTableAuth';

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<{ data: T | null; error: RestError | null }> {
  const url = `${getApiBaseUrl()}/api${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
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
      const detail = (data as { detail?: string })?.detail ?? res.statusText ?? 'Request failed';
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      if (res.status === 401 || (typeof message === 'string' && message.toLowerCase().includes('could not validate credentials'))) {
        logoutUsersTable();
        window.location.href = '/';
        return { data: null, error: { message, code: String(res.status) } };
      }
      return { data: null, error: { message, code: String(res.status) } };
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

// ---- Auth ----
export interface SessionLoginResponse {
  user_id: number;
  user_name: string;
  user_role: string;
  access_token: string;
}

export interface SessionByTaskTokenResponse {
  user_id: number;
  user_name: string;
  user_role: string;
  task_id: number;
  access_token: string;
}

export async function authSessionLogin(user_name: string, password: string) {
  return rest<SessionLoginResponse>('POST', '/auth/session', { user_name, password });
}

export async function authSessionByTaskToken(token: string) {
  return rest<SessionByTaskTokenResponse>('POST', '/auth/session-by-task-token', { token });
}

// ---- Assets ----
export async function assetsSaveBulkTransactional(payload: Record<string, unknown>) {
  return rest<Record<string, unknown>>('POST', '/assets/save-bulk-transactional', payload);
}

export async function assetsDeleteTransactional(payload: Record<string, unknown>) {
  return rest<Record<string, unknown>>('POST', '/assets/delete-transactional', payload);
}

export async function assetsDeleteBulkTransactional(payload: Record<string, unknown>) {
  return rest<Record<string, unknown>>('POST', '/assets/delete-bulk-transactional', payload);
}

export async function assetsByIds(p_asset_ids: number[]) {
  return rest<unknown[]>('POST', '/assets/by-ids', { p_asset_ids });
}

export async function assetsWithHistory(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/assets/with-history', payload);
}

export async function assetsCopyToHistory(p_asset_id: number) {
  return rest<unknown>('POST', '/assets/copy-to-history', { p_asset_id });
}

export async function assetsMarkExported() {
  return rest<Record<string, unknown>>('POST', '/assets/mark-exported');
}

/** Mark given asset IDs as exported. Call after successful send so count updates only after send. */
export async function assetsMarkExportedByIds(assetIds: number[]) {
  return rest<{ updated_count: number; asset_ids: number[] }>('POST', '/assets/mark-exported-by-ids', { asset_ids: assetIds });
}

/** GET measured-not-exported assets (same criteria as mark-exported). Optional building_number. */
export async function assetsMeasuredNotExported(buildingNumber?: number) {
  const path = buildingNumber != null
    ? `/assets/measured-not-exported?building_number=${buildingNumber}`
    : '/assets/measured-not-exported';
  return rest<unknown[]>('GET', path);
}

/** Reset latest export batch (exported_to_automation=false for assets with latest export date). */
export async function assetsResetExportToAutomation() {
  return rest<{ success: boolean; count: number; next_latest_date?: string | null }>(
    'POST',
    '/assets/reset-export-to-automation'
  );
}

// ---- Export to automation queue (3 requests: zip, email operators, email managers) ----
export interface EnqueueExportPayload {
  asset_ids: number[];
  operator_email_items?: Array<{ to: string; subject: string; body: string; attachment_filename?: string; attachment_base64?: string }>;
  manager_email_items?: Array<{ to: string; subject: string; body: string; attachment_filename?: string; attachment_base64?: string }>;
  email_config?: Record<string, unknown>;
}

export interface EnqueueExportResponse {
  export_job_id: string;
  enqueued: string[];
  message: string;
}

export async function exportToAutomationEnqueue(payload: EnqueueExportPayload) {
  return rest<EnqueueExportResponse>('POST', '/export-to-automation/enqueue', payload);
}

export async function assetsSearchByRange(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/assets/search-by-range', payload);
}

// ---- Buildings ----
export async function buildingsUpdateTotalArea(p_building_number: number) {
  return rest<unknown>('POST', '/buildings/update-total-area', { p_building_number });
}

export async function buildingsBulkDistributionFlags(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/buildings/bulk-distribution-flags', payload);
}

// ---- Asset types ----
export async function assetTypesUpdateWithDistributionReset(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/asset-types/update-with-distribution-reset', payload);
}

export async function assetTypesBulkDistributionReset(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/asset-types/bulk-distribution-reset', payload);
}

// ---- Audit / change log ----
export async function auditLogEntry(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/audit/entry', payload);
}

export async function auditLogForAsset(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/audit/for-asset', payload);
}

export async function auditLogForBuilding(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/audit/for-building', payload);
}

export async function changeLogEntry(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/change-log/entry', payload);
}

export async function changeLogHistory(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/change-log/history', payload);
}

// ---- Users ----
export async function usersCreateInternal(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/users/internal', payload);
}

export async function usersSetPassword(payload: Record<string, unknown>) {
  return rest<unknown>('POST', '/users/set-password', payload);
}

export async function usersEnsureDefaults() {
  return rest<unknown>('POST', '/users/ensure-defaults');
}

// ---- Metadata ----
export async function metadataTablesFieldsTypes() {
  return rest<unknown>('GET', '/metadata/tables-fields-types');
}

// ---- Export (async ZIP) ----
export interface ZipEntryInput {
  path: string;
  filename_in_zip: string;
}

export async function exportCreateZipJob(zip_filename: string, entries: ZipEntryInput[]) {
  return rest<{ job_id: string; message?: string; status?: string }>(
    'POST',
    '/export/zip',
    { zip_filename, entries }
  );
}

export async function exportGetZipStatus(job_id: string) {
  return rest<{ job_id: string; status: string; error?: string }>(
    'GET',
    `/export/zip/${job_id}`
  );
}

/** Returns the download URL for the ZIP (same origin). Call when status is "ready". */
export function exportGetZipDownloadUrl(job_id: string): string {
  const base = getApiBaseUrl();
  const path = `${base}/api/export/zip/${job_id}/download`;
  return path;
}
