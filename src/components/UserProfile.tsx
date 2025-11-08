import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut, User, Shield, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UserProfileProps {
  onLogout: () => void;
  onOpenUserManagement?: () => void;
}

interface UserProfile {
  email: string;
  role: 'viewer' | 'editor';
}

export function UserProfile({ onLogout, onOpenUserManagement }: UserProfileProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('email, role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  if (loading) {
    return null;
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-teal-600 to-blue-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">{profile?.email}</p>
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-slate-500" />
              <p className="text-xs text-slate-600">
                {profile?.role === 'editor' ? t('editorRole') : t('viewerRole')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenUserManagement && (
            <button
              onClick={onOpenUserManagement}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Users className="w-4 h-4" />
              {t('userManagement')}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
