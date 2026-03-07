/**
 * Admin: manage inspection tasks (list, create, assign, approve, return).
 * Uses AG Grid with field_configurations for column layout.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { inspectionTasksApi, inspectionReportsApi, type InspectionTask } from '../lib/inspectionApi';
import { api } from '../lib/api';
import { notifyTaskAssigned, notifyTaskReturned } from '../lib/inspectionTaskNotifications';
import { getApiBaseUrl } from '../lib/appConfig';
import { useUserRole } from '../contexts/UserRoleContext';
import { getSession } from '../lib/usersTableAuth';
import { useFieldConfig } from '../lib/useFieldConfig';
import { useFieldConfigVersion } from '../contexts/FieldConfigContext';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import {
  ListTodo,
  Plus,
  Filter,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Building2,
  User,
  Calendar,
  ChevronDown,
  X,
  Image,
  Film,
  Ban,
  FileUp,
  Camera,
  Video,
} from 'lucide-react';

function fileDownloadUrl(filePath: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base ? base + '/' : ''}api/files/download?path=${encodeURIComponent(filePath)}`;
}

function isVideoFile(f: { file_type?: string | null; file_name?: string | null }): boolean {
  const t = (f.file_type ?? '').toLowerCase();
  const n = (f.file_name ?? '').toLowerCase();
  return t.startsWith('video/') || n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov');
}

const STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  in_inspector_handling: 'בטיפול', // legacy
  pending_approval: 'ממתין לאישור',
  approved: 'אושר',
  cancelled: 'בוטל',
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  created: 'נוצרה',
  taken: 'נלקחה',
  submitted: 'הוגש לאישור',
  returned: 'הוחזרה לפקח',
  approved: 'אושרה',
  cancelled: 'בוטלה',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
};

export function InspectionTasksManager() {
  const { isAdmin, isInspector } = useUserRole();
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterAssignedTo, setFilterAssignedTo] = useState<number | ''>('');
  const [users, setUsers] = useState<Array<{ user_id: number; user_name: string; user_role: string }>>([]);
  const [buildings, setBuildings] = useState<Array<{ building_number: number; building_number_in_street?: number }>>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBuildingNumber, setCreateBuildingNumber] = useState<string>('');
  const [createAssetIds, setCreateAssetIds] = useState<number[]>([]);
  const [assetsForBuilding, setAssetsForBuilding] = useState<Array<{ asset_id: number; main_asset_type?: string; asset_size?: number }>>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [createAssignedTo, setCreateAssignedTo] = useState<number | ''>('');
  const [createTitle, setCreateTitle] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [createPriority, setCreatePriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [creating, setCreating] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<InspectionTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [updatingTask, setUpdatingTask] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [previewModal, setPreviewModal] = useState<{ url: string; name: string; isVideo: boolean } | null>(null);
  const [detailReportText, setDetailReportText] = useState('');
  const [savingDetailReport, setSavingDetailReport] = useState(false);
  const [uploadingDetailFile, setUploadingDetailFile] = useState(false);
  const [detailUploadAssetIds, setDetailUploadAssetIds] = useState<number[]>([]);
  const [detailAssetsForUpload, setDetailAssetsForUpload] = useState<Array<{ asset_id: number; main_asset_type?: string; asset_size?: number }>>([]);
  const [detailAssetsLoading, setDetailAssetsLoading] = useState(false);

  useEffect(() => {
    if (detailTask) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setEditTitle((detailTask.title ?? '').toString());
      setEditNote(detailTask.note ?? '');
      setDetailReportText(detailTask.report?.report_text ?? '');
      setDetailUploadAssetIds([]);
      return () => { document.body.style.overflow = prev; };
    }
  }, [detailTask]);

  const loadDetailAssetsForUpload = async () => {
    if (!detailTask) return;
    const bn = detailTask.building_number;
    try {
      setDetailAssetsLoading(true);
      const list = await api.assets.getAll(bn);
      const all = (list || []).map((a: { asset_id: number; main_asset_type?: string; asset_size?: number }) => ({
        asset_id: a.asset_id,
        main_asset_type: a.main_asset_type,
        asset_size: a.asset_size,
      }));
      const taskIds = detailTask.asset_ids ?? [];
      setDetailAssetsForUpload(
        taskIds.length > 0 ? all.filter((a) => taskIds.includes(a.asset_id)) : all
      );
    } catch {
      setDetailAssetsForUpload([]);
    } finally {
      setDetailAssetsLoading(false);
    }
  };

  useEffect(() => {
    if (detailTask && isInspector && (detailTask.status === 'in_progress' || detailTask.status === 'pending_approval')) {
      loadDetailAssetsForUpload();
    } else {
      setDetailAssetsForUpload([]);
    }
  }, [detailTask?.id, detailTask?.status, detailTask?.asset_ids, isInspector]);

  const toggleDetailUploadAsset = (assetId: number) => {
    setDetailUploadAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const saveDetailReport = async () => {
    if (!detailTask) return;
    try {
      setSavingDetailReport(true);
      await inspectionReportsApi.upsert({ task_id: detailTask.id, report_text: detailReportText });
      const updated = await inspectionTasksApi.get(detailTask.id);
      setDetailTask(updated);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת דיווח');
    } finally {
      setSavingDetailReport(false);
    }
  };

  const uploadDetailFile = async (file: File) => {
    if (!detailTask) return;
    let reportId = detailTask.report?.id;
    if (!reportId) {
      await inspectionReportsApi.upsert({ task_id: detailTask.id, report_text: detailReportText });
      const updated = await inspectionTasksApi.get(detailTask.id);
      setDetailTask(updated);
      reportId = updated.report?.id;
      if (!reportId) return;
    }
    try {
      setUploadingDetailFile(true);
      const aids = detailUploadAssetIds.length > 0 ? detailUploadAssetIds : undefined;
      await inspectionReportsApi.uploadFile(reportId, file, aids);
      const updated = await inspectionTasksApi.get(detailTask.id);
      setDetailTask(updated);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת קובץ');
    } finally {
      setUploadingDetailFile(false);
    }
  };

  // Inspector: default to showing only their own tasks
  useEffect(() => {
    if (isInspector) {
      const s = getSession();
      if (s?.user_id) setFilterAssignedTo(s.user_id);
    }
  }, [isInspector]);

  const loadUsers = async () => {
    try {
      const list = await api.users.getAll();
      setUsers(list.map((u: { user_id: number; user_name: string; user_role: string }) => ({ user_id: u.user_id, user_name: u.user_name, user_role: u.user_role })));
    } catch {
      setUsers([]);
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { status?: string; assigned_to?: number } = {};
      if (filterStatus) params.status = filterStatus;
      if (filterAssignedTo !== '') params.assigned_to = Number(filterAssignedTo);
      const data = await inspectionTasksApi.list(params);
      setTasks(data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת משימות');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [filterStatus, filterAssignedTo]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadBuildings = async () => {
    try {
      setBuildingsLoading(true);
      const list = await api.buildings.getAll();
      setBuildings(
        (list || []).map((b: { building_number: number; building_number_in_street?: number }) => ({
          building_number: b.building_number,
          building_number_in_street: b.building_number_in_street,
        }))
      );
    } catch {
      setBuildings([]);
    } finally {
      setBuildingsLoading(false);
    }
  };

  useEffect(() => {
    if (createOpen && buildings.length === 0 && !buildingsLoading) loadBuildings();
  }, [createOpen]);

  const loadAssetsForBuilding = async (buildingNumber: number) => {
    try {
      setAssetsLoading(true);
      const list = await api.assets.getAll(buildingNumber);
      setAssetsForBuilding(
        (list || []).map((a: { asset_id: number; main_asset_type?: string; asset_size?: number }) => ({
          asset_id: a.asset_id,
          main_asset_type: a.main_asset_type,
          asset_size: a.asset_size,
        }))
      );
      setCreateAssetIds([]);
    } catch {
      setAssetsForBuilding([]);
      setCreateAssetIds([]);
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    if (createOpen && createBuildingNumber !== '') {
      const bn = parseInt(createBuildingNumber, 10);
      if (!Number.isNaN(bn)) loadAssetsForBuilding(bn);
    } else {
      setAssetsForBuilding([]);
      setCreateAssetIds([]);
    }
  }, [createOpen, createBuildingNumber]);

  const inspectors = users.filter((u) => u.user_role === 'inspector');

  // Row data for AG Grid (tasks + name lookups from users), newest first
  type TaskRow = InspectionTask & { assigned_to_name: string; created_by_name: string; approved_by_name: string };
  const rowData: TaskRow[] = useMemo(() => {
    const list = (tasks || []).map((t) => {
      const assignee = users.find((u) => u.user_id === t.assigned_to);
      const creator = users.find((u) => u.user_id === t.created_by);
      const approver = users.find((u) => u.user_id === t.approved_by);
      return {
        ...t,
        assigned_to_name: assignee?.user_name ?? '-',
        created_by_name: creator?.user_name ?? '-',
        approved_by_name: approver?.user_name ?? '-',
      };
    });
    return [...list].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da; // newest first
    });
  }, [tasks, users]);

  const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('he-IL') : '-');

  const configVersion = useFieldConfigVersion();
  const columnDefs: ColDef<TaskRow>[] = useMemo(() => [
    { field: 'id', colId: 'id', ...processColumnHeader('מזהה'), editable: false },
    { field: 'title', colId: 'title', ...processColumnHeader('כותרת'), editable: false },
    { field: 'building_number', colId: 'building_number', ...processColumnHeader('בניין'), editable: false },
    {
      field: 'asset_ids',
      colId: 'asset_ids',
      ...processColumnHeader('נכסים'),
      editable: false,
      valueFormatter: (p) => {
        const ids = p.value as number[] | null | undefined;
        return ids && ids.length > 0 ? ids.join(', ') : 'כל הבניין';
      },
    },
    { field: 'assigned_to_name', colId: 'assigned_to_name', ...processColumnHeader('פקח'), editable: false },
    {
      field: 'status',
      colId: 'status',
      ...processColumnHeader('סטטוס'),
      editable: false,
      valueFormatter: (p) => STATUS_LABELS[p.value ?? ''] ?? p.value,
    },
    {
      field: 'priority',
      colId: 'priority',
      ...processColumnHeader('עדיפות'),
      editable: false,
      valueFormatter: (p) => PRIORITY_LABELS[p.value ?? ''] ?? p.value ?? '-',
    },
    {
      field: 'created_at',
      colId: 'created_at',
      ...processColumnHeader('נוצר'),
      editable: false,
      valueFormatter: (p) => fmtDate(p.value),
    },
    { field: 'created_by_name', colId: 'created_by_name', ...processColumnHeader('נוצר ע"י'), editable: false },
    {
      field: 'updated_at',
      colId: 'updated_at',
      ...processColumnHeader('עודכן'),
      editable: false,
      valueFormatter: (p) => fmtDate(p.value),
    },
    {
      field: 'taken_at',
      colId: 'taken_at',
      ...processColumnHeader('נלקח'),
      editable: false,
      valueFormatter: (p) => fmtDate(p.value),
    },
    {
      field: 'submitted_at',
      colId: 'submitted_at',
      ...processColumnHeader('הוגש'),
      editable: false,
      valueFormatter: (p) => fmtDate(p.value),
    },
    {
      field: 'approved_at',
      colId: 'approved_at',
      ...processColumnHeader('אושר'),
      editable: false,
      valueFormatter: (p) => fmtDate(p.value),
    },
    { field: 'approved_by_name', colId: 'approved_by_name', ...processColumnHeader('אושר ע"י'), editable: false },
    {
      field: 'note',
      colId: 'note',
      ...processColumnHeader('הערה'),
      editable: false,
      wrapText: true,
    },
    {
      colId: 'actions',
      headerName: 'פעולות',
      editable: false,
      pinned: 'right',
      cellRenderer: (params: { data: TaskRow }) => {
        const t = params.data;
        if (!t) return null;
        return (
          <div className="flex gap-1 flex-wrap justify-end" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => openDetail(t)} className="text-theme-tab-active hover:underline text-xs">
              פרטים
            </button>
            {t.status === 'pending_approval' && isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleApprove(t.id)}
                  disabled={actioningId === t.id}
                  className="mr-2 text-green-600 hover:underline text-xs disabled:opacity-50"
                >
                  {actioningId === t.id ? '...' : 'אישור'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReturn(t.id, undefined, t)}
                  disabled={actioningId === t.id}
                  className="mr-2 text-amber-600 hover:underline text-xs disabled:opacity-50"
                >
                  החזר לפקח
                </button>
              </>
            )}
            {(t.status === 'new' || t.status === 'in_progress' || t.status === 'pending_approval') && isAdmin && (
              <button
                type="button"
                onClick={() => handleCancel(t.id)}
                disabled={actioningId === t.id}
                className="text-slate-600 hover:underline text-xs disabled:opacity-50"
              >
                {actioningId === t.id ? '...' : 'ביטול'}
              </button>
            )}
          </div>
        );
      },
    },
  ], [configVersion, actioningId, isAdmin]);
  const [configuredColumnDefs, fieldConfigLoading] = useFieldConfig(columnDefs, 'inspection-tasks-manager');

  const toggleCreateAsset = (assetId: number) => {
    setCreateAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const handleCreate = async () => {
    const bn = createBuildingNumber === '' ? 0 : parseInt(createBuildingNumber, 10);
    if (!bn || Number.isNaN(bn)) {
      setError('יש לבחור בניין');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const created = await inspectionTasksApi.create({
        building_number: bn,
        asset_ids: createAssetIds.length > 0 ? createAssetIds : undefined,
        title: createTitle || undefined,
        assigned_to: createAssignedTo === '' ? undefined : Number(createAssignedTo),
        note: createNote || undefined,
      });
      if (createAssignedTo !== '' && created?.id) {
        const assignedToId = Number(createAssignedTo);
        notifyTaskAssigned(assignedToId, created.id, created.title || `משימה #${created.id}`);
      }
      setCreateOpen(false);
      setCreateBuildingNumber('');
      setCreateAssetIds([]);
      setCreateAssignedTo('');
      setCreateTitle('');
      setCreateNote('');
      setCreatePriority('medium');
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה ביצירת משימה');
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async (taskId: number) => {
    try {
      setActioningId(taskId);
      await inspectionTasksApi.approve(taskId);
      setDetailTask(null);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה באישור');
    } finally {
      setActioningId(null);
    }
  };

  const handleReturn = async (taskId: number, comment?: string, taskForNotify?: InspectionTask) => {
    try {
      setActioningId(taskId);
      const taskBefore = taskForNotify ?? detailTask;
      await inspectionTasksApi.return(taskId, comment ? { comment } : undefined);
      if (taskBefore?.assigned_to) {
        notifyTaskReturned(taskBefore.assigned_to, taskId, taskBefore.title || `משימה #${taskId}`);
      }
      setReturnComment('');
      setDetailTask(null);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהחזרה');
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (taskId: number) => {
    try {
      setActioningId(taskId);
      await inspectionTasksApi.update(taskId, { status: 'cancelled' });
      setDetailTask(null);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בביטול');
    } finally {
      setActioningId(null);
    }
  };

  const openDetail = async (task: InspectionTask) => {
    try {
      const full = await inspectionTasksApi.get(task.id);
      setDetailTask(full);
    } catch {
      setDetailTask(task);
    }
  };

  const handleUpdateTask = async () => {
    if (!detailTask) return;
    const title = editTitle.trim() || undefined;
    const note = editNote.trim() || undefined;
    const hasChange = title !== (detailTask.title ?? '') || note !== (detailTask.note ?? '');
    if (!hasChange) return;
    try {
      setUpdatingTask(true);
      const updated = await inspectionTasksApi.update(detailTask.id, { title, note });
      setDetailTask(updated);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדכון משימה');
    } finally {
      setUpdatingTask(false);
    }
  };

  if (!isAdmin && !isInspector) {
    return (
      <div className="p-4 text-slate-600" dir="rtl">
        גישה זו זמינה למנהלים ולפקחים בלבד.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-xl font-semibold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
        <ListTodo className="h-6 w-6 text-theme-tab-active" />
        ניהול משימות ביקורת
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-slate-600">
          <Filter className="h-4 w-4" />
          סטטוס:
        </span>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">הכל</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {isAdmin && (
          <>
            <span className="text-slate-600">פקח:</span>
            <select
              value={filterAssignedTo === '' ? '' : String(filterAssignedTo)}
              onChange={(e) => setFilterAssignedTo(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">הכל</option>
              {inspectors.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setCreateBuildingNumber('');
                setCreateAssetIds([]);
                setCreateOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-theme-tab-active hover:bg-theme-tab-active-hover text-white rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              משימה חדשה
            </button>
          </>
        )}
        <button type="button" onClick={loadTasks} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50">
          <Loader2 className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading || fieldConfigLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 text-theme-tab-active animate-spin" />
        </div>
      ) : (
        <div className="ag-theme-alpine buildings-list-grid bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: 'calc(100vh - 320px)', minHeight: 300, width: '100%', minWidth: '100%', overflowX: 'auto', direction: 'rtl' }}>
          <AgGridReact<TaskRow>
            key={`inspection-tasks-grid-${configVersion}`}
            rowData={rowData}
            columnDefs={configuredColumnDefs}
            enableRtl={true}
            defaultColDef={{
              resizable: false,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              cellStyle: { textAlign: 'right', fontSize: '16px' },
              headerClass: 'buildings-list-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' },
              minWidth: 40,
            }}
            suppressColumnVirtualisation
            suppressMovableColumns
            onRowClicked={(e) => e.data && openDetail(e.data)}
            getRowId={(p) => String(p.data?.id ?? '')}
          />
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCreateOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">משימת ביקורת חדשה</h2>
            <div className="space-y-2">
              <label className="block text-sm text-slate-600">בניין *</label>
              <select
                value={createBuildingNumber}
                onChange={(e) => setCreateBuildingNumber(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                disabled={buildingsLoading}
              >
                <option value="">
                  {buildingsLoading ? 'טוען...' : 'בחר בניין'}
                </option>
                {buildings.map((b) => (
                  <option key={b.building_number} value={String(b.building_number)}>
                    {b.building_number_in_street != null
                      ? `מבנה ${b.building_number} (מס׳ ברחוב: ${b.building_number_in_street})`
                      : `מבנה ${b.building_number}`}
                  </option>
                ))}
              </select>
              {createBuildingNumber !== '' && (
                <>
                  <label className="block text-sm text-slate-600">נכסים (אופציונלי)</label>
                  <p className="text-xs text-slate-500 mb-1">לא נבחר = ביקורת לכל הבניין</p>
                  {assetsLoading ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> טוען נכסים...
                    </div>
                  ) : assetsForBuilding.length === 0 ? (
                    <p className="text-slate-500 text-sm py-1">אין נכסים במבנה זה</p>
                  ) : (
                    <div className="max-h-20 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                      {assetsForBuilding.map((a) => (
                        <label key={a.asset_id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 rounded px-2 py-1">
                          <input
                            type="checkbox"
                            checked={createAssetIds.includes(a.asset_id)}
                            onChange={() => toggleCreateAsset(a.asset_id)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm">
                            נכס {a.asset_id}
                            {a.main_asset_type != null ? ` (${a.main_asset_type})` : ''}
                            {a.asset_size != null ? ` — ${a.asset_size} מ"ר` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
              <label className="block text-sm text-slate-600">כותרת</label>
              <input
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                placeholder="אופציונלי"
              />
              <label className="block text-sm text-slate-600">הקצאה לפקח</label>
              <label className="block text-sm text-slate-600">עדיפות</label>
              <select
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value as 'high' | 'medium' | 'low')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-2"
              >
                <option value="high">גבוהה</option>
                <option value="medium">בינונית</option>
                <option value="low">נמוכה</option>
              </select>
              <label className="block text-sm text-slate-600">מוקצה לפקח</label>
              <select
                value={createAssignedTo === '' ? '' : String(createAssignedTo)}
                onChange={(e) => setCreateAssignedTo(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="">ללא הקצאה</option>
                {inspectors.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
                ))}
              </select>
              <label className="block text-sm text-slate-600">הערה</label>
              <textarea
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-2 border border-slate-300 rounded-lg">
                ביטול
              </button>
              <button type="button" onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-theme-tab-active text-white rounded-lg disabled:opacity-50">
                {creating ? 'יוצר...' : 'צור משימה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailTask && createPortal(
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/40" 
          style={{ inset: 0, overflow: 'hidden' }} 
          onClick={() => setDetailTask(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-lg w-full grid overflow-hidden" 
            style={{ 
              height: '80vh', 
              maxHeight: '80vh',
              gridTemplateRows: 'auto 1fr' 
            }} 
            dir="rtl" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start p-4 pb-2 border-b border-slate-100">
              <h2 className="text-lg font-semibold">משימה #{detailTask.id}</h2>
              <button type="button" onClick={() => setDetailTask(null)} className="p-1 text-slate-500 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-4 min-h-0">
            {(detailTask.status === 'new' || detailTask.status === 'in_progress' || detailTask.status === 'pending_approval') && (isAdmin || isInspector) && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <h3 className="text-sm font-medium text-slate-700">עריכת משימה</h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">כותרת</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="כותרת המשימה"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">הערה</label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="הערה"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUpdateTask}
                  disabled={updatingTask || (editTitle.trim() === (detailTask.title ?? '').trim() && editNote.trim() === (detailTask.note ?? '').trim())}
                  className="px-3 py-2 bg-theme-tab-active text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingTask ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            )}
            <p><Building2 className="inline h-4 w-4 ml-1" /> בניין: {detailTask.building_number}</p>
            <p><User className="inline h-4 w-4 ml-1" /> סטטוס: {STATUS_LABELS[detailTask.status] ?? detailTask.status}</p>
            {isInspector && (detailTask.status === 'in_progress' || detailTask.status === 'pending_approval') && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <label className="block text-sm font-medium text-slate-700">דיווח ביקורת</label>
                <textarea
                  value={detailReportText}
                  onChange={(e) => setDetailReportText(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                  placeholder="תאר את ממצאי הביקורת..."
                />
                <button
                  type="button"
                  onClick={saveDetailReport}
                  disabled={savingDetailReport}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm disabled:opacity-50"
                >
                  {savingDetailReport ? 'שומר...' : 'שמור דיווח'}
                </button>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">קשר לנכסים (לפני העלאה)</label>
                  <p className="text-xs text-slate-500 mb-1">בחר נכסים — הקבצים שיועלו ישתפו לכל הנכסים שבחרת</p>
                  {detailAssetsLoading ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> טוען...
                    </div>
                  ) : detailAssetsForUpload.length === 0 ? (
                    <p className="text-slate-500 text-sm py-1">אין נכסים במשימה / בבניין</p>
                  ) : (
                    <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-white">
                      {detailAssetsForUpload.map((a) => (
                        <label key={a.asset_id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1">
                          <input
                            type="checkbox"
                            checked={detailUploadAssetIds.includes(a.asset_id)}
                            onChange={() => toggleDetailUploadAsset(a.asset_id)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm">
                            נכס {a.asset_id}
                            {a.main_asset_type != null ? ` (${a.main_asset_type})` : ''}
                            {a.asset_size != null ? ` — ${a.asset_size} מ"ר` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="px-3 py-2 bg-theme-highlight hover:bg-theme-highlight/80 rounded-lg text-sm cursor-pointer flex items-center gap-1">
                    <FileUp className="h-4 w-4" />
                    {uploadingDetailFile ? 'מעלה...' : 'מגלריה / קבצים'}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files?.length) {
                          Array.from(files).forEach((f) => uploadDetailFile(f));
                        }
                        e.target.value = '';
                      }}
                      disabled={uploadingDetailFile}
                    />
                  </label>
                  <label className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 rounded-lg text-sm cursor-pointer flex items-center gap-1">
                    <Camera className="h-4 w-4" />
                    צלם תמונה
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDetailFile(f);
                        e.target.value = '';
                      }}
                      disabled={uploadingDetailFile}
                    />
                  </label>
                  <label className="px-3 py-2 bg-amber-100 hover:bg-amber-200 rounded-lg text-sm cursor-pointer flex items-center gap-1">
                    <Video className="h-4 w-4" />
                    הקלט וידאו
                    <input
                      type="file"
                      className="hidden"
                      accept="video/*"
                      capture="environment"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDetailFile(f);
                        e.target.value = '';
                      }}
                      disabled={uploadingDetailFile}
                    />
                  </label>
                </div>
              </div>
            )}
            {detailTask.report && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <h3 className="font-medium text-slate-700">דיווח</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{detailTask.report.report_text || '—'}</p>
                {detailTask.report.files && detailTask.report.files.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">קבצים מצורפים</h3>
                    <ul className="space-y-3">
                      {detailTask.report.files.map((f: { id: number; file_name: string | null; file_type?: string | null; file_path: string }) => {
                        const url = fileDownloadUrl(f.file_path);
                        const name = f.file_name ?? `קובץ ${f.id}`;
                        return (
                          <li key={f.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-slate-200 flex items-center justify-center p-0 border-0 cursor-pointer focus:ring-2 focus:ring-theme-action-accent focus:ring-offset-1"
                              onClick={() => setPreviewModal({ url, name, isVideo: isVideoFile(f) })}
                            >
                              {isVideoFile(f) ? (
                                <video src={url} className="w-full h-full object-cover pointer-events-none" preload="metadata" playsInline />
                              ) : (
                                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                              )}
                            </button>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p className="text-sm font-medium text-slate-800 truncate" title={name}>{name}</p>
                              <span className="text-xs text-slate-500">
                                {isVideoFile(f) ? <><Film className="inline h-3 w-3 ml-0.5" /> וידאו</> : <><Image className="inline h-3 w-3 ml-0.5" /> תמונה</>}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {detailTask.history && detailTask.history.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <h3 className="font-medium text-slate-700 mb-2">היסטוריה (תאריך, שעה, פעולה)</h3>
                <ul className="space-y-2 text-sm">
                  {detailTask.history.map((h: { id: number; created_at: string; action: string; comment_text: string | null }) => (
                    <li key={h.id} className="flex flex-col gap-0.5 p-2 bg-slate-50 rounded border border-slate-200">
                      <span className="text-slate-600 font-medium">
                        {new Date(h.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} – {HISTORY_ACTION_LABELS[h.action] ?? h.action}
                      </span>
                      {h.comment_text && <p className="text-slate-700 whitespace-pre-wrap">{h.comment_text}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(detailTask.status === 'new' || detailTask.status === 'in_progress' || detailTask.status === 'pending_approval') && isAdmin && (
              <div className="flex flex-wrap gap-2 mt-4">
                {detailTask.status === 'pending_approval' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApprove(detailTask.id)}
                      disabled={actioningId === detailTask.id}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> אישור והעברה לאוטומציה
                    </button>
                    <div className="flex flex-col gap-2 w-full">
                      <label className="text-sm text-slate-600">הערה להחזרה (אופציונלי)</label>
                      <textarea
                        value={returnComment}
                        onChange={(e) => setReturnComment(e.target.value)}
                        placeholder="הערה עם תאריך/שעה יתווספו אוטומטית"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        rows={2}
                      />
                      <button
                        type="button"
                        onClick={() => handleReturn(detailTask.id, returnComment.trim() || undefined)}
                        disabled={actioningId === detailTask.id}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm disabled:opacity-50 w-fit"
                      >
                        <RotateCcw className="h-4 w-4" /> החזר לפקח
                      </button>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleCancel(detailTask.id)}
                  disabled={actioningId === detailTask.id}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> ביטול משימה
                </button>
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {previewModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewModal(null)}
        >
          <div className="relative max-w-full max-h-full w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewModal(null)}
              className="absolute top-2 left-2 z-10 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white"
              aria-label="סגור"
            >
              <X className="h-6 w-6" />
            </button>
            <p className="absolute top-2 right-2 z-10 text-white text-sm truncate max-w-[70%] bg-black/50 px-2 py-1 rounded">
              {previewModal.name}
            </p>
            {previewModal.isVideo ? (
              <video
                src={previewModal.url}
                className="max-w-full max-h-full object-contain"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={previewModal.url}
                alt={previewModal.name}
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
