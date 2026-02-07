import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FieldConfiguration, api } from '../lib/api';
import { Save, X, RefreshCw, Download, Upload, Filter } from 'lucide-react';
import { Toast } from './Toast';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { exportToExcel } from '../lib/excelExport';

export function FieldConfigManager() {
  const [configurations, setConfigurations] = useState<FieldConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [selectedGridName, setSelectedGridName] = useState<string>('all');
  const [dirtyConfigs, setDirtyConfigs] = useState<Map<string, FieldConfiguration>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<FieldConfiguration>>(null);

  // Grid preferences hook
  const gridPreferences = useGridPreferences(
    gridRef,
    'field-config-manager',
    'default'
  );

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
      
      // Clear dirty state for this specific config
      const key = `${gridName}-${fieldName}`;
      setDirtyConfigs(prev => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
      
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
  async function handleExportToExcel() {
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

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const gridSuffix = selectedGridName !== 'all' ? `_${selectedGridName}` : '';
      const filename = `הגדרות_שדות${gridSuffix}_${dateStr}.xlsx`;

      // Use improved export function to reduce antivirus false positives
      exportToExcel({
        filename,
        sheetName: 'הגדרות שדות',
        data,
        columnWidths: [
          { wch: 20 }, // שם גריד
          { wch: 20 }, // שם שדה
          { wch: 20 }, // שם בעברית
          { wch: 12 }, // רוחב (תווים)
          { wch: 12 }, // תפיחה (פיקסלים)
          { wch: 8 },  // נעוץ
          { wch: 12 }, // צד נעיצה
          { wch: 8 },  // נראה
          { wch: 12 }  // סדר עמודה
        ]
      });
      
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

      const payload: any[] = [];
      for (const row of rowsToImport) {
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

        payload.push({
          grid_name: gridName,
          field_name: fieldName,
          width_chars: widthChars,
          padding: padding,
          hebrew_name: hebrewName || undefined,
          pinned,
          pin_side: pinSide,
          visible,
          column_order: columnOrder,
        });
      }

      if (payload.length > 0) {
        const bulkResult = await api.fieldConfigurations.upsertBulk(payload);
        importedCount = bulkResult.count;
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

  // Filter configurations based on selected grid
  const filteredConfigurations = useMemo(() => {
    if (selectedGridName === 'all') {
      return configurations;
    }
    return configurations.filter(config => config.grid_name === selectedGridName);
  }, [configurations, selectedGridName]);

  // Calculate preview width
  const calculatePreviewWidth = useCallback((chars: number, pad: number) => {
    return (chars * 8) + (pad * 2);
  }, []);

  // Hard-coded width: 15 chars + 2 padding = 15 * 8 + 2 * 2 = 120 + 4 = 124 pixels
  const FIXED_COLUMN_WIDTH = 15 * 8 + 2 * 2; // 124 pixels

  // Check if a config is dirty
  const isConfigDirty = useCallback((config: FieldConfiguration) => {
    const key = `${config.grid_name}-${config.field_name}`;
    return dirtyConfigs.has(key);
  }, [dirtyConfigs]);

  // Mark config as dirty
  const markDirty = useCallback((config: FieldConfiguration, updatedData: Partial<FieldConfiguration>) => {
    const key = `${config.grid_name}-${config.field_name}`;
    setDirtyConfigs(prev => {
      const newMap = new Map(prev);
      const existing = prev.get(key) || config;
      newMap.set(key, { ...existing, ...updatedData } as FieldConfiguration);
      return newMap;
    });
  }, []);

  // Handle cell value change
  const onCellValueChanged = useCallback((event: any) => {
    const config = event.data as FieldConfiguration;
    const field = event.colDef.field;
    const newValue = event.newValue;
    
    // Mark as dirty
    markDirty(config, { [field]: newValue });
    
    // Update the row data
    event.data[field] = newValue;
  }, [markDirty]);

  // Handle save all
  const handleSaveAll = useCallback(async () => {
    if (dirtyConfigs.size === 0) {
      setToast({ 
        message: 'אין שינויים לשמירה', 
        type: 'info' 
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    try {
      setSaving(true);
      const payload = Array.from(dirtyConfigs.values()).map(dirtyConfig => ({
        grid_name: dirtyConfig.grid_name,
        field_name: dirtyConfig.field_name,
        width_chars: dirtyConfig.width_chars,
        padding: dirtyConfig.padding,
        hebrew_name: dirtyConfig.hebrew_name || undefined,
        pinned: dirtyConfig.pinned ?? false,
        pin_side: dirtyConfig.pin_side || null,
        visible: dirtyConfig.visible ?? true,
        column_order: dirtyConfig.column_order,
      }));

      const result = await api.fieldConfigurations.upsertBulk(payload);
      const savedCount = result.count;

      // Reload configurations
      await loadConfigurations();
      
      // Clear cache
      const { clearFieldConfigCache } = await import('../lib/fieldConfigUtils');
      clearFieldConfigCache();
      
      // Clear all dirty states
      setDirtyConfigs(new Map());
      
      setToast({ 
        message: `נשמרו ${savedCount} הגדרות בהצלחה`, 
        type: 'success' 
      });
      setTimeout(() => setToast(null), 5000);
    } catch (error) {
      console.error('Error saving all configurations:', error);
      setToast({ 
        message: 'שגיאה בשמירת ההגדרות', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [dirtyConfigs]);

  // Handle cancel all
  const handleCancelAll = useCallback(() => {
    if (dirtyConfigs.size === 0) {
      return;
    }

    if (confirm(`האם אתה בטוח שברצונך לבטל את כל השינויים? (${dirtyConfigs.size} שינויים)`)) {
      setDirtyConfigs(new Map());
      
      // Reload configurations to restore original values
      loadConfigurations();
      
      setToast({ 
        message: 'כל השינויים בוטלו', 
        type: 'info' 
      });
      setTimeout(() => setToast(null), 3000);
    }
  }, [dirtyConfigs]);

  // Calculate total changes
  const totalChanges = useMemo(() => dirtyConfigs.size, [dirtyConfigs]);

  // Column definitions
  const columnDefs: ColDef<FieldConfiguration>[] = useMemo(() => [
    {
      field: 'grid_name',
      headerName: 'שם גריד',
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
    },
    {
      field: 'hebrew_name',
      headerName: 'שם בעברית',
      sortable: true,
      filter: true,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      valueGetter: (params) => params.data.hebrew_name || '',
      valueSetter: (params) => {
        params.data.hebrew_name = params.newValue || null;
        return true;
      },
      valueFormatter: (params) => params.value || '-',
    },
    {
      field: 'width_chars',
      headerName: 'רוחב (תווים)',
      sortable: true,
      filter: true,
      editable: true,
      type: 'numericColumn',
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      valueParser: (params) => {
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? params.oldValue : Math.max(1, num);
      },
    },
    {
      field: 'padding',
      headerName: 'תפיחה (פיקסלים)',
      sortable: true,
      filter: true,
      editable: true,
      type: 'numericColumn',
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      valueParser: (params) => {
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? params.oldValue : Math.max(0, num);
      },
    },
    {
      field: 'preview_width',
      headerName: 'רוחב משוער (פיקסלים)',
      sortable: false,
      filter: false,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      hide: true, // Hide from grid UI
      valueGetter: (params) => {
        const config = params.data as FieldConfiguration;
        const key = `${config.grid_name}-${config.field_name}`;
        const dirty = dirtyConfigs.get(key);
        const widthChars = dirty?.width_chars ?? config.width_chars;
        const padding = dirty?.padding ?? config.padding;
        return calculatePreviewWidth(widthChars, padding);
      },
      valueFormatter: (params) => `${params.value}px`,
    },
    {
      field: 'pinned',
      headerName: 'נעוץ',
      sortable: true,
      filter: true,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      cellEditor: 'agCheckboxCellEditor',
      cellRenderer: 'agCheckboxCellRenderer',
      valueGetter: (params) => params.data.pinned ?? false,
      valueSetter: (params) => {
        params.data.pinned = params.newValue ?? false;
        return true;
      },
    },
    {
      field: 'pin_side',
      headerName: 'צד נעיצה',
      sortable: true,
      filter: true,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      hide: true, // Hide from grid UI
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: [null, 'left', 'right'],
      },
      valueGetter: (params) => params.data.pin_side || null,
      valueSetter: (params) => {
        params.data.pin_side = params.newValue || null;
        return true;
      },
      cellRenderer: (params: any) => {
        const value = params.value;
        if (value === 'left') return 'שמאל';
        if (value === 'right') return 'ימין';
        return '-';
      },
    },
    {
      field: 'visible',
      headerName: 'נראה',
      sortable: true,
      filter: true,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      cellEditor: 'agCheckboxCellEditor',
      cellRenderer: 'agCheckboxCellRenderer',
      valueGetter: (params) => params.data.visible !== false,
      valueSetter: (params) => {
        params.data.visible = params.newValue ?? true;
        return true;
      },
    },
    {
      field: 'column_order',
      headerName: 'סדר',
      sortable: true,
      filter: true,
      editable: true,
      type: 'numericColumn',
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      valueFormatter: (params) => params.value ?? '-',
    },
    {
      field: 'field_name',
      headerName: 'שם שדה',
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      sortable: true,
      filter: true,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => {
        const config = params.data as FieldConfiguration;
        const isDirty = isConfigDirty(config);
        return { 
          textAlign: 'right', 
          fontWeight: isDirty ? 'bold' : '600',
          backgroundColor: isDirty ? '#fef3c7' : undefined
        };
      },
      width: FIXED_COLUMN_WIDTH,
      minWidth: FIXED_COLUMN_WIDTH,
      maxWidth: FIXED_COLUMN_WIDTH,
    },
  ], [dirtyConfigs, isConfigDirty, calculatePreviewWidth]);

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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
              title="ייצא ל-Excel"
            >
              <Download className="h-4 w-4" />
              ייצא
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 disabled:bg-gray-400  text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none font-medium"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 active:bg-slate-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              רענן
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
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
        </div>

        {totalChanges > 0 && (
          <div className="flex items-center justify-end gap-2 mb-4">
            <button
              onClick={handleCancelAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 active:bg-slate-700 disabled:bg-gray-400  text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none font-medium"
            >
              <X className="h-4 w-4" />
              ביטול ({totalChanges})
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving || totalChanges === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 disabled:bg-gray-400  text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none font-medium"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'שומר...' : `שמור הכל (${totalChanges})`}
            </button>
          </div>
        )}

        <p className="text-slate-600 mb-6">
          הגדר רוחב ותפיחה לכל שדה במערכת. כל הטבלאות ישתמשו בהגדרות אלה.
        </p>

        <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
          <AgGridReact<FieldConfiguration>
            ref={gridRef}
            rowData={filteredConfigurations}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              sortable: true,
              filter: true,
              headerClass: 'ag-right-aligned-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
              cellStyle: { textAlign: 'right' },
              minWidth: 40
            }}
            gridOptions={{
              suppressColumnVirtualisation: false,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
              rowBuffer: 10,
              debounceVerticalScrollbar: true,
            }}
            suppressHorizontalScroll={false}
            getRowId={(params) => `${params.data.grid_name}-${params.data.field_name}`}
            onGridReady={async (params) => {
              await gridPreferences.loadColumnState(params.api);
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
              }, 200);
            }}
            onFirstDataRendered={async (params) => {
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
                setupTextOverflowObserver(params.api);
              }, 200);
            }}
            onColumnResized={(params) => {
              gridPreferences.handleColumnResized();
              setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
            }}
            onColumnMoved={gridPreferences.handleColumnMoved}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enableRtl={true}
            animateRows={false}
          />
        </div>

        {filteredConfigurations.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            אין הגדרות שדות. הוסף שדה חדש כדי להתחיל.
          </div>
        )}
      </div>
    </div>
  );
}
