import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { usePreferences, EditMode } from '../contexts/PreferencesContext';

export function PreferencesButton() {
  const { preferences, setEditMode } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-right bg-white hover:bg-blue-50 rounded-lg transition-all shadow-sm border border-blue-100 hover:shadow-md hover:border-blue-300 group"
        title="העדפות"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-700 group-hover:text-blue-900">העדפות עריכה</span>
          <Settings className="h-4 w-4 text-blue-600 group-hover:text-blue-700" />
        </div>
        <div className="text-xs text-slate-500">
          {preferences.editMode === 'inline' ? 'ישירה' : 'חלון'}
        </div>
      </button>

      {isOpen && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={handleClose}
        >
          <div 
            className={`bg-white rounded-lg shadow-xl max-w-md w-full mx-4 transition-all duration-300 ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-slate-800">העדפות</h3>
              <button
                  onClick={handleClose}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  מצב עריכה
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="editMode"
                      value="inline"
                      checked={preferences.editMode === 'inline'}
                      onChange={(e) => {
                        setEditMode(e.target.value as EditMode);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    />
                    <div className="text-right">
                      <div className="font-medium text-slate-800">עריכה ישירה בתא</div>
                      <div className="text-xs text-slate-600">עריכה ישירה בתאים של הטבלה</div>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="editMode"
                      value="modal"
                      checked={preferences.editMode === 'modal'}
                      onChange={(e) => {
                        setEditMode(e.target.value as EditMode);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    />
                    <div className="text-right">
                      <div className="font-medium text-slate-800">עריכה בחלון נפרד</div>
                      <div className="text-xs text-slate-600">לחיצה כפולה על שורה לפתיחת חלון עריכה</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

