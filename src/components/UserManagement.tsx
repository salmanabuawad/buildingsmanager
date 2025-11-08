import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, Shield, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

interface UserProfile {
  id: string;
  email: string;
  role: 'viewer' | 'editor';
  created_at: string;
}

export function UserManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'viewer' | 'editor'>('viewer');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
      });

      if (signUpError) throw signUpError;

      if (data.user && newUserRole === 'editor') {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ role: 'editor' })
          .eq('id', data.user.id);

        if (updateError) throw updateError;
      }

      setSuccess(t('userCreated', { email: newUserEmail, role: newUserRole }));
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('viewer');

      setTimeout(() => loadUsers(), 1000);
    } catch (err: any) {
      setError(err.message || t('errorCreatingUser'));
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'viewer' | 'editor') => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      setSuccess(t('roleUpdated'));
      loadUsers();
    } catch (err: any) {
      setError(err.message || t('errorUpdatingRole'));
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(t('confirmDeleteUser', { email }))) return;

    try {
      const { error } = await supabase.rpc('delete_user', { user_id: userId });

      if (error) throw error;

      setSuccess(t('userDeleted', { email }));
      loadUsers();
    } catch (err: any) {
      setError(err.message || t('errorDeletingUser'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Users className="w-8 h-8 text-teal-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('userManagement')}</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-semibold text-gray-900">{t('createNewUser')}</h2>
          </div>

          <form onSubmit={createUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('email')}
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('password')}
                </label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={t('minimumChars', { count: 6 })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('role')}
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'viewer' | 'editor')}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="viewer">{t('viewer')} - {t('readOnly')}</option>
                  <option value="editor">{t('editor')} - {t('readWrite')}</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-teal-600 to-blue-600 text-white font-semibold rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('creating') : t('createUser')}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">{t('existingUsers')}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('email')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('role')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('createdAt')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value as 'viewer' | 'editor')}
                        className="px-3 py-1 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="viewer">
                          {t('viewer')}
                        </option>
                        <option value="editor">
                          {t('editor')}
                        </option>
                      </select>
                      <span className="mr-2">
                        {user.role === 'editor' ? (
                          <Shield className="inline w-4 h-4 text-teal-600" />
                        ) : (
                          <Eye className="inline w-4 h-4 text-gray-400" />
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" dir="ltr">
                      {new Date(user.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => deleteUser(user.id, user.email)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title={t('deleteUser')}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {users.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {t('noUsersYet')}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">{t('roleExplanation')}</h3>
          <div className="space-y-2 text-sm text-blue-800">
            <div className="flex items-start gap-2">
              <Eye className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{t('viewer')}:</strong> {t('viewerDescription')}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{t('editor')}:</strong> {t('editorDescription')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
