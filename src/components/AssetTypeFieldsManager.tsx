import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetTypeField, api } from '../lib/api';
import { Plus, Settings, Trash2, Save, X } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';

export function AssetTypeFieldsManager() {
  const { t } = useTranslation();
  const [fields, setFields] = useState<AssetTypeField[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const gridRef = useRef<AgGridReact<AssetTypeField>>(null);
  const [dirtyFields, setDirtyFields] = useState<Map<string, Partial<AssetTypeField>>>(new Map());
  const [originalFields, setOriginalFields] = useState<AssetTypeField[]>([]);

  const [formData, setFormData] = useState({
    field_name: '',
    is_asset_level: false,
    is_building_level: false,
    is_asset_type_validation: false,
  });

  useEffect(() => {
    fetchFields();
  }, []);

  useEffect(() => {
    // Refresh grid when dirtyFields changes to show updated checkboxes
    if (gridRef.current?.api && dirtyFields.size > 0) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }, [dirtyFields]);

  async function fetchFields(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await api.assetTypeFields.getAll();
      setFields(data);
      // Store original data only if dirtyFields is empty (initial load or after save)
      if (dirtyFields.size === 0) {
        setOriginalFields(JSON.parse(JSON.stringify(data)));
      }
      if (data.length === 0) {
        console.warn('No asset type fields found. The table might be empty or not exist yet.');
      }
    } catch (error: any) {
      console.error('Error fetching asset type fields:', error);
      const errorMessage = error?.message || t('error');
      showMessage('error', errorMessage);
      // If table doesn't exist, show helpful message
      if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
        showMessage('error', 'טבלת שדות סוגי נכסים לא קיימת. אנא הרץ את המיגרציה תחילה.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function resetForm() {
    setFormData({
      field_name: '',
      is_asset_level: false,
      is_building_level: false,
      is_asset_type_validation: false,
    });
    setIsAdding(false);
    setEditingId(null);
  }

  function startAdd() {
    resetForm();
    setIsAdding(true);
  }

  function startEdit(field: AssetTypeField) {
    setFormData({
      field_name: field.field_name,
      is_asset_level: field.is_asset_level,
      is_building_level: field.is_building_level,
      is_asset_type_validation: field.is_asset_type_validation,
    });
    setEditingId(field.id);
    setIsAdding(true);
  }

  async function handleSave() {
    if (!formData.field_name.trim()) {
      showMessage('error', 'שם השדה הוא חובה');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await api.assetTypeFields.update(editingId, formData);
        showMessage('success', 'השדה עודכן בהצלחה');
      } else {
        await api.assetTypeFields.create(formData);
        showMessage('success', 'השדה נוצר בהצלחה');
      }
      await fetchFields();
      resetForm();
    } catch (error: any) {
      console.error('Error saving asset type field:', error);
      showMessage('error', error?.message || 'שגיאה בשמירת השדה');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('האם אתה בטוח שברצונך למחוק שדה זה?')) {
      return;
    }

    try {
      await api.assetTypeFields.delete(id);
      showMessage('success', 'השדה נמחק בהצלחה');
      await fetchFields();
    } catch (error: any) {
      console.error('Error deleting asset type field:', error);
      showMessage('error', error?.message || 'שגיאה במחיקת השדה');
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    const { data, colDef } = event;
    const field = colDef.field;
    const fieldId = data.id;
    const newValue = event.newValue;

    // Update local state first
    setFields(prevFields => {
      return prevFields.map(f =>
        f.id === fieldId ? { ...f, [field]: newValue } : f
      );
    });

    // Update the dirty tracking
    setDirtyFields(prev => {
      const next = new Map(prev);
      const existingChanges = next.get(fieldId) || {};
      next.set(fieldId, { ...existingChanges, [field]: newValue });
      return next;
    });

    // Refresh grid to show updated state
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ rowNodes: [event.node], force: true });
    }
  }, []);

  const handleSaveAll = async () => {
    if (dirtyFields.size === 0) {
      showMessage('error', 'אין שינויים לשמור');
      return;
    }

    const count = dirtyFields.size;
    setLoading(true);
    try {
      for (const [fieldId, changes] of dirtyFields.entries()) {
        await api.assetTypeFields.update(fieldId, changes);
      }

      setDirtyFields(new Map());
      await fetchFields(false);
      showMessage('success', `נשמרו ${count} שדות בהצלחה`);
    } catch (error: any) {
      console.error('Error saving fields:', error);
      showMessage('error', error?.message || 'שגיאה בשמירת השדות');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAll = () => {
    if (dirtyFields.size === 0) {
      return;
    }

    // Restore original data
    setFields(JSON.parse(JSON.stringify(originalFields)));
    setDirtyFields(new Map());
    showMessage('success', 'בוטלו כל השינויים');
    
    // Refresh grid
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  const columnDefs: ColDef<AssetTypeField>[] = useMemo(() => [
    {
      colId: 'actions',
      headerName: t('actions'),
      pinned: 'left',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        const field = params.data as AssetTypeField;
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <button
              onClick={() => handleDelete(field.id)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="מחק"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'field_name',
      headerName: 'שם השדה',
      editable: false,
    },
    {
      field: 'is_asset_level',
      headerName: 'רמת נכס',
      editable: true,
      width: 60,
      cellRenderer: (params: any) => {
        const fieldId = params.data?.id;
        const isDirty = fieldId && dirtyFields.has(fieldId) && dirtyFields.get(fieldId)?.hasOwnProperty('is_asset_level');
        const currentValue = isDirty ? dirtyFields.get(fieldId)?.is_asset_level : params.value;
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue || false}
              onChange={(e) => {
                params.setValue(e.target.checked);
              }}
              className={`w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500 cursor-pointer ${isDirty ? 'ring-2 ring-teal-500' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'is_building_level',
      headerName: 'רמת מבנה',
      editable: true,
      width: 60,
      cellRenderer: (params: any) => {
        const fieldId = params.data?.id;
        const isDirty = fieldId && dirtyFields.has(fieldId) && dirtyFields.get(fieldId)?.hasOwnProperty('is_building_level');
        const currentValue = isDirty ? dirtyFields.get(fieldId)?.is_building_level : params.value;
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue || false}
              onChange={(e) => {
                params.setValue(e.target.checked);
              }}
              className={`w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500 cursor-pointer ${isDirty ? 'ring-2 ring-teal-500' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'is_asset_type_validation',
      headerName: 'תקינות סוג נכס',
      editable: true,
      width: 60,
      cellRenderer: (params: any) => {
        const fieldId = params.data?.id;
        const isDirty = fieldId && dirtyFields.has(fieldId) && dirtyFields.get(fieldId)?.hasOwnProperty('is_asset_type_validation');
        const currentValue = isDirty ? dirtyFields.get(fieldId)?.is_asset_type_validation : params.value;
        
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={currentValue || false}
              onChange={(e) => {
                params.setValue(e.target.checked);
              }}
              className={`w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500 cursor-pointer ${isDirty ? 'ring-2 ring-teal-500' : ''}`}
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
    {
      field: 'extra_field_1',
      headerName: '',
      width: 120,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      width: 120,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], [t, dirtyFields]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    wrapText: true,
    autoHeight: false,
    minWidth: 100,
    cellStyle: { textAlign: 'right' },
    headerClass: 'ag-right-aligned-header'
  }), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-600">טוען...</div>
      </div>
    );
  }

  return (
    <div className="w-full px-2 sm:px-4 py-4 sm:py-8" dir="rtl">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-1 sm:mb-2">
          ניהול שדות סוגי נכסים
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          ניהול הגדרות שדות עבור סוגי נכסים
        </p>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 w-full">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">רשימת שדות</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={startAdd}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              הוסף שדה
            </button>
            {dirtyFields.size > 0 && (
              <>
                <button
                  onClick={handleCancelAll}
                  disabled={loading || dirtyFields.size === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  <X className="h-4 w-4" />
                  ביטול
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={loading || dirtyFields.size === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? (
                    <span>שומר...</span>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>שמור הכל{dirtyFields.size > 0 ? ` (${dirtyFields.size})` : ''}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {isAdding && (
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  שם השדה *
                </label>
                <input
                  type="text"
                  value={formData.field_name}
                  onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="לדוגמה: asset_id"
                  disabled={!!editingId}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_asset_level}
                    onChange={(e) => setFormData({ ...formData, is_asset_level: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700">רמת נכס</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_building_level}
                    onChange={(e) => setFormData({ ...formData, is_building_level: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700">רמת מבנה</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_asset_type_validation}
                    onChange={(e) => setFormData({ ...formData, is_asset_type_validation: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700">תקינות סוג נכס</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <span>שומר...</span>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>שמור</span>
                  </>
                )}
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
            </div>
          </div>
        )}

        <div className="ag-theme-alpine rounded-xl overflow-hidden" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
          <AgGridReact
            ref={gridRef}
            rowData={fields}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
            }}
            suppressHorizontalScroll={false}
            onGridReady={async (params) => {
              // Ensure actions column is always pinned and in correct position (first column near sidebar)
              setTimeout(() => {
                if (params.api) {
                  const columnState = params.api.getColumnState();
                  const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                  const otherCols = columnState.filter((col: any) => col.colId !== 'actions');
                  if (actionsCol) {
                    // Ensure actions column is pinned to left and in first position
                    params.api.applyColumnState({
                      state: [{
                        ...actionsCol,
                        colId: 'actions',
                        pinned: 'left',
                        lockPosition: true,
                        lockPinned: true,
                        suppressMovable: true
                      }, ...otherCols],
                      applyOrder: true
                    });
                  }
                }
              }, 10);
              

              // Ensure actions column stays pinned after any operations
              setTimeout(() => {
                if (params.api) {
                  const columnState = params.api.getColumnState();
                  const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                  if (actionsCol) {
                    // Ensure it's pinned correctly and in first position
                    const otherCols = columnState.filter((col: any) => col.colId !== 'actions');
                    params.api.applyColumnState({
                      state: [{
                        ...actionsCol,
                        colId: 'actions',
                        pinned: 'left',
                        lockPosition: true,
                        lockPinned: true,
                        suppressMovable: true
                      }, ...otherCols],
                      applyOrder: true
                    });
                  }
                }
              }, 150);
            }}
            onFirstDataRendered={async (params) => {
            }}
            onColumnResized={() => {}}
            onColumnMoved={(params) => {
              try {
                const actionsColumn = params.columnApi?.getColumn('actions');
                if (actionsColumn) {
                  const allColumns = params.columnApi?.getAllColumns() || [];
                  const actionsIndex = allColumns.findIndex(col => col?.getColId() === 'actions');
                  const isPinnedLeft = actionsColumn.getPinned?.() === 'left';
                  
                  // Force actions column to be first and pinned left if it's not
                  if (actionsIndex !== 0 || !isPinnedLeft) {
                    setTimeout(() => {
                      try {
                        if (gridRef.current?.api) {
                          // Apply column state to ensure it's pinned correctly and in first position
                          const columnState = gridRef.current.api.getColumnState();
                          const actionsCol = columnState.find((col: any) => col?.colId === 'actions');
                          const otherCols = columnState.filter((col: any) => col?.colId !== 'actions');
                          if (actionsCol) {
                            gridRef.current.api.applyColumnState({
                              state: [{ 
                                ...actionsCol, 
                                colId: 'actions',
                                pinned: 'left', 
                                lockPosition: true,
                                lockPinned: true,
                                suppressMovable: true
                              }, ...otherCols],
                              applyOrder: true
                            });
                          }
                        }
                      } catch (err) {
                        console.error('Error in onColumnMoved handler:', err);
                      }
                    }, 0);
                    return;
                  }
                }
              } catch (err) {
                console.error('Error in onColumnMoved:', err);
              }
            }}
            onSortChanged={() => {}}
            onCellValueChanged={onCellValueChanged}
            pagination={true}
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            enableRtl={true}
            getRowId={(params) => params.data.id}
          />
        </div>
      </div>
    </div>
  );
}

