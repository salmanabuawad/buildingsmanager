import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, User, Shield, UserX, CheckCircle2, XCircle, Save, RefreshCw, Key, X, Eye, EyeOff, Plus, Trash2, AlertCircle } from 'lucide-react';

interface User {
  user_id: number;
  auth_user_id: string | null;
  user_name: string;
  user_email: string | null;
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
    password: '',
    confirmPassword: '',
    user_role: 'user' as 'admin' | 'user' | 'inspector',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingCell, setEditingCell] = useState<{ userId: number; field: 'user_name' | 'user_email'; value: string } | null>(null);

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

  const handleUpdateUser = async (userId: number, updates: { user_role?: 'admin' | 'user' | 'inspector'; active?: boolean; user_name?: string; user_email?: string }) => {
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
  };

  const handleRoleChange = (userId: number, newRole: 'admin' | 'user' | 'inspector') => {
    handleUpdateUser(userId, { user_role: newRole });
  };

  const handleActiveToggle = (userId: number, currentActive: boolean) => {
    handleUpdateUser(userId, { active: !currentActive });
  };

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
      });

      // Refresh users list
      await fetchUsers();

      // Close modal and reset form
      setAddUserModalOpen(false);
      setNewUser({
        user_name: '',
        user_email: '',
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-purple-600" />
          <h1 className="text-2xl font-bold text-slate-900">ניהול משתמשים</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openAddUserModal}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            הוסף משתמש
          </button>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg border border-purple-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" dir="rtl">
              <thead className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">שם משתמש</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">אימייל</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">תפקיד</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">סטטוס</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">תאריך יצירה</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      לא נמצאו משתמשים
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.user_id} className="hover:bg-purple-50/50 transition-colors">
                      <td className="px-4 py-3">
                        {editingCell?.userId === user.user_id && editingCell?.field === 'user_name' ? (
                          <input
                            type="text"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((c) => (c ? { ...c, value: e.target.value } : null))}
                            onBlur={() => {
                              const v = editingCell?.value.trim();
                              if (editingCell && v && v !== user.user_name) {
                                handleUpdateUser(user.user_id, { user_name: v });
                              }
                              setEditingCell(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            autoFocus
                            className="w-full px-2 py-1 text-sm border border-purple-300 rounded focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <span
                            className="text-sm text-slate-900 font-medium cursor-pointer hover:bg-purple-100 rounded px-1 -mx-1"
                            onClick={() => setEditingCell({ userId: user.user_id, field: 'user_name', value: user.user_name })}
                          >
                            {user.user_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingCell?.userId === user.user_id && editingCell?.field === 'user_email' ? (
                          <input
                            type="email"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((c) => (c ? { ...c, value: e.target.value } : null))}
                            onBlur={() => {
                              if (editingCell && editingCell.value.trim() !== (user.user_email || '')) {
                                handleUpdateUser(user.user_id, { user_email: editingCell.value.trim() || undefined });
                              }
                              setEditingCell(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            autoFocus
                            className="w-full px-2 py-1 text-sm border border-purple-300 rounded focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <span
                            className="text-sm text-slate-600 cursor-pointer hover:bg-purple-100 rounded px-1 -mx-1"
                            onClick={() => setEditingCell({ userId: user.user_id, field: 'user_email', value: user.user_email || '' })}
                          >
                            {user.user_email || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.user_role}
                          onChange={(e) => handleRoleChange(user.user_id, e.target.value as 'admin' | 'user' | 'inspector')}
                          disabled={saving === user.user_id}
                          className="px-3 py-1.5 text-sm border border-purple-300 rounded-lg bg-white hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="admin">מנהל</option>
                          <option value="user">משתמש</option>
                          <option value="inspector">פקח</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.active ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-green-700">פעיל</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="text-sm text-red-700">לא פעיל</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {new Date(user.created_at).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openPasswordModal(user.user_id)}
                            disabled={saving === user.user_id || deleting === user.user_id}
                            className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title="שנה סיסמה"
                          >
                            <Key className="h-4 w-4" />
                            שנה סיסמה
                          </button>
                          <button
                            onClick={() => handleActiveToggle(user.user_id, user.active)}
                            disabled={saving === user.user_id || deleting === user.user_id}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              user.active
                                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {saving === user.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : user.active ? (
                              <>
                                <UserX className="h-4 w-4 inline-block ml-1" />
                                השבת
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 inline-block ml-1" />
                                הפעל
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmOpen(user.user_id)}
                            disabled={saving === user.user_id || deleting === user.user_id}
                            className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title="מחק משתמש"
                          >
                            <Trash2 className="h-4 w-4" />
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                  תפקיד
                </label>
                <select
                  value={newUser.user_role}
                  onChange={(e) => setNewUser({ ...newUser, user_role: e.target.value as 'admin' | 'user' | 'inspector' })}
                  disabled={creatingUser}
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg bg-white hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="user">משתמש</option>
                  <option value="admin">מנהל</option>
                  <option value="inspector">פקח</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">מנהל: גישה מלאה. משתמש: מבנים, נכסים ועריכה. פקח: משימות ביקורת בלבד.</p>
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
