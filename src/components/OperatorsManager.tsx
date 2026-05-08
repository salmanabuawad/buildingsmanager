import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Operator, api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, Users, Plus, Trash2, Check, Save, X, RefreshCw, Download, Upload } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { exportToExcel } from '../lib/excelExport';
import * as XLSX from 'xlsx';
import ExcelLikeFilter from './grid/ExcelLikeFilter';

export function OperatorsManager() {
  const { isAdmin } = useUserRole();
  const [items, setItems] = useState<Operator[]>([]);
  const [originalItems, setOriginalItems] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyItems, setDirtyItems] = useState<Map<number, Partial<Operator>>>(new Map());
  const [deletedItems, setDeletedItems] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<Operator>>(null);

  const gridPreferences = useGridPreferences(
    gridRef,
    'operators',
    'default'
  );

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await api.operators.getAll();
      setItems(data);
      if (dirtyItems.size === 0) {
        setOriginalItems(JSON.parse(JSON.stringify(data)));
      }
    } catch (err) {
      console.error('Error fetching operators:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בטעינת פקידים/ות');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, message: text });
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
    });
    setIsAdding(false);
  };

  const startAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleAdd = async () => {
    if (!isAdmin) {
      showMessage('error', 'אין לך הרשאה להוסיף רשומות');
      return;
    }

    if (!formData.name.trim() || !formData.email.trim()) {
      showMessage('error', 'שם ואימייל הם שדות חובה');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email.trim())) {
      showMessage('error', 'כתובת אימייל לא תקינה');
      return;
    }

    try {
      setIsSaving(true);
      const newItem = await api.operators.create({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
      });
      setItems([...items, newItem]);
      setOriginalItems([...originalItems, newItem]);
      showMessage('success', 'הפקיד/ה נוסף/ה בהצלחה');
      resetForm();
    } catch (err) {
      console.error('Error adding operator:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בהוספת הפקיד/ה');
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentValue = useCallback((item: Operator, field: keyof Operator): any => {
    const dirtyChanges = dirtyItems.get(item.id);
    if (dirtyChanges && field in dirtyChanges) {
      return dirtyChanges[field as keyof Partial<Operator>];
    }
    return item[field];
  }, [dirtyItems]);

  const isFieldDirty = useCallback((itemId: number, field: keyof Operator): boolean => {
    return dirtyItems.has(itemId) && field in (dirtyItems.get(itemId) || {});
  }, [dirtyItems]);

  const handleCellChange = useCallback(async (itemId: number, field: keyof Operator, newValue: any) => {
    try {
      if (field === 'email') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (newValue && !emailPattern.test(String(newValue).trim())) {
          showMessage('error', 'כתובת אימייל לא תקינה');
          return;
        }
      }

      setDirtyItems(prev => {
        const next = new Map(prev);
        const existingChanges = next.get(itemId) || {};
        next.set(itemId, { ...existingChanges, [field]: newValue });
        return next;
      });
    } catch (error) {
      console.error('Error updating item:', error);
      showMessage('error', 'שגיאה בעדכון');
    }
  }, []);

  const handleDelete = (id: number) => {
    if (!isAdmin) {
      showMessage('error', 'אין לך הרשאה למחוק רשומות');
      return;
    }
    setDeletedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirtyItems(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
    }, 100);
  };

  const handleSaveAll = async () => {
    if (dirtyItems.size === 0 && deletedItems.size === 0) {
      showMessage('info', 'אין שינויים לשמירה');
      return;
    }

    setIsSaving(true);
    try {
      for (const id of deletedItems) {
        await api.operators.delete(id);
      }

      for (const [id, changes] of dirtyItems) {
        if (deletedItems.has(id)) continue;
        await api.operators.update(id, changes);
      }

      showMessage('success', 'כל השינויים נשמרו בהצלחה');
      setDirtyItems(new Map());
      setDeletedItems(new Set());
      await fetchItems();
    } catch (error) {
      console.error('Error saving changes:', error);
      showMessage('error', 'שגיאה בשמירת השינויים');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelAll = () => {
    if (dirtyItems.size === 0 && deletedItems.size === 0) return;
    setItems(JSON.parse(JSON.stringify(originalItems)));
    setDirtyItems(new Map());
    setDeletedItems(new Set());
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef } = event;
    const field = colDef.field as keyof Operator;
    const itemId = data.id;
    const newValue = event.newValue;
    if (!field || !itemId) return;
    await handleCellChange(itemId, field, newValue);
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ rowNodes: [event.node], force: true });
    }
  }, [handleCellChange]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    setTimeout(() => {
      if (event.api) {
        event.api.ensureColumnVisible('actions', 'right');
      }
    }, 100);
  }, []);

  const columnDefs: ColDef<Operator>[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'שם פקיד/ה',
      editable: isAdmin,
      cellEditor: 'agTextCellEditor',
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
    {
      field: 'email',
      headerName: 'אימייל',
      editable: isAdmin,
      cellEditor: 'agTextCellEditor',
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'email');
        return {
          textAlign: 'left',
          direction: 'ltr',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      field: 'phone',
      headerName: 'טלפון',
      editable: isAdmin,
      cellEditor: 'agTextCellEditor',
      cellStyle: (params: any) => {
        const isDirty = params.data && isFieldDirty(params.data.id, 'phone');
        return {
          textAlign: 'left',
          direction: 'ltr',
          backgroundColor: isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : undefined
        };
      }
    },
    {
      headerName: 'פעולות',
      width: 100,
      pinned: 'right',
      editable: false,
      cellRenderer: (params: any) => {
        if (!isAdmin) return '';
        const item = params.data as Operator;
        if (!item) return null;
        const isDeleted = deletedItems.has(item.id);
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <button
              onClick={() => handleDelete(item.id)}
              className={`relative inline-flex px-2 py-1 text-xs rounded transition-colors ${
                isDeleted
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
              title={isDeleted ? 'בטל מחיקה' : 'מחק'}
            >
              <Trash2 className="h-3 w-3" />
              {isDeleted && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600">
                  <Check className="h-1.5 w-1.5 text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          </div>
        );
      },
      cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    }
  ], [isAdmin, deletedItems, isFieldDirty]);

  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'operators');

  const getRowStyle = (params: any) => {
    if (!params.data) return null;
    if (deletedItems.has(params.data.id)) {
      return { backgroundColor: '#fee2e2', textDecoration: 'line-through' };
    }
    return null;
  };

  const handleExportToExcel = () => {
    const dataToExport = items
      .filter(item => !deletedItems.has(item.id))
      .map(item => {
        const dirty = dirtyItems.get(item.id) || {};
        return {
          'שם פקיד/ה': dirty.name !== undefined ? dirty.name : item.name,
          'אימייל': dirty.email !== undefined ? dirty.email : item.email,
          'טלפון': dirty.phone !== undefined ? dirty.phone : item.phone ?? '',
        };
      });
    exportToExcel({
      filename: 'פקידים_ות.xlsx',
      sheetName: 'פקידים/ות',
      data: dataToExport,
    });
    showMessage('success', 'הייצוא הושלם בהצלחה');
  };

  const handleImportFromExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const itemsToAdd: Array<{ name: string; email: string; phone?: string }> = [];
      for (const row of jsonData) {
        const name = String(row['שם פקיד/ה'] || row['name'] || row['Name'] || '').trim();
        const email = String(row['אימייל'] || row['email'] || row['Email'] || '').trim();
        const phone = String(row['טלפון'] || row['phone'] || row['Phone'] || '').trim();
        if (name && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          itemsToAdd.push({ name, email, phone: phone || undefined });
        }
      }

      if (itemsToAdd.length === 0) {
        showMessage('error', 'לא נמצאו רשומות תקינות לייבא');
        return;
      }

      for (const item of itemsToAdd) {
        await api.operators.create(item);
      }
      showMessage('success', `יובאו ${itemsToAdd.length} פקידים/ות בהצלחה`);
      await fetchItems();
    } catch (error) {
      console.error('Error importing:', error);
      showMessage('error', 'שגיאה בייבוא הקובץ');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-theme-tab-active animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">טוען פקידים/ות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full py-2" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={3000}
        />
      )}

      <div className="page-header mb-1.5 rounded-md px-2 py-1.5 flex-shrink-0 w-full">
        <div className="relative flex items-center gap-1.5 flex-wrap w-full">
          <div className="page-header-icon shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h1 className="page-header-title text-sm sm:text-base font-bold">פקידים/ות</h1>
          <span className="page-header-badge">{items.length} רשומות</span>
        </div>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2 flex-shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleImportFromExcel}
          className="hidden"
          disabled={isImporting}
        />
        <div className="action-bar flex-1 min-w-0 py-1 px-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            {!isAdding && (
              <>
                <button
                  onClick={handleCancelAll}
                  disabled={isSaving || (dirtyItems.size === 0 && deletedItems.size === 0)}
                  className="btn btn-action btn-cancel disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="h-5 w-5" />
                  <span>ביטול</span>
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving || (dirtyItems.size === 0 && deletedItems.size === 0)}
                  className="btn btn-action btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  <span>שמור{dirtyItems.size + deletedItems.size > 0 ? ` (${dirtyItems.size + deletedItems.size})` : ''}</span>
                </button>
              </>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={handleExportToExcel}
                  className="btn btn-action btn-export"
                >
                  <Download className="h-5 w-5" />
                  <span>ייצא</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="btn btn-action btn-primary disabled:opacity-50 disabled:shadow-none"
                >
                  <Upload className="h-5 w-5" />
                  <span>{isImporting ? 'מייבא...' : 'ייבא'}</span>
                </button>
                <button
                  onClick={startAdd}
                  className="btn btn-action btn-primary"
                >
                  <Plus className="h-5 w-5" />
                  <span>הוסף פקיד/ה</span>
                </button>
              </>
            )}
            <button
              onClick={fetchItems}
              className="btn btn-action btn-secondary"
            >
              <RefreshCw className="h-5 w-5" />
              <span>רענן</span>
            </button>
          </div>
        </div>
      </div>

        {isAdding && (
          <div className="mb-6 p-4 bg-theme-highlight rounded-lg border border-theme-card-border">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">הוסף פקיד/ה חדש/ה</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם פקיד/ה *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="שם הפקיד/ה"
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אימייל *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="example@domain.com"
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">טלפון</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="טלפון"
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-theme-tab-active text-white rounded-lg hover:bg-theme-tab-active-hover transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-theme-action-accent w-full">
          <div className="ag-theme-alpine flex-1 min-h-[300px]" style={{ width: '100%', minWidth: '100%', overflowX: 'auto', direction: 'rtl' }}>
            <AgGridReact
              ref={gridRef}
              rowData={items}
              columnDefs={configuredColumnDefs}
              defaultColDef={{
                resizable: false,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
                cellStyle: { textAlign: 'right', direction: 'rtl' },
                headerClass: 'ag-right-aligned-header',
                headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
                minWidth: 40,
                sortable: true,
                filter: ExcelLikeFilter
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={async (params) => {
                await gridPreferences.loadColumnState(params.api);
                onGridReady(params);
              }}
              onColumnResized={() => gridPreferences.handleColumnResized()}
              onColumnMoved={gridPreferences.handleColumnMoved}
              getRowStyle={getRowStyle}
              getRowId={(params: any) => String(params.data.id)}
              gridOptions={{
                suppressColumnVirtualisation: true,
                alwaysShowHorizontalScroll: true,
                enableRtl: true,
                animateRows: false,
                suppressMovableColumns: true,
                suppressColumnMoveAnimation: true,
              }}
              localeText={{
                noRowsToShow: 'אין פקידים/ות להצגה',
              }}
            />
          </div>
        </div>
    </div>
  );
}
