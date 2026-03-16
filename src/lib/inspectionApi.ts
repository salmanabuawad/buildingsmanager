/**
 * Inspection tasks and reports API. Uses same auth as file API (Bearer or X-Users-Table-Session).
 */
import { getApiBaseUrl } from './appConfig';
import { getFileApiHeaders } from './apiClient';

const base = () => `${getApiBaseUrl()}/api`;
const headers = () => ({ 'Content-Type': 'application/json', ...getFileApiHeaders() });

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = text ? JSON.parse(text) : null;
      const d = (data as { detail?: string | { msg?: string }[] })?.detail;
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && d[0].msg) msg = (d[0] as { msg: string }).msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

export interface InspectionTask {
  id: number;
  title: string | null;
  building_number: number;
  asset_ids: number[];
  assigned_to: number | null;
  status: string;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  taken_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  note: string | null;
  priority?: 'high' | 'medium' | 'low';
  report?: {
    id: number;
    task_id: number;
    report_text: string | null;
    reported_at: string | null;
    reported_by: number | null;
    files?: Array<{ id: number; file_path: string; file_name: string | null; file_type: string | null; asset_ids?: number[] }>;
  } | null;
  history?: Array<{
    id: number;
    task_id: number;
    created_at: string;
    created_by: number | null;
    action: string;
    comment_text: string | null;
  }>;
}

export const inspectionTasksApi = {
  list: (params?: { status?: string; assigned_to?: number; building_number?: number; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.assigned_to != null) q.set('assigned_to', String(params.assigned_to));
    if (params?.building_number != null) q.set('building_number', String(params.building_number));
    if (params?.skip != null) q.set('skip', String(params.skip));
    if (params?.limit != null) q.set('limit', String(params.limit));
    const query = q.toString() ? `?${q.toString()}` : '';
    return request<InspectionTask[]>('GET', `/inspection-tasks${query}`);
  },
  get: (taskId: number) => request<InspectionTask>('GET', `/inspection-tasks/${taskId}`),
  create: (body: { title?: string; building_number: number; asset_ids?: number[]; assigned_to?: number; note?: string; priority?: 'high' | 'medium' | 'low' }) =>
    request<InspectionTask>('POST', '/inspection-tasks', body),
  update: (taskId: number, body: { title?: string; assigned_to?: number; status?: string; note?: string; priority?: 'high' | 'medium' | 'low' }) =>
    request<InspectionTask>('PATCH', `/inspection-tasks/${taskId}`, body),
  take: (taskId: number) => request<InspectionTask>('POST', `/inspection-tasks/${taskId}/take`),
  submit: (taskId: number, body?: { comment?: string }) =>
    request<InspectionTask>('POST', `/inspection-tasks/${taskId}/submit`, body ?? {}),
  approve: (taskId: number) => request<InspectionTask>('POST', `/inspection-tasks/${taskId}/approve`),
  return: (taskId: number, body?: { comment?: string }) =>
    request<InspectionTask>('POST', `/inspection-tasks/${taskId}/return`, body ?? {}),
  /** Create one-time token for inspector (admin only). Returns { token, expires_in_days }. */
  createAccessToken: (taskId: number, userId: number) =>
    request<{ token: string; expires_in_days: number }>('POST', `/inspection-tasks/${taskId}/access-token`, { user_id: userId }),
};

export const inspectionReportsApi = {
  getByTask: (taskId: number) =>
    request<{ task_id: number; report: InspectionTask['report'] | null }>('GET', `/inspection-reports?task_id=${taskId}`),
  upsert: (body: { task_id: number; report_text?: string }) =>
    request<{ task_id: number; report: InspectionTask['report'] }>('PUT', '/inspection-reports', body),
  listFiles: (reportId: number) =>
    request<Array<{ id: number; report_id: number; file_path: string; file_name: string | null; file_type: string | null; uploaded_at: string; uploaded_by: number | null }>>(
      'GET',
      `/inspection-reports/${reportId}/files`
    ),
  uploadFile: async (reportId: number, file: File, assetIds?: number[]) => {
    const form = new FormData();
    form.append('file', file);
    if (assetIds && assetIds.length > 0) {
      form.append('asset_ids', JSON.stringify(assetIds));
    }
    const res = await fetch(`${getApiBaseUrl()}/api/inspection-reports/${reportId}/files`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: getFileApiHeaders(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    return JSON.parse(text) as { id: number; report_id: number; file_path: string; file_name: string; file_type: string; uploaded_by: number | null; asset_ids?: number[] };
  },
  deleteFile: (fileId: number) =>
    request<null>('DELETE', `/inspection-reports/files/${fileId}`),
};
