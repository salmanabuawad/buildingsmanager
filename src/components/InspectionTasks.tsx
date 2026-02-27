import { useEffect, useState, useRef, useMemo } from 'react';
import { api, InspectionTask, InspectionTaskStatus, InspectionReport, InspectionReportFile, InspectionTaskHistoryEntry, Building, Asset } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { getSession } from '../lib/usersTableAuth';
import { Loader2, RefreshCw, ClipboardList, AlertCircle, Plus, X, FileText, Paperclip, Camera, Send, Trash2, CheckCircle, RotateCcw, XCircle, Pencil } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useFieldConfig } from '../lib/useFieldConfig';

const STATUS_LABELS: Record<InspectionTaskStatus, string> = {
  new: 'חדש',
  in_progress: 'בביצוע',
  pending_approval: 'ממתין לאישור',
  approved: 'אושר',
  cancelled: 'בוטל',
};

const HISTORY_ACTION_LABELS: Record<InspectionTaskHistoryEntry['action'], string> = {
  created: 'נוצר',
  taken: 'התחיל משימה',
  submitted: 'נשלח לאישור',
  returned: 'הוחזר לפקח',
  approved: 'אושר',
  cancelled: 'בוטל',
};

function StatusBadge({ status }: { status: InspectionTaskStatus }) {
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-md text-sm font-medium ${
        status === 'approved'
          ? 'bg-green-100 text-green-800'
          : status === 'cancelled'
            ? 'bg-slate-100 text-slate-600'
            : status === 'pending_approval'
              ? 'bg-amber-100 text-amber-800'
              : status === 'in_progress'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-700'
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function StatusCellRenderer(props: ICellRendererParams<InspectionTask>) {
  return props.value ? <StatusBadge status={props.value as InspectionTaskStatus} /> : null;
}

interface UserOption {
  user_id: number;
  user_name: string;
  user_role: string;
}

function isImageType(type: string | null): boolean {
  if (!type) return false;
  return type.startsWith('image/');
}
function isVideoType(type: string | null): boolean {
  if (!type) return false;
  return type.startsWith('video/');
}

function FileRow({
  file,
  onDelete,
  onViewInModal,
  onRename,
  canRename,
}: {
  file: InspectionReportFile;
  onDelete?: () => void;
  onViewInModal?: (url: string, fileType: string | null) => void;
  onRename?: () => void;
  canRename?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(file.file_name || file.file_path || '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isImageType(file.file_type) && !isVideoType(file.file_type)) {
      setPreviewUrl(null);
      return;
    }
    api.inspectionReports.files
      .getSignedUrl(file.file_path)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file.file_path, file.file_type]);

  useEffect(() => {
    if (!isEditingName) setEditName(file.file_name || file.file_path || '');
  }, [file.file_name, file.file_path, isEditingName]);

  const handleSaveName = async () => {
    if (!canRename || !onRename) return;
    const name = editName.trim() || file.file_path;
    if (name === (file.file_name || file.file_path)) {
      setIsEditingName(false);
      return;
    }
    setRenaming(true);
    try {
      await api.inspectionReports.files.update(file.id, { file_name: name });
      setIsEditingName(false);
      onRename();
    } finally {
      setRenaming(false);
    }
  };

  const handleView = async () => {
    if (onViewInModal) {
      const url = previewUrl || (await api.inspectionReports.files.getSignedUrl(file.file_path));
      onViewInModal(url, file.file_type);
      return;
    }
    if (previewUrl) {
      window.open(previewUrl, '_blank');
      return;
    }
    setLoading(true);
    try {
      const url = await api.inspectionReports.files.getSignedUrl(file.file_path);
      window.open(url, '_blank');
    } finally {
      setLoading(false);
    }
  };
  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await api.inspectionReports.files.delete(file.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const isPreviewType = isImageType(file.file_type) || isVideoType(file.file_type);
  const previewLoading = isPreviewType && !previewUrl && !previewError;

  return (
    <li className="flex items-center gap-3 py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={handleView}
        disabled={loading || previewLoading}
        className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 touch-manipulation min-w-[64px] min-h-[64px]"
        aria-label="צפה בקובץ"
      >
        {previewLoading && (
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        )}
        {previewUrl && isImageType(file.file_type) && (
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        )}
        {previewUrl && isVideoType(file.file_type) && (
          <video src={previewUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        )}
        {(!isPreviewType || previewError) && !previewLoading && (
          <Paperclip className="w-6 h-6 text-slate-500" />
        )}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditingName ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              onBlur={handleSaveName}
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-300 rounded"
              autoFocus
              disabled={renaming}
            />
            {renaming && <Loader2 className="w-4 h-4 animate-spin text-slate-500 shrink-0" />}
          </>
        ) : (
          <span
            className={`text-sm text-slate-800 truncate ${canRename ? 'cursor-pointer hover:text-indigo-600' : ''}`}
            title={file.file_name || file.file_path}
            onClick={canRename ? () => setIsEditingName(true) : undefined}
          >
            {file.file_name || file.file_path}
          </span>
        )}
        {canRename && !isEditingName && (
          <button
            type="button"
            onClick={() => setIsEditingName(true)}
            className="shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-indigo-600 rounded"
            aria-label="שנה שם"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleView}
          disabled={loading || previewLoading}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-medium disabled:opacity-50 touch-manipulation"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'צפה'}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 touch-manipulation"
            aria-label="מחק"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </li>
  );
}

export function InspectionTasks() {
  const { isInspector, isAdmin } = useUserRole();
  const canCreateTasks = !isInspector; // admin and editor can create; inspector cannot
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [inspectors, setInspectors] = useState<UserOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [buildingAssets, setBuildingAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', building_number: '' as number | '', assigned_to: '' as number | '', note: '', asset_ids: [] as number[] });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<InspectionTask | null>(null);
  const [detailReport, setDetailReport] = useState<InspectionReport | null>(null);
  const [detailFiles, setDetailFiles] = useState<InspectionReportFile[]>([]);
  const [detailHistory, setDetailHistory] = useState<InspectionTaskHistoryEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0);
  const [reportEditText, setReportEditText] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [saveReportSaving, setSaveReportSaving] = useState(false);
  const [takeSaving, setTakeSaving] = useState(false);
  const [submitSaving, setSubmitSaving] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [taskAssets, setTaskAssets] = useState<Asset[]>([]);
  const [uploadAssetId, setUploadAssetId] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Files uploaded this session (by task id) so they stay visible even if state/effect overwrites */
  const optimisticFilesRef = useRef<Map<number, InspectionReportFile[]>>(new Map());
  /** State-based list of files just uploaded (forces re-render so file appears immediately) */
  const [sessionUploadedFiles, setSessionUploadedFiles] = useState<InspectionReportFile[]>([]);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<InspectionReportFile | null>(null);
  const [viewFileUrl, setViewFileUrl] = useState<string | null>(null);
  const [viewFileType, setViewFileType] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [approveSaving, setApproveSaving] = useState(false);
  const [returnSaving, setReturnSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [editTaskSaving, setEditTaskSaving] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskBuildingNumber, setEditTaskBuildingNumber] = useState<number | ''>('');
  const [editTaskAssignedTo, setEditTaskAssignedTo] = useState<number | ''>('');
  const [editTaskNote, setEditTaskNote] = useState('');
  const [editTaskAssetIds, setEditTaskAssetIds] = useState<number[]>([]);
  const [adminEditBuildingAssets, setAdminEditBuildingAssets] = useState<Asset[]>([]);

  const gridRef = useRef<AgGridReact<InspectionTask>>(null);

  const taskListColumnDefs = useMemo<ColDef<InspectionTask>[]>(() => {
    const dateFmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('he-IL') : '—');
    const userName = (id: number | null | undefined, users: UserOption[]) => {
      if (id == null) return '—';
      const u = users.find((i) => i.user_id === id);
      const name = u?.user_name?.trim();
      return name ? name : String(id);
    };
    return [
      { field: 'id', headerName: 'מזהה', width: 90, type: 'numericColumn', filter: 'agNumberColumnFilter' },
      { field: 'title', headerName: 'כותרת', flex: 1, minWidth: 140 },
      { field: 'building_number', headerName: 'מבנה', width: 100, type: 'numericColumn', filter: 'agNumberColumnFilter' },
      {
        field: 'asset_ids',
        headerName: 'נכסים',
        width: 90,
        valueFormatter: (params) => (params.value?.length ? `${params.value.length} נכסים` : '—'),
        filter: true,
      },
      {
        field: 'assigned_to',
        headerName: 'מוקצה אל',
        width: 120,
        valueGetter: (params) => userName(params.data?.assigned_to, allUsers),
        filter: true,
      },
      { field: 'status', headerName: 'סטטוס', width: 130, cellRenderer: StatusCellRenderer, filter: true },
      {
        field: 'note',
        headerName: 'הערה',
        width: 140,
        valueFormatter: (params) => {
          const s = params.value?.trim();
          return s ? (s.length > 25 ? s.slice(0, 25) + '…' : s) : '—';
        },
        tooltipValueGetter: (params) => params.value?.trim() || undefined,
        filter: true,
      },
      { field: 'created_at', headerName: 'נוצר', width: 110, valueFormatter: (params) => dateFmt(params.value), filter: 'agDateColumnFilter' },
      { field: 'created_by', headerName: 'נוצר על ידי', width: 120, valueGetter: (params) => userName(params.data?.created_by, allUsers), filter: true },
      { field: 'updated_at', headerName: 'עודכן', width: 110, valueFormatter: (params) => dateFmt(params.value), filter: 'agDateColumnFilter' },
      { field: 'taken_at', headerName: 'התחיל', width: 110, valueFormatter: (params) => dateFmt(params.value), filter: 'agDateColumnFilter' },
      { field: 'submitted_at', headerName: 'נשלח לאישור', width: 110, valueFormatter: (params) => dateFmt(params.value), filter: 'agDateColumnFilter' },
      { field: 'approved_at', headerName: 'אושר', width: 110, valueFormatter: (params) => dateFmt(params.value), filter: 'agDateColumnFilter' },
      { field: 'approved_by', headerName: 'אושר על ידי', width: 120, valueGetter: (params) => userName(params.data?.approved_by, allUsers), filter: true },
    ];
  }, [allUsers]);

  const configuredTaskListColumnDefs = useFieldConfig(taskListColumnDefs, 'inspection-tasks');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await api.inspectionTasks.getAll();
      setTasks(list);
    } catch (err) {
      console.error('Error fetching inspection tasks:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת משימות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Load all users for grid name resolution (assigned_to, created_by, approved_by); inspectors for dropdowns
  useEffect(() => {
    api.users.getAll().then((uList) => {
      const list = uList as UserOption[];
      setAllUsers(list);
      if (!isInspector) {
        setInspectors(list.filter((u) => u.user_role === 'inspector'));
      }
    }).catch(() => {});
  }, [isInspector]);

  // Load task detail when a task is clicked or after a mutation
  useEffect(() => {
    if (selectedTaskId == null) {
      setDetailTask(null);
      setDetailReport(null);
      setDetailFiles([]);
      setDetailHistory([]);
      setDetailError(null);
      setReportEditText('');
      setSubmitComment('');
      setReturnNote('');
      optimisticFilesRef.current.clear();
      setSessionUploadedFiles([]);
      setUploadSuccessMsg(null);
      setLastUploadedFile(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const [task, report, history] = await Promise.all([
          api.inspectionTasks.getOne(selectedTaskId),
          api.inspectionReports.getByTaskId(selectedTaskId),
          api.inspectionTasks.getHistory(selectedTaskId),
        ]);
        if (cancelled) return;
        setDetailTask(task ?? null);
        setDetailReport(report ?? null);
        setDetailHistory(history ?? []);
        setReportEditText(report?.report_text ?? '');
        if (report) {
          const files = await api.inspectionReports.files.list(report.id);
          if (!cancelled) {
            setDetailFiles((prev) =>
              files.length > 0 ? files : prev.length > 0 ? prev : []
            );
            if (files.length > 0) setLastUploadedFile(null);
          }
        } else {
          setDetailFiles([]);
        }
      } catch (err) {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'שגיאה בטעינת פרטי המשימה');
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId, detailRefreshTrigger]);

  // Load task assets for file-upload and (for admin) edit-form asset selector
  useEffect(() => {
    const session = getSession();
    const inspectorAssigned = isInspector && detailTask && session?.user_id === detailTask.assigned_to;
    if (!selectedTaskId || !detailTask || (!inspectorAssigned && !isAdmin)) {
      setTaskAssets([]);
      return;
    }
    api.inspectionTasks.getAssetsForFileSelection(selectedTaskId).then(setTaskAssets).catch(() => setTaskAssets([]));
  }, [selectedTaskId, detailTask?.id, detailTask?.assigned_to, isInspector, isAdmin]);

  useEffect(() => {
    if (!createModalOpen || !canCreateTasks) return;
    const load = async () => {
      try {
        const [bList, uList] = await Promise.all([api.buildings.getAll(), api.users.getAll()]);
        setBuildings(bList);
        setInspectors((uList as UserOption[]).filter((u) => u.user_role === 'inspector' && u.user_name));
      } catch (e) {
        console.error('Load buildings/users for create task:', e);
      }
    };
    load();
  }, [createModalOpen, canCreateTasks]);

  // Load buildings + inspectors when admin opens a task (for edit form)
  useEffect(() => {
    if (!isAdmin || !selectedTaskId) return;
    const load = async () => {
      try {
        const [bList, uList] = await Promise.all([api.buildings.getAll(), api.users.getAll()]);
        setBuildings((prev) => (prev.length > 0 ? prev : bList));
        setInspectors((prev) => (prev.length > 0 ? prev : (uList as UserOption[]).filter((u) => u.user_role === 'inspector' && u.user_name)));
      } catch (e) {
        console.error('Load buildings/users for admin edit task:', e);
      }
    };
    load();
  }, [isAdmin, selectedTaskId]);

  // Init edit form from detailTask (admin: all fields; inspector: when in_progress and assigned to me)
  useEffect(() => {
    if (!detailTask) return;
    const session = getSession();
    const inspectorCanEdit = isInspector && session?.user_id === detailTask.assigned_to && detailTask.status === 'in_progress';
    if (!isAdmin && !inspectorCanEdit) return;
    setEditTaskTitle(detailTask.title);
    setEditTaskNote(detailTask.note ?? '');
    if (isAdmin) {
      setEditTaskBuildingNumber(detailTask.building_number);
      setEditTaskAssignedTo(detailTask.assigned_to ?? '');
      setEditTaskAssetIds(detailTask.asset_ids ?? []);
    }
  }, [detailTask?.id, detailTask?.title, detailTask?.building_number, detailTask?.assigned_to, detailTask?.note, detailTask?.asset_ids, detailTask?.status, isAdmin, isInspector]);

  // Load building assets for admin edit form (asset_ids selector)
  useEffect(() => {
    const buildingNumber = editTaskBuildingNumber === '' ? detailTask?.building_number : editTaskBuildingNumber;
    if (!isAdmin || buildingNumber === undefined || buildingNumber === '') {
      setAdminEditBuildingAssets([]);
      return;
    }
    const num = typeof buildingNumber === 'number' ? buildingNumber : Number(buildingNumber);
    if (Number.isNaN(num)) return;
    api.assets.getAll(num).then(setAdminEditBuildingAssets).catch(() => setAdminEditBuildingAssets([]));
  }, [isAdmin, editTaskBuildingNumber, detailTask?.building_number]);

  const openCreateModal = () => {
    setCreateError(null);
    setCreateForm({ title: '', building_number: '', assigned_to: '', note: '', asset_ids: [] });
    setBuildingAssets([]);
    setCreateModalOpen(true);
  };

  const session = getSession();
  const displayFiles = (() => {
    const fromServer = detailFiles;
    const reportId = detailReport?.id;
    const fromSession = reportId != null
      ? sessionUploadedFiles.filter((f) => f.report_id === reportId)
      : [];
    const fromRef = selectedTaskId != null ? optimisticFilesRef.current.get(selectedTaskId) || [] : [];
    const serverIds = new Set(fromServer.map((f) => f.id));
    const sessionExtra = fromSession.filter((f) => !serverIds.has(f.id));
    const refExtra = fromRef.filter((f) => !serverIds.has(f.id));
    const seen = new Set(serverIds);
    for (const f of sessionExtra) seen.add(f.id);
    const refOnly = refExtra.filter((f) => !seen.has(f.id));
    let list: InspectionReportFile[] = [...sessionExtra, ...refOnly, ...fromServer];
    if (lastUploadedFile && reportId != null && lastUploadedFile.report_id === reportId && !seen.has(lastUploadedFile.id)) {
      list = [lastUploadedFile, ...list];
    }
    return list;
  })();

  const canInspectorEdit =
    isInspector &&
    detailTask &&
    session?.user_id === detailTask.assigned_to &&
    (detailTask.status === 'new' || detailTask.status === 'in_progress');

  const canAdminActOnTask = isAdmin && detailTask?.status === 'pending_approval';

  /** Admin can edit task and report at any time. */
  const canEditTaskOrReport = canInspectorEdit || isAdmin;
  /** Inspector can edit task metadata only after starting the task (in_progress). */
  const canInspectorEditTask = canInspectorEdit && detailTask?.status === 'in_progress';
  const canShowEditTaskForm = isAdmin || canInspectorEditTask;

  const refreshDetail = () => {
    setDetailRefreshTrigger((t) => t + 1);
  };

  const refreshFilesOnly = async () => {
    if (selectedTaskId == null || !detailReport) return;
    try {
      const files = await api.inspectionReports.files.list(detailReport.id);
      setDetailFiles(files);
      if (files.length > 0) setLastUploadedFile(null);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה ברענון רשימת הקבצים');
    }
  };

  const handleSaveReport = async () => {
    if (selectedTaskId == null) return;
    setSaveReportSaving(true);
    setDetailError(null);
    try {
      await api.inspectionReports.upsert(selectedTaskId, reportEditText);
      refreshDetail();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בשמירת הדוח');
    } finally {
      setSaveReportSaving(false);
    }
  };

  const handleSaveTask = async () => {
    if (selectedTaskId == null || !isAdmin) return;
    const buildingNumber = editTaskBuildingNumber === '' ? undefined : Number(editTaskBuildingNumber);
    if (buildingNumber !== undefined && Number.isNaN(buildingNumber)) return;
    setEditTaskSaving(true);
    setDetailError(null);
    try {
      const updated = await api.inspectionTasks.update(selectedTaskId, {
        title: editTaskTitle.trim(),
        building_number: buildingNumber,
        assigned_to: editTaskAssignedTo === '' ? null : editTaskAssignedTo,
        note: editTaskNote.trim() || null,
        asset_ids: editTaskAssetIds.length > 0 ? editTaskAssetIds : null,
      });
      setDetailTask(updated);
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בשמירת המשימה');
    } finally {
      setEditTaskSaving(false);
    }
  };

  const handleTakeTask = async () => {
    if (selectedTaskId == null) return;
    setTakeSaving(true);
    setDetailError(null);
    try {
      await api.inspectionTasks.takeTask(selectedTaskId);
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בהתחלת המשימה');
    } finally {
      setTakeSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (selectedTaskId == null) return;
    setSubmitSaving(true);
    setDetailError(null);
    try {
      await api.inspectionTasks.submitForApproval(selectedTaskId, submitComment);
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בשליחה לאישור');
    } finally {
      setSubmitSaving(false);
    }
  };

  const handleApprove = async () => {
    if (selectedTaskId == null) return;
    setApproveSaving(true);
    setDetailError(null);
    try {
      await api.inspectionTasks.approveTask(selectedTaskId);
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה באישור המשימה');
    } finally {
      setApproveSaving(false);
    }
  };

  const handleReturnToInspector = async () => {
    if (selectedTaskId == null) return;
    setReturnSaving(true);
    setDetailError(null);
    try {
      await api.inspectionTasks.returnToInspector(selectedTaskId, returnNote);
      setReturnNote('');
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בהחזרה לפקח');
    } finally {
      setReturnSaving(false);
    }
  };

  const handleCancelTask = async () => {
    if (selectedTaskId == null) return;
    if (!window.confirm('לבטל את המשימה? לא ניתן לשחזר.')) return;
    setCancelSaving(true);
    setDetailError(null);
    try {
      await api.inspectionTasks.cancelTask(selectedTaskId);
      refreshDetail();
      fetchTasks();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בדחיית המשימה');
    } finally {
      setCancelSaving(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || selectedTaskId == null) return;
    if (uploadAssetId === '') {
      setDetailError('יש לבחור נכס לפני העלאת תמונה או וידאו');
      return;
    }
    setFileUploading(true);
    setDetailError(null);
    try {
      let report = await api.inspectionReports.getByTaskId(selectedTaskId);
      if (!report) {
        report = await api.inspectionReports.upsert(selectedTaskId, reportEditText || null);
        setDetailReport(report);
      }
      const assetId = Number(uploadAssetId);
      const raw = await api.inspectionReports.files.upload(report.id, file, assetId);
      const uploaded: InspectionReportFile = {
        id: Number((raw as Record<string, unknown>).id) || -Date.now(),
        report_id: Number((raw as Record<string, unknown>).report_id) ?? report.id,
        asset_id: (raw as Record<string, unknown>).asset_id != null ? Number((raw as Record<string, unknown>).asset_id) : null,
        file_path: String((raw as Record<string, unknown>).file_path ?? ''),
        file_name: (raw as Record<string, unknown>).file_name != null ? String((raw as Record<string, unknown>).file_name) : file.name,
        file_type: (raw as Record<string, unknown>).file_type != null ? String((raw as Record<string, unknown>).file_type) : file.type ?? null,
        uploaded_at: String((raw as Record<string, unknown>).uploaded_at ?? new Date().toISOString()),
        uploaded_by: (raw as Record<string, unknown>).uploaded_by != null ? Number((raw as Record<string, unknown>).uploaded_by) : null,
      };
      const tid = selectedTaskId;
      optimisticFilesRef.current.set(tid, [
        uploaded,
        ...(optimisticFilesRef.current.get(tid) || []),
      ]);
      setSessionUploadedFiles((prev) => [uploaded, ...prev]);
      setDetailFiles((prev) => [uploaded, ...prev]);
      setUploadSuccessMsg(`הקובץ "${file.name}" הועלה בהצלחה`);
      setTimeout(() => setUploadSuccessMsg(null), 4000);
      setLastUploadedFile(uploaded);
      // Do NOT call refreshDetail() here - it can refetch before DB replicates and overwrite with []
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'שגיאה בהעלאת הקובץ';
      setDetailError(msg);
      console.error('Inspection report file upload failed:', err);
    } finally {
      setFileUploading(false);
    }
  };

  // When building is selected, load its assets for optional selection
  useEffect(() => {
    const bn = createForm.building_number;
    if (bn === '' || isNaN(Number(bn))) {
      setBuildingAssets([]);
      setCreateForm((f) => (f.asset_ids.length ? { ...f, asset_ids: [] } : f));
      return;
    }
    setAssetsLoading(true);
    api.assets
      .getAll(Number(bn))
      .then((list) => {
        setBuildingAssets(list || []);
        setCreateForm((f) => ({ ...f, asset_ids: [] }));
      })
      .catch(() => setBuildingAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [createForm.building_number]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bn = typeof createForm.building_number === 'number' ? createForm.building_number : Number(createForm.building_number);
    if (!createForm.title.trim() || !bn || isNaN(bn)) {
      setCreateError('יש למלא כותרת ומבנה');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await api.inspectionTasks.create({
        title: createForm.title.trim(),
        building_number: bn,
        asset_ids: createForm.asset_ids.length > 0 ? createForm.asset_ids : undefined,
        assigned_to: createForm.assigned_to === '' ? undefined : Number(createForm.assigned_to),
        note: createForm.note.trim() || undefined,
      });
      setCreateModalOpen(false);
      await fetchTasks();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'שגיאה ביצירת משימה');
    } finally {
      setCreateSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] safe-area-pb" dir="rtl">
        <div className="text-center px-4">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-base">טוען משימות ביקורת...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 pb-safe" dir="rtl">
        <div className="flex flex-col gap-3 text-red-700 bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-base flex-1">{error}</span>
          </div>
          <button
            onClick={fetchTasks}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 text-red-800 bg-white border border-red-200 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors text-base font-medium"
          >
            <RefreshCw className="w-5 h-5" /> נסה שוב
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-safe min-h-[60vh] flex flex-col" dir="rtl">
      {/* Header: stacked on mobile, row on desktop; touch-friendly buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2 min-h-[44px] items-center">
          <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-600 shrink-0" />
          <span className="text-base sm:text-xl">{isInspector ? 'משימות והעלאות' : 'ניהול משימות ביקורת'}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateTasks && (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl text-base font-medium touch-manipulation"
            >
              <Plus className="w-5 h-5" /> משימה חדשה
            </button>
          )}
          <button
            type="button"
            onClick={fetchTasks}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 w-full sm:w-auto text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-base font-medium touch-manipulation"
          >
            <RefreshCw className="w-5 h-5" /> רענן
          </button>
        </div>
      </div>

      {/* Create Task modal (admin only) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl" onClick={() => !createSaving && setCreateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">משימת ביקורת חדשה</h3>
              <button type="button" onClick={() => !createSaving && setCreateModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="סגור">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">כותרת *</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base"
                  placeholder="כותרת המשימה"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מבנה *</label>
                <select
                  value={createForm.building_number === '' ? '' : String(createForm.building_number)}
                  onChange={(e) => setCreateForm((f) => ({ ...f, building_number: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base"
                  required
                >
                  <option value="">בחר מבנה</option>
                  {buildings.map((b) => (
                    <option key={b.building_number} value={b.building_number}>
                      מבנה {b.building_number}
                      {b.address != null ? ` — ${b.address}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">נכסים (אופציונלי)</label>
                {createForm.building_number === '' || createForm.building_number === undefined ? (
                  <p className="text-slate-500 text-sm">בחר מבנה כדי לבחור נכסים</p>
                ) : assetsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin" /> טוען נכסים...
                  </div>
                ) : buildingAssets.length === 0 ? (
                  <p className="text-slate-500 text-sm">אין נכסים במבנה זה</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg max-h-[180px] overflow-y-auto p-2 space-y-1.5">
                    {buildingAssets.map((asset) => {
                      const checked = createForm.asset_ids.includes(asset.asset_id);
                      return (
                        <label
                          key={asset.asset_id}
                          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer min-h-[44px]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setCreateForm((f) => ({
                                ...f,
                                asset_ids: checked ? f.asset_ids.filter((id) => id !== asset.asset_id) : [...f.asset_ids, asset.asset_id],
                              }));
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span className="text-sm text-slate-800">
                            נכס {asset.asset_id}
                            {asset.payer_id ? ` (${asset.payer_id})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">פקח (מוקצה אל)</label>
                <select
                  value={createForm.assigned_to === '' ? '' : String(createForm.assigned_to)}
                  onChange={(e) => setCreateForm((f) => ({ ...f, assigned_to: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base"
                >
                  <option value="">ללא הקצאה</option>
                  {inspectors.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.user_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">הערה</label>
                <textarea
                  value={createForm.note}
                  onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base min-h-[80px]"
                  placeholder="הערה (אופציונלי)"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createSaving}
                  className="flex-1 min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {createSaving ? 'יוצר...' : 'צור משימה'}
                </button>
                <button
                  type="button"
                  onClick={() => !createSaving && setCreateModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg font-medium"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task detail modal — opens when clicking a task */}
      {selectedTaskId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          dir="rtl"
          onClick={() => setSelectedTaskId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-bold text-slate-800">פרטי משימה</h3>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="p-2 rounded-lg hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              {detailLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                </div>
              )}
              {uploadSuccessMsg && (
                <div className="flex items-center gap-2 text-green-800 bg-green-100 border border-green-300 rounded-lg p-3 text-sm mb-4 font-medium">
                  {uploadSuccessMsg}
                </div>
              )}
              {detailError && (
                <div className="flex items-center gap-2 text-red-700 bg-red-100 border-2 border-red-300 rounded-lg p-4 text-sm mb-4 font-medium">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {detailError}
                </div>
              )}
              {!detailLoading && detailTask && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="font-semibold text-slate-800 text-base">{detailTask.title}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                      <span>מזהה #{detailTask.id}</span>
                      <span>מבנה {detailTask.building_number}</span>
                      <StatusBadge status={detailTask.status} />
                    </div>
                    {detailTask.note && (
                      <p className="text-slate-600 text-sm border-t border-slate-100 pt-2 mt-2">{detailTask.note}</p>
                    )}
                    {detailTask.created_at && (
                      <p className="text-slate-500 text-xs">
                        נוצר: {new Date(detailTask.created_at).toLocaleString('he-IL')}
                      </p>
                    )}
                  </div>
                  {canShowEditTaskForm && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-700">{isAdmin ? 'עריכת משימה (מנהל)' : 'עריכת משימה'}</h4>
                      <div className="grid grid-cols-1 gap-3 text-sm">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">כותרת</label>
                          <input
                            type="text"
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            dir="rtl"
                          />
                        </div>
                        {isAdmin && (
                          <>
                            <div>
                              <label className="block font-medium text-slate-700 mb-1">מבנה</label>
                              <select
                                value={editTaskBuildingNumber === '' ? '' : String(editTaskBuildingNumber)}
                                onChange={(e) => {
                                  setEditTaskBuildingNumber(e.target.value === '' ? '' : Number(e.target.value));
                                  setEditTaskAssetIds([]);
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                              >
                                <option value="">בחר מבנה</option>
                                {buildings.map((b) => (
                                  <option key={b.building_number} value={b.building_number}>
                                    מבנה {b.building_number}
                                    {b.address != null ? ` — ${b.address}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block font-medium text-slate-700 mb-1">פקח (מוקצה אל)</label>
                              <select
                                value={editTaskAssignedTo === '' ? '' : String(editTaskAssignedTo)}
                                onChange={(e) => setEditTaskAssignedTo(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                              >
                                <option value="">ללא הקצאה</option>
                                {inspectors.map((u) => (
                                  <option key={u.user_id} value={u.user_id}>
                                    {u.user_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block font-medium text-slate-700 mb-1">נכסים (אופציונלי)</label>
                              {adminEditBuildingAssets.length === 0 ? (
                                <p className="text-slate-500 text-xs">בחר מבנה כדי לבחור נכסים</p>
                              ) : (
                                <div className="border border-slate-200 rounded-lg max-h-[160px] overflow-y-auto p-2 space-y-1.5">
                                  {adminEditBuildingAssets.map((asset) => {
                                    const checked = editTaskAssetIds.includes(asset.asset_id);
                                    return (
                                      <label
                                        key={asset.asset_id}
                                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer min-h-[40px]"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            setEditTaskAssetIds((prev) =>
                                              checked ? prev.filter((id) => id !== asset.asset_id) : [...prev, asset.asset_id]
                                            );
                                          }}
                                          className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                                        />
                                        <span className="text-slate-800">
                                          נכס {asset.asset_id}
                                          {asset.payer_id ? ` (${asset.payer_id})` : ''}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">הערה</label>
                          <textarea
                            value={editTaskNote}
                            onChange={(e) => setEditTaskNote(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg min-h-[70px]"
                            dir="rtl"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveTask}
                          disabled={editTaskSaving}
                          className="min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 touch-manipulation"
                        >
                          {editTaskSaving ? <Loader2 className="w-4 h-4 animate-spin inline ml-1" /> : null} שמור שינויים במשימה
                        </button>
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                      <FileText className="w-4 h-4" /> דוח
                    </h4>
                    {canEditTaskOrReport ? (
                      <div className="space-y-2">
                        <textarea
                          value={reportEditText}
                          onChange={(e) => setReportEditText(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[120px]"
                          placeholder="כתוב את תוכן הדוח..."
                          dir="rtl"
                        />
                        <button
                          type="button"
                          onClick={handleSaveReport}
                          disabled={saveReportSaving}
                          className="min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 touch-manipulation"
                        >
                          {saveReportSaving ? <Loader2 className="w-4 h-4 animate-spin inline ml-1" /> : null} שמור דוח
                        </button>
                      </div>
                    ) : detailReport ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 text-sm whitespace-pre-wrap min-h-[80px]">
                        {detailReport.report_text?.trim() || 'אין תוכן דוח.'}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">טרם נוצר דוח למשימה זו.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Paperclip className="w-4 h-4" /> קבצים ({displayFiles.length})
                      </h4>
                      {detailReport && (
                        <button
                          type="button"
                          onClick={refreshFilesOnly}
                          className="text-xs text-indigo-600 hover:underline min-h-[32px] px-2"
                        >
                          רענן רשימה
                        </button>
                      )}
                    </div>
                    {canEditTaskOrReport && (
                      <div className="mb-3 space-y-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,video/*"
                          capture="environment"
                          onChange={handleFileSelect}
                          className="hidden"
                          aria-hidden
                        />
                        {taskAssets.length === 0 ? (
                          <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                            אין נכסים במשימה או במבנה — לא ניתן להעלות תמונות/וידאו. פנה למנהל להגדרת נכסים.
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-sm font-medium text-slate-700 shrink-0">נכס (חובה להעלאה)</label>
                            <select
                              value={uploadAssetId === '' ? '' : String(uploadAssetId)}
                              onChange={(e) => {
                                setUploadAssetId(e.target.value === '' ? '' : Number(e.target.value));
                                setDetailError(null);
                              }}
                              className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              required
                            >
                              <option value="">בחר נכס</option>
                              {taskAssets.map((a) => (
                                <option key={a.asset_id} value={a.asset_id}>
                                  נכס {a.asset_id}
                                  {a.payer_id ? ` (${a.payer_id})` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={fileUploading || uploadAssetId === ''}
                              className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-sm font-medium"
                            >
                              {fileUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                              {fileUploading ? 'מעלה...' : 'הוסף תמונה/וידאו'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {displayFiles.length === 0 ? (
                      <p className="text-slate-500 text-sm">אין קבצים מועלים.</p>
                    ) : (
                      <ul className="space-y-2">
                        {displayFiles.map((f) => (
                          <FileRow
                            key={f.id}
                            file={f}
                            onDelete={(canInspectorEdit || isAdmin) ? refreshDetail : undefined}
                            onViewInModal={(url, type) => {
                              setViewFileUrl(url);
                              setViewFileType(type);
                            }}
                            canRename={canInspectorEdit || isAdmin}
                            onRename={refreshDetail}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                  {detailHistory.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-700">היסטוריה והערות</h4>
                      <ul className="space-y-3">
                        {detailHistory.map((h) => (
                          <li key={h.id} className="text-sm border-r-2 border-slate-200 pr-2" dir="rtl">
                            <span className="font-medium text-slate-700">{HISTORY_ACTION_LABELS[h.action]}</span>
                            <span className="text-slate-500 mx-1">—</span>
                            <span className="text-slate-600">{new Date(h.created_at).toLocaleString('he-IL')}</span>
                            {h.comment_text && (
                              <p className="mt-1 text-slate-700 bg-slate-50 rounded p-2">{h.comment_text}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {canInspectorEdit && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">הערה עם שליחה לאישור (אופציונלי)</label>
                        <textarea
                          value={submitComment}
                          onChange={(e) => setSubmitComment(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[70px]"
                          placeholder="הוסף הערה..."
                          dir="rtl"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {detailTask.status === 'new' && (
                          <button
                            type="button"
                            onClick={handleTakeTask}
                            disabled={takeSaving}
                            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 touch-manipulation"
                          >
                            {takeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} התחל משימה
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSubmitForApproval}
                          disabled={submitSaving}
                          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 touch-manipulation"
                        >
                          {submitSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} שלח לאישור
                        </button>
                      </div>
                    </div>
                  )}
                  {canAdminActOnTask && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-700">פעולות מנהל (ממתין לאישור)</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">הערה להחזרה לפקח (אופציונלי)</label>
                        <textarea
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[70px]"
                          placeholder="הוסף הערה לפקח כשמחזירים את המשימה..."
                          dir="rtl"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleApprove}
                          disabled={approveSaving || returnSaving || cancelSaving}
                          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 touch-manipulation"
                        >
                          {approveSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} אשר משימה
                        </button>
                        <button
                          type="button"
                          onClick={handleReturnToInspector}
                          disabled={returnSaving || approveSaving || cancelSaving}
                          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 touch-manipulation"
                        >
                          {returnSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} החזר לפקח
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelTask}
                          disabled={cancelSaving || approveSaving || returnSaving}
                          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 touch-manipulation"
                        >
                          {cancelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} דחה משימה
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View file modal — image/video or open in new tab */}
      {viewFileUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
          dir="rtl"
          onClick={() => { setViewFileUrl(null); setViewFileType(null); }}
        >
          <div
            className="relative max-w-full max-h-full w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setViewFileUrl(null); setViewFileType(null); }}
              className="absolute top-4 left-4 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white shadow-lg"
              aria-label="סגור"
            >
              <X className="w-6 h-6" />
            </button>
            {viewFileType && isImageType(viewFileType) && (
              <img src={viewFileUrl} alt="" className="max-w-full max-h-full object-contain" />
            )}
            {viewFileType && isVideoType(viewFileType) && (
              <video
                src={viewFileUrl}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full"
              />
            )}
            {(!viewFileType || (!isImageType(viewFileType) && !isVideoType(viewFileType))) && (
              <div className="bg-white rounded-xl p-6 text-center max-w-md">
                <p className="text-slate-600 mb-4">לא ניתן להציג את הקובץ בתצוגה מקדימה.</p>
                <a
                  href={viewFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 underline"
                >
                  פתח בטאב חדש
                </a>
                <button
                  type="button"
                  onClick={() => { setViewFileUrl(null); setViewFileType(null); }}
                  className="block mt-4 mx-auto min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg"
                >
                  סגור
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8 text-center text-slate-600 text-base">
          אין משימות ביקורת כרגע.
          {isInspector && ' משימות שיוקצו אליך יופיעו כאן.'}
        </div>
      ) : (
        <div className="ag-theme-alpine w-full" style={{ height: '50vh', minHeight: 240 }}>
          <AgGridReact<InspectionTask>
            ref={gridRef}
            rowData={tasks}
            columnDefs={configuredTaskListColumnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
              cellStyle: { textAlign: 'right' },
              headerClass: 'ag-right-aligned-header',
              minWidth: 60,
            }}
            enableRtl={true}
            domLayout="normal"
            onRowClicked={(e) => e.data && setSelectedTaskId(e.data.id)}
            getRowId={(params) => String(params.data.id)}
            rowSelection={{ mode: 'singleRow', checkboxes: false }}
            animateRows={false}
            localeText={{
              noRowsToShow: 'אין משימות להצגה',
              loadingOoo: 'טוען...',
            }}
            suppressCellFocus={true}
          />
        </div>
      )}
    </div>
  );
}
