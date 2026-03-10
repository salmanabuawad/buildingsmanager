/**
 * Inspection tasks and reports API - uses Supabase.
 */
import { supabase } from './supabase';
import { getSession } from './usersTableAuth';

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

async function withReportAndHistory(task: Record<string, unknown>): Promise<InspectionTask> {
  const taskId = task.id as number;
  const { data: report } = await supabase.from('inspection_reports').select('*').eq('task_id', taskId).maybeSingle();
  let files: Array<{ id: number; file_path: string; file_name: string | null; file_type: string | null; asset_ids?: number[] }> = [];
  if (report?.id) {
    const { data: fileRows } = await supabase.from('inspection_report_files').select('*').eq('report_id', report.id);
    files = (fileRows ?? []).map((r) => ({
      id: r.id,
      file_path: r.file_path,
      file_name: r.file_name,
      file_type: r.file_type,
      asset_ids: r.asset_id != null ? [r.asset_id] : undefined,
    }));
  }
  const { data: history } = await supabase
    .from('inspection_task_history')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  return {
    ...task,
    report: report ? { ...report, files } : null,
    history: history ?? [],
  } as InspectionTask;
}

export const inspectionTasksApi = {
  list: async (params?: { status?: string; assigned_to?: number; building_number?: number; skip?: number; limit?: number }) => {
    let q = supabase.from('inspection_tasks').select('*').order('created_at', { ascending: false });
    if (params?.status) q = q.eq('status', params.status);
    if (params?.assigned_to != null) q = q.eq('assigned_to', params.assigned_to);
    if (params?.building_number != null) q = q.eq('building_number', params.building_number);
    if (params?.limit != null) q = q.limit(params.limit);
    if (params?.skip != null) q = q.range(params.skip, params.skip + (params.limit ?? 100) - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const tasks = await Promise.all((data ?? []).map(withReportAndHistory));
    return tasks;
  },

  get: async (taskId: number) => {
    const { data, error } = await supabase.from('inspection_tasks').select('*').eq('id', taskId).single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Task not found');
    return withReportAndHistory(data);
  },

  create: async (body: { title?: string; building_number: number; asset_ids?: number[]; assigned_to?: number; note?: string; priority?: 'high' | 'medium' | 'low' }) => {
    const s = getSession();
    const { data, error } = await supabase
      .from('inspection_tasks')
      .insert({
        title: body.title ?? null,
        building_number: body.building_number,
        asset_ids: body.asset_ids ?? [],
        assigned_to: body.assigned_to ?? null,
        status: 'new',
        note: body.note ?? null,
        priority: body.priority ?? 'medium',
        created_by: s?.user_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from('inspection_reports').insert({ task_id: data.id, report_text: null });
    return withReportAndHistory(data);
  },

  update: async (taskId: number, body: { title?: string; assigned_to?: number; status?: string; note?: string; priority?: 'high' | 'medium' | 'low' }) => {
    const { data, error } = await supabase.from('inspection_tasks').update(body).eq('id', taskId).select().single();
    if (error) throw new Error(error.message);
    return withReportAndHistory(data);
  },

  take: async (taskId: number) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data: task } = await supabase.from('inspection_tasks').select('*').eq('id', taskId).single();
    if (!task || task.status !== 'new') throw new Error(task?.status !== 'new' ? 'Task is not in new status' : 'Task not found');
    const { data, error } = await supabase
      .from('inspection_tasks')
      .update({ status: 'in_progress', taken_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from('inspection_task_history').insert({ task_id: taskId, action: 'taken', created_by: s.user_id });
    return withReportAndHistory(data);
  },

  submit: async (taskId: number, body?: { comment?: string }) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data: task } = await supabase.from('inspection_tasks').select('*').eq('id', taskId).single();
    if (!task || task.status !== 'in_progress') throw new Error(task?.status !== 'in_progress' ? 'Task must be in progress to submit' : 'Task not found');
    const { data, error } = await supabase
      .from('inspection_tasks')
      .update({ status: 'pending_approval', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from('inspection_task_history')
      .insert({ task_id: taskId, action: 'submitted', comment_text: body?.comment ?? null, created_by: s.user_id });
    return withReportAndHistory(data);
  },

  approve: async (taskId: number) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data: task } = await supabase.from('inspection_tasks').select('*').eq('id', taskId).single();
    if (!task || task.status !== 'pending_approval') throw new Error(task?.status !== 'pending_approval' ? 'Task must be pending approval' : 'Task not found');
    const { data, error } = await supabase
      .from('inspection_tasks')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: s.user_id, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from('inspection_task_history')
      .insert({ task_id: taskId, action: 'approved', created_by: s.user_id });
    return withReportAndHistory(data);
  },

  return: async (taskId: number, body?: { comment?: string }) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data: task } = await supabase.from('inspection_tasks').select('*').eq('id', taskId).single();
    if (!task || task.status !== 'pending_approval') throw new Error('Task must be pending approval to return');
    const { data, error } = await supabase
      .from('inspection_tasks')
      .update({ status: 'returned', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from('inspection_task_history')
      .insert({ task_id: taskId, action: 'returned', comment_text: body?.comment ?? null, created_by: s.user_id });
    return withReportAndHistory(data);
  },

  createAccessToken: async (taskId: number, userId: number) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data, error } = await supabase.rpc('inspection_task_create_access_token', {
      p_task_id: taskId,
      p_user_id: userId,
      p_caller_user_id: s.user_id,
    });
    if (error) throw new Error(error.message);
    const token = typeof data === 'string' ? data : (Array.isArray(data) ? data[0] : data)?.token ?? '';
    return { token, expires_in_days: 7 };
  },

  /** Create OTP for inspector (sent in task assignment email). Returns 6-digit code. */
  createOtp: async (userId: number, taskId: number) => {
    const s = getSession();
    if (!s?.user_id) throw new Error('User id required');
    const { data, error } = await supabase.rpc('inspector_create_otp', {
      p_user_id: userId,
      p_task_id: taskId,
      p_caller_user_id: s.user_id,
    });
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : String(data ?? '');
  },
};

