import { X } from 'lucide-react';
import { useHelp } from '../contexts/HelpContext';
import { HelpContextId, HELP_CONTENT } from '../lib/helpContent';

export function HelpModal() {
  const { helpOpen, closeHelp, currentContextId } = useHelp();

  if (!helpOpen) return null;

  const contextId: HelpContextId = currentContextId ?? 'general';
  const entry = HELP_CONTENT[contextId] ?? HELP_CONTENT.general;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeHelp();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{entry.title}</h2>
          <button
            type="button"
            onClick={closeHelp}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-800"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto prose prose-slate max-w-none">
          <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">{entry.content}</div>
        </div>
        <div className="p-4 border-t border-slate-200 text-sm text-slate-500 shrink-0 flex items-center justify-between gap-4 flex-wrap">
          <span>💡 לחץ F1 בכל מסך להצגת עזרה מותאמת להקשר</span>
          <div className="flex items-center gap-3">
            <kbd className="px-2 py-1 bg-slate-100 rounded border border-slate-300 font-mono text-xs">F1</kbd>
            <span className="text-slate-400 text-xs">Galil software • החל 05/2022</span>
          </div>
        </div>
      </div>
    </div>
  );
}
