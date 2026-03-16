/**
 * REST API client - uses Supabase RPCs.
 * All calls go to Supabase.
 */
import { client } from './client';
import { getAuthUserIdForBackend } from './usersTableAuth';

export interface RestError {
  message: string;
  detail?: string;
  code?: string;
}

function fromRpc<T>(result: { data: T; error: { message: string } | null }): {
  data: T | null;
  error: RestError | null;
} {
  if (result.error) {
    return { data: null, error: { message: result.error.message } };
  }
  return { data: result.data, error: null };
}

// ---- Auth (handled by usersTableAuth via client.rpc) ----
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

// ---- Assets ----
export async function assetsSaveBulkTransactional(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('save_assets_bulk_transactional', {
    p_assets_data: payload.p_assets_data ?? payload.assets_data ?? [],
    p_validation_passed: payload.p_validation_passed ?? true,
    p_validation_errors: payload.p_validation_errors,
    p_action_type: payload.p_action_type ?? 'manual_update',
    p_user_id: uid,
    p_before_data: payload.p_before_data,
    p_after_data: payload.p_after_data,
    p_description: payload.p_description,
    p_is_business_context: payload.p_is_business_context,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function assetsDeleteTransactional(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('delete_asset_transactional', {
    p_asset_id: payload.p_asset_id ?? payload.asset_id,
    p_user_id: uid,
    p_description: payload.p_description,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function assetsDeleteBulkTransactional(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('delete_assets_bulk_transactional', {
    p_asset_ids: payload.p_asset_ids ?? payload.asset_ids ?? [],
    p_user_id: uid,
    p_description: payload.p_description,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function assetsByIds(p_asset_ids: number[]) {
  const { data, error } = await client.rpc('get_assets_by_ids', {
    p_asset_ids: p_asset_ids.length ? p_asset_ids : [0],
  });
  if (p_asset_ids.length === 0) return { data: [], error: null };
  return fromRpc({ data: (data ?? []) as unknown[], error });
}

export async function assetsWithHistory(payload: Record<string, unknown>) {
  const bn = payload.p_building_number ?? payload.building_number;
  const { data: master } = await client.from('assets').select('*').eq('building_number', bn).order('asset_id');
  const { data: details } = await client
    .from('assets_history')
    .select('*')
    .eq('building_number', bn)
    .order('asset_id', { ascending: true })
    .order('history_created_at', { ascending: false });
  return { data: { master: master ?? [], details: details ?? [] }, error: null };
}

export async function assetsCopyToHistory(p_asset_id: number) {
  const { error } = await client.rpc('copy_asset_to_history_before_update', {
    p_asset_id: p_asset_id,
  });
  return fromRpc({ data: {}, error });
}

export async function assetsMarkExported() {
  const { data, error } = await client.rpc('mark_assets_as_exported_to_automation');
  const result = Array.isArray(data) ? data[0] : data;
  return fromRpc({
    data: result ? { updated_count: result.updated_count, asset_ids: result.asset_ids ?? [] } : {},
    error,
  });
}

export async function assetsMarkExportedByIds(assetIds: number[]) {
  if (!assetIds.length) return { data: { updated_count: 0, asset_ids: [] }, error: null };
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const { data, error } = await client
    .from('assets')
    .update({ exported_to_automation: true, export_to_automation_at: dateStr })
    .in('asset_id', assetIds)
    .select('asset_id');
  if (error) return fromRpc({ data: null, error });
  return { data: { updated_count: data?.length ?? assetIds.length, asset_ids: assetIds }, error: null };
}

export async function assetsMeasuredNotExported(buildingNumber?: number) {
  let query = client
    .from('assets')
    .select('*')
    .not('measurement_date', 'is', null)
    .or('exported_to_automation.eq.false,exported_to_automation.is.null')
    .or('data_from_automation.eq.false,data_from_automation.is.null')
    .order('building_number')
    .order('asset_id');
  if (buildingNumber != null) {
    query = query.eq('building_number', buildingNumber);
  }
  const { data, error } = await query;
  return fromRpc({ data: (data ?? []) as unknown[], error });
}

export async function assetsResetExportToAutomation() {
  const { data: exported } = await client
    .from('assets')
    .select('asset_id, export_to_automation_at')
    .eq('exported_to_automation', true)
    .not('export_to_automation_at', 'is', null);
  if (!exported?.length) return { data: { success: true, count: 0, next_latest_date: null }, error: null };
  const dates = [...new Set(exported.map((r) => r.export_to_automation_at).filter(Boolean))] as string[];
  const parse = (s: string) => {
    const parts = s.trim().split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const latest = dates.reduce((a, b) => (parse(a) ?? 0) >= (parse(b) ?? 0) ? a : b);
  const idsToReset = exported.filter((r) => r.export_to_automation_at === latest).map((r) => r.asset_id);
  const { error } = await client
    .from('assets')
    .update({ exported_to_automation: false, export_to_automation_at: null })
    .in('asset_id', idsToReset);
  if (error) return fromRpc({ data: null, error });
  const remaining = exported.filter((r) => r.export_to_automation_at !== latest);
  const nextDate = remaining.length
    ? remaining.reduce((a, b) => (parse(a.export_to_automation_at!) ?? 0) >= (parse(b.export_to_automation_at!) ?? 0) ? a : b).export_to_automation_at
    : null;
  return { data: { success: true, count: idsToReset.length, next_latest_date: nextDate }, error: null };
}

export async function assetsSearchByRange(payload: Record<string, unknown>) {
  const fromId = payload.from_id ?? payload.fromId;
  const toId = payload.to_id ?? payload.toId;
  const { data, error } = await client.rpc('search_assets_by_range', {
    from_id: fromId,
    to_id: toId,
  });
  return fromRpc({ data: (data ?? []) as unknown, error });
}

// ---- Export to automation (queue - may need Edge Function; for now stub) ----
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

export async function exportToAutomationEnqueue(_payload: EnqueueExportPayload) {
  return { data: { export_job_id: 'client', enqueued: [], message: 'Export queue requires Edge Function' }, error: null };
}

// ---- Buildings ----
export async function buildingsUpdateTotalArea(p_building_number: number) {
  const { data, error } = await client.rpc('update_building_total_area', {
    p_building_number: p_building_number,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function buildingsBulkDistributionFlags(payload: Record<string, unknown>) {
  const { data, error } = await client.rpc('update_buildings_bulk_with_distribution_flags', {
    p_buildings_data: payload.p_buildings_data ?? payload.buildings_data ?? [],
  });
  return fromRpc({ data: data ?? {}, error });
}

// ---- Asset types ----
export async function assetTypesUpdateWithDistributionReset(payload: Record<string, unknown>) {
  const { data, error } = await client.rpc('update_asset_type_with_distribution_reset', payload);
  return fromRpc({ data: data ?? {}, error });
}

export async function assetTypesBulkDistributionReset(payload: Record<string, unknown>) {
  const { data, error } = await client.rpc('update_asset_types_bulk_with_distribution_reset', payload);
  return fromRpc({ data: data ?? {}, error });
}

// ---- Audit / change log ----
export async function auditLogEntry(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('log_audit_entry', {
    ...payload,
    p_user_id: uid,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function auditLogForAsset(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('log_audit_for_asset', {
    ...payload,
    p_user_id: uid,
  });
  return fromRpc({ data: (data ?? []) as unknown, error });
}

export async function auditLogForBuilding(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('log_audit_for_building', {
    ...payload,
    p_user_id: uid,
  });
  return fromRpc({ data: (data ?? []) as unknown, error });
}

export async function changeLogEntry(payload: Record<string, unknown>) {
  const uid = getAuthUserIdForBackend();
  const { data, error } = await client.rpc('log_change_entry', {
    ...payload,
    p_user_id: uid,
  });
  return fromRpc({ data: data ?? {}, error });
}

export async function changeLogHistory(payload: Record<string, unknown>) {
  const table = String(payload.p_table_name ?? payload.table_name ?? '');
  const recordId = String(payload.p_record_id ?? payload.record_id ?? '');
  const limit = Number(payload.p_limit ?? payload.limit ?? 50);
  const { data, error } = await client
    .from('change_log')
    .select('*')
    .eq('table_name', table)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return fromRpc({ data: (data ?? []) as unknown, error });
}

// ---- Users ----
export async function usersCreateInternal(payload: Record<string, unknown>) {
  const { data, error } = await client.rpc('users_create_internal', payload);
  return fromRpc({ data: data ?? {}, error });
}

export async function usersSetPassword(payload: Record<string, unknown>) {
  const { data, error } = await client.rpc('users_set_password', payload);
  return fromRpc({ data: data ?? {}, error });
}

export async function usersEnsureDefaults() {
  const { data, error } = await client.rpc('users_ensure_defaults');
  return fromRpc({ data: data ?? {}, error });
}

// ---- Metadata ----
export async function metadataTablesFieldsTypes() {
  const { data, error } = await client.rpc('get_tables_fields_types');
  return fromRpc({ data: data ?? {}, error });
}

// ---- Export (async ZIP) - requires Edge Function; stub ----
export interface ZipEntryInput {
  path: string;
  filename_in_zip: string;
}

export async function exportCreateZipJob(_zip_filename: string, _entries: ZipEntryInput[]) {
  return { data: { job_id: 'stub', message: 'ZIP export requires Edge Function', status: 'unavailable' }, error: null };
}

export async function exportGetZipStatus(_job_id: string) {
  return { data: { job_id: 'stub', status: 'unavailable' }, error: null };
}

export function exportGetZipDownloadUrl(_job_id: string): string {
  return '#';
}
