import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, User, Shield, UserX, CheckCircle2, XCircle, Save, RefreshCw, Key, X, Eye, EyeOff, Plus, Trash2, AlertCircle } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import { useFieldConfig } from '../lib/useFieldConfig';

interface User {
  user_id: number;
  auth_user_id: string | null;
  user_name: string;
  user_email: string | null;
  full_name?: string | null;
  phone?: string | null;
  user_role: 'admin' | 'user' | 'inspector';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function UserManagement() {
  const { isAdmin } = useUserRole();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [newUser, setNewUser] = useState({
    user_name: '',
    user_email: '',
    full_name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_role: 'user' as 'admin' | 'user' | 'inspector',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const gridRef = useRef<AgGridReact<User>>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.users.getAll();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateUser = useCallback(async (userId: number, updates: { user_role?: 'admin' | 'user' | 'inspector'; active?: boolean; user_name?: string; user_email?: string | null; full_name?: string | null; phone?: string | null }) => {
    if (!isAdmin) {
      setError('אין לך הרשאה לעדכן משתמשים');
      return;
    }

    try {
      setSaving(userId);
      setError(null);
      await api.users.update(userId, updates);
      
      // Update local state
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.user_id === userId
            ? { ...user, ...updates, updated_at: new Date().toISOString() }
            : user
        )
      );
    } catch (err) {
      console.error('Error updating user:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון המשתמש');
    } finally {
      setSaving(null);
    }
  }, [isAdmin]);

  const handleRoleChange = (userId: number, newRole: 'admin' | 'user' | 'inspector') => {
    handleUpdateUser(userId, { user_role: newRole });
  };

  const handleActiveToggle = (userId: number, currentActive: boolean) => {
    handleUpdateUser(userId, { active: !currentActive });
  };

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<User>) => {
    const field = event.colDef.field as keyof User;
    const user = event.data;
    if (!user?.user_id || !field) return;
    const newValue = event.newValue;
    if (field === 'user_name') handleUpdateUser(user.user_id, { user_name: String(newValue ?? '').trim() || undefined });
    else if (field === 'user_email') handleUpdateUser(user.user_id, { user_email: newValue != null ? String(newValue).trim() || null : null });
    else if (field === 'full_name') handleUpdateUser(user.user_id, { full_name: newValue != null ? String(newValue).trim() || null : null });
    else if (field === 'phone') handleUpdateUser(user.user_id, { phone: newValue != null ? String(newValue).trim() || null : null });
    else if (field === 'user_role') handleUpdateUser(user.user_id, { user_role: newValue as 'admin' | 'user' | 'inspector' });
    else if (field === 'active') handleUpdateUser(user.user_id, { active: !!newValue });
  }, [handleUpdateUser]);

  const columnDefs: ColDef<User>[] = useMemo(() => [
    { field: 'user_name', headerName: 'שם משתמש', editable: true, cellEditor: 'agTextCellEditor', width: 130 },
    { field: 'full_name', headerName: 'שם מלא', editable: true, cellEditor: 'agTextCellEditor', width: 130 },
    { field: 'user_email', headerName: 'אימייל', editable: true, cellEditor: 'agTextCellEditor', width: 180, cellStyle: { direction: 'ltr', textAlign: 'left' } },
    { field: 'phone', headerName: 'טלפון', editable: true, cellEditor: 'agTextCellEditor', width: 120, cellStyle: { direction: 'ltr', textAlign: 'left' } },
    {
      field: 'user_role',
      headerName: 'תפקיד',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['מנהל', 'פקח', 'משתמש'] },
      width: 100,
      valueGetter: (p) => (p.data?.user_role === 'admin' ? 'מנהל' : p.data?.user_role === 'inspector' ? 'פקח' : 'משתמש'),
      valueParser: (p) => ({ 'מנהל': 'admin', 'פקח': 'inspector', 'משתמש': 'user' }[p.newValue as string] || 'user'),
      valueSetter: (p) => { if (p.data) p.data.user_role = ({ 'מנהל': 'admin', 'פקח': 'inspector', 'משתמש': 'user' }[p.newValue as string] || 'user') as 'admin' | 'user' | 'inspector'; },
    },
    {
      field: 'active',
      headerName: 'פעיל',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['כן', 'לא'] },
      width: 80,
      valueGetter: (p) => (p.data?.active ? 'כן' : 'לא'),
      valueParser: (p) => p.newValue === 'כן',
      valueSetter: (p) => { if (p.data) p.data.active = p.newValue === 'כן'; },
    },
    {
      field: 'created_at',
      headerName: 'תאריך יצירה',
      editable: false,
      width: 110,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString('he-IL') : '',
    },
    {
      headerName: 'פעולות',
      width: 200,
      pinned: 'left',
      editable: false,
      cellRenderer: (params: any) => {
        const user = params.data as User;
        if (!user) return null;
        return (
          <div className="flex items-center gap-1 justify-start h-full">
            <button
              onClick={() => openPasswordModal(user.user_id)}
              disabled={saving === user.user_id || deleting === user.user_id}
              className="px-2 py-1 text-xs rounded bg-theme-highlight text-theme-tab-active hover:bg-theme-highlight/80 disabled:opacity-50"
              title="שנה סיסמה"
            >
              <Key className="h-3 w-3 inline" /> סיסמה
            </button>
            <button
              onClick={() => handleActiveToggle(user.user_id, user.active)}
              disabled={saving === user.user_id || deleting === user.user_id}
              className={`px-2 py-1 text-xs rounded disabled:opacity-50 ${user.active ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}
            >
              {saving === user.user_id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : user.active ? 'השבת' : 'הפעל'}
            </button>
            <button
              onClick={() => setDeleteConfirmOpen(user.user_id)}
              disabled={saving === user.user_id || deleting === user.user_id}
              className="px-2 py-1 text-xs rounded bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
              title="מחק"
            >
              <Trash2 className="h-3 w-3 inline" />
            </button>
          </div>
        );
      },
    },
  ], [saving, deleting]);

  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'user-management');

  const handleChangePassword = async (userId: number) => {
    if (!isAdmin) {
      setError('אין לך הרשאה לשנות סיסמאות');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    try {
      setChangingPassword(true);
      setError(null);

      await api.users.changePassword(userId, newPassword);

      // Success
      setPasswordModalOpen(null);
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      alert('הסיסמה עודכנה בהצלחה');
    } catch (err) {
      console.error('Error changing password:', err);
      const errorMessage = err instanceof Error ? err.message : 'שגיאה בעדכון הסיסמה';
      setError(errorMessage);
    } finally {
      setChangingPassword(false);
    }
  };

  const openPasswordModal = (userId: number) => {
    setPasswordModalOpen(userId);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError(null);
  };

  const closePasswordModal = () => {
    setPasswordModalOpen(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError(null);
  };

  const handleAddUser = async () => {
    if (!isAdmin) {
      setError('אין לך הרשאה להוסיף משתמשים');
      return;
    }

    if (!newUser.user_name || !newUser.user_email || !newUser.password) {
      setError('אנא מלא את כל השדות');
      return;
    }

    if (newUser.password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (newUser.password !== newUser.confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    try {
      setCreatingUser(true);
      setError(null);

      const result = await api.users.create({
        user_name: newUser.user_name,
        user_email: newUser.user_email,
        password: newUser.password,
        user_role: newUser.user_role,
        full_name: newUser.full_name.trim() || undefined,
        phone: newUser.phone.trim() || undefined,
      });

      // Refresh users list
      await fetchUsers();

      // Close modal and reset form
      setAddUserModalOpen(false);
      setNewUser({
        user_name: '',
        user_email: '',
        full_name: '',
        phone: '',
        password: '',
        confirmPassword: '',
        user_role: 'user',
      });
      setError(null);
      alert('המשתמש נוצר בהצלחה');
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת המשתמש');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!isAdmin) {
      setError('אין לך הרשאה למחוק משתמשים');
      return;
    }

    try {
      setDeleting(userId);
      setError(null);

      await api.users.delete(userId);

      // Refresh users list
      await fetchUsers();

      // Close confirmation modal
      setDeleteConfirmOpen(null);
      setError(null);
      alert('המשתמש נמחק בהצלחה');
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err instanceof Error ? err.message : 'שגיאה במחיקת המשתמש');
    } finally {
      setDeleting(null);
    }
  };

  const openAddUserModal = () => {
    setAddUserModalOpen(true);
    setNewUser({
      user_name: '',
      user_email: '',
      password: '',
      confirmPassword: '',
      user_role: 'user',
    });
    setError(null);
  };

  const closeAddUserModal = () => {
    setAddUserModalOpen(false);
    setNewUser({
      user_name: '',
      user_email: '',
      full_name: '',
      phone: '',
      password: '',
      confirmPassword: '',
      user_role: 'user',
    });
    setError(null);
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <Shield className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-700 font-medium">אין לך הרשאה לגשת לדף זה</p>
          <p className="text-red-600 text-sm mt-1">רק מנהלים יכולים לנהל משתמשים</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full py-2" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
      <div className="page-header mb-1.5 rounded-md px-2 py-1.5 flex-shrink-0 w-full">
        <div className="relative flex items-center gap-1.5 flex-wrap w-full">
          <div className="page-header-icon shrink-0">
            <User className="w-4 h-4" />
          </div>
          <h1 className="page-header-title text-sm sm:text-base font-bold">ניהול משתמשים</h1>
          <span className="page-header-badge">{users.length} רשומות</span>
        </div>
      </div>

      {error && (
        <div className="mb-2 px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="action-bar flex-1 min-w-0 py-1 px-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              onClick={openAddUserModal}
              className="btn btn-action btn-primary"
            >
              <Plus className="h-5 w-5" />
              <span>הוסף משתמש</span>
            </button>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="btn btn-action btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>רענן</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-theme-tab-active animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-theme-action-accent w-full">
            <div className="ag-theme-alpine flex-1 min-h-[300px]" style={{ width: '100%', minWidth: '100%', overflowX: 'auto', direction: 'rtl' }}>
            <AgGridReact<User>
              ref={gridRef}
              rowData={users}
              columnDefs={configuredColumnDefs}
              onCellValueChanged={onCellValueChanged}
              getRowId={(p) => String(p.data?.user_id)}
              defaultColDef={{
                resizable: true,
                sortable: true,
                cellStyle: { textAlign: 'right', direction: 'rtl' },
              }}
              singleClickEdit={true}
              stopEditingWhenCellsLoseFocus={true}
              localeText={{ noRowsToShow: 'לא נמצאו משתמשים' }}
            />
            </div>
          </div>
        )}

      {/* Password Change Modal */}
      {passwordModalOpen !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">שנה סיסמה</h3>
              <button
                onClick={closePasswordModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={changingPassword}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  סיסמה חדשה (לפחות 6 תווים)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="הזן סיסמה חדשה"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  אימות סיסמה
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={changingPassword}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן שוב את הסיסמה"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closePasswordModal}
                disabled={changingPassword}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  const user = users.find(u => u.user_id === passwordModalOpen);
                  if (user) {
                    handleChangePassword(user.user_id);
                  }
                }}
                disabled={changingPassword || !newPassword || !confirmPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    משנה...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    שמור
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">הוסף משתמש חדש</h3>
              <button
                onClick={closeAddUserModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={creatingUser}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  שם משתמש *
                </label>
                <input
                  type="text"
                  value={newUser.user_name}
                  onChange={(e) => setNewUser({ ...newUser, user_name: e.target.value })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן שם משתמש"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  שם מלא (אופציונלי)
                </label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן שם מלא"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  אימייל *
                </label>
                <input
                  type="email"
                  value={newUser.user_email}
                  onChange={(e) => setNewUser({ ...newUser, user_email: e.target.value })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן אימייל"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  טלפון (אופציונלי)
                </label>
                <input
                  type="tel"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן טלפון"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  תפקיד
                </label>
                <select
                  value={newUser.user_role}
                  onChange={(e) => setNewUser({ ...newUser, user_role: e.target.value as 'admin' | 'user' | 'inspector' })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg bg-white hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="user">משתמש</option>
                  <option value="inspector">פקח</option>
                  <option value="admin">מנהל</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  סיסמה (לפחות 6 תווים) *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    disabled={creatingUser}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="הזן סיסמה"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  אימות סיסמה *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newUser.confirmPassword}
                  onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="הזן שוב את הסיסמה"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeAddUserModal}
                disabled={creatingUser}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button
                onClick={handleAddUser}
                disabled={creatingUser || !newUser.user_name || !newUser.user_email || !newUser.password || !newUser.confirmPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingUser ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    יוצר...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    צור משתמש
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">מחיקת משתמש</h3>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <p className="text-slate-600 mb-6">
              האם אתה בטוח שברצונך למחוק את המשתמש{' '}
              <span className="font-semibold text-slate-900">
                {users.find(u => u.user_id === deleteConfirmOpen)?.user_name}
              </span>?
              <br />
              פעולה זו לא ניתנת לביטול.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(null)}
                disabled={deleting === deleteConfirmOpen}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  if (deleteConfirmOpen !== null) {
                    handleDeleteUser(deleteConfirmOpen);
                  }
                }}
                disabled={deleting === deleteConfirmOpen}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting === deleteConfirmOpen ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מוחק...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    מחק
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
