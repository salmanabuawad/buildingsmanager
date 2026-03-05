/**
 * Mobile-first view: task list (inspection tasks assigned to me) and prominent upload pictures.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { inspectionTasksApi, inspectionReportsApi, type InspectionTask } from '../lib/inspectionApi';
import { getApiBaseUrl } from '../lib/appConfig';
import { api } from '../lib/api';
import { ListTodo, Loader2, CheckCircle2, Send, FileUp, X, Camera, Video, Trash2, Image, Film } from 'lucide-react';

function fileDownloadUrl(filePath: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base ? base + '/' : ''}api/files/download?path=${encodeURIComponent(filePath)}`;
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

export function MobileTasksAndUpload() {
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<InspectionTask | null>(null);

  useEffect(() => {
    if (selectedTask) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [selectedTask]);
  const [reportText, setReportText] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [previewModal, setPreviewModal] = useState<{ url: string; name: string; isVideo: boolean } | null>(null);
  const [submitComment, setSubmitComment] = useState('');
  const [uploadAssetIds, setUploadAssetIds] = useState<number[]>([]);
  const [assetsForUpload, setAssetsForUpload] = useState<Array<{ asset_id: number; main_asset_type?: string; asset_size?: number }>>([]);
  const [assetsForUploadLoading, setAssetsForUploadLoading] = useState(false);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inspectionTasksApi.list({});
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
  }, []);

  const handleTake = async (taskId: number) => {
    try {
      setActioningId(taskId);
      await inspectionTasksApi.take(taskId);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setActioningId(null);
    }
  };

  const handleSubmit = async (taskId: number, comment?: string) => {
    try {
      setActioningId(taskId);
      await inspectionTasksApi.submit(taskId, comment ? { comment } : undefined);
      setSubmitComment('');
      setSelectedTask(null);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחה');
    } finally {
      setActioningId(null);
    }
  };

  const openTaskDetail = async (task: InspectionTask) => {
    try {
      const full = await inspectionTasksApi.get(task.id);
      setSelectedTask(full);
      setReportText(full.report?.report_text ?? '');
      setUploadAssetIds([]);
    } catch {
      setSelectedTask(task);
      setReportText('');
    }
  };

  const loadAssetsForUpload = async () => {
    if (!selectedTask) return;
    const bn = selectedTask.building_number;
    try {
      setAssetsForUploadLoading(true);
      const list = await api.assets.getAll(bn);
      const all = (list || []).map((a: { asset_id: number; main_asset_type?: string; asset_size?: number }) => ({
        asset_id: a.asset_id,
        main_asset_type: a.main_asset_type,
        asset_size: a.asset_size,
      }));
      const taskIds = selectedTask.asset_ids ?? [];
      setAssetsForUpload(taskIds.length > 0 ? all.filter((a) => taskIds.includes(a.asset_id)) : all);
    } catch {
      setAssetsForUpload([]);
    } finally {
      setAssetsForUploadLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTask && (selectedTask.status === 'in_progress' || selectedTask.status === 'pending_approval')) {
      loadAssetsForUpload();
    } else {
      setAssetsForUpload([]);
    }
  }, [selectedTask?.id, selectedTask?.status, selectedTask?.asset_ids]);

  const toggleUploadAsset = (assetId: number) => {
    setUploadAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const saveReport = async () => {
    if (!selectedTask) return;
    try {
      setSavingReport(true);
      await inspectionReportsApi.upsert({ task_id: selectedTask.id, report_text: reportText });
      const updated = await inspectionTasksApi.get(selectedTask.id);
      setSelectedTask(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת דיווח');
    } finally {
      setSavingReport(false);
    }
  };

  const uploadReportFile = async (file: File, skipState = false) => {
    if (!selectedTask?.report?.id) {
      await inspectionReportsApi.upsert({ task_id: selectedTask!.id, report_text: reportText });
      const updated = await inspectionTasksApi.get(selectedTask!.id);
      setSelectedTask(updated);
      if (!updated.report?.id) return;
    }
    const reportId = selectedTask!.report?.id ?? (await inspectionTasksApi.get(selectedTask!.id)).report?.id;
    if (!reportId) return;
    const aids = uploadAssetIds.length > 0 ? uploadAssetIds : undefined;
    try {
      if (!skipState) setUploadingFile(true);
      await inspectionReportsApi.uploadFile(reportId, file, aids);
      const updated = await inspectionTasksApi.get(selectedTask!.id);
      setSelectedTask(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת קובץ');
    } finally {
      if (!skipState) setUploadingFile(false);
    }
  };

  const uploadReportFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploadingFile(true);
    try {
      for (const f of list) await uploadReportFile(f, true);
    } finally {
      setUploadingFile(false);
    }
  };

  const deleteReportFile = async (fileId: number) => {
    if (!selectedTask) return;
    try {
      setDeletingFileId(fileId);
      await inspectionReportsApi.deleteFile(fileId);
      const updated = await inspectionTasksApi.get(selectedTask.id);
      setSelectedTask(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה במחיקה');
    } finally {
      setDeletingFileId(null);
    }
  };

  const reportFiles = selectedTask?.report?.files ?? [];
  const isVideo = (f: { file_type?: string | null; file_name?: string | null }) => {
    const t = (f.file_type ?? '').toLowerCase();
    const n = (f.file_name ?? '').toLowerCase();
    return t.startsWith('video/') || n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov');
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6" dir="rtl">
      <h1 className="text-xl font-semibold text-slate-800 border-b border-slate-200 pb-2">
        משימות והעלאות
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="flex items-center gap-2 text-base font-medium text-slate-700 mb-3">
          <ListTodo className="h-5 w-5 text-indigo-600" />
          המשימות שלי
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="min-h-[120px] flex flex-col items-center justify-center rounded-lg bg-slate-50 border border-dashed border-slate-200 p-6 text-center">
            <p className="text-slate-500 text-sm mb-1">אין משימות כרגע</p>
            <p className="text-slate-400 text-xs">משימות ביקורת יופיעו כאן כאשר יוקצו אליך</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-100"
                onClick={() => openTaskDetail(t)}
              >
                <div>
                  <span className="font-medium text-slate-800">{t.title ? (t.title as string) : `בניין ${t.building_number}`}</span>
                  <span className="mr-2 text-slate-500 text-sm"> – {STATUS_LABELS[t.status] ?? t.status}</span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {t.status === 'new' && (
                    <button
                      type="button"
                      onClick={() => handleTake(t.id)}
                      disabled={actioningId === t.id}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {actioningId === t.id ? '...' : 'קח משימה'}
                    </button>
                  )}
                  {(t.status === 'in_progress' || t.status === 'pending_approval') && (
                    <button
                      type="button"
                      onClick={() => openTaskDetail(t)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-100"
                    >
                      פרטים / דיווח
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedTask && createPortal(
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/40" 
          style={{ inset: 0, overflow: 'hidden' }} 
          onClick={() => setSelectedTask(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-md w-full grid overflow-hidden" 
            style={{ 
              height: '80vh', 
              maxHeight: '80vh',
              gridTemplateRows: 'auto 1fr' 
            }} 
            dir="rtl" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start p-4 pb-2 border-b border-slate-100">
              <h2 className="text-lg font-semibold">משימה – בניין {selectedTask.building_number}</h2>
              <button type="button" onClick={() => setSelectedTask(null)} className="p-1 text-slate-500 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-4 min-h-0">
            <p className="text-sm text-slate-600 mb-3">סטטוס: {STATUS_LABELS[selectedTask.status] ?? selectedTask.status}</p>
            {selectedTask.history && selectedTask.history.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200 mb-3">
                <h3 className="font-medium text-slate-700 mb-2">היסטוריה והערות (תאריך, שעה, פעולה)</h3>
                <ul className="space-y-2 text-sm">
                  {selectedTask.history.map((h: { id: number; created_at: string; action: string; comment_text: string | null }) => (
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
            <label className="block text-sm font-medium text-slate-700 mb-1">דיווח ביקורת</label>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px]"
              placeholder="תאר את ממצאי הביקורת..."
            />
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">קשר לנכסים (לפני העלאה)</label>
              <p className="text-xs text-slate-500 mb-1">בחר נכסים — הקבצים שיועלו ישתפו לכל הנכסים שבחרת</p>
              {assetsForUploadLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> טוען...
                </div>
              ) : assetsForUpload.length === 0 ? (
                <p className="text-slate-500 text-sm py-1">אין נכסים במשימה / בבניין</p>
              ) : (
                <div className="max-h-20 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {assetsForUpload.map((a) => (
                    <label key={a.asset_id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={uploadAssetIds.includes(a.asset_id)}
                        onChange={() => toggleUploadAsset(a.asset_id)}
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
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={saveReport}
                disabled={savingReport}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm disabled:opacity-50"
              >
                {savingReport ? 'שומר...' : 'שמור דיווח'}
              </button>
              <label className="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-lg text-sm cursor-pointer flex items-center gap-1">
                <FileUp className="h-4 w-4" />
                {uploadingFile ? 'מעלה...' : 'מגלריה / קבצים'}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length) uploadReportFiles(files);
                    e.target.value = '';
                  }}
                  disabled={uploadingFile}
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
                    if (f) uploadReportFile(f);
                    e.target.value = '';
                  }}
                  disabled={uploadingFile}
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
                    if (f) uploadReportFile(f);
                    e.target.value = '';
                  }}
                  disabled={uploadingFile}
                />
              </label>
            </div>
            <p className="text-xs text-slate-500 mt-1">מגלריה, מצלמה או וידאו — תמונות ווידאו נתמכים</p>
            {reportFiles.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <h3 className="text-sm font-medium text-slate-700 mb-2">קבצים מצורפים</h3>
                <ul className="space-y-4">
                  {reportFiles.map((f: { id: number; file_name: string | null; file_type?: string | null; file_path: string }) => {
                    const url = fileDownloadUrl(f.file_path);
                    const name = f.file_name ?? `קובץ ${f.id}`;
                    return (
                      <li
                        key={f.id}
                        className="flex flex-col sm:flex-row gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex-1 min-w-0 flex items-start gap-2">
                          <button
                            type="button"
                            className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center p-0 border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                            onClick={() => setPreviewModal({ url, name, isVideo: isVideo(f) })}
                          >
                            {isVideo(f) ? (
                              <video
                                src={url}
                                className="w-full h-full object-cover pointer-events-none"
                                preload="metadata"
                                playsInline
                              />
                            ) : (
                              <img
                                src={url}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                                draggable={false}
                              />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate" title={name}>
                              {name}
                            </p>
                            {isVideo(f) ? (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <Film className="h-3 w-3" /> וידאו
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Image className="h-3 w-3" /> תמונה
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteReportFile(f.id)}
                          disabled={deletingFileId === f.id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg self-start sm:self-center disabled:opacity-50"
                          title="מחק"
                        >
                          {deletingFileId === f.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {selectedTask.status === 'in_progress' && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-600">הערה עם שליחה (אופציונלי)</label>
                <textarea
                  value={submitComment}
                  onChange={(e) => setSubmitComment(e.target.value)}
                  placeholder="הוסף הערה שתשמר עם תאריך ושעה..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => handleSubmit(selectedTask.id, submitComment.trim() || undefined)}
                  disabled={actioningId === selectedTask.id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                  {actioningId === selectedTask.id ? 'שולח...' : 'שליחה לאישור מנהל'}
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
