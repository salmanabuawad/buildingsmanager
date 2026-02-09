import { useState, useEffect, useRef } from 'react';
import { TaxRegionsMailingList, api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, Mail, Plus, Trash2, Edit2, Save, X, RefreshCw, AlertCircle } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';

export function TaxRegionsMailingListManager() {
  const { isAdmin } = useUserRole();
  const [items, setItems] = useState<TaxRegionsMailingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  
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

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await api.taxRegionsMailingList.getAll();
      setItems(data);
    } catch (err) {
      console.error('Error fetching tax regions mailing list:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בטעינת רשימת תפוצה',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה להוסיף רשומות', type: 'error' });
      return;
    }
    setFormData({
      tax_region: '',
      email: '',
    });
    setEditingId(null);
    setAddingNew(true);
  };

  const handleEdit = (item: TaxRegionsMailingList) => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לערוך רשומות', type: 'error' });
      return;
    }
    setFormData({
      tax_region: item.tax_region,
      email: item.email,
    });
    setEditingId(item.id);
    setAddingNew(false);
  };

  const handleCancel = () => {
    setFormData({
      tax_region: '',
      email: '',
    });
    setEditingId(null);
    setAddingNew(false);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לשמור רשומות', type: 'error' });
      return;
    }

    if (!formData.tax_region.trim() || !formData.email.trim()) {
      setToast({ message: 'אזור מס ואימייל הם שדות חובה', type: 'error' });
      return;
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email.trim())) {
      setToast({ message: 'כתובת אימייל לא תקינה', type: 'error' });
      return;
    }

    try {
      setSaving(true);
      setToast(null);

      if (addingNew) {
        const newItem = await api.taxRegionsMailingList.create({
          tax_region: formData.tax_region.trim(),
          email: formData.email.trim(),
        });
        setItems([...items, newItem]);
        setToast({ message: 'הרשומה נוספה בהצלחה', type: 'success' });
      } else if (editingId) {
        const updatedItem = await api.taxRegionsMailingList.update(editingId, {
          tax_region: formData.tax_region.trim(),
          email: formData.email.trim(),
        });
        setItems(items.map(item => item.id === editingId ? updatedItem : item));
        setToast({ message: 'הרשומה עודכנה בהצלחה', type: 'success' });
      }

      handleCancel();
    } catch (err) {
      console.error('Error saving tax regions mailing list:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בשמירת הרשומה',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה למחוק רשומות', type: 'error' });
      return;
    }

    try {
      setDeleting(id);
      await api.taxRegionsMailingList.delete(id);
      setItems(items.filter(item => item.id !== id));
      setToast({ message: 'הרשומה נמחקה בהצלחה', type: 'success' });
      setDeleteConfirmOpen(null);
    } catch (err) {
      console.error('Error deleting tax regions mailing list:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה במחיקת הרשומה',
        type: 'error'
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteBulk = async () => {
    if (!isAdmin || selectedRows.length === 0) {
      return;
    }

    try {
      setDeleting(0); // Use 0 as indicator for bulk delete
      await api.taxRegionsMailingList.deleteBulk(selectedRows);
      setItems(items.filter(item => !selectedRows.includes(item.id)));
      setToast({ message: `נמחקו ${selectedRows.length} רשומות בהצלחה`, type: 'success' });
      setSelectedRows([]);
    } catch (err) {
      console.error('Error deleting tax regions mailing list:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה במחיקת הרשומות',
        type: 'error'
      });
    } finally {
      setDeleting(null);
    }
  };

  const columnDefs: ColDef<TaxRegionsMailingList>[] = [
    {
      field: 'id',
      headerName: 'מזהה',
      width: 80,
      checkboxSelection: isAdmin,
      headerCheckboxSelection: isAdmin,
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      editable: false,
      width: 200,
    },
    {
      field: 'email',
      headerName: 'אימייל',
      editable: false,
      width: 250,
    },
    {
      field: 'created_at',
      headerName: 'נוצר',
      width: 180,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleDateString('he-IL');
      },
    },
    {
      field: 'updated_at',
      headerName: 'עודכן',
      width: 180,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleDateString('he-IL');
      },
    },
    {
      headerName: 'פעולות',
      width: 150,
      cellRenderer: (params: any) => {
        if (!isAdmin) return '';
        return (
          <div className="flex items-center gap-2 h-full">
            <button
              onClick={() => handleEdit(params.data)}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors flex items-center gap-1"
            >
              <Edit2 className="h-3 w-3" />
              ערוך
            </button>
            <button
              onClick={() => setDeleteConfirmOpen(params.data.id)}
              className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        );
      },
      pinned: 'left',
    },
  ];

  const onSelectionChanged = () => {
    if (gridRef.current) {
      const selectedNodes = gridRef.current.api.getSelectedNodes();
      const selectedIds = selectedNodes.map(node => node.data?.id).filter((id): id is number => id !== undefined);
      setSelectedRows(selectedIds);
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
                {selectedRows.length > 0 && (
                  <button
                    onClick={handleDeleteBulk}
                    disabled={deleting === 0}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting === 0 ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    מחק נבחרים ({selectedRows.length})
                  </button>
                )}
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  הוסף רשומה
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add/Edit Form */}
        {(addingNew || editingId !== null) && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">
              {addingNew ? 'הוסף רשומה חדשה' : 'ערוך רשומה'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אזור מס *</label>
                <input
                  type="text"
                  value={formData.tax_region}
                  onChange={(e) => setFormData({ ...formData, tax_region: e.target.value })}
                  placeholder="לדוגמה: business, residence"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אימייל *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="example@domain.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                שמור
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={items}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
            }}
            rowSelection="multiple"
            onSelectionChanged={onSelectionChanged}
            suppressRowClickSelection={true}
            animateRows={true}
            localeText={{
              noRowsToShow: 'אין רשומות להצגה',
            }}
          />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">מחיקת רשומה</h3>
            </div>
            <p className="text-slate-600 mb-6">
              האם אתה בטוח שברצונך למחוק את הרשומה? פעולה זו לא ניתנת לביטול.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmOpen)}
                disabled={deleting === deleteConfirmOpen}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting === deleteConfirmOpen ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
