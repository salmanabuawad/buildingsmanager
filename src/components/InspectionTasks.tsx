import { useEffect, useState } from 'react';
import { api, InspectionTask, InspectionTaskStatus, Building } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, RefreshCw, ClipboardList, AlertCircle, Plus, X } from 'lucide-react';

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
  const [createForm, setCreateForm] = useState({ title: '', building_number: '' as number | '', assigned_to: '' as number | '', note: '' });

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
    setCreateForm({ title: '', building_number: '', assigned_to: '', note: '' });
    setCreateModalOpen(true);
  };

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
              <div
                key={task.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm active:bg-slate-50/80 transition-colors"
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
              </div>
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
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
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