export const inspectionReportsApi = {
  getByTask: async (taskId: number) => {
    const { data: report } = await supabase.from('inspection_reports').select('*').eq('task_id', taskId).maybeSingle();
    const files = report?.id
      ? (await supabase.from('inspection_report_files').select('*').eq('report_id', report.id)).data ?? []
      : [];
    return { task_id: taskId, report: report ? { ...report, files } : null };
  },

  upsert: async (body: { task_id: number; report_text?: string }) => {
    const { data: existing } = await supabase.from('inspection_reports').select('*').eq('task_id', body.task_id).maybeSingle();
    if (existing) {
      const { data, error } = await supabase
        .from('inspection_reports')
        .update({ report_text: body.report_text ?? existing.report_text })
        .eq('task_id', body.task_id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { task_id: body.task_id, report: data };
    }
    const { data, error } = await supabase
      .from('inspection_reports')
      .insert({ task_id: body.task_id, report_text: body.report_text ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { task_id: body.task_id, report: data };
  },

  listFiles: async (reportId: number) => {
    const { data, error } = await supabase.from('inspection_report_files').select('*').eq('report_id', reportId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  uploadFile: async (reportId: number, file: File, assetIds?: number[]) => {
    const path = `${reportId}/${Date.now()}_${file.name}`;
    const bucket = 'inspection-reports';
    const { data: storageData, error: storageError } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (storageError) throw new Error(storageError.message);
    const { data, error } = await supabase
      .from('inspection_report_files')
      .insert({
        report_id: reportId,
        file_path: storageData?.path ?? path,
        file_name: file.name,
        file_type: file.type,
        asset_id: assetIds?.[0] ?? null,
        uploaded_by: getSession()?.user_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  deleteFile: async (fileId: number) => {
    const { error } = await supabase.from('inspection_report_files').delete().eq('id', fileId);
    if (error) throw new Error(error.message);
    return null;
  },
};
