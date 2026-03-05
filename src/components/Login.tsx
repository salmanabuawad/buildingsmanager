import { useState, FormEvent } from 'react';
import { loginUsersTable } from '../lib/usersTableAuth';
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-app-header rounded-lg shadow-lg mb-4">
            <Building2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">מערכת ניהול מבנים</h1>
          <p className="text-slate-600">התחברות למערכת</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 border border-slate-200">
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
                className="w-full px-4 py-3 border border-app-input-border rounded focus:ring-2 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-right disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                  className="w-full px-4 py-3 border border-app-input-border rounded focus:ring-2 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-right disabled:bg-slate-100 disabled:cursor-not-allowed"
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
              className="w-full py-3 px-4 bg-app-accent hover:bg-app-accent-hover text-white font-semibold rounded shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
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
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          מערכת ניהול מבנים © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
