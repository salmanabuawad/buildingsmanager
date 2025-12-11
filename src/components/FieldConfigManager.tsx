import { useState, useEffect, useMemo } from 'react';
import { FieldConfiguration, api } from '../lib/api';
import { Save, X, Plus, Trash2, RefreshCw, Edit } from 'lucide-react';
import { Toast } from './Toast';

// Editable row component
function FieldConfigRow({ 
  config, 
  onSave, 
  onDelete, 
  saving 
}: { 
  config: FieldConfiguration; 
  onSave: (fieldName: string, widthChars: number, padding: number, hebrewName?: string, pinned?: 'left' | 'right' | 'false') => Promise<void>;
  onDelete: (fieldName: string) => Promise<void>;
  saving: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [widthChars, setWidthChars] = useState(config.width_chars);
  const [padding, setPadding] = useState(config.padding);
  const [hebrewName, setHebrewName] = useState(config.hebrew_name || '');
  const [pinned, setPinned] = useState<'left' | 'right' | 'false'>(config.pinned === 'left' || config.pinned === 'right' ? config.pinned : 'false');

  const calculatePreviewWidth = (chars: number, pad: number) => {
    return (chars * 8) + (pad * 2);
  };

  const handleSave = async () => {
    await onSave(config.field_name, widthChars, padding, hebrewName, pinned);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setWidthChars(config.width_chars);
    setPadding(config.padding);
    setHebrewName(config.hebrew_name || '');
    setPinned(config.pinned === 'left' || config.pinned === 'right' ? config.pinned : 'false');
  };

  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-900 font-medium">
        {config.field_name}
      </td>
      <td className="px-4 py-3 text-slate-700">
        {isEditing ? (
          <input
            type="text"
            value={hebrewName}
            onChange={(e) => setHebrewName(e.target.value)}
            placeholder="שם בעברית"
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span>{config.hebrew_name || '-'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="number"
            min="1"
            value={widthChars}
            onChange={(e) => setWidthChars(parseInt(e.target.value) || 10)}
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span className="text-slate-700">{config.width_chars}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="number"
            min="0"
            value={padding}
            onChange={(e) => setPadding(parseInt(e.target.value) || 8)}
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span className="text-slate-700">{config.padding}</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {calculatePreviewWidth(
          isEditing ? widthChars : config.width_chars,
          isEditing ? padding : config.padding
        )}px
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <select
            value={pinned === 'false' ? '' : pinned}
            onChange={(e) => setPinned(e.target.value === '' ? 'false' : (e.target.value as 'left' | 'right'))}
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ללא נעיצה</option>
            <option value="left">שמאל</option>
            <option value="right">ימין</option>
          </select>
        ) : (
          <span className="text-slate-700">
            {config.pinned === 'left' ? 'שמאל' : config.pinned === 'right' ? 'ימין' : '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded transition-colors"
                title="שמור"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                className="p-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                title="ביטול"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                title="ערוך"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(config.field_name)}
                className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                title="מחק"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function FieldConfigManager() {
  const [configurations, setConfigurations] = useState<FieldConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newWidthChars, setNewWidthChars] = useState(10);
  const [newPadding, setNewPadding] = useState(8);
  const [newHebrewName, setNewHebrewName] = useState('');
  const [newPinned, setNewPinned] = useState<'left' | 'right' | 'false'>('false');

  // Load configurations on mount
  useEffect(() => {
    loadConfigurations();
  }, []);

  async function loadConfigurations() {
    try {
      setLoading(true);
      const configs = await api.fieldConfigurations.getAll();
      setConfigurations(configs);
    } catch (error) {
      console.error('Error loading field configurations:', error);
      setToast({ 
        message: 'שגיאה בטעינת הגדרות השדות', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfiguration(fieldName: string, widthChars: number, padding: number, hebrewName?: string, pinned?: 'left' | 'right' | 'false') {
    try {
      setSaving(true);
      await api.fieldConfigurations.upsert({
        field_name: fieldName,
        width_chars: widthChars,
        padding: padding,
        hebrew_name: hebrewName || undefined,
        pinned: pinned === 'false' ? 'false' : (pinned || 'false'),
      });
      
      // Reload configurations
      await loadConfigurations();
      
      // Clear cache so grids reload the new settings
      const { clearFieldConfigCache } = await import('../lib/fieldConfigUtils');
      clearFieldConfigCache();
      
      setToast({ 
        message: 'הגדרות השדה נשמרו בהצלחה', 
        type: 'success' 
      });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error saving field configuration:', error);
      setToast({ 
        message: 'שגיאה בשמירת הגדרות השדה', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfiguration(fieldName: string) {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הגדרות השדה "${fieldName}"?`)) {
      return;
    }

    try {
      await api.fieldConfigurations.delete(fieldName);
      await loadConfigurations();
      
      // Clear cache
      const { clearFieldConfigCache } = await import('../lib/fieldConfigUtils');
      clearFieldConfigCache();
      
      setToast({ 
        message: 'הגדרות השדה נמחקו בהצלחה', 
        type: 'success' 
      });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error deleting field configuration:', error);
      setToast({ 
        message: 'שגיאה במחיקת הגדרות השדה', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function addNewConfiguration() {
    if (!newFieldName.trim()) {
      setToast({ 
        message: 'יש להזין שם שדה', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    await saveConfiguration(newFieldName.trim(), newWidthChars, newPadding, newHebrewName.trim() || undefined, newPinned);
    setNewFieldName('');
    setNewWidthChars(10);
    setNewPadding(8);
    setNewHebrewName('');
    setNewPinned('false');
  }

  // Sort configurations by field name
  const sortedConfigurations = useMemo(() => {
    return [...configurations].sort((a, b) => a.field_name.localeCompare(b.field_name));
  }, [configurations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">טוען הגדרות שדות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-4 py-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={3000}
        />
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">ניהול הגדרות שדות</h1>
          <button
            onClick={loadConfigurations}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            רענן
          </button>
        </div>

        <p className="text-slate-600 mb-6">
          הגדר רוחב ותפיחה לכל שדה במערכת. כל הטבלאות ישתמשו בהגדרות אלה.
        </p>

        {/* Add new field configuration */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">הוסף שדה חדש</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                שם שדה
              </label>
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="לדוגמה: building_number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                שם בעברית
              </label>
              <input
                type="text"
                value={newHebrewName}
                onChange={(e) => setNewHebrewName(e.target.value)}
                placeholder="לדוגמה: מזהה מבנה"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                רוחב (מספר תווים)
              </label>
              <input
                type="number"
                min="1"
                value={newWidthChars}
                onChange={(e) => setNewWidthChars(parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                תפיחה (פיקסלים)
              </label>
              <input
                type="number"
                min="0"
                value={newPadding}
                onChange={(e) => setNewPadding(parseInt(e.target.value) || 8)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                נעיצה
              </label>
              <select
                value={newPinned === 'false' ? '' : newPinned}
                onChange={(e) => setNewPinned(e.target.value === '' ? 'false' : (e.target.value as 'left' | 'right'))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">ללא נעיצה</option>
                <option value="left">שמאל</option>
                <option value="right">ימין</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={addNewConfiguration}
                disabled={saving || !newFieldName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                הוסף
              </button>
            </div>
          </div>
        </div>

        {/* Existing configurations */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300">
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם שדה</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם בעברית</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">רוחב (תווים)</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">תפיחה (פיקסלים)</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">רוחב משוער (פיקסלים)</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">נעיצה</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {sortedConfigurations.map((config) => (
                <FieldConfigRow
                  key={config.field_name}
                  config={config}
                  onSave={saveConfiguration}
                  onDelete={deleteConfiguration}
                  saving={saving}
                />
              ))}
            </tbody>
          </table>
        </div>

        {sortedConfigurations.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            אין הגדרות שדות. הוסף שדה חדש כדי להתחיל.
          </div>
        )}
      </div>
    </div>
  );
}

