import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, api } from '../lib/api';
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Save, X, Loader2, Download, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useValidationRules } from '../contexts/ValidationContext';

export function AssetTypes() {
  const { t } = useTranslation();
  const { refreshRules } = useValidationRules();
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [originalAssetTypes, setOriginalAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [dirtyAssetTypes, setDirtyAssetTypes] = useState<Map<number, Partial<AssetType>>>(new Map());
  const [deletedAssetTypes, setDeletedAssetTypes] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  
  // Column widths state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    actions: 80,
    name: 100,
    active: 60,
    description: 200,
    tax_region: 120,
    elevator: 60,
    single_double_family: 60,
    penthouse: 60,
    condo: 60,
    townhouses: 60,
    business_private: 120,
    shared_area_usage: 60,
    min_size: 80,
    max_size: 80,
  });
  
  // Resizing state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tax_region: '',
    elevator: '',
    single_double_family: '',
    penthouse: '',
    condo: '',
    townhouses: '',
    business_private: '',
    shared_area_usage: '',
    min_size: '',
    max_size: '',
  });

  useEffect(() => {
    fetchAssetTypes();
  }, []);

  async function fetchAssetTypes(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await api.assetTypes.getAll();
      setAssetTypes(data);
      // Store original data only if dirtyAssetTypes is empty (initial load or after save)
      if (dirtyAssetTypes.size === 0) {
        setOriginalAssetTypes(JSON.parse(JSON.stringify(data)));
      }
    } catch (error) {
      console.error('Error fetching asset types:', error);
      showMessage('error', t('error'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error' | 'info', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function resetForm() {
    setFormData({ name: '', description: '', tax_region: '', elevator: '', single_double_family: '', penthouse: '', condo: '', townhouses: '', business_private: '', shared_area_usage: '', min_size: '', max_size: '' });
    setIsAdding(false);
  }

  function startAdd() {
    resetForm();
    setIsAdding(true);
  }

  async function handleSave() {
    if (!formData.name) {
      showMessage('error', 'קוד נכס חייב להיות מספר');
      return;
    }

    const taxRegionValidation = await assetTypeValidators.validateTaxRegion(formData.tax_region);
    if (!taxRegionValidation.valid) {
      showMessage('error', taxRegionValidation.error!);
      return;
    }

    setIsSaving(true);
    try {
      const dataToSave = {
        name: formData.name,
        description: formData.description || undefined,
        tax_region: formData.tax_region ? parseInt(formData.tax_region) : undefined,
        elevator: formData.elevator || undefined,
        single_double_family: formData.single_double_family || undefined,
        penthouse: formData.penthouse || undefined,
        condo: formData.condo || undefined,
        townhouses: formData.townhouses || undefined,
        business_private: formData.business_private || undefined,
        shared_area_usage: formData.shared_area_usage || undefined,
        min_size: formData.min_size ? parseFloat(formData.min_size) : undefined,
        max_size: formData.max_size ? parseFloat(formData.max_size) : undefined,
      };

      await api.assetTypes.create(dataToSave);
      
      // Reload validation rules after creating new asset type
      await refreshRules();
      console.log('[AssetTypes] Validation rules reloaded after creating new asset type');
      
      showMessage('success', t('assetTypeCreated'));
      await fetchAssetTypes();
      resetForm();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error saving asset type:', error);
    } finally {
      setIsSaving(false);
    }
  }

  // Helper function to get current value of a field (considering dirty state)
  const getCurrentValue = useCallback((assetType: AssetType, field: keyof AssetType): any => {
    const dirtyChanges = dirtyAssetTypes.get(assetType.id);
    if (dirtyChanges && field in dirtyChanges) {
      return dirtyChanges[field as keyof Partial<AssetType>];
    }
    return assetType[field];
  }, [dirtyAssetTypes]);

  // Helper function to check if a field is dirty
  const isFieldDirty = useCallback((assetTypeId: number, field: keyof AssetType): boolean => {
    return dirtyAssetTypes.has(assetTypeId) && field in (dirtyAssetTypes.get(assetTypeId) || {});
  }, [dirtyAssetTypes]);

  // Handle cell value change for table
  const handleCellChange = useCallback(async (assetTypeId: number, field: keyof AssetType, newValue: any) => {
    try {
      // Validate name field
      if (field === 'name') {
        const nameValidation = await assetTypeValidators.validateName(newValue);
        if (!nameValidation.valid) {
          showMessage('error', nameValidation.error!);
          return;
        }
      }

      // Validate business_private field
      if (field === 'business_private') {
        if (newValue !== null && newValue !== undefined && newValue !== '' && newValue !== 'עסקים' && newValue !== 'מגורים') {
          showMessage('error', 'עסקים/מגורים חייב להיות "עסקים" או "מגורים"');
          return;
        }
      }

      // Track the change in dirtyAssetTypes
      setDirtyAssetTypes(prev => {
        const next = new Map(prev);
        const existingChanges = next.get(assetTypeId) || {};
        next.set(assetTypeId, { ...existingChanges, [field]: newValue });
        return next;
      });
    } catch (error) {
      console.error('Error updating asset type:', error);
      showMessage('error', 'שגיאה בעדכון');
    }
  }, []);

  // Handle sorting
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Handle filtering
  const handleFilterChange = useCallback((field: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }, []);

  // Handle column resizing
  const handleResizeStart = useCallback((column: string, e: React.MouseEvent) => {
    e.preventDefault();
    setResizingColumn(column);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[column] || 100;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - resizeStartX.current;
      const newWidth = Math.max(50, resizeStartWidth.current - deltaX); // RTL: subtract deltaX
      setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };
    
    const handleMouseUp = () => {
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

  async function handleDelete(id: number) {
    if (!confirm(t('confirmDeleteAssetType'))) return;

    // Mark for deletion (don't delete immediately)
    setDeletedAssetTypes(prev => new Set(prev).add(id));
    setDirtyAssetTypes(prev => {
      const next = new Map(prev);
      next.delete(id); // Remove from dirty changes if exists
      return next;
    });
    
    // Update local state to hide the row
    setAssetTypes(prev => prev.filter(at => at.id !== id));
  }

  async function handleSaveAll() {
    if (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0) {
      showMessage('info', 'אין שינויים לשמירה');
      return;
    }

    setIsSaving(true);
    try {
      // Process deletions first
      for (const id of deletedAssetTypes) {
        await api.assetTypes.delete(id);
      }

      // Process updates
      for (const [id, changes] of dirtyAssetTypes.entries()) {
        if (!deletedAssetTypes.has(id)) {
          // Validate tax_region if it's being changed
          if ('tax_region' in changes) {
            const validation = await assetTypeValidators.validateTaxRegion(changes.tax_region);
            if (!validation.valid) {
              showMessage('error', `שגיאה בנכס ${id}: ${validation.error}`);
              setIsSaving(false);
              return;
            }
          }

          await api.assetTypes.update(id, changes);
        }
      }

      showMessage('success', 'כל השינויים נשמרו בהצלחה');
      setDirtyAssetTypes(new Map());
      setDeletedAssetTypes(new Set());
      await fetchAssetTypes();
    } catch (error) {
      console.error('Error saving changes:', error);
      showMessage('error', 'שגיאה בשמירת השינויים');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelAll() {
    if (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0) {
      return;
    }

    // Restore original data
    setAssetTypes(JSON.parse(JSON.stringify(originalAssetTypes)));
    setDirtyAssetTypes(new Map());
    setDeletedAssetTypes(new Set());
  }

  // Filter and sort asset types
  const filteredAndSortedAssetTypes = useMemo(() => {
    let filtered = assetTypes.filter(assetType => {
      // Apply global filter (searches across all fields)
      if (filters.global) {
        const globalSearch = filters.global.toLowerCase();
        const searchableFields = [
          String(assetType.name || ''),
          String(assetType.description || ''),
          String(assetType.tax_region || ''),
          String(assetType.business_private || ''),
        ];
        const matchesGlobal = searchableFields.some(field => field.toLowerCase().includes(globalSearch));
        if (!matchesGlobal) return false;
      }

      // Apply specific field filters
      if (filters.name && !String(assetType.name || '').toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.description && !String(assetType.description || '').toLowerCase().includes(filters.description.toLowerCase())) {
        return false;
      }
      if (filters.tax_region && String(assetType.tax_region || '') !== filters.tax_region) {
        return false;
      }
      if (filters.business_private && String(assetType.business_private || '') !== filters.business_private) {
        return false;
      }
      return true;
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = getCurrentValue(a, sortColumn as keyof AssetType);
        const bValue = getCurrentValue(b, sortColumn as keyof AssetType);
        
        let comparison = 0;
        if (aValue === null || aValue === undefined) comparison = 1;
        else if (bValue === null || bValue === undefined) comparison = -1;
        else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [assetTypes, filters, sortColumn, sortDirection, getCurrentValue]);


  function downloadTemplate() {
    // Headers matching the import function expectations
    const headers = [
      'סוג נכס',
      'תיאור',
      'אזור מיסים',
      'מעלית',
      'בית פרטי חד משפחתי דו משפחתי',
      'דירת גג',
      'בית משותף',
      'מבנים צמודי קרקע טוריים מעל 2 יחידות',
      'עסקים/מגורים',
      'שימוש בשטח משותף',
      'שטח מ',
      'שטח עד'
    ];

    // Example rows
    const exampleRows = [
      ['199', 'דירה רגילה', '10', 'כן', '', '', 'כן', '', 'מגורים', '', '20', '150'],
      ['299', 'דירה מורכבת', '40', '', '', '', 'כן', '', 'מגורים', '', '30', '200'],
      ['101', 'חנות', '10', '', '', '', '', '', 'עסקים', '', '10', '100']
    ];

    // Create data array with headers and example rows
    const data = [headers, ...exampleRows];

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 12 }, // סוג נכס
      { wch: 25 }, // תיאור
      { wch: 12 }, // אזור מיסים
      { wch: 8 },  // מעלית
      { wch: 35 }, // בית פרטי חד משפחתי דו משפחתי
      { wch: 10 }, // דירת גג
      { wch: 12 }, // בית משותף
      { wch: 40 }, // מבנים צמודי קרקע טוריים מעל 2 יחידות
      { wch: 15 }, // עסקים/מגורים
      { wch: 20 }, // שימוש בשטח משותף
      { wch: 10 }, // שטח מ
      { wch: 10 }  // שטח עד
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'סוגי נכסים');
    
    // Download the file
    XLSX.writeFile(workbook, 'תבנית_סוגי_נכסים.xlsx');
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // Check if it's Excel file
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      let lines: string[] = [];
      
      if (isExcel) {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
        
        // Skip header row and convert to CSV-like format
        lines = jsonData.slice(1).map(row => row.map(cell => String(cell || '')).join(','));
      } else {
        // Handle CSV file
        const text = await file.text();
        lines = text.split('\n').filter(line => line.trim());
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // First, truncate the table by deleting all records
      try {
        const allAssetTypes = await api.assetTypes.getAll();
        for (const assetType of allAssetTypes) {
          try {
            await api.assetTypes.delete(assetType.id);
          } catch (err) {
            console.error(`Error deleting asset type ${assetType.id}:`, err);
          }
        }
      } catch (err) {
        console.error('Error truncating asset types:', err);
        showMessage('error', 'שגיאה במחיקת רשומות קיימות');
      }

      // Parse and import each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line - handle quoted values
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim()); // Add last part

        // Map columns: name, description, tax_region, elevator, single_double_family, penthouse, condo, townhouses, business_private, shared_area_usage, min_size, max_size
        const [name, description = '', tax_region = '', elevator = '', single_double_family = '', penthouse = '', condo = '', townhouses = '', business_private = '', shared_area_usage = '', min_size = '', max_size = ''] = parts;

        // Skip header row if it doesn't look like data
        if (i === 0 && (name === 'סוג נכס' || name === 'name' || !name || isNaN(parseInt(name)))) {
          continue;
        }

        if (!name) continue;

        const nameValidation = await assetTypeValidators.validateName(name);
        if (!nameValidation.valid) {
          errors.push(`שורה ${i + 1}: ${nameValidation.error}`);
          errorCount++;
          continue;
        }

        try {
          // Validate business_private field - only allow 'עסקים', 'מגורים', or empty
          let validBusinessPrivate: string | undefined = undefined;
          if (business_private && business_private.trim() !== '') {
            const trimmed = business_private.trim();
            if (trimmed === 'עסקים' || trimmed === 'מגורים') {
              validBusinessPrivate = trimmed;
            } else {
              errors.push(`שורה ${i + 1}: עסקים/מגורים חייב להיות "עסקים" או "מגורים"`);
              errorCount++;
              continue;
            }
          }

          const assetTypeData: Partial<AssetType> = {
            name,
            description: description || undefined,
            tax_region: tax_region ? parseInt(tax_region) : undefined,
            elevator: elevator || undefined,
            single_double_family: single_double_family || undefined,
            penthouse: penthouse || undefined,
            condo: condo || undefined,
            townhouses: townhouses || undefined,
            business_private: validBusinessPrivate,
            shared_area_usage: shared_area_usage || undefined,
            min_size: min_size ? parseFloat(min_size) : undefined,
            max_size: max_size ? parseFloat(max_size) : undefined,
          };

          await api.assetTypes.create(assetTypeData);
          successCount++;
        } catch (error) {
          errors.push(`שורה ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchAssetTypes();

      // Reload validation rules after importing asset types
      await refreshRules();
      console.log('[AssetTypes] Validation rules reloaded after importing asset types');

      if (errors.length > 0) {
        showMessage('error', `יובאו ${successCount} רשומות. ${errorCount} שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        showMessage('success', `יובאו בהצלחה ${successCount} רשומות`);
      }
    } catch (error) {
      showMessage('error', 'שגיאה בקריאת קובץ File');
      console.error('Error importing File:', error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-3">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-7 h-7 text-white bg-white/20 rounded-lg p-1" />
            <h1 className="text-lg sm:text-xl font-bold text-white">{t('assetTypes')}</h1>
          </div>
          <div className="text-white text-sm font-medium">
            {assetTypes.length} רשומות
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 
            message.type === 'error' ? 'bg-red-50 text-red-800' : 
            'bg-blue-50 text-blue-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">{t('assetTypes')}</h2>
          </div>
          {!isAdding && (
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">{t('downloadTemplate')}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="hidden sm:inline">{isImporting ? t('loading') : t('importCSV')}</span>
              </button>
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                {t('addAssetType')}
              </button>
            </div>
          )}
        </div>

        {/* Save All / Cancel buttons - always visible */}
        {!isAdding && (
          <div className="mb-4 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleCancelAll}
              disabled={isSaving || (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0)}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0)}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? 'שומר...' : `שמור הכל${dirtyAssetTypes.size + deletedAssetTypes.size > 0 ? ` (${dirtyAssetTypes.size + deletedAssetTypes.size})` : ''}`}
            </button>
          </div>
        )}

        {isAdding && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {t('addAssetType')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  קוד נכס *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="199"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תיאור
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="תיאור"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  אזור מיסים
                </label>
                <input
                  type="number"
                  step="1"
                  value={formData.tax_region}
                  onChange={(e) => setFormData({ ...formData, tax_region: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.elevator === 'כן'}
                    onChange={(e) => setFormData({ ...formData, elevator: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  מעלית
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.single_double_family === 'כן'}
                    onChange={(e) => setFormData({ ...formData, single_double_family: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  בית פרטי חד משפחתי דו משפחתי
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.penthouse === 'כן'}
                    onChange={(e) => setFormData({ ...formData, penthouse: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  דירת גג
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.condo === 'כן'}
                    onChange={(e) => setFormData({ ...formData, condo: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  בית משותף
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.townhouses === 'כן'}
                    onChange={(e) => setFormData({ ...formData, townhouses: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  מבנים צמודי קרקע טוריים מעל 2 יחידות
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  עסקים/מגורים
                </label>
                <select
                  value={formData.business_private}
                  onChange={(e) => setFormData({ ...formData, business_private: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">-- בחר --</option>
                  <option value="עסקים">עסקים</option>
                  <option value="מגורים">מגורים</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.shared_area_usage === 'כן'}
                    onChange={(e) => setFormData({ ...formData, shared_area_usage: e.target.checked ? 'כן' : undefined })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  שימוש בשטח משותף
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  שטח מ
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_size}
                  onChange={(e) => setFormData({ ...formData, min_size: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  שטח עד
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.max_size}
                  onChange={(e) => setFormData({ ...formData, max_size: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isSaving ? 'שומר...' : t('save')}
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}


        {assetTypes.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Tag className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg">{t('noAssetTypes')}</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden shadow-lg border border-blue-100 bg-white">
            {/* Global search filter */}
            <div className="p-3 border-b border-blue-200 bg-blue-50">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-blue-600" />
                <input
                  type="text"
                  placeholder="חיפוש גלובלי..."
                  value={filters.global || ''}
                  onChange={(e) => handleFilterChange('global', e.target.value)}
                  className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {filters.global && (
                  <button
                    onClick={() => handleFilterChange('global', '')}
                    className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    נקה
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
              <table className="w-full border-collapse" dir="rtl">
                <thead className="bg-blue-50 sticky top-0 z-10">
                  <tr>
                    <th className="border border-blue-200 p-2 text-center sticky right-0 bg-blue-50 z-20 relative" style={{ width: columnWidths.actions, minWidth: '50px' }}>
                      {t('actions')}
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.name, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30 transition-colors"
                        style={{ cursor: resizingColumn === 'name' ? 'col-resize' : 'ew-resize' }}
                        onMouseDown={(e) => handleResizeStart('name', e)}
                        title="גרור כדי לשנות רוחב"
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('name')}
                      >
                        <span className="text-right font-semibold">סוג נכס</span>
                        {sortColumn === 'name' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="סינון..."
                        value={filters.name || ''}
                        onChange={(e) => handleFilterChange('name', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-xs border rounded"
                      />
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.active, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('active', e)}
                      />
                      <div 
                        className="flex items-center justify-center gap-1 mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('active')}
                      >
                        <span className="font-semibold">פעיל</span>
                        {sortColumn === 'active' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.description, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('description', e)}
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('description')}
                      >
                        <span className="text-right font-semibold">תיאור</span>
                        {sortColumn === 'description' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="סינון..."
                        value={filters.description || ''}
                        onChange={(e) => handleFilterChange('description', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-xs border rounded"
                      />
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.tax_region, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('tax_region', e)}
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('tax_region')}
                      >
                        <span className="text-right font-semibold">אזור מיסים</span>
                        {sortColumn === 'tax_region' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="סינון..."
                        value={filters.tax_region || ''}
                        onChange={(e) => handleFilterChange('tax_region', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-xs border rounded"
                      />
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.elevator, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('elevator', e)}
                      />
                      <span className="font-semibold">מעלית</span>
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.single_double_family, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('single_double_family', e)}
                      />
                      <span className="font-semibold">בית פרטי</span>
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.penthouse, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('penthouse', e)}
                      />
                      <span className="font-semibold">דירת גג</span>
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.condo, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('condo', e)}
                      />
                      <span className="font-semibold">בית משותף</span>
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.townhouses, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('townhouses', e)}
                      />
                      <span className="font-semibold">טוריים</span>
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.business_private, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('business_private', e)}
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('business_private')}
                      >
                        <span className="text-right font-semibold">עסקים/מגורים</span>
                        {sortColumn === 'business_private' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                      <select
                        value={filters.business_private || ''}
                        onChange={(e) => handleFilterChange('business_private', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-xs border rounded"
                      >
                        <option value="">הכל</option>
                        <option value="עסקים">עסקים</option>
                        <option value="מגורים">מגורים</option>
                      </select>
                    </th>
                    <th className="border border-blue-200 p-2 text-center relative" style={{ width: columnWidths.shared_area_usage, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('shared_area_usage', e)}
                      />
                      <span className="font-semibold">שטח משותף</span>
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.min_size, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('min_size', e)}
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('min_size')}
                      >
                        <span className="text-right font-semibold">שטח מ</span>
                        {sortColumn === 'min_size' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                    </th>
                    <th className="border border-blue-200 p-2 relative" style={{ width: columnWidths.max_size, minWidth: '50px' }}>
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30"
                        onMouseDown={(e) => handleResizeStart('max_size', e)}
                      />
                      <div 
                        className="flex items-center justify-between mb-1 cursor-pointer hover:bg-blue-100 px-1 -mx-1 rounded"
                        onClick={() => handleSort('max_size')}
                      >
                        <span className="text-right font-semibold">שטח עד</span>
                        {sortColumn === 'max_size' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedAssetTypes.map((assetType, index) => {
                    const isDirty = dirtyAssetTypes.has(assetType.id);
                    const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-blue-50';
                    return (
                      <tr key={assetType.id} className={rowClass}>
                        <td className={`border border-blue-200 p-2 text-center sticky right-0 z-10 ${rowClass}`} style={{ width: columnWidths.actions, minWidth: '50px' }}>
                          <button
                            onClick={() => handleDelete(assetType.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="מחק"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.name, minWidth: '50px' }}>
                          <input
                            type="text"
                            value={getCurrentValue(assetType, 'name') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'name', e.target.value)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'name') ? 'bg-yellow-100 font-bold' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.active, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'active') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'active', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'active') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.description, minWidth: '50px' }}>
                          <input
                            type="text"
                            value={getCurrentValue(assetType, 'description') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'description', e.target.value)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'description') ? 'bg-yellow-100 font-bold' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.tax_region, minWidth: '50px' }}>
                          <input
                            type="number"
                            value={getCurrentValue(assetType, 'tax_region') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'tax_region', e.target.value ? parseInt(e.target.value) : null)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'tax_region') ? 'bg-yellow-100 font-bold' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.elevator, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'elevator') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'elevator', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'elevator') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.single_double_family, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'single_double_family') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'single_double_family', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'single_double_family') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.penthouse, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'penthouse') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'penthouse', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'penthouse') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.condo, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'condo') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'condo', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'condo') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.townhouses, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'townhouses') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'townhouses', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'townhouses') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.business_private, minWidth: '50px' }}>
                          <select
                            value={getCurrentValue(assetType, 'business_private') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'business_private', e.target.value || null)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'business_private') ? 'bg-yellow-100 font-bold' : ''}`}
                          >
                            <option value="">-- בחר --</option>
                            <option value="עסקים">עסקים</option>
                            <option value="מגורים">מגורים</option>
                          </select>
                        </td>
                        <td className="border border-blue-200 p-2 text-center" style={{ width: columnWidths.shared_area_usage, minWidth: '50px' }}>
                          <input
                            type="checkbox"
                            checked={getCurrentValue(assetType, 'shared_area_usage') === 'כן'}
                            onChange={(e) => handleCellChange(assetType.id, 'shared_area_usage', e.target.checked ? 'כן' : null)}
                            className={`w-4 h-4 text-blue-600 rounded ${isFieldDirty(assetType.id, 'shared_area_usage') ? 'ring-2 ring-yellow-400' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.min_size, minWidth: '50px' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={getCurrentValue(assetType, 'min_size') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'min_size', e.target.value ? parseFloat(e.target.value) : null)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'min_size') ? 'bg-yellow-100 font-bold' : ''}`}
                          />
                        </td>
                        <td className="border border-blue-200 p-2" style={{ width: columnWidths.max_size, minWidth: '50px' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={getCurrentValue(assetType, 'max_size') || ''}
                            onChange={(e) => handleCellChange(assetType.id, 'max_size', e.target.value ? parseFloat(e.target.value) : null)}
                            className={`w-full px-2 py-1 border rounded text-right ${isFieldDirty(assetType.id, 'max_size') ? 'bg-yellow-100 font-bold' : ''}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
