/**
 * SessionExpiredModal — shown when any API call returns 401.
 * Lets the user silently refresh their token ("Retry") or re-login
 * with their credentials without losing the current page state.
 */
import { useState, useCallback } from 'react';
import { Loader2, RefreshCw, LogIn, AlertTriangle } from 'lucide-react';
import { authRefreshToken } from '../lib/restClient';
import { loginUsersTable, getSession, setSession, clearSession } from '../lib/usersTableAuth';

interface Props {
  onResolved: () => void;   // called when session is restored — modal closes
  onLogout: () => void;     // called when user chooses to fully log out
}

export function SessionExpiredModal({ onResolved, onLogout }: Props) {
  const [mode, setMode] = useState<'prompt' | 'login'>('prompt');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to silently refresh the existing token
  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await authRefreshToken();
      if (data?.access_token && !err) {
        const session = getSession();
        if (session) {
          setSession({ ...session, access_token: data.access_token });
          onResolved();
          return;
        }
      }
      setMode('login');
    } catch {
      setMode('login');
    } finally {
      setLoading(false);
    }
  }, [onResolved]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loginUsersTable(userName, password);
      if (result.success) {
        onResolved();
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }, [userName, password, onResolved]);

  const handleLogout = useCallback(() => {
    clearSession();
    onLogout();
  }, [onLogout]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-theme-content border border-theme-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5"
           dir="rtl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-theme-primary">פג תוקף החיבור</h2>
            <p className="text-sm text-theme-secondary">ניתן לנסות שוב או להתחבר מחדש מבלי לאבד את העבודה</p>
          </div>
        </div>

        {mode === 'prompt' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 py-2.5"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              נסה שוב
            </button>
            <button
              onClick={() => setMode('login')}
              disabled={loading}
              className="btn-secondary flex items-center justify-center gap-2 py-2.5"
            >
              <LogIn className="w-4 h-4" />
              התחברות מחדש
            </button>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="text-sm text-theme-secondary hover:text-theme-primary underline text-center"
            >
              יציאה מלאה מהמערכת
            </button>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-theme-primary">שם משתמש</label>
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                autoFocus
                disabled={loading}
                className="border border-theme-border rounded-lg px-3 py-2 text-sm bg-theme-input text-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-accent"
                placeholder="שם משתמש"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-theme-primary">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                className="border border-theme-border rounded-lg px-3 py-2 text-sm bg-theme-input text-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-accent"
                placeholder="סיסמה"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !userName.trim() || !password}
              className="btn-primary flex items-center justify-center gap-2 py-2.5"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <LogIn className="w-4 h-4" />}
              התחברות
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="text-sm text-theme-secondary hover:text-theme-primary underline text-center"
            >
              יציאה מלאה מהמערכת
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
