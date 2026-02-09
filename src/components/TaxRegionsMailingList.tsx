import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TaxRegionsMailingList, api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, Mail, Plus, Trash2, Save, X, RefreshCw, Download, Upload } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { exportToExcel } from '../lib/excelExport';
import * as XLSX from 'xlsx';

export function TaxRegionsMailingListManager() {
  const { isAdmin } = useUserRole();
  const [items, setItems] = useState<TaxRegionsMailingList[]>([]);
  const [originalItems, setOriginalItems] = useState<TaxRegionsMailingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyItems, setDirtyItems] = useState<Map<number, Partial<TaxRegionsMailingList>>>(new Map());
  const [deletedItems, setDeletedItems] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<TaxRegionsMailingList>>(null);

  const gridPreferences = useGridPreferences(
    gridRef,
    'tax-regions-mailing-list',
    'default'
  );

  const [formData, setFormData] = useState({
    tax_region: '',
    email: '',
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await api.taxRegionsMailingList.getAll();
      setItems(data);
      if (dirtyItems.size === 0) {
        setOriginalItems(JSON.parse(JSON.stringify(data)));
      }
    } catch (err) {
      console.error('Error fetching tax regions mailing list:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בטעינת רשימת תפוצה');
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
      tax_region: '',
      email: '',
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

    if (!formData.tax_region.trim() || !formData.email.trim()) {
      showMessage('error', 'אזור מס ואימייל הם שדות חובה');
      return;
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email.trim())) {
      showMessage('error', 'כתובת אימייל לא תקינה');
      return;
    }

    try {
      setIsSaving(true);
      const newItem = await api.taxRegionsMailingList.create({
        tax_region: formData.tax_region.trim(),
        email: formData.email.trim(),
      });
      setItems([...items, newItem]);
      setOriginalItems([...originalItems, newItem]);
      showMessage('success', 'הרשומה נוספה בהצלחה');
      resetForm();
    } catch (err) {
      console.error('Error adding tax regions mailing list:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בהוספת הרשומה');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper function to get current value of a field (considering dirty state)
  const getCurrentValue = useCallback((item: TaxRegionsMailingList, field: keyof TaxRegionsMailingList): any => {
    const dirtyChanges = dirtyItems.get(item.id);
    if (dirtyChanges && field in dirtyChanges) {
      return dirtyChanges[field as keyof Partial<TaxRegionsMailingList>];
    }
    return item[field];
  }, [dirtyItems]);

  // Helper function to check if a field is dirty
  const isFieldDirty = useCallback((itemId: number, field: keyof TaxRegionsMailingList): boolean => {
    return dirtyItems.has(itemId) && field in (dirtyItems.get(itemId) || {});
  }, [dirtyItems]);

  // Handle cell value change
  const handleCellChange = useCallback(async (itemId: number, field: keyof TaxRegionsMailingList, newValue: any) => {
    try {
      // Validate email field
      if (field === 'email') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (newValue && !emailPattern.test(String(newValue).trim())) {
          showMessage('error', 'כתובת אימייל לא תקינה');
          return;
        }
      }

      // Track the change in dirtyItems
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
    // Toggle deletion mark
    setDeletedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
      // Bulk delete first
      if (deletedItems.size > 0) {
        await api.taxRegionsMailingList.deleteBulk(Array.from(deletedItems.values()));
      }

      // Save updates
      const updatePromises = Array.from(dirtyItems.entries()).map(async ([id, changes]) => {
        if (deletedItems.has(id)) return;
        return api.taxRegionsMailingList.update(id, changes);
      });

      await Promise.all(updatePromises);

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
    if (dirtyItems.size === 0 && deletedItems.size === 0) {
      return;
    }

    setItems(JSON.parse(JSON.stringify(originalItems)));
    setDirtyItems(new Map());
    setDeletedItems(new Set());
    
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef } = event;
    const field = colDef.field as keyof TaxRegionsMailingList;
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

  const columnDefs: ColDef<TaxRegionsMailingList>[] = useMemo(() => {
    const defs: ColDef<TaxRegionsMailingList>[] = [
      {
        field: 'tax_region',
        headerName: 'אזור מס',
        editable: isAdmin,
        cellEditor: 'agTextCellEditor',
        cellStyle: (params: any) => {
          const isDirty = params.data && isFieldDirty(params.data.id, 'tax_region');
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
            textAlign: 'right',
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
          const item = params.data as TaxRegionsMailingList;
          if (!item) return null;
          const isDeleted = deletedItems.has(item.id);
          return (
            <div className="flex items-center justify-center gap-1 h-full">
              <button
                onClick={() => handleDelete(item.id)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  isDeleted 
                    ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
                title={isDeleted ? 'בטל מחיקה' : 'מחק'}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        },
        cellStyle: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }
    ];

    return defs.map(col => ({
      ...col,
      headerName: processColumnHeader(col.headerName || ''),
    }));
  }, [isAdmin, deletedItems, isFieldDirty]);

  const configuredColumnDefs = useFieldConfig(columnDefs, 'tax-regions-mailing-list');

  const getRowStyle = (params: any) => {
    if (!params.data) return null;
    const isDeleted = deletedItems.has(params.data.id);
    if (isDeleted) {
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
          'אזור מס': dirty.tax_region !== undefined ? dirty.tax_region : item.tax_region,
          'אימייל': dirty.email !== undefined ? dirty.email : item.email,
        };
      });

    exportToExcel({
      filename: 'רשימת_תפוצה_לפי_אזורי_מס.xlsx',
      sheetName: 'רשימת תפוצה',
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

      const itemsToAdd: Array<{ tax_region: string; email: string }> = [];
      for (const row of jsonData) {
        // Support both Hebrew and English headers
        const taxRegion = String(
          row['אזור מס'] || 
          row['אזור מיסים'] || 
          row['tax_region'] || 
          row['tax region'] || 
          ''
        ).trim();
        const email = String(
          row['אימייל'] || 
          row['email'] || 
          row['Email'] || 
          ''
        ).trim();
        
        if (taxRegion && email) {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailPattern.test(email)) {
            itemsToAdd.push({ tax_region: taxRegion, email });
          }
        }
      }

      if (itemsToAdd.length === 0) {
        showMessage('error', 'לא נמצאו רשומות תקינות לייבא');
        return;
      }

      // Create all items
      const createPromises = itemsToAdd.map(item => 
        api.taxRegionsMailingList.create(item).catch(err => {
          console.error('Error creating item:', err);
          return null;
        })
      );

      const created = await Promise.all(createPromises);
      const successful = created.filter(item => item !== null);

      showMessage('success', `יובאו ${successful.length} מתוך ${itemsToAdd.length} רשומות בהצלחה`);
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
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">טוען רשימת תפוצה...</p>
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
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-800">רשימת תפוצה לפי אזורי מס</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchItems}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              רענן
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={handleExportToExcel}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  ייצא ל-Excel
                </button>
                <label className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                  <Upload className="h-4 w-4" />
                  ייבא מ-Excel
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImportFromExcel}
                    className="hidden"
                    disabled={isImporting}
                  />
                </label>
                <button
                  onClick={startAdd}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  הוסף רשומה
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add Form */}
        {isAdding && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">הוסף רשומה חדשה</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אזור מס *</label>
                <input
                  type="text"
                  value={formData.tax_region}
                  onChange={(e) => setFormData({ ...formData, tax_region: e.target.value })}
                  placeholder="לדוגמה: business, residence"
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אימייל *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="example@domain.com"
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
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

        {/* Save All / Cancel buttons */}
        {!isAdding && (
          <div className="mb-4 flex justify-end gap-2">
            <button
              onClick={handleCancelAll}
              disabled={isSaving || (dirtyItems.size === 0 && deletedItems.size === 0)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
              ביטול
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving || (dirtyItems.size === 0 && deletedItems.size === 0)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור הכל{dirtyItems.size + deletedItems.size > 0 ? ` (${dirtyItems.size + deletedItems.size})` : ''}
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={items}
            columnDefs={configuredColumnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
            }}
            onCellValueChanged={onCellValueChanged}
            onGridReady={onGridReady}
            getRowStyle={getRowStyle}
            animateRows={true}
            localeText={{
              noRowsToShow: 'אין רשומות להצגה',
            }}
          />
        </div>
      </div>
    </div>
  );
}
