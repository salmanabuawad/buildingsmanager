import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, api } from '../lib/api';
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Trash2, Save, X, Loader2 } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../hooks/useGridPreferences';

export function AssetTypes() {
  const { t } = useTranslation();
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
  const gridRef = useRef<AgGridReact<AssetType>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'asset_types_column_state');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tax_region: '',
    elevator: '',
    single_double_family: '',
    penthouse: '',
    condo: '',
    townhouses: '',
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
    setFormData({ name: '', description: '', tax_region: '', elevator: '', single_double_family: '', penthouse: '', condo: '', townhouses: '', min_size: '', max_size: '' });
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
        min_size: formData.min_size ? parseFloat(formData.min_size) : undefined,
        max_size: formData.max_size ? parseFloat(formData.max_size) : undefined,
      };

      await api.assetTypes.create(dataToSave);
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

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetTypeId = data.id;
      const newValue = event.newValue;

      if (field === 'name') {
        showMessage('error', 'לא ניתן לערוך את קוד הנכס');
        // Revert the change
        const originalAssetType = originalAssetTypes.find(at => at.id === assetTypeId);
        if (originalAssetType) {
          event.node.setDataValue('name', originalAssetType.name);
        }
        return;
      }

      // Track the change in dirtyAssetTypes
      setDirtyAssetTypes(prev => {
        const next = new Map(prev);
        const existingChanges = next.get(assetTypeId) || {};
        next.set(assetTypeId, { ...existingChanges, [field]: newValue });
        return next;
      });

      // Update local state immediately for UI responsiveness
      setAssetTypes(prev => 
        prev.map(at => at.id === assetTypeId ? { ...at, [field]: newValue } : at)
      );
      
      // Force refresh only this specific cell to avoid affecting other cells
      if (gridRef.current) {
        gridRef.current.api.refreshCells({ 
          rowNodes: [event.node], 
          columns: [field],
          force: true 
        });
      }
    } catch (error) {
      console.error('Error updating asset type:', error);
      showMessage('error', 'שגיאה בעדכון');
    }
  }, [originalAssetTypes]);

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
      
      // Refresh grid to show updated data
      if (gridRef.current) {
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.redrawRows();
      }
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
    
    // Refresh grid
    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }

  const columnDefs: ColDef<AssetType>[] = useMemo(() => [
    {
      colId: 'actions',
      headerName: t('actions'),
      editable: false,
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressSizeToFit: true,
      suppressMenu: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'text-left',
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => handleDelete(params.data.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      }
    },
    {
      field: 'name',
      headerName: 'סוג נכס',
      editable: false,
      cellStyle: { textAlign: 'left' },
      headerClass: 'text-left'
    },
    {
      field: 'description',
      headerName: 'תיאור',
      editable: true,
      valueFormatter: (params) => params.value || '',
      cellStyle: { textAlign: 'left' },
      headerClass: 'text-left'
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      editable: true,
      valueFormatter: (params) => params.value || '',
      cellStyle: { textAlign: 'left' },
      headerClass: 'text-left'
    },
    {
      field: 'elevator',
      headerName: 'מעלית',
      editable: false,
      headerClass: 'text-left',
      cellRenderer: (params: any) => {
        const assetTypeId = params.data?.id;
        if (!assetTypeId) return null;
        
        // Use params.value which is the current cell value
        const isChecked = params.value === 'כן';
        const isDirty = dirtyAssetTypes.has(assetTypeId) && 'elevator' in (dirtyAssetTypes.get(assetTypeId) || {});
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                // Track the change in dirtyAssetTypes
                setDirtyAssetTypes(prev => {
                  const next = new Map(prev);
                  const existingChanges = next.get(assetTypeId) || {};
                  next.set(assetTypeId, { ...existingChanges, elevator: newValue });
                  return next;
                });
                // Update grid cell data directly first
                params.node.setDataValue('elevator', newValue);
                // Update local state
                setAssetTypes(prev => 
                  prev.map(at => at.id === assetTypeId ? { ...at, elevator: newValue } : at)
                );
                // Force refresh only this cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['elevator'],
                    force: true 
                  });
                }
              }}
              className={`w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center' }
    },
    {
      field: 'single_double_family',
      headerName: 'בית פרטי חד משפחתי דו משפחתי',
      editable: false,
      cellRenderer: (params: any) => {
        const assetTypeId = params.data?.id;
        if (!assetTypeId) return null;
        
        // Use params.value which is the current cell value
        const isChecked = params.value === 'כן';
        const isDirty = dirtyAssetTypes.has(assetTypeId) && 'single_double_family' in (dirtyAssetTypes.get(assetTypeId) || {});
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                // Track the change in dirtyAssetTypes
                setDirtyAssetTypes(prev => {
                  const next = new Map(prev);
                  const existingChanges = next.get(assetTypeId) || {};
                  next.set(assetTypeId, { ...existingChanges, single_double_family: newValue });
                  return next;
                });
                // Update grid cell data directly first
                params.node.setDataValue('single_double_family', newValue);
                // Update local state
                setAssetTypes(prev => 
                  prev.map(at => at.id === assetTypeId ? { ...at, single_double_family: newValue } : at)
                );
                // Force refresh only this cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['single_double_family'],
                    force: true 
                  });
                }
              }}
              className={`w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center' },
      headerClass: 'text-left'
    },
    {
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      headerClass: 'text-left',
      cellRenderer: (params: any) => {
        const assetTypeId = params.data?.id;
        if (!assetTypeId) return null;
        
        // Use params.value which is the current cell value
        const isChecked = params.value === 'כן';
        const isDirty = dirtyAssetTypes.has(assetTypeId) && 'penthouse' in (dirtyAssetTypes.get(assetTypeId) || {});
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                // Track the change in dirtyAssetTypes
                setDirtyAssetTypes(prev => {
                  const next = new Map(prev);
                  const existingChanges = next.get(assetTypeId) || {};
                  next.set(assetTypeId, { ...existingChanges, penthouse: newValue });
                  return next;
                });
                // Update grid cell data directly first
                params.node.setDataValue('penthouse', newValue);
                // Update local state
                setAssetTypes(prev => 
                  prev.map(at => at.id === assetTypeId ? { ...at, penthouse: newValue } : at)
                );
                // Force refresh only this cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['penthouse'],
                    force: true 
                  });
                }
              }}
              className={`w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center' }
    },
    {
      field: 'condo',
      headerName: 'בית משותף',
      editable: false,
      headerClass: 'text-left',
      cellRenderer: (params: any) => {
        const assetTypeId = params.data?.id;
        if (!assetTypeId) return null;
        
        // Use params.value which is the current cell value
        const isChecked = params.value === 'כן';
        const isDirty = dirtyAssetTypes.has(assetTypeId) && 'condo' in (dirtyAssetTypes.get(assetTypeId) || {});
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                // Track the change in dirtyAssetTypes
                setDirtyAssetTypes(prev => {
                  const next = new Map(prev);
                  const existingChanges = next.get(assetTypeId) || {};
                  next.set(assetTypeId, { ...existingChanges, condo: newValue });
                  return next;
                });
                // Update grid cell data directly first
                params.node.setDataValue('condo', newValue);
                // Update local state
                setAssetTypes(prev => 
                  prev.map(at => at.id === assetTypeId ? { ...at, condo: newValue } : at)
                );
                // Force refresh only this cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['condo'],
                    force: true 
                  });
                }
              }}
              className={`w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center' }
    },
    {
      field: 'townhouses',
      headerName: 'בניינים צמודי קרקע טוריים מעל 2 יחידות',
      editable: false,
      cellRenderer: (params: any) => {
        const assetTypeId = params.data?.id;
        if (!assetTypeId) return null;
        
        // Use params.value which is the current cell value
        const isChecked = params.value === 'כן';
        const isDirty = dirtyAssetTypes.has(assetTypeId) && 'townhouses' in (dirtyAssetTypes.get(assetTypeId) || {});
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                // Track the change in dirtyAssetTypes
                setDirtyAssetTypes(prev => {
                  const next = new Map(prev);
                  const existingChanges = next.get(assetTypeId) || {};
                  next.set(assetTypeId, { ...existingChanges, townhouses: newValue });
                  return next;
                });
                // Update grid cell data directly first
                params.node.setDataValue('townhouses', newValue);
                // Update local state
                setAssetTypes(prev => 
                  prev.map(at => at.id === assetTypeId ? { ...at, townhouses: newValue } : at)
                );
                // Force refresh only this cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['townhouses'],
                    force: true 
                  });
                }
              }}
              className={`w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center' },
      headerClass: 'text-left'
    },
    {
      field: 'min_size',
      headerName: 'שטח מ',
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params) => {
        const baseStyle = { textAlign: 'left' as const };
        const assetTypeId = params.data?.id;
        const isDirty = assetTypeId && dirtyAssetTypes.has(assetTypeId) && 'min_size' in (dirtyAssetTypes.get(assetTypeId) || {});
        return isDirty ? { ...baseStyle, fontWeight: 'bold', backgroundColor: '#fef3c7' } : baseStyle;
      },
      headerClass: 'text-left'
    },
    {
      field: 'max_size',
      headerName: 'שטח עד',
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params) => {
        const baseStyle = { textAlign: 'left' as const };
        const assetTypeId = params.data?.id;
        const isDirty = assetTypeId && dirtyAssetTypes.has(assetTypeId) && 'max_size' in (dirtyAssetTypes.get(assetTypeId) || {});
        return isDirty ? { ...baseStyle, fontWeight: 'bold', backgroundColor: '#fef3c7' } : baseStyle;
      },
      headerClass: 'text-left'
    },
  ], [t, dirtyAssetTypes]);

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(s => s.trim());
        const [name, description = ''] = parts;

        const nameValidation = await assetTypeValidators.validateName(name || '');
        if (!nameValidation.valid) {
          errors.push(`Line ${i + 1}: ${nameValidation.error}`);
          errorCount++;
          continue;
        }

        try {
          await api.assetTypes.create({ name, description });
          successCount++;
        } catch (error) {
          errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchAssetTypes();

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
                accept=".csv"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="hidden sm:inline">{isImporting ? t('loading') : t('importCSV')}</span>
              </button>
              <button
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
              onClick={handleCancelAll}
              disabled={isSaving || (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0)}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
            <button
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
                  בניינים צמודי קרקע טוריים מעל 2 יחידות
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
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ width: '100%', height: '60vh', direction: 'ltr' }}>
            <AgGridReact
              ref={gridRef}
              rowData={assetTypes}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                sortable: true,
                wrapText: true,
                autoHeight: false,
                minWidth: 30
              }}
              domLayout="normal"
              onCellValueChanged={onCellValueChanged}
              onGridReady={async (params) => {
                // Load saved column state first
                const hasSavedState = await loadColumnState();
                
                // If no saved state, apply default sizing
                if (!hasSavedState) {
                  setTimeout(() => {
                    const allColumnIds = params.api.getAllDisplayedColumns()
                      .map(col => col.getColId())
                      .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                    
                    if (allColumnIds.length > 0) {
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 100);
                }
              }}
              onFirstDataRendered={async (params) => {
                // Load saved column state if not already loaded
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  
                  // If no saved state, apply default sizing
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                      
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                } else {
                  const firstCol = params.api.getAllDisplayedColumns()[0];
                  if (firstCol) {
                    params.api.ensureColumnVisible(firstCol);
                  }
                }
                
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              onColumnResized={saveColumnState}
              onColumnMoved={(params) => {
                // Prevent actions column from being moved - force it back to first position
                const actionsColumn = params.columnApi.getColumn('actions');
                if (actionsColumn) {
                  const allColumns = params.columnApi.getAllColumns() || [];
                  const actionsIndex = allColumns.findIndex(col => col.getColId() === 'actions');
                  if (actionsIndex !== 0) {
                    setTimeout(() => {
                      if (gridRef.current?.api) {
                        const columnState = gridRef.current.api.getColumnState();
                        const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                        const otherCols = columnState.filter((col: any) => col.colId !== 'actions');
                        if (actionsCol) {
                          gridRef.current.api.applyColumnState({
                            state: [{ ...actionsCol, pinned: 'right', lockPosition: true }, ...otherCols],
                            applyOrder: true
                          });
                        }
                      }
                    }, 0);
                    return;
                  }
                }
                saveColumnState();
              }}
              onSortChanged={saveColumnState}
              pagination={false}
              suppressHorizontalScroll={false}
              enableRtl={true}
              rowClass="ag-row"
              getRowStyle={(params) => {
                if (params.node.rowIndex % 2 === 0) {
                  return { background: '#ffffff' };
                }
                return { background: '#f0f9ff' };
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
