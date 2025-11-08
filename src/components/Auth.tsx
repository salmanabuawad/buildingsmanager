import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuthProps {
  onAuthSuccess: () => void;
}

export function Auth({ onAuthSuccess }: AuthProps) {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (authData.user) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .insert([
              {
                id: authData.user.id,
                email: authData.user.email,
                role: 'viewer'
              }
            ]);

          if (profileError) throw profileError;
        }
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-teal-600 to-blue-600 rounded-full mb-4">
            {isLogin ? (
              <LogIn className="w-8 h-8 text-white" />
            ) : (
              <UserPlus className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isLogin ? t('login') : t('register')}
          </h1>
          <p className="text-slate-600 mt-2">{t('welcomeMessage')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                placeholder={t('passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-teal-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('loading') : isLogin ? t('loginButton') : t('registerButton')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            {isLogin ? t('switchToRegister') : t('switchToLogin')}
          </button>
        </div>
      </div>
    </div>
  );
}
