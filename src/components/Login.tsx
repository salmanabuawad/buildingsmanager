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
  const [creatingUsers, setCreatingUsers] = useState(false);
  const [createUsersMessage, setCreateUsersMessage] = useState<string | null>(null);

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
          errorMessage = 'פרטי התחברות לא תקינים. המשתמש לא קיים ב-Supabase Auth או הסיסמה שגויה.\n\nאפשרויות:\n1. לחץ על "צור משתמשים ברירת מחדל" למטה\n2. או ודא שהמשתמש קיים והסיסמה נכונה';
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

  const handleCreateUsers = async () => {
    setCreatingUsers(true);
    setCreateUsersMessage(null);
    setError(null);

    try {
      // Use Edge Function to create users with auto-confirm (requires service role key)
      // Fallback to direct signUp if Edge Function is not available
      const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
      const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

      let useEdgeFunction = false;
      let result;

      // Try Edge Function first (if available)
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/create-users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseAnonKey,
            },
          });

          if (response.ok) {
            result = await response.json();
            useEdgeFunction = true;
          } else if (response.status === 404) {
            // Edge Function not deployed, fall back to signUp
            console.warn('Edge Function not found, using signUp fallback');
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Failed to create users: ${response.statusText}`);
          }
        } catch (fetchError) {
          // Edge Function not available, fall back to signUp
          console.warn('Edge Function not available, using signUp fallback:', fetchError);
        }
      }

      // Fallback to direct signUp if Edge Function is not available
      if (!useEdgeFunction) {
        // Create admin user
        const { data: adminData, error: adminError } = await supabase.auth.signUp({
          email: 'admin@buildingsmanager.local',
          password: 'admin123',
          options: {
            data: {
              user_name: 'admin'
            }
          }
        });

        let messages: string[] = [];

        if (adminError) {
          if (adminError.message.includes('already registered') || adminError.message.includes('already exists')) {
            messages.push('משתמש admin כבר קיים');
          } else {
            messages.push(`שגיאה ביצירת admin: ${adminError.message}`);
          }
        } else if (adminData.user) {
          messages.push('✅ משתמש admin נוצר בהצלחה');
          
          // Try to link to users table
          const { error: linkError } = await supabase
            .from('users')
            .update({ auth_user_id: adminData.user.id })
            .eq('user_name', 'admin');
          
          if (!linkError) {
            messages.push('✅ admin מקושר ל-users table');
          }
        }

        // Sign out before creating next user
        await supabase.auth.signOut();

        // Create user (read-only)
        const { data: userData, error: userError } = await supabase.auth.signUp({
          email: 'user@buildingsmanager.local',
          password: 'user123',
          options: {
            data: {
              user_name: 'user'
            }
          }
        });

        if (userError) {
          if (userError.message.includes('already registered') || userError.message.includes('already exists')) {
            messages.push('משתמש user כבר קיים');
          } else {
            messages.push(`שגיאה ביצירת user: ${userError.message}`);
          }
        } else if (userData.user) {
          messages.push('✅ משתמש user נוצר בהצלחה');
          
          // Try to link to users table
          const { error: linkError } = await supabase
            .from('users')
            .update({ auth_user_id: userData.user.id })
            .eq('user_name', 'user');
          
          if (!linkError) {
            messages.push('✅ user מקושר ל-users table');
          }
        }

        // Sign out after creation
        await supabase.auth.signOut();

        result = {
          success: messages.some(m => m.includes('✅')),
          results: messages.map(m => ({ user: m.includes('admin') ? 'admin' : 'user', success: m.includes('✅'), message: m })),
          message: messages.join('\n')
        };
      }

      // Display results
      const messages = result.results.map(r => r.message).join('\n');
      const allSuccess = result.results.every(r => r.success);

      // Try to verify login works after creation
      let loginTestMessage = '';
      if (allSuccess || result.results.some(r => r.success)) {
        try {
          const { error: testError } = await supabase.auth.signInWithPassword({
            email: 'admin@buildingsmanager.local',
            password: 'admin123',
          });
          
          if (!testError) {
            loginTestMessage = '\n\n✅ בדיקת התחברות הצליחה! אפשר להתחבר עכשיו.';
            await supabase.auth.signOut(); // Sign out after test
          } else if (testError.message?.includes('Email not confirmed')) {
            loginTestMessage = '\n\n⚠️ המשתמשים נוצרו אך דורשים אישור אימייל. אנא השתמש ב-Edge Function (דורש Service Role Key) ליצירת משתמשים עם Auto Confirm.';
          } else {
            loginTestMessage = `\n\n⚠️ המשתמשים נוצרו אך יש בעיה בהתחברות: ${testError.message}. נסה להתחבר ידנית.`;
          }
        } catch (testErr) {
          loginTestMessage = '\n\n⚠️ המשתמשים נוצרו. נסה להתחבר ידנית.';
        }
      }

      if (allSuccess) {
        setCreateUsersMessage(messages + loginTestMessage);
      } else {
        setCreateUsersMessage(messages + loginTestMessage + '\n\n💡 טיפ: כדי ליצור משתמשים עם Auto Confirm, אנא פרוס את ה-Edge Function (ראה DEPLOY_EDGE_FUNCTION.md)');
      }
    } catch (err) {
      console.error('Error creating users:', err);
      setCreateUsersMessage(`שגיאה: ${err instanceof Error ? err.message : 'שגיאה בלתי צפויה'}\n\n💡 טיפ: ודא שה-Edge Function פרוס או שהגדרות Supabase מאפשרות יצירת משתמשים ללא אישור אימייל.`);
    } finally {
      setCreatingUsers(false);
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

          {/* Default Users Info */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center mb-2">משתמשים ברירת מחדל:</p>
            <div className="text-xs text-slate-600 space-y-1 text-center mb-3">
              <div>מנהל: <span className="font-mono font-semibold">admin</span> / <span className="font-mono font-semibold">admin123</span></div>
              <div>משתמש: <span className="font-mono font-semibold">user</span> / <span className="font-mono font-semibold">user123</span></div>
            </div>
            
            {/* Create Users Button - Always visible */}
            <div className="mt-4 pt-4 border-t border-slate-200">
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
                <div className={`mt-2 p-2 rounded text-xs text-center whitespace-pre-line ${
                  createUsersMessage.includes('✅') 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {createUsersMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          מערכת ניהול מבנים © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
