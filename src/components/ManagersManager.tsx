import { useState, useEffect, useCallback } from 'react';
import { Manager, api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { useFieldConfig } from '../lib/useFieldConfig';
import { Loader2, UserCog, Plus, Trash2, Check, Save, X } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';

export function ManagersManager() {
  const { isAdmin } = useUserRole();
  const [items, setItems] = useState<Manager[]>([]);
  const [originalItems, setOriginalItems] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyItems, setDirtyItems] = useState<Map<number, Partial<Manager>>>(new Map());
  const [deletedItems, setDeletedItems] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState({ name: '', tax_regions: '', email: '', phone: '' });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await api.managers.getAll();
      setItems(data);
      setOriginalItems(JSON.parse(JSON.stringify(data)));
    } catch (err) {
      console.error('Error fetching managers:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בטעינת מנהלים');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, message: text });
    setTimeout(() => setToast(null), 3000);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      showMessage('error', 'כתובת אימייל לא תקינה');
      return;
    }
    try {
      setIsSaving(true);
      const newItem = await api.managers.create({
        name: formData.name.trim(),
        tax_regions: formData.tax_regions.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
      });
      setItems([...items, newItem]);
      setOriginalItems([...originalItems, newItem]);
      showMessage('success', 'המנהל נוסף בהצלחה');
      setFormData({ name: '', tax_regions: '', email: '', phone: '' });
      setIsAdding(false);
    } catch (err) {
      console.error('Error adding manager:', err);
      showMessage('error', err instanceof Error ? err.message : 'שגיאה בהוספת המנהל');
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentValue = useCallback((item: Manager, field: keyof Manager): any => {
    const dirty = dirtyItems.get(item.id);
    if (dirty && field in dirty) return (dirty as any)[field];
    return item[field];
  }, [dirtyItems]);

  const isFieldDirty = useCallback((itemId: number, field: keyof Manager): boolean => {
    return dirtyItems.has(itemId) && field in (dirtyItems.get(itemId) || {});
  }, [dirtyItems]);

  const handleCellChange = useCallback((itemId: number, field: keyof Manager, newValue: any) => {
    if (field === 'email' && newValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newValue).trim())) {
      showMessage('error', 'כתובת אימייל לא תקינה');
      return;
    }
    setDirtyItems(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId) || {};
      next.set(itemId, { ...existing, [field]: newValue });
      return next;
    });
  }, []);

  const handleDelete = (id: number) => {
    if (!isAdmin) return;
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
  };

  const handleSaveAll = async () => {
    if (dirtyItems.size === 0 && deletedItems.size === 0) {
      showMessage('info', 'אין שינויים לשמירה');
      return;
    }
    setIsSaving(true);
    try {
      for (const id of deletedItems) await api.managers.delete(id);
      for (const [id, changes] of dirtyItems) {
        if (deletedItems.has(id)) continue;
        await api.managers.update(id, changes);
      }
      showMessage('success', 'כל השינויים נשמרו בהצלחה');
      setDirtyItems(new Map());
      setDeletedItems(new Set());
      await fetchItems();
    } catch (error) {
      console.error('Error saving:', error);
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
  };

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const field = event.colDef.field as keyof Manager;
    const itemId = (event.data as Manager).id;
    if (field && itemId != null) handleCellChange(itemId, field, event.newValue);
  }, [handleCellChange]);

  const columnDefs: ColDef<Manager>[] = [
    { field: 'name', headerName: 'שם מנהל', editable: isAdmin, cellStyle: (params) => params.data && isFieldDirty(params.data.id, 'name') ? { backgroundColor: '#fef3c7', textAlign: 'right', direction: 'rtl' } : { textAlign: 'right', direction: 'rtl' } },
    { field: 'tax_regions', headerName: 'אזורי מס (מופרדים בפסיק)', editable: isAdmin, flex: 1, cellStyle: (params) => params.data && isFieldDirty(params.data.id, 'tax_regions') ? { backgroundColor: '#fef3c7', textAlign: 'right', direction: 'rtl' } : { textAlign: 'right', direction: 'rtl' } },
    { field: 'email', headerName: 'אימייל', editable: isAdmin, cellStyle: (params) => params.data && isFieldDirty(params.data.id, 'email') ? { backgroundColor: '#fef3c7', direction: 'ltr', textAlign: 'left' } : { direction: 'ltr', textAlign: 'left' } },
    { field: 'phone', headerName: 'טלפון', editable: isAdmin, cellStyle: (params) => params.data && isFieldDirty(params.data.id, 'phone') ? { backgroundColor: '#fef3c7', textAlign: 'right' } : { textAlign: 'right' } },
    {
      headerName: 'פעולות',
      width: 100,
      pinned: 'right',
      cellRenderer: (params: any) => {
        if (!isAdmin) return '';
        const item = params.data as Manager;
        if (!item) return null;
        const isDeleted = deletedItems.has(item.id);
        return (
          <div className="flex justify-center gap-1">
            <button
              type="button"
              onClick={() => handleDelete(item.id)}
              className={`relative inline-flex ${isDeleted ? 'px-2 py-1 text-xs rounded bg-green-100 text-green-800' : 'px-2 py-1 text-xs rounded bg-red-100 text-red-800'}`}
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
    },
  ];

  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'managers');

  const getRowStyle = (params: any) => {
    if (params.data && deletedItems.has(params.data.id)) {
      return { backgroundColor: '#fee2e2', textDecoration: 'line-through' };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader2 className="h-10 w-10 animate-spin text-theme-tab-active" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full py-2" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header mb-1.5 rounded-md px-2 py-1.5 flex-shrink-0 w-full">
        <div className="relative flex items-center gap-1.5 flex-wrap w-full">
          <div className="page-header-icon shrink-0">
            <UserCog className="w-4 h-4" />
          </div>
          <h1 className="page-header-title text-sm sm:text-base font-bold">מנהלים</h1>
          <span className="page-header-badge">{items.length} רשומות</span>
        </div>
      </div>

      {isAdding && (
        <div className="mb-2 p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-2">
          <input
            placeholder="שם"
            value={formData.name}
            onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-32"
          />
          <input
            placeholder="אזורי מס (1,2,3)"
            value={formData.tax_regions}
            onChange={e => setFormData(d => ({ ...d, tax_regions: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-36"
          />
          <input
            placeholder="אימייל"
            value={formData.email}
            onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-40"
          />
          <input
            placeholder="טלפון"
            value={formData.phone}
            onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-28"
          />
          <button onClick={handleAdd} disabled={isSaving} className="btn btn-action btn-primary disabled:opacity-50">
            <Save className="h-5 w-5" /><span>שמור</span>
          </button>
          <button onClick={() => setIsAdding(false)} className="btn btn-action btn-cancel">
            <X className="h-5 w-5" /><span>ביטול</span>
          </button>
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="action-bar flex-1 min-w-0 py-1 px-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            {!isAdding && (dirtyItems.size > 0 || deletedItems.size > 0) && (
              <>
                <button onClick={handleCancelAll} className="btn btn-action btn-cancel">
                  <X className="h-5 w-5" /><span>ביטול</span>
                </button>
                <button onClick={handleSaveAll} disabled={isSaving} className="btn btn-action btn-primary disabled:opacity-50">
                  {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  <span>שמור שינויים</span>
                </button>
              </>
            )}
            {isAdmin && !isAdding && (
              <button onClick={() => setIsAdding(true)} className="btn btn-action btn-primary">
                <Plus className="h-5 w-5" /><span>הוסף מנהל</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-theme-action-accent w-full">
          <div className="ag-theme-alpine flex-1 min-h-[300px]" style={{ width: '100%', minWidth: '100%', overflowX: 'auto', direction: 'rtl' }}>
        <AgGridReact<Manager>
          rowData={items.map(item => ({
            ...item,
            name: getCurrentValue(item, 'name'),
            tax_regions: getCurrentValue(item, 'tax_regions'),
            email: getCurrentValue(item, 'email'),
            phone: getCurrentValue(item, 'phone'),
          }))}
          columnDefs={configuredColumnDefs}
          onCellValueChanged={onCellValueChanged}
          getRowStyle={getRowStyle}
          domLayout="normal"
          suppressCellFocus={true}
          singleClickEdit={true}
        />
          </div>
        </div>
    </div>
  );
}
