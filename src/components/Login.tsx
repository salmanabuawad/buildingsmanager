import { useState, FormEvent } from 'react';
import { loginUsersTable } from '../lib/usersTableAuth';
import { api } from '../lib/api';
import { Building2, Loader2, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [creatingUsers, setCreatingUsers] = useState(false);
  const [createUsersMessage, setCreateUsersMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginUsersTable(userName.trim(), password);
      if (result.success) {
        onLoginSuccess();
        return;
      }
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהתחברות. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUsers = async () => {
    setCreatingUsers(true);
    setCreateUsersMessage(null);
    setError(null);
    try {
      const res = await api.users.createDefaultUsers();
      setCreateUsersMessage(res.message);
    } catch (err) {
      setCreateUsersMessage(err instanceof Error ? err.message : 'שגיאה ביצירת משתמשים.');
    } finally {
      setCreatingUsers(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg mb-4">
            <Building2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">מערכת ניהול מבנים</h1>
          <p className="text-slate-600">התחברות למערכת</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2 text-right">
                שם משתמש
              </label>
              <input
                id="username"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-right disabled:bg-slate-100 disabled:cursor-not-allowed"
                placeholder="הזן שם משתמש"
                dir="rtl"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2 text-right">
                סיסמה
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-right disabled:bg-slate-100 disabled:cursor-not-allowed"
                  placeholder="הזן סיסמה"
                  dir="rtl"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? 'הסתר' : 'הצג'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-right whitespace-pre-line flex-1">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !userName.trim() || !password}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>מתחבר...</span>
                </>
              ) : (
                <span>התחבר</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={handleCreateUsers}
              disabled={creatingUsers}
              className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creatingUsers ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>יוצר משתמשים...</span>
                </>
              ) : (
                <span>צור משתמשים ברירת מחדל</span>
              )}
            </button>
            {createUsersMessage && (
              <div
                className={`mt-2 p-2 rounded text-xs text-center whitespace-pre-line ${
                  createUsersMessage.includes('מוכנים') || createUsersMessage.includes('✅')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {createUsersMessage}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          מערכת ניהול מבנים © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
