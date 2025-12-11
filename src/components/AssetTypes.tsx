import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, api } from '../lib/api';
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Save, X, Loader2, Download, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Filter, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useValidationRules } from '../contexts/ValidationContext';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';

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
  const gridRef = useRef<AgGridReact<AssetType>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'asset-types',
    'default'
  );

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tax_region: '',
    elevator: '',
    single_double_family: '',
    penthouse: '',
    condo: '',
    townhouses: '',
    business_residence: '',
    shared_area_usage: '',
    not_accountable: false,
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
    setFormData({ name: '', description: '', tax_region: '', elevator: '', single_double_family: '', penthouse: '', condo: '', townhouses: '', business_residence: '', shared_area_usage: '', not_accountable: false, min_size: '', max_size: '' });
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
        business_residence: formData.business_residence || undefined,
        shared_area_usage: formData.shared_area_usage || undefined,
        not_accountable: formData.not_accountable || undefined,
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

      // Validate business_residence field
      if (field === 'business_residence') {
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


  function handleDelete(id: number) {
    // Toggle deletion mark (don't delete immediately)
    setDeletedAssetTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id); // Unmark for deletion
      } else {
        next.add(id); // Mark for deletion
      }
      return next;
    });
    setDirtyAssetTypes(prev => {
      const next = new Map(prev);
      next.delete(id); // Remove from dirty changes if exists
      return next;
    });
    
    // Refresh grid to show updated state
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
    }, 100);
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
            const taxRegionValue = changes.tax_region;
            const validation = await assetTypeValidators.validateTaxRegion(
              taxRegionValue !== undefined && taxRegionValue !== null ? String(taxRegionValue) : ''
            );
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
    
    // Refresh grid
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }

  // Handle cell value changed in ag-grid
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef } = event;
    const field = colDef.field as keyof AssetType;
    const assetTypeId = data.id;
    const newValue = event.newValue;

    if (!field || !assetTypeId) return;

    await handleCellChange(assetTypeId, field, newValue);
    
    // Refresh grid to show updated state
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ rowNodes: [event.node], force: true });
    }
  }, [handleCellChange]);

  // Handle grid ready - scroll to focus on actions
  const onGridReady = useCallback((event: GridReadyEvent) => {
    // Scroll to focus on actions column
    setTimeout(() => {
      if (event.api) {
        event.api.ensureColumnVisible('actions', 'right');
      }
    }, 100);
  }, []);

  // Column definitions for ag-grid
  const columnDefs: ColDef<AssetType>[] = useMemo(() => {
    const defs: ColDef<AssetType>[] = [
    {
      field: 'active',
      headerName: 'פעיל',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'active');
        const isDirty = isFieldDirty(assetType.id, 'active');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'description',
      headerName: 'תיאור',
      editable: true,
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        useFormatter: false,
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'description');
        return { 
          textAlign: 'right',
          direction: 'rtl',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      editable: true,
      valueParser: (params: any) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'tax_region');
        return { 
          textAlign: 'right',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'area_description_for_tab',
      headerName: 'תיאור אזור לתצוגה בלשונית',
      editable: true,
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        useFormatter: false,
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'area_description_for_tab');
        return { 
          textAlign: 'right',
          direction: 'rtl',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'elevator',
      headerName: 'מעלית',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'elevator');
        const isDirty = isFieldDirty(assetType.id, 'elevator');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'single_double_family',
      headerName: 'בית פרטי',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'single_double_family');
        const isDirty = isFieldDirty(assetType.id, 'single_double_family');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'penthouse');
        const isDirty = isFieldDirty(assetType.id, 'penthouse');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'condo',
      headerName: 'בית משותף',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'condo');
        const isDirty = isFieldDirty(assetType.id, 'condo');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'townhouses',
      headerName: 'טוריים',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'townhouses');
        const isDirty = isFieldDirty(assetType.id, 'townhouses');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'business_residence',
      headerName: 'עסקים/מגורים',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['', 'עסקים', 'מגורים']
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'business_residence');
        return { 
          textAlign: 'right',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'shared_area_usage',
      headerName: 'שטח משותף',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'shared_area_usage');
        const isDirty = isFieldDirty(assetType.id, 'shared_area_usage');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === 'כן'}
              onChange={(e) => {
                params.setValue(e.target.checked ? 'כן' : null);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'not_accountable',
      headerName: 'לא נספר',
      editable: true,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'not_accountable');
        const isDirty = isFieldDirty(assetType.id, 'not_accountable');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                params.setValue(e.target.checked);
              }}
              className={`w-4 h-4 text-blue-600 rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'min_size',
      headerName: 'שטח מ',
      editable: true,
      valueParser: (params: any) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseFloat(params.newValue);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'min_size');
        return { 
          textAlign: 'right',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'max_size',
      headerName: 'שטח עד',
      editable: true,
      valueParser: (params: any) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseFloat(params.newValue);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'max_size');
        return { 
          textAlign: 'right',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'extra_field_1',
      headerName: '',
      editable: false,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      editable: false,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      colId: 'actions',
      headerName: t('actions'),
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const isDeleted = deletedAssetTypes.has(assetType.id);
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <button
              onClick={() => handleDelete(assetType.id)}
              className={`p-1.5 rounded transition-colors ${
                isDeleted
                  ? 'text-red-700 hover:bg-red-100 bg-red-50'
                  : 'text-red-600 hover:bg-red-50'
              }`}
              title={isDeleted ? 'בטל מחיקה' : 'סמן למחיקה'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'name',
      headerName: 'סוג נכס',
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      editable: true,
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        useFormatter: false,
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'name');
        return { 
          textAlign: 'right',
          direction: 'rtl',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    ];
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, getCurrentValue, isFieldDirty, handleDelete, deletedAssetTypes]);


  function downloadTemplate() {
    // Headers - can be in any order, import will map by exact field name match
    // Supports both Hebrew and English field names
    const headers = [
      'סוג נכס',                 // name (required)
      'תיאור',                   // description
      'אזור מיסים',              // tax_region
      'תיאור אזור לתצוגה בלשונית', // area_description_for_tab
      'מעלית',                   // elevator
      'בית פרטי חד משפחתי דו משפחתי', // single_double_family
      'דירת גג',                 // penthouse
      'בית משותף',               // condo
      'מבנים צמודי קרקע טוריים מעל 2 יחידות', // townhouses
      'עסקים/מגורים',            // business_residence
      'שימוש בשטח משותף',         // shared_area_usage
      'לא נספר',                  // not_accountable
      'שטח מ',                   // min_size
      'שטח עד'                   // max_size
    ];

    // Example rows
    // Note: 'לא נספר' column - 'כן' means NOT accountable, 'לא' means IS accountable
    const exampleRows = [
      ['199', 'דירה רגילה', '10', 'אזור מרכז', 'כן', '', '', 'כן', '', 'מגורים', '', 'לא', '20', '150'],
      ['299', 'דירה מורכבת', '40', 'אזור צפון', '', '', '', 'כן', '', 'מגורים', '', 'לא', '30', '200'],
      ['101', 'חנות', '10', 'אזור דרום', '', '', '', '', '', 'עסקים', '', 'כן', '10', '100']
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
      { wch: 10 }, // נספר
      { wch: 10 }, // שטח מ
      { wch: 10 }  // שטח עד
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'סוגי נכסים');
    
    // Download the file
    XLSX.writeFile(workbook, 'תבנית_סוגי_נכסים.xlsx');
  }

  function exportAssetTypes() {
    if (assetTypes.length === 0) {
      showMessage('error', 'אין נתונים לייצוא');
      return;
    }

    // Headers matching the template format
    const headers = [
      'סוג נכס',                 // name
      'תיאור',                   // description
      'אזור מיסים',              // tax_region
      'תיאור אזור לתצוגה בלשונית', // area_description_for_tab
      'מעלית',                   // elevator
      'בית פרטי חד משפחתי דו משפחתי', // single_double_family
      'דירת גג',                 // penthouse
      'בית משותף',               // condo
      'מבנים צמודי קרקע טוריים מעל 2 יחידות', // townhouses
      'עסקים/מגורים',            // business_residence
      'שימוש בשטח משותף',         // shared_area_usage
      'לא נספר',                  // not_accountable
      'שטח מ',                   // min_size
      'שטח עד'                   // max_size
    ];

    // Convert asset types to rows (exclude deleted ones from export)
    const rows = assetTypes
      .filter(at => !deletedAssetTypes.has(at.id))
      .map(assetType => [
        assetType.name || '',
        assetType.description || '',
        assetType.tax_region?.toString() || '',
        assetType.area_description_for_tab || '',
        assetType.elevator || '',
        assetType.single_double_family || '',
        assetType.penthouse || '',
        assetType.condo || '',
        assetType.townhouses || '',
        assetType.business_residence || '',
        assetType.shared_area_usage || '',
        assetType.not_accountable ? 'כן' : 'לא',
        assetType.min_size?.toString() || '',
        assetType.max_size?.toString() || ''
      ]);

    // Create data array with headers and data rows
    const data = [headers, ...rows];

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
      { wch: 10 }, // נספר
      { wch: 10 }, // שטח מ
      { wch: 10 }  // שטח עד
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'סוגי נכסים');
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `סוגי_נכסים_${dateStr}.xlsx`;
    
    // Download the file
    XLSX.writeFile(workbook, filename);
    showMessage('success', `יוצאו ${rows.length} רשומות בהצלחה`);
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // Check if it's Excel file
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      let rows: any[][] = [];
      
      if (isExcel) {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      } else {
        // Handle CSV file
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        // Parse CSV lines - handle quoted values
        for (const line of lines) {
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
          rows.push(parts);
        }
      }

      if (rows.length === 0) {
        showMessage('error', 'קובץ ריק');
        return;
      }

      // Process headers - normalize and create mapping
      const originalHeaders = rows[0].map(h => String(h || '').trim());
      const normalizedHeaders = originalHeaders.map(h => h.toLowerCase());
      
      // Define exact field name mappings (Hebrew and English)
      const fieldMappings: Record<string, string> = {
        // name field
        'name': 'name',
        'סוג נכס': 'name',
        'סוגנכס': 'name',
        // description field
        'description': 'description',
        'תיאור': 'description',
        // tax_region field
        'tax_region': 'tax_region',
        'taxregion': 'tax_region',
        'אזור מיסים': 'tax_region',
        'אזורמיסים': 'tax_region',
        // area_description_for_tab field
        'area_description_for_tab': 'area_description_for_tab',
        'areadescriptionfortab': 'area_description_for_tab',
        'תיאור אזור לתצוגה בלשונית': 'area_description_for_tab',
        'תיאור אזור': 'area_description_for_tab',
        // elevator field
        'elevator': 'elevator',
        'מעלית': 'elevator',
        // single_double_family field
        'single_double_family': 'single_double_family',
        'singledoublefamily': 'single_double_family',
        'בית פרטי חד משפחתי דו משפחתי': 'single_double_family',
        'בית פרטי': 'single_double_family',
        // penthouse field
        'penthouse': 'penthouse',
        'דירת גג': 'penthouse',
        'דירתגג': 'penthouse',
        // condo field
        'condo': 'condo',
        'בית משותף': 'condo',
        'ביתמשותף': 'condo',
        // townhouses field
        'townhouses': 'townhouses',
        'מבנים צמודי קרקע טוריים מעל 2 יחידות': 'townhouses',
        'טוריים': 'townhouses',
        // business_residence field
        'business_residence': 'business_residence',
        'businessresidence': 'business_residence',
        'עסקים/מגורים': 'business_residence',
        'עסקיםמגורים': 'business_residence',
        // shared_area_usage field
        'shared_area_usage': 'shared_area_usage',
        'sharedareausage': 'shared_area_usage',
        'שימוש בשטח משותף': 'shared_area_usage',
        'שטח משותף': 'shared_area_usage',
        // not_accountable field
        'not_accountable': 'not_accountable',
        'לא נספר': 'not_accountable',
        // min_size field
        'min_size': 'min_size',
        'minsize': 'min_size',
        'שטח מ': 'min_size',
        'שטחמ': 'min_size',
        // max_size field
        'max_size': 'max_size',
        'maxsize': 'max_size',
        'שטח עד': 'max_size',
        'שטחד': 'max_size',
      };

      // Create header mapping - map column index to field name
      const headerMap: Record<string, number> = {};
      for (let i = 0; i < originalHeaders.length; i++) {
        const header = originalHeaders[i];
        const normalized = normalizedHeaders[i];
        const fieldName = fieldMappings[header] || fieldMappings[normalized];
        if (fieldName) {
          headerMap[fieldName] = i;
        }
      }

      // Validate required field (name)
      if (headerMap['name'] === undefined) {
        showMessage('error', 'שדה חובה חסר: "סוג נכס" או "name"');
        return;
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

      // Parse and import each data row (skip header row)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Extract values by field name using header mapping
        const getValue = (fieldName: string): string => {
          const colIndex = headerMap[fieldName];
          if (colIndex === undefined || colIndex >= row.length) return '';
          return String(row[colIndex] || '').trim();
        };

        const name = getValue('name');
        
        // Skip empty rows
        if (!name) continue;

        // Skip header row if it doesn't look like data
        if (name === 'סוג נכס' || name === 'name' || (!name || isNaN(parseInt(name)))) {
          continue;
        }

        const nameValidation = await assetTypeValidators.validateName(name);
        if (!nameValidation.valid) {
          errors.push(`שורה ${i + 1}: ${nameValidation.error}`);
          errorCount++;
          continue;
        }

        try {
          // Extract all field values
          const description = getValue('description');
          const tax_region = getValue('tax_region');
          const area_description_for_tab = getValue('area_description_for_tab');
          const elevator = getValue('elevator');
          const single_double_family = getValue('single_double_family');
          const penthouse = getValue('penthouse');
          const condo = getValue('condo');
          const townhouses = getValue('townhouses');
          const business_residence = getValue('business_residence');
          const shared_area_usage = getValue('shared_area_usage');
          const not_accountable = getValue('not_accountable');
          const min_size = getValue('min_size');
          const max_size = getValue('max_size');

          // Validate business_residence field - only allow 'עסקים', 'מגורים', or empty
          let validBusinessResidence: string | undefined = undefined;
          if (business_residence && business_residence.trim() !== '') {
            const trimmed = business_residence.trim();
            if (trimmed === 'עסקים' || trimmed === 'מגורים') {
              validBusinessResidence = trimmed;
            } else {
              errors.push(`שורה ${i + 1}: עסקים/מגורים חייב להיות "עסקים" או "מגורים"`);
              errorCount++;
              continue;
            }
          }

          const assetTypeData: Omit<AssetType, 'id' | 'created_at' | 'updated_at'> = {
            name, // name is guaranteed to be a string (validated above)
            description: description || undefined,
            tax_region: tax_region ? parseInt(tax_region) : undefined,
            area_description_for_tab: area_description_for_tab || undefined,
            elevator: elevator || undefined,
            single_double_family: single_double_family || undefined,
            penthouse: penthouse || undefined,
            condo: condo || undefined,
            townhouses: townhouses || undefined,
            business_residence: validBusinessResidence,
            shared_area_usage: shared_area_usage || undefined,
            not_accountable: not_accountable && (not_accountable.toLowerCase() === 'כן' || not_accountable.toLowerCase() === 'yes' || not_accountable === '1' || not_accountable === 'true') ? true : (not_accountable && (not_accountable.toLowerCase() === 'לא' || not_accountable.toLowerCase() === 'no' || not_accountable === '0' || not_accountable === 'false') ? false : undefined),
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
                title="הורד תבנית"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">{t('downloadTemplate')}</span>
              </button>
              <button
                type="button"
                onClick={exportAssetTypes}
                disabled={assetTypes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="ייצא את כל סוגי הנכסים"
              >
                <FileText className="h-5 w-5" />
                <span className="hidden sm:inline">ייצא נתונים</span>
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
                    onChange={(e) => setFormData({ ...formData, elevator: e.target.checked ? 'כן' : '' })}
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
                    onChange={(e) => setFormData({ ...formData, single_double_family: e.target.checked ? 'כן' : '' })}
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
                    onChange={(e) => setFormData({ ...formData, penthouse: e.target.checked ? 'כן' : '' })}
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
                    onChange={(e) => setFormData({ ...formData, condo: e.target.checked ? 'כן' : '' })}
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
                    onChange={(e) => setFormData({ ...formData, townhouses: e.target.checked ? 'כן' : '' })}
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
                  value={formData.business_residence || ''}
                  onChange={(e) => setFormData({ ...formData, business_residence: e.target.value || '' })}
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
                    onChange={(e) => setFormData({ ...formData, shared_area_usage: e.target.checked ? 'כן' : '' })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  שימוש בשטח משותף
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.not_accountable}
                    onChange={(e) => setFormData({ ...formData, not_accountable: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  לא נספר
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
            <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', direction: 'rtl' }}>
              <AgGridReact
                ref={gridRef}
                rowData={assetTypes}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  cellStyle: { textAlign: 'right', direction: 'rtl' },
                  headerClass: 'ag-right-aligned-header',
                  headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: '600', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
                  minWidth: 40,
                  sortable: true,
                  filter: true
                }}
                getRowStyle={(params: any) => {
                  const assetType = params.data as AssetType;
                  if (!assetType) return {};
                  if (deletedAssetTypes.has(assetType.id)) {
                    return { backgroundColor: '#fee2e2', opacity: 0.7 }; // Light red for deleted
                  }
                  return {};
                }}
                onCellValueChanged={onCellValueChanged}
                onGridReady={async (params) => {
                  await gridPreferences.loadColumnState(params.api);
                  onGridReady(params);
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
                getRowId={(params: any) => String(params.data.id)}
                gridOptions={{
                  suppressColumnVirtualisation: true,
                  alwaysShowHorizontalScroll: true,
                  enableRtl: true,
                  suppressMovableColumns: true,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


