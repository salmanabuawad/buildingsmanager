import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, User, Shield, UserX, CheckCircle2, XCircle, Save, RefreshCw } from 'lucide-react';

interface User {
  user_id: number;
  auth_user_id: string | null;
  user_name: string;
  user_email: string | null;
  user_role: 'admin' | 'user';
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

  const handleUpdateUser = async (userId: number, updates: { user_role?: 'admin' | 'user'; active?: boolean }) => {
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

  const handleRoleChange = (userId: number, newRole: 'admin' | 'user') => {
    handleUpdateUser(userId, { user_role: newRole });
  };

  const handleActiveToggle = (userId: number, currentActive: boolean) => {
    handleUpdateUser(userId, { active: !currentActive });
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
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </button>
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
                      <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                        {user.user_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {user.user_email || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.user_role}
                          onChange={(e) => handleRoleChange(user.user_id, e.target.value as 'admin' | 'user')}
                          disabled={saving === user.user_id}
                          className="px-3 py-1.5 text-sm border border-purple-300 rounded-lg bg-white hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="admin">מנהל</option>
                          <option value="user">משתמש</option>
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
                        <button
                          onClick={() => handleActiveToggle(user.user_id, user.active)}
                          disabled={saving === user.user_id}
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
