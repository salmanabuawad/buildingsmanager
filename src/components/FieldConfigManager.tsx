import { useState, useEffect, useMemo, useRef } from 'react';
import { FieldConfiguration, api } from '../lib/api';
import { Save, X, Plus, Trash2, RefreshCw, Edit, Minus, Download, Upload, Filter } from 'lucide-react';
import { Toast } from './Toast';
import * as XLSX from 'xlsx';

// Editable row component
function FieldConfigRow({ 
  config, 
  onSave, 
  onDelete, 
  saving 
}: { 
  config: FieldConfiguration; 
  onSave: (gridName: string, fieldName: string, widthChars: number, padding: number, hebrewName?: string, pinned?: boolean, pinSide?: 'left' | 'right' | null, visible?: boolean, columnOrder?: number) => Promise<void>;
  onDelete: (gridName: string, fieldName: string) => Promise<void>;
  saving: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [widthChars, setWidthChars] = useState(config.width_chars);
  const [padding, setPadding] = useState(config.padding);
  const [hebrewName, setHebrewName] = useState(config.hebrew_name || '');
  const [pinned, setPinned] = useState<boolean>(config.pinned || false);
  const [pinSide, setPinSide] = useState<'left' | 'right' | null>(config.pin_side || null);
  const [visible, setVisible] = useState<boolean>(config.visible !== undefined ? config.visible : true);
  const [columnOrder, setColumnOrder] = useState<number | undefined>(config.column_order);

  const calculatePreviewWidth = (chars: number, pad: number) => {
    return (chars * 8) + (pad * 2);
  };

  const handleSave = async () => {
    await onSave(config.grid_name, config.field_name, widthChars, padding, hebrewName, pinned, pinSide, visible, columnOrder);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setWidthChars(config.width_chars);
    setPadding(config.padding);
    setHebrewName(config.hebrew_name || '');
    setPinned(config.pinned || false);
    setPinSide(config.pin_side || null);
    setVisible(config.visible !== undefined ? config.visible : true);
    setColumnOrder(config.column_order);
  };

  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-900 font-medium">
        {config.grid_name}
      </td>
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
      <td className="px-4 py-3" style={{ maxWidth: '80px', width: '80px' }}>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWidthChars(Math.max(1, widthChars - 1))}
              className="p-1 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center min-w-[28px]"
              title="הפחת"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              type="number"
              min="1"
              value={widthChars}
              onChange={(e) => setWidthChars(parseInt(e.target.value) || 10)}
              className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
              style={{ maxWidth: '40px' }}
            />
            <button
              type="button"
              onClick={() => setWidthChars(widthChars + 1)}
              className="p-1 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center min-w-[28px]"
              title="הוסף"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="text-slate-700">{config.width_chars}</span>
        )}
      </td>
      <td className="px-4 py-3" style={{ maxWidth: '80px', width: '80px' }}>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPadding(Math.max(0, padding - 1))}
              className="p-1 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center min-w-[28px]"
              title="הפחת"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              type="number"
              min="0"
              value={padding}
              onChange={(e) => setPadding(parseInt(e.target.value) || 8)}
              className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
              style={{ maxWidth: '40px' }}
            />
            <button
              type="button"
              onClick={() => setPadding(padding + 1)}
              className="p-1 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center min-w-[28px]"
              title="הוסף"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
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
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => {
                  setPinned(e.target.checked);
                  if (!e.target.checked) setPinSide(null);
                }}
                className="w-4 h-4"
              />
              <span className="text-sm">נעוץ</span>
            </label>
            {pinned && (
              <select
                value={pinSide || ''}
                onChange={(e) => setPinSide(e.target.value === '' ? null : (e.target.value as 'left' | 'right'))}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">בחר צד</option>
                <option value="left">שמאל</option>
                <option value="right">ימין</option>
              </select>
            )}
          </div>
        ) : (
          <span className="text-slate-700">
            {config.pinned ? (config.pin_side === 'left' ? 'שמאל' : config.pin_side === 'right' ? 'ימין' : 'כן') : 'לא'}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">נראה</span>
          </label>
        ) : (
          <span className="text-slate-700">
            {config.visible ? 'כן' : 'לא'}
          </span>
        )}
      </td>
      <td className="px-4 py-3" style={{ maxWidth: '80px', width: '80px' }}>
        {isEditing ? (
          <input
            type="number"
            min="0"
            value={columnOrder || ''}
            onChange={(e) => setColumnOrder(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="סדר"
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
            style={{ maxWidth: '60px' }}
          />
        ) : (
          <span className="text-slate-700">{config.column_order ?? '-'}</span>
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
                onClick={() => onDelete(config.grid_name, config.field_name)}
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
  const [selectedGridName, setSelectedGridName] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function saveConfiguration(gridName: string, fieldName: string, widthChars: number, padding: number, hebrewName?: string, pinned?: boolean, pinSide?: 'left' | 'right' | null, visible?: boolean, columnOrder?: number) {
    try {
      setSaving(true);
      await api.fieldConfigurations.upsert({
        grid_name: gridName,
        field_name: fieldName,
        width_chars: widthChars,
        padding: padding,
        hebrew_name: hebrewName || undefined,
        pinned: pinned ?? false,
        pin_side: pinSide || null,
        visible: visible ?? true,
        column_order: columnOrder,
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

  async function deleteConfiguration(gridName: string, fieldName: string) {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הגדרות השדה "${fieldName}" מהגריד "${gridName}"?`)) {
      return;
    }

    try {
      await api.fieldConfigurations.delete(gridName, fieldName);
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

  // Export configurations to Excel
  function handleExportToExcel() {
    try {
      // Filter configurations based on selected grid
      const configsToExport = selectedGridName === 'all' 
        ? configurations 
        : configurations.filter(config => config.grid_name === selectedGridName);

      if (configsToExport.length === 0) {
        setToast({ 
          message: 'אין הגדרות שדות לייצוא', 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Define headers
      const headers = [
        'שם גריד',
        'שם שדה',
        'שם בעברית',
        'רוחב (תווים)',
        'תפיחה (פיקסלים)',
        'נעוץ',
        'צד נעיצה',
        'נראה',
        'סדר עמודה'
      ];

      // Convert configurations to rows
      const rows = configsToExport.map(config => [
        config.grid_name || '',
        config.field_name || '',
        config.hebrew_name || '',
        config.width_chars || 10,
        config.padding || 8,
        config.pinned ? 'כן' : 'לא',
        config.pin_side || '',
        config.visible !== false ? 'כן' : 'לא',
        config.column_order || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(data);

      // Set column widths
      worksheet['!cols'] = [
        { wch: 20 }, // שם גריד
        { wch: 20 }, // שם שדה
        { wch: 20 }, // שם בעברית
        { wch: 12 }, // רוחב (תווים)
        { wch: 12 }, // תפיחה (פיקסלים)
        { wch: 8 },  // נעוץ
        { wch: 12 }, // צד נעיצה
        { wch: 8 },  // נראה
        { wch: 12 }  // סדר עמודה
      ];

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'הגדרות שדות');

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const gridSuffix = selectedGridName !== 'all' ? `_${selectedGridName}` : '';
      const filename = `הגדרות_שדות${gridSuffix}_${dateStr}.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);
      
      setToast({ 
        message: `יוצאו ${rows.length} הגדרות שדות בהצלחה`, 
        type: 'success' 
      });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setToast({ 
        message: 'שגיאה בייצוא לקובץ Excel', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    }
  }

  // Import configurations from Excel
  async function handleImportFromExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        setToast({ 
          message: 'קובץ Excel אינו תקין - חסרים נתונים', 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Get headers (first row)
      const headers = jsonData[0] as string[];
      
      // Find column indices
      const gridNameIndex = headers.findIndex(h => h === 'שם גריד' || h === 'grid_name');
      const fieldNameIndex = headers.findIndex(h => h === 'שם שדה' || h === 'field_name');
      const hebrewNameIndex = headers.findIndex(h => h === 'שם בעברית' || h === 'hebrew_name');
      const widthCharsIndex = headers.findIndex(h => h === 'רוחב (תווים)' || h === 'width_chars');
      const paddingIndex = headers.findIndex(h => h === 'תפיחה (פיקסלים)' || h === 'padding');
      const pinnedIndex = headers.findIndex(h => h === 'נעוץ' || h === 'pinned');
      const pinSideIndex = headers.findIndex(h => h === 'צד נעיצה' || h === 'pin_side');
      const visibleIndex = headers.findIndex(h => h === 'נראה' || h === 'visible');
      const columnOrderIndex = headers.findIndex(h => h === 'סדר עמודה' || h === 'column_order');

      if (gridNameIndex === -1 || fieldNameIndex === -1) {
        setToast({ 
          message: 'קובץ Excel אינו תקין - חסרים עמודות חובה (שם גריד, שם שדה)', 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Process rows (skip header row)
      const rowsToImport = jsonData.slice(1);
      let importedCount = 0;
      let errorCount = 0;

      setSaving(true);

      for (const row of rowsToImport) {
        try {
          const gridName = String(row[gridNameIndex] || '').trim();
          const fieldName = String(row[fieldNameIndex] || '').trim();

          if (!gridName || !fieldName) {
            errorCount++;
            continue;
          }

          const hebrewName = hebrewNameIndex !== -1 ? String(row[hebrewNameIndex] || '').trim() : undefined;
          const widthChars = widthCharsIndex !== -1 ? parseInt(String(row[widthCharsIndex] || '10')) : 10;
          const padding = paddingIndex !== -1 ? parseInt(String(row[paddingIndex] || '8')) : 8;
          const pinned = pinnedIndex !== -1 ? (String(row[pinnedIndex] || '').trim() === 'כן' || String(row[pinnedIndex] || '').trim().toLowerCase() === 'yes' || String(row[pinnedIndex] || '').trim() === 'true') : false;
          const pinSide = pinSideIndex !== -1 ? (String(row[pinSideIndex] || '').trim() === 'שמאל' || String(row[pinSideIndex] || '').trim().toLowerCase() === 'left' ? 'left' : String(row[pinSideIndex] || '').trim() === 'ימין' || String(row[pinSideIndex] || '').trim().toLowerCase() === 'right' ? 'right' : null) : null;
          const visible = visibleIndex !== -1 ? (String(row[visibleIndex] || '').trim() !== 'לא' && String(row[visibleIndex] || '').trim().toLowerCase() !== 'no' && String(row[visibleIndex] || '').trim() !== 'false') : true;
          const columnOrder = columnOrderIndex !== -1 ? (row[columnOrderIndex] ? parseInt(String(row[columnOrderIndex])) : undefined) : undefined;

          await api.fieldConfigurations.upsert({
            grid_name: gridName,
            field_name: fieldName,
            width_chars: widthChars,
            padding: padding,
            hebrew_name: hebrewName || undefined,
            pinned: pinned,
            pin_side: pinSide,
            visible: visible,
            column_order: columnOrder,
          });

          importedCount++;
        } catch (rowError) {
          console.error('Error importing row:', rowError);
          errorCount++;
        }
      }

      // Reload configurations
      await loadConfigurations();
      
      // Clear cache
      const { clearFieldConfigCache } = await import('../lib/fieldConfigUtils');
      clearFieldConfigCache();

      setToast({ 
        message: `יובאו ${importedCount} הגדרות שדות בהצלחה${errorCount > 0 ? `, ${errorCount} שגיאות` : ''}`, 
        type: importedCount > 0 ? 'success' : 'error' 
      });
      setTimeout(() => setToast(null), 5000);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error importing from Excel:', error);
      setToast({ 
        message: 'שגיאה בייבוא מקובץ Excel', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }


  // Get unique grid names for dropdown
  const uniqueGridNames = useMemo(() => {
    const gridNames = new Set<string>();
    configurations.forEach(config => {
      const gridName = config.grid_name || 'ללא גריד';
      gridNames.add(gridName);
    });
    
    // Define custom order for grid names (priority grids first)
    const gridOrder = [
      'buildings-list',
      'assets-list',
      'asset-details-main',
      'asset-details-history'
    ];
    
    // Sort grid names: priority grids first, then alphabetically
    return Array.from(gridNames).sort((a, b) => {
      const aIndex = gridOrder.indexOf(a);
      const bIndex = gridOrder.indexOf(b);
      
      // If both are in the priority list, sort by their order in the list
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the priority list, it comes first
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in the priority list, sort alphabetically
      return a.localeCompare(b);
    });
  }, [configurations]);

  // Group configurations by grid_name and sort, filtered by selected grid
  const groupedConfigurations = useMemo(() => {
    const grouped = new Map<string, FieldConfiguration[]>();
    configurations.forEach(config => {
      const gridName = config.grid_name || 'ללא גריד';
      // Filter by selected grid name
      if (selectedGridName !== 'all' && gridName !== selectedGridName) {
        return;
      }
      if (!grouped.has(gridName)) {
        grouped.set(gridName, []);
      }
      grouped.get(gridName)!.push(config);
    });
    
    // Sort each group by column_order, then by field_name
    grouped.forEach((configs) => {
      configs.sort((a, b) => {
        if (a.column_order !== undefined && b.column_order !== undefined) {
          return a.column_order - b.column_order;
        }
        if (a.column_order !== undefined) return -1;
        if (b.column_order !== undefined) return 1;
        return a.field_name.localeCompare(b.field_name);
      });
    });
    
    // Define custom order for grid names (priority grids first)
    const gridOrder = [
      'buildings-list',
      'assets-list',
      'asset-details-main',
      'asset-details-history'
    ];
    
    // Sort grid names: priority grids first, then alphabetically
    const sortedGrids = Array.from(grouped.keys()).sort((a, b) => {
      const aIndex = gridOrder.indexOf(a);
      const bIndex = gridOrder.indexOf(b);
      
      // If both are in the priority list, sort by their order in the list
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the priority list, it comes first
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in the priority list, sort alphabetically
      return a.localeCompare(b);
    });
    
    return sortedGrids.map(gridName => ({
      gridName,
      configs: grouped.get(gridName)!
    }));
  }, [configurations, selectedGridName]);

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 text-white rounded-md transition-all shadow-sm hover:shadow font-medium"
              title="ייצא ל-Excel"
            >
              <Download className="h-4 w-4" />
              ייצא
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-all shadow-sm hover:shadow font-medium"
              title="ייבא מ-Excel"
            >
              <Upload className="h-4 w-4" />
              ייבא
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFromExcel}
              className="hidden"
            />
            <button
              onClick={loadConfigurations}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 text-white rounded-md transition-all shadow-sm hover:shadow font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              רענן
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-600" />
            <label className="text-slate-700 font-medium">סינון לפי גריד:</label>
            <select
              value={selectedGridName}
              onChange={(e) => setSelectedGridName(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">הכל</option>
              {uniqueGridNames.map(gridName => (
                <option key={gridName} value={gridName}>{gridName}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-slate-600 mb-6">
          הגדר רוחב ותפיחה לכל שדה במערכת. כל הטבלאות ישתמשו בהגדרות אלה.
        </p>

        {/* Existing configurations grouped by grid */}
        {groupedConfigurations.map(({ gridName, configs }) => (
          <div key={gridName} className="mb-8">
            <h3 className="text-xl font-semibold text-slate-800 mb-4 pb-2 border-b-2 border-slate-300">
              {gridName}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-300">
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם גריד</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם שדה</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם בעברית</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700" style={{ maxWidth: '80px', width: '80px' }}>רוחב (תווים)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700" style={{ maxWidth: '80px', width: '80px' }}>תפיחה (פיקסלים)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">רוחב משוער (פיקסלים)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">נעיצה</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">נראה</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700" style={{ maxWidth: '80px', width: '80px' }}>סדר</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((config) => (
                    <FieldConfigRow
                      key={`${config.grid_name}-${config.field_name}`}
                      config={config}
                      onSave={saveConfiguration}
                      onDelete={deleteConfiguration}
                      saving={saving}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {groupedConfigurations.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            אין הגדרות שדות. הוסף שדה חדש כדי להתחיל.
          </div>
        )}
      </div>
    </div>
  );
}

