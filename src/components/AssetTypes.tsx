import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, api, toBoolean } from '../lib/api';

function toBooleanFromInput(v: unknown): boolean | undefined {
  if (v == null || String(v).trim() === '') return undefined;
  return toBoolean(v);
}
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Save, X, Loader2, Download, Trash2, Check, ArrowUpDown, ArrowUp, ArrowDown, Filter, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useValidationRules } from '../contexts/ValidationContext';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, GridReadyEvent, ITooltipParams } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { useFillHandle } from '../lib/useFillHandle';
import { useFieldConfig } from '../lib/useFieldConfig';
import { exportToExcel } from '../lib/excelExport';
import { numericValueParser, numericValueParserInt } from '../lib/numberUtils';

// Custom tooltip component that supports line breaks - uses standardized tooltip styles
const CustomTooltip = (params: ITooltipParams) => {
  if (!params.value) return null;
  // Split by <br/> or \n to create lines
  const lines = String(params.value).split(/<br\/>|\n/);
  return (
    <div className="tooltip-content" style={{
      maxWidth: '450px',
      lineHeight: '1.6',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      whiteSpace: 'pre-wrap',
      direction: 'rtl',
      textAlign: 'right'
    }}>
      {lines.map((line, index) => {
        const isHeader = line.includes('━━━') || line.includes('┈┈');
        const isSeparator = line.includes('━━━') || line.includes('─────') || line.includes('┈┈');

        return (
          <div
            key={index}
            className={index < lines.length - 1 ? 'tooltip-message-item' : ''}
            style={{
              fontWeight: isHeader && !isSeparator ? '600' : '400',
              color: isHeader && !isSeparator ? '#1e40af' : '#1f2937',
              fontSize: isSeparator ? '12px' : '14px',
              marginBottom: line === '' ? '4px' : undefined,
              opacity: isSeparator ? '0.5' : '1'
            }}
          >
            {line || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
};

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

  // Fill handle hook for drag-to-fill functionality
  useFillHandle({
    gridRef,
    enabled: false
  });

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
    non_accountable_for_total_area: false,
    non_accountable_for_distribution: false,
    not_accountable_for_statistics: false,
    use_shared_area: false,
    use_for_parking_shared_area: false,
    can_be_subtype: true,
    min_sub_types_number: '',
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
    setFormData({ 
      name: '', 
      description: '', 
      tax_region: '', 
      elevator: '', 
      single_double_family: '', 
      penthouse: '', 
      condo: '', 
      townhouses: '', 
      business_residence: '', 
      non_accountable_for_total_area: false, 
      non_accountable_for_distribution: false, 
      not_accountable_for_statistics: false,
      use_shared_area: false,
      use_for_parking_shared_area: false,
      can_be_subtype: true,
      min_sub_types_number: '',
      min_size: '',
      max_size: ''
    });
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
        non_accountable_for_total_area: formData.non_accountable_for_total_area || undefined,
        non_accountable_for_distribution: formData.non_accountable_for_distribution || undefined,
        not_accountable_for_statistics: formData.not_accountable_for_statistics || undefined,
        use_shared_area: formData.use_shared_area || undefined,
        use_for_parking_shared_area: formData.use_for_parking_shared_area || undefined,
        can_be_subtype: formData.can_be_subtype,
        min_sub_types_number: formData.min_sub_types_number !== '' ? parseInt(formData.min_sub_types_number) : 0,
        min_size: formData.min_size ? parseFloat(formData.min_size) : undefined,
        max_size: formData.max_size ? parseFloat(formData.max_size) : undefined,
      };

      await api.assetTypes.create(dataToSave);
      
      // Reload validation rules after creating new asset type
      await refreshRules();
      
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
      // Bulk delete first
      if (deletedAssetTypes.size > 0) {
        await api.assetTypes.deleteBulk(Array.from(deletedAssetTypes.values()));
      }

      // Validate updates, then save in ONE bulk call
      const updatesToSave: Array<{ id: number; updates: Partial<AssetType> }> = [];
      for (const [id, changes] of dirtyAssetTypes.entries()) {
        if (deletedAssetTypes.has(id)) continue;

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

        updatesToSave.push({ id, updates: changes });
      }

      if (updatesToSave.length > 0) {
        const bulkResult = await api.assetTypes.updateBulkWithDistributionReset(updatesToSave);
        if (!bulkResult.success) {
          throw new Error(bulkResult.error || 'שגיאה בשמירה');
        }
      }

      showMessage('success', 'כל השינויים נשמרו בהצלחה');
      setDirtyAssetTypes(new Map());
      setDeletedAssetTypes(new Set());
      await fetchAssetTypes();
      
      // Keep validation rules in sync (asset types can affect them)
      await refreshRules();
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

  const onCellEditingStopped = useCallback((event: any) => {
    const { data, column, colDef } = event;
    const field = colDef?.field ?? column?.getColDef?.()?.field as keyof AssetType | undefined;
    const assetTypeId = data?.id;
    if (!field || !assetTypeId) return;
    let newValue = event.newValue ?? event.node?.data?.[field];
    if (newValue === '' || newValue === null || newValue === undefined) {
      const isNumericField = field === 'tax_region' || field === 'min_size' || field === 'max_size';
      newValue = isNumericField ? 0 : null;
    }
    handleCellChange(assetTypeId, field, newValue);
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
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'active');
        const isDirty = isFieldDirty(assetType.id, 'active');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked ? true : false;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'active', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
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
      headerTooltip: 'אזור מיסים',
      tooltipValueGetter: (params: any) => {
        if (!params.data || params.value == null) return '';
        // For asset types grid, show area_description_for_tab from the same row
        return params.data.area_description_for_tab || String(params.value);
      },
      editable: true,
      valueParser: (params: any) => numericValueParserInt(params, 10),
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
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'elevator');
        const isDirty = isFieldDirty(assetType.id, 'elevator');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'elevator', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'single_double_family',
      headerName: 'בית פרטי',
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'single_double_family');
        const isDirty = isFieldDirty(assetType.id, 'single_double_family');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'single_double_family', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'penthouse');
        const isDirty = isFieldDirty(assetType.id, 'penthouse');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'penthouse', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'condo',
      headerName: 'בית משותף',
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'condo');
        const isDirty = isFieldDirty(assetType.id, 'condo');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'condo', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'townhouses',
      headerName: 'טוריים',
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'townhouses');
        const isDirty = isFieldDirty(assetType.id, 'townhouses');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'townhouses', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
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
      field: 'non_accountable_for_total_area',
      headerName: 'לא נספר בחישוב שטח מבנה',
      editable: false,
      tooltipValueGetter: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return '';
        const flags = [];
        if (getCurrentValue(assetType, 'non_accountable_for_total_area')) flags.push('לא נספר בשטח מבנה');
        if (getCurrentValue(assetType, 'non_accountable_for_distribution')) flags.push('לא נכלל בפיזור');
        if (getCurrentValue(assetType, 'not_accountable_for_statistics')) flags.push('לא נכלל בסטטיסטיקה');
        if (getCurrentValue(assetType, 'use_shared_area')) flags.push('משמש לפיזור שטח משותף');
        if (getCurrentValue(assetType, 'use_for_parking_shared_area')) flags.push('שימוש בשטח חניה משותף');
        return flags.length > 0 ? flags.join(' • ') : '';
      },
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'non_accountable_for_total_area');
        const isDirty = isFieldDirty(assetType.id, 'non_accountable_for_total_area');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'non_accountable_for_total_area', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'non_accountable_for_distribution',
      headerName: 'לא נספר בפיזור',
      editable: false,
      tooltipValueGetter: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return '';
        const flags = [];
        if (getCurrentValue(assetType, 'non_accountable_for_total_area')) flags.push('לא נספר בשטח מבנה');
        if (getCurrentValue(assetType, 'non_accountable_for_distribution')) flags.push('לא נכלל בפיזור');
        if (getCurrentValue(assetType, 'not_accountable_for_statistics')) flags.push('לא נכלל בסטטיסטיקה');
        if (getCurrentValue(assetType, 'use_shared_area')) flags.push('משמש לפיזור שטח משותף');
        if (getCurrentValue(assetType, 'use_for_parking_shared_area')) flags.push('שימוש בשטח חניה משותף');
        return flags.length > 0 ? flags.join(' • ') : '';
      },
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'non_accountable_for_distribution');
        const isDirty = isFieldDirty(assetType.id, 'non_accountable_for_distribution');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'non_accountable_for_distribution', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'not_accountable_for_statistics',
      headerName: 'לא נספר בסטטיסטיקה',
      editable: false,
      tooltipValueGetter: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return '';
        const flags = [];
        if (getCurrentValue(assetType, 'non_accountable_for_total_area')) flags.push('לא נספר בשטח מבנה');
        if (getCurrentValue(assetType, 'non_accountable_for_distribution')) flags.push('לא נכלל בפיזור');
        if (getCurrentValue(assetType, 'not_accountable_for_statistics')) flags.push('לא נכלל בסטטיסטיקה');
        if (getCurrentValue(assetType, 'use_shared_area')) flags.push('משמש לפיזור שטח משותף');
        if (getCurrentValue(assetType, 'use_for_parking_shared_area')) flags.push('שימוש בשטח חניה משותף');
        return flags.length > 0 ? flags.join(' • ') : '';
      },
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'not_accountable_for_statistics');
        const isDirty = isFieldDirty(assetType.id, 'not_accountable_for_statistics');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'not_accountable_for_statistics', newValue);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'use_shared_area',
      headerName: 'שימוש בשטח משותף',
      editable: false,
      tooltipValueGetter: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return '';
        const flags = [];
        if (getCurrentValue(assetType, 'non_accountable_for_total_area')) flags.push('לא נספר בשטח מבנה');
        if (getCurrentValue(assetType, 'non_accountable_for_distribution')) flags.push('לא נכלל בפיזור');
        if (getCurrentValue(assetType, 'not_accountable_for_statistics')) flags.push('לא נכלל בסטטיסטיקה');
        if (getCurrentValue(assetType, 'use_shared_area')) flags.push('משמש לפיזור שטח משותף');
        if (getCurrentValue(assetType, 'use_for_parking_shared_area')) flags.push('שימוש בשטח חניה משותף');
        return flags.length > 0 ? flags.join(' • ') : '';
      },
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'use_shared_area');
        const isDirty = isFieldDirty(assetType.id, 'use_shared_area');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'use_shared_area', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'use_for_parking_shared_area',
      headerName: 'שימוש בשטח חניה משותף',
      editable: false,
      tooltipValueGetter: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return '';
        const flags = [];
        if (getCurrentValue(assetType, 'non_accountable_for_total_area')) flags.push('לא נספר בשטח מבנה');
        if (getCurrentValue(assetType, 'non_accountable_for_distribution')) flags.push('לא נכלל בפיזור');
        if (getCurrentValue(assetType, 'not_accountable_for_statistics')) flags.push('לא נכלל בסטטיסטיקה');
        if (getCurrentValue(assetType, 'use_shared_area')) flags.push('משמש לפיזור שטח משותף');
        if (getCurrentValue(assetType, 'use_for_parking_shared_area')) flags.push('שימוש בשטח חניה משותף');
        return flags.length > 0 ? flags.join(' • ') : '';
      },
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'use_for_parking_shared_area');
        const isDirty = isFieldDirty(assetType.id, 'use_for_parking_shared_area');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'use_for_parking_shared_area', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'can_be_subtype',
      headerName: 'יכול להיות תת-נכס',
      width: 80,
      editable: false,
      cellRenderer: (params: any) => {
        const assetType = params.data as AssetType;
        if (!assetType) return null;
        const currentValue = getCurrentValue(assetType, 'can_be_subtype');
        const isDirty = isFieldDirty(assetType.id, 'can_be_subtype');
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue !== false}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.setValue(newValue);
                handleCellChange(assetType.id, 'can_be_subtype', newValue);
                setTimeout(() => {
                  if (gridRef.current?.api) {
                    gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
                  }
                }, 0);
              }}
              className={`w-4 h-4 text-theme-tab-active rounded ${isDirty ? 'ring-2 ring-yellow-400' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'min_sub_types_number',
      headerName: 'מינ. תתי-נכסים',
      width: 60,
      editable: true,
      valueParser: (params: any) => {
        const val = parseInt(params.newValue);
        return isNaN(val) ? 0 : Math.max(0, val);
      },
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'min_sub_types_number');
        return {
          textAlign: 'right',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'min_size',
      headerName: 'שטח מ',
      editable: true,
      valueParser: (params: any) => numericValueParser(params),
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
      valueParser: (params: any) => numericValueParser(params),
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
              className={`relative inline-flex p-1.5 rounded transition-colors ${
                isDeleted
                  ? 'text-red-700 hover:bg-red-100 bg-red-50'
                  : 'text-red-600 hover:bg-red-50'
              }`}
              title={isDeleted ? 'בטל מחיקה' : 'סמן למחיקה'}
            >
              <Trash2 className="h-4 w-4" />
              {isDeleted && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600">
                  <Check className="h-1.5 w-1.5 text-white" strokeWidth={3} />
                </span>
              )}
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
      tooltipValueGetter: (params: any) => {
        if (!params.data) return '';
        const assetType = params.data as AssetType;
        const currentName = assetType.name;
        
        // Find all asset types with the same name
        const matchingAssetTypes = assetTypes
          .map((at, index) => {
            const dirtyChanges = dirtyAssetTypes.get(at.id);
            const currentAssetType = dirtyChanges ? { ...at, ...dirtyChanges } : at;
            return { assetType: currentAssetType, originalIndex: index };
          })
          .filter(({ assetType: at }) => at.name === currentName);
        
        if (matchingAssetTypes.length === 0) return '';
        
        // Helper function to build tooltip text for a single asset type
        const buildTooltipForAssetType = (at: AssetType, entryNumber?: number): string[] => {
          const sections: string[] = [];

          // Add asset type name at the beginning (with number if multiple entries)
          const namePrefix = entryNumber !== undefined ? `${entryNumber}. ` : '';
          sections.push(`${namePrefix}סוג נכס: ${at.name}`);

          // Description
          if (at.description) {
            sections.push(`תיאור: ${at.description}`);
          }

          // Tax region with area description
          if (at.tax_region) {
            const taxInfo = [`אזור מס: ${at.tax_region}`];
            if (at.area_description_for_tab) {
              taxInfo.push(` (${at.area_description_for_tab})`);
            }
            sections.push(taxInfo.join(''));
          }

          // Type classification
          if (at.business_residence && at.business_residence !== 'לא' && at.business_residence !== '') {
            sections.push(`סיווג: ${at.business_residence}`);
          }

          // Size constraints
          if (at.min_size || at.max_size) {
            const minSize = at.min_size ? at.min_size.toLocaleString('he-IL') : '0';
            const maxSize = at.max_size ? at.max_size.toLocaleString('he-IL') : '∞';
            sections.push(`טווח שטח: ${minSize} - ${maxSize} מ"ר`);
          }

          // Property characteristics - compact inline format
          const characteristics: string[] = [];
          if (at.elevator === true) characteristics.push('מעלית');
          if (at.single_double_family === true) characteristics.push('בית פרטי');
          if (at.penthouse === true) characteristics.push('דירת גג');
          if (at.condo === true) characteristics.push('בית משותף');
          if (at.townhouses === true) characteristics.push('טוריים');

          if (characteristics.length > 0) {
            sections.push(`מאפיינים: ${characteristics.join(' • ')}`);
          }

          // Special accounting flags - compact inline format (excluding "לא נספר" fields)
          const accountingFlags: string[] = [];
          if (at.use_shared_area === true) accountingFlags.push('משמש לפיזור שטח משותף');
          if (at.use_for_parking_shared_area === true) accountingFlags.push('שימוש בשטח חניה משותף');

          if (accountingFlags.length > 0) {
            sections.push(`כללי חישוב: ${accountingFlags.join(' • ')}`);
          }

          return sections;
        };
        
        // Build combined tooltip
        const allTooltips: string[] = [];

        if (matchingAssetTypes.length === 1) {
          // Single asset type - show all details in compact format
          const tooltipFields = buildTooltipForAssetType(matchingAssetTypes[0].assetType);
          if (tooltipFields.length > 0) {
            tooltipFields.forEach(field => allTooltips.push(field));
          }
        } else {
          // Multiple asset types with same name - show all with numbers
          matchingAssetTypes.forEach((item, index) => {
            const tooltipFields = buildTooltipForAssetType(item.assetType, index + 1);
            if (tooltipFields.length > 0) {
              tooltipFields.forEach(field => allTooltips.push(field));
            }
          });
        }

        return allTooltips.length > 0 ? allTooltips.join('\n') : 'אין פרטים נוספים';
      },
      tooltipComponent: CustomTooltip,
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
  }, [t, getCurrentValue, isFieldDirty, handleDelete, deletedAssetTypes, assetTypes, dirtyAssetTypes, handleCellChange, gridRef]);

  // Apply field configurations from database
  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'asset-types');


  async function downloadTemplate(format: 'excel' | 'csv' = 'excel') {
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
      'לא נספר בחישוב שטח מבנה',  // non_accountable_for_total_area
      'לא נספר בפיזור',           // non_accountable_for_distribution
      'לא נספר בסטטיסטיקה',       // not_accountable_for_statistics
      'שטח מ',                   // min_size
      'שטח עד'                   // max_size
    ];

    // Create data array with headers only (no sample data)
    const data = [headers];

    if (format === 'csv') {
      // Export as CSV
      const { exportToCSV } = await import('../lib/csvExport');
      exportToCSV({
        filename: 'תבנית_סוגי_נכסים.csv',
        data
      });
    } else {
      // Export as Excel
      exportToExcel({
        filename: 'תבנית_סוגי_נכסים.xlsx',
        sheetName: 'סוגי נכסים',
        data,
        columnWidths: [
          { wch: 12 }, // סוג נכס
          { wch: 25 }, // תיאור
          { wch: 12 }, // אזור מיסים
          { wch: 8 },  // מעלית
          { wch: 35 }, // בית פרטי חד משפחתי דו משפחתי
          { wch: 10 }, // דירת גג
          { wch: 12 }, // בית משותף
          { wch: 40 }, // מבנים צמודי קרקע טוריים מעל 2 יחידות
          { wch: 15 }, // עסקים/מגורים
          { wch: 25 }, // לא נספר בחישוב שטח מבנה
          { wch: 15 }, // לא נספר בפיזור
          { wch: 18 }, // לא נספר בסטטיסטיקה
          { wch: 10 }, // שטח מ
          { wch: 10 }  // שטח עד
        ]
      });
    }
  }

  async function exportAssetTypes() {
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
      'לא נספר בחישוב שטח מבנה',  // non_accountable_for_total_area
      'לא נספר בפיזור',           // non_accountable_for_distribution
      'לא נספר בסטטיסטיקה',       // not_accountable_for_statistics
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
        assetType.non_accountable_for_total_area ? 'כן' : 'לא',
        assetType.non_accountable_for_distribution ? 'כן' : 'לא',
        assetType.not_accountable_for_statistics ? 'כן' : 'לא',
        assetType.min_size?.toString() || '',
        assetType.max_size?.toString() || ''
      ]);

    // Create data array with headers and data rows
    const data = [headers, ...rows];

    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `סוגי_נכסים_${dateStr}.xlsx`;

    // Use improved export function to reduce antivirus false positives
    exportToExcel({
      filename,
      sheetName: 'סוגי נכסים',
      data,
      decimalFormatColumnIndices: [14, 15], // שטח מ, שטח עד (min_size, max_size)
      columnWidths: [
        { wch: 12 }, // סוג נכס
        { wch: 25 }, // תיאור
        { wch: 12 }, // אזור מיסים
        { wch: 8 },  // מעלית
        { wch: 35 }, // בית פרטי חד משפחתי דו משפחתי
        { wch: 10 }, // דירת גג
        { wch: 12 }, // בית משותף
        { wch: 40 }, // מבנים צמודי קרקע טוריים מעל 2 יחידות
        { wch: 15 }, // עסקים/מגורים
        { wch: 25 }, // לא נספר בחישוב שטח מבנה
        { wch: 15 }, // לא נספר בפיזור
        { wch: 18 }, // לא נספר בסטטיסטיקה
        { wch: 10 }, // שטח מ
        { wch: 10 }  // שטח עד
      ]
    });
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
        // non_accountable_for_total_area field
        'non_accountable_for_total_area': 'non_accountable_for_total_area',
        'non_accountable_total_area': 'non_accountable_for_total_area',
        'לא נספר': 'non_accountable_for_total_area',
        'לא נספר בחישוב שטח מבנה': 'non_accountable_for_total_area',
        // non_accountable_for_distribution field
        'non_accountable_for_distribution': 'non_accountable_for_distribution',
        'לא נספר בפיזור': 'non_accountable_for_distribution',
        // not_accountable_for_statistics field
        'not_accountable_for_statistics': 'not_accountable_for_statistics',
        'notaccountableforstatistics': 'not_accountable_for_statistics',
        'לא נספר בסטטיסטיקה': 'not_accountable_for_statistics',
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
        if (allAssetTypes && allAssetTypes.length > 0) {
          await api.assetTypes.deleteBulk(allAssetTypes.map(at => at.id));
        }
      } catch (err) {
        console.error('Error truncating asset types:', err);
        showMessage('error', 'שגיאה במחיקת רשומות קיימות');
      }

      // Collect valid rows and insert in one bulk call
      const assetTypesToInsert = new Map<string, Omit<AssetType, 'id' | 'created_at' | 'updated_at'>>();

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
          const non_accountable_for_total_area = getValue('non_accountable_for_total_area');
          const non_accountable_for_distribution = getValue('non_accountable_for_distribution');
          const not_accountable_for_statistics = getValue('not_accountable_for_statistics');
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
            elevator: toBooleanFromInput(elevator),
            single_double_family: toBooleanFromInput(single_double_family),
            penthouse: toBooleanFromInput(penthouse),
            condo: toBooleanFromInput(condo),
            townhouses: toBooleanFromInput(townhouses),
            business_residence: validBusinessResidence,
            non_accountable_for_total_area: toBooleanFromInput(non_accountable_for_total_area),
            non_accountable_for_distribution: toBooleanFromInput(non_accountable_for_distribution),
            not_accountable_for_statistics: toBooleanFromInput(not_accountable_for_statistics),
            min_size: min_size ? parseFloat(min_size) : undefined,
            max_size: max_size ? parseFloat(max_size) : undefined,
          };

          // De-duplicate by name (keep last occurrence)
          assetTypesToInsert.set(String(name), assetTypeData);
        } catch (error) {
          errors.push(`שורה ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      if (assetTypesToInsert.size > 0) {
        const bulkCreate = await api.assetTypes.createBulk(Array.from(assetTypesToInsert.values()));
        if (!bulkCreate.success) {
          throw new Error(bulkCreate.error || 'שגיאה בייבוא סוגי נכסים');
        }
        successCount = bulkCreate.count;
      }

      await fetchAssetTypes();

      // Reload validation rules after importing asset types
      await refreshRules();

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-tab-active mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-2 sm:px-4 md:px-6 py-1.5 sm:py-2">
      <div className="page-header mb-2 rounded-lg px-3 py-2 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="page-header-icon shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <h1 className="page-header-title text-sm sm:text-base font-bold">{t('assetTypes')}</h1>
          </div>
          <span className="page-header-badge">{assetTypes.length} רשומות</span>
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

      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border border-theme-card-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3 shrink-0">
            <h2 className="text-xl font-bold text-slate-900">{t('assetTypes')}</h2>
          </div>
          {!isAdding && (
            <div className="action-bar flex flex-row flex-wrap justify-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => downloadTemplate('excel')}
                className="btn btn-action btn-secondary"
                title="הורד תבנית Excel"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">הורד תבנית Excel</span>
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate('csv')}
                className="btn btn-action btn-secondary"
                title="הורד תבנית CSV"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">הורד תבנית CSV</span>
              </button>
              <button
                type="button"
                onClick={exportAssetTypes}
                disabled={assetTypes.length === 0}
                className="btn btn-action btn-export disabled:opacity-50 disabled:cursor-not-allowed"
                title="ייצא את כל סוגי הנכסים"
              >
                <FileText className="h-5 w-5" />
                <span className="hidden sm:inline">ייצא נתונים</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="btn btn-action btn-primary disabled:opacity-50 disabled:shadow-none"
              >
                <Upload className="h-5 w-5" />
                <span className="hidden sm:inline">{isImporting ? t('loading') : t('importCSV')}</span>
              </button>
              <button
                type="button"
                onClick={startAdd}
                className="btn btn-action btn-primary"
              >
                <Plus className="h-5 w-5" />
                <span>{t('addAssetType')}</span>
              </button>
              <button
                type="button"
                onClick={handleCancelAll}
                disabled={isSaving || (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0)}
                className="btn btn-action btn-cancel disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-5 w-5" />
                <span>{t('cancel')}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSaving || (dirtyAssetTypes.size === 0 && deletedAssetTypes.size === 0)}
                className="btn btn-action btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                <span>{isSaving ? 'שומר...' : `שמור הכל${dirtyAssetTypes.size + deletedAssetTypes.size > 0 ? ` (${dirtyAssetTypes.size + deletedAssetTypes.size})` : ''}`}</span>
              </button>
            </div>
          )}
        </div>

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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.elevator === true}
                    onChange={(e) => setFormData({ ...formData, elevator: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  מעלית
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.single_double_family === true}
                    onChange={(e) => setFormData({ ...formData, single_double_family: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  בית פרטי חד משפחתי דו משפחתי
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.penthouse === true}
                    onChange={(e) => setFormData({ ...formData, penthouse: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  דירת גג
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.condo === true}
                    onChange={(e) => setFormData({ ...formData, condo: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  בית משותף
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <input
                    type="checkbox"
                    checked={formData.townhouses === true}
                    onChange={(e) => setFormData({ ...formData, townhouses: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
                >
                  <option value="">-- בחר --</option>
                  <option value="עסקים">עסקים</option>
                  <option value="מגורים">מגורים</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1" title="נכסים מסוג זה לא נספרים בחישוב שטח המבנה הכולל">
                  <input
                    type="checkbox"
                    checked={formData.non_accountable_for_total_area}
                    onChange={(e) => setFormData({ ...formData, non_accountable_for_total_area: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  לא נספר בחישוב שטח מבנה
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1" title="נכסים מסוג זה לא נכללים בפיזור שטח משותף. שינוי ערך זה יאפס את דגלי הפיזור במבנים מושפעים">
                  <input
                    type="checkbox"
                    checked={formData.non_accountable_for_distribution}
                    onChange={(e) => setFormData({ ...formData, non_accountable_for_distribution: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  לא נספר בפיזור
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1" title="נכסים מסוג זה לא יופיעו בסטטיסטיקות נכסים">
                  <input
                    type="checkbox"
                    checked={formData.not_accountable_for_statistics}
                    onChange={(e) => setFormData({ ...formData, not_accountable_for_statistics: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  לא נספר בסטטיסטיקה
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1" title="סוג נכס זה משמש לפיזור שטח משותף מגורים. שטח משותף יווסף כנכס משנה מסוג זה">
                  <input
                    type="checkbox"
                    checked={formData.use_shared_area}
                    onChange={(e) => setFormData({ ...formData, use_shared_area: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  שימוש בשטח משותף
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1" title="סוג נכס זה משמש לשטח חניה משותף">
                  <input
                    type="checkbox"
                    checked={formData.use_for_parking_shared_area}
                    onChange={(e) => setFormData({ ...formData, use_for_parking_shared_area: e.target.checked })}
                    className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  שימוש בשטח חניה משותף
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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
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
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:border-slate-400 transition-all duration-200"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none font-medium"
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
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
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
          <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-theme-action-accent w-full">
            <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto', direction: 'rtl' }}>
              <AgGridReact
                ref={gridRef}
                rowData={assetTypes}
                columnDefs={configuredColumnDefs}
                defaultColDef={{
                  resizable: false, // Disabled - use field configurations instead
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  cellStyle: { textAlign: 'right', direction: 'rtl' },
                  headerClass: 'ag-right-aligned-header',
                  headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
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
                onCellEditingStopped={onCellEditingStopped}
                onGridReady={async (params) => {
                  await gridPreferences.loadColumnState(params.api);
                  onGridReady(params);
                }}
                onColumnResized={(params) => {
                  gridPreferences.handleColumnResized();
                }}
                onColumnMoved={gridPreferences.handleColumnMoved}
                getRowId={(params: any) => String(params.data.id)}
                gridOptions={{
                  suppressColumnVirtualisation: true,
                  alwaysShowHorizontalScroll: true,
                  enableRtl: true,
                  animateRows: false,
                  suppressMovableColumns: true,
                  suppressColumnMoveAnimation: true,
                  tooltipShowDelay: 500,
                  tooltipHideDelay: 120000,
                  enableBrowserTooltips: false,
                  tooltipMouseTrack: false,
                }}
                rowSelection={{
                  mode: 'singleRow',
                  enableClickSelection: false,
                  checkboxes: false,
                  hideDisabledCheckboxes: true
                }}
                stopEditingWhenCellsLoseFocus={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


