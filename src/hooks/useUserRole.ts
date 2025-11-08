import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'viewer' | 'editor';

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRole();
  }, []);

  async function loadRole() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) setRole(data.role);
    } catch (error) {
      console.error('Error loading user role:', error);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }

  return { role, loading, isEditor: role === 'editor', isViewer: role === 'viewer' };
}
