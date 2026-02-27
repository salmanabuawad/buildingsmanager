import { useEffect, useState, useRef } from 'react';
import { api, InspectionTask, InspectionTaskStatus, InspectionReport, InspectionReportFile, Building, Asset } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { getSession } from '../lib/usersTableAuth';
import { Loader2, RefreshCw, ClipboardList, AlertCircle, Plus, X, FileText, Paperclip, Camera, Send, Trash2 } from 'lucide-react';

const STATUS_LABELS: Record<InspectionTaskStatus, string> = {
  new: 'חדש',
  in_progress: 'בביצוע',
  pending_approval: 'ממתין לאישור',
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

function FileRow({ file, onDelete }: { file: InspectionReportFile; onDelete?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const handleView = async () => {
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
      <span className="text-sm text-slate-800 truncate flex-1 min-w-0" title={file.file_name || file.file_path}>
        {file.file_name || file.file_path}
      </span>
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
  const [buildingAssets, setBuildingAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', building_number: '' as number | '', assigned_to: '' as number | '', note: '', asset_ids: [] as number[] });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<InspectionTask | null>(null);
  const [detailReport, setDetailReport] = useState<InspectionReport | null>(null);
  const [detailFiles, setDetailFiles] = useState<InspectionReportFile[]>([]);
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

  // Load task detail when a task is clicked or after a mutation
  useEffect(() => {
    if (selectedTaskId == null) {
      setDetailTask(null);
      setDetailReport(null);
      setDetailFiles([]);
      setDetailError(null);
      setReportEditText('');
      setSubmitComment('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const [task, report] = await Promise.all([
          api.inspectionTasks.getOne(selectedTaskId),
          api.inspectionReports.getByTaskId(selectedTaskId),
        ]);
        if (cancelled) return;
        setDetailTask(task ?? null);
        setDetailReport(report ?? null);
        setReportEditText(report?.report_text ?? '');
        if (report) {
          const files = await api.inspectionReports.files.list(report.id);
          if (!cancelled) setDetailFiles(files);
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

  // Load task assets for file-upload asset selector (inspector, assigned to me)
  useEffect(() => {
    const session = getSession();
    if (!selectedTaskId || !detailTask || !isInspector || session?.user_id !== detailTask.assigned_to) {
      setTaskAssets([]);
      return;
    }
    api.inspectionTasks.getAssetsForFileSelection(selectedTaskId).then(setTaskAssets).catch(() => setTaskAssets([]));
  }, [selectedTaskId, detailTask?.id, detailTask?.assigned_to, isInspector]);

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

  const openCreateModal = () => {
    setCreateError(null);
    setCreateForm({ title: '', building_number: '', assigned_to: '', note: '', asset_ids: [] });
    setBuildingAssets([]);
    setCreateModalOpen(true);
  };

  const session = getSession();
  const canInspectorEdit =
    isInspector &&
    detailTask &&
    session?.user_id === detailTask.assigned_to &&
    (detailTask.status === 'new' || detailTask.status === 'in_progress');

  const refreshDetail = () => {
    setDetailRefreshTrigger((t) => t + 1);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || selectedTaskId == null) return;
    setFileUploading(true);
    setDetailError(null);
    try {
      let report = await api.inspectionReports.getByTaskId(selectedTaskId);
      if (!report) {
        report = await api.inspectionReports.upsert(selectedTaskId, reportEditText || null);
        setDetailReport(report);
      }
      const assetId = uploadAssetId === '' ? undefined : Number(uploadAssetId);
      const uploaded = await api.inspectionReports.files.upload(report.id, file, assetId);
      setDetailFiles((prev) => [uploaded, ...prev]);
      // Don't call refreshDetail() here: it can refetch before the DB sees the new row and overwrite with []
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'שגיאה בהעלאת הקובץ');
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
                <label className="block text-sm font-medium text-slate-700 mb-1">מפקח (מוקצה אל)</label>
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
              {detailError && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
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
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                      <FileText className="w-4 h-4" /> דוח
                    </h4>
                    {canInspectorEdit ? (
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
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                      <Paperclip className="w-4 h-4" /> קבצים ({detailFiles.length})
                    </h4>
                    {canInspectorEdit && (
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
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={fileUploading}
                            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 touch-manipulation text-sm font-medium"
                          >
                            {fileUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                            {fileUploading ? 'מעלה...' : 'הוסף תמונה/וידאו'}
                          </button>
                          {taskAssets.length > 0 && (
                            <select
                              value={uploadAssetId === '' ? '' : String(uploadAssetId)}
                              onChange={(e) => setUploadAssetId(e.target.value === '' ? '' : Number(e.target.value))}
                              className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              title="קישור לנכס (אופציונלי)"
                            >
                              <option value="">ללא נכס</option>
                              {taskAssets.map((a) => (
                                <option key={a.asset_id} value={a.asset_id}>
                                  נכס {a.asset_id}
                                  {a.payer_id ? ` (${a.payer_id})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                    {detailFiles.length === 0 ? (
                      <p className="text-slate-500 text-sm">אין קבצים מועלים.</p>
                    ) : (
                      <ul className="space-y-2">
                        {detailFiles.map((f) => (
                          <FileRow
                            key={f.id}
                            file={f}
                            onDelete={canInspectorEdit ? refreshDetail : undefined}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8 text-center text-slate-600 text-base">
          אין משימות ביקורת כרגע.
          {isInspector && ' משימות שיוקצו אליך יופיעו כאן.'}
        </div>
      ) : (
        <>
          {/* Mobile: card list — comfortable tap targets and reading */}
          <div className="flex flex-col gap-3 md:hidden">
            {tasks.map((task) => (
              <button
                type="button"
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className="w-full text-right bg-white border border-slate-200 rounded-xl p-4 shadow-sm active:bg-slate-50/80 transition-colors hover:border-slate-300 cursor-pointer touch-manipulation min-h-[44px]"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-800 text-base leading-snug">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 text-sm">
                    <span>מבנה {task.building_number}</span>
                    <span>#{task.id}</span>
                    {task.created_at && (
                      <span>{new Date(task.created_at).toLocaleDateString('he-IL')}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">מזהה</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">כותרת</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">מבנה</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">סטטוס</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">נוצר</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTaskId(task.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedTaskId(task.id)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 text-slate-600">{task.id}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{task.title}</td>
                    <td className="py-3 px-4 text-slate-600">{task.building_number}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-sm">
                      {task.created_at ? new Date(task.created_at).toLocaleDateString('he-IL') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
