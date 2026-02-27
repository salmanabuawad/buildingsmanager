import { useEffect, useState } from 'react';
import { api, InspectionTask, InspectionTaskStatus } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, RefreshCw, ClipboardList, AlertCircle } from 'lucide-react';

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

export function InspectionTasks() {
  const { isInspector } = useUserRole();
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <button
          onClick={fetchTasks}
          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 w-full sm:w-auto text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-base font-medium touch-manipulation"
        >
          <RefreshCw className="w-5 h-5" /> רענן
        </button>
      </div>

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
