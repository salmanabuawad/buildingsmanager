import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Loader2, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Try to sign in - handle both email and username
      let signInError = null;
      let signInData = null;
      
      // First try with the input as-is (could be email or username)
      const loginAttempt = email.trim();
      
      // If it looks like a username (no @), try with @buildingsmanager.local
      const emailToTry = loginAttempt.includes('@') 
        ? loginAttempt 
        : `${loginAttempt}@buildingsmanager.local`;
      
      const result = await supabase.auth.signInWithPassword({
        email: emailToTry,
        password: password,
      });

      signInError = result.error;
      signInData = result.data;

      if (signInError) {
        // If login failed, provide helpful error message
        let errorMessage = signInError.message || 'שגיאה בהתחברות. אנא נסה שוב.';
        
        if (signInError.message?.includes('Invalid login credentials')) {
          errorMessage = 'פרטי התחברות לא תקינים. המשתמש לא קיים ב-Supabase Auth או הסיסמה שגויה.';
        } else if (signInError.message?.includes('Email not confirmed')) {
          errorMessage = 'האימייל לא אושר. אנא:\n1. בדוק את תיבת הדואר הנכנס לאימייל\n2. או השתמש ב-Service Role Key ליצירת משתמשים עם Auto Confirm\n3. או השב את אישור האימייל ב-Supabase Dashboard';
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (signInData?.user) {
        // Successfully logged in
        // The UserRoleContext will automatically refresh on auth state change
        onLoginSuccess();
      } else {
        setError('שגיאה בהתחברות. לא התקבל משתמש.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('שגיאה בלתי צפויה. אנא נסה שוב.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
      <div className="max-w-md w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg mb-4">
            <Building2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">מערכת ניהול מבנים</h1>
          <p className="text-slate-600">התחברות למערכת</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email/Username Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2 text-right">
                שם משתמש / אימייל
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-right disabled:bg-slate-100 disabled:cursor-not-allowed"
                placeholder="הזן שם משתמש או אימייל"
                dir="rtl"
                autoComplete="username"
              />
            </div>

            {/* Password Field */}
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

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-right">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
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
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          מערכת ניהול מבנים © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
