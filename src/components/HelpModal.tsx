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
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-theme-card-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme-card-border shrink-0 bg-theme-highlight/30">
          <h2 className="text-xl font-bold text-theme-text-primary">{entry.title}</h2>
          <button
            type="button"
            onClick={closeHelp}
            className="p-2 rounded-lg hover:bg-theme-table-header text-theme-text-muted hover:text-theme-text-primary transition-colors"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto prose prose-slate max-w-none">
          <div className="text-theme-text-primary whitespace-pre-wrap leading-relaxed">{entry.content}</div>
        </div>
        <div className="p-4 border-t border-theme-card-border text-sm text-theme-text-muted shrink-0 flex items-center justify-between gap-4 flex-wrap bg-theme-content">
          <span>💡 לחץ F1 בכל מסך להצגת עזרה מותאמת להקשר</span>
          <div className="flex items-center gap-3">
            <kbd className="px-2 py-1 bg-theme-table-header rounded border border-theme-card-border font-mono text-xs text-theme-text-primary">F1</kbd>
            <span className="text-theme-text-muted text-xs">Kortex Digital</span>
          </div>
        </div>
      </div>
    </div>
  );
}
