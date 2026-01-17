import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'user';

interface UserRoleContextType {
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isReadOnly: boolean;
  refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserRole = async () => {
    try {
      setIsLoading(true);
      
      // Get current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        // No authenticated user, default to read-only
        setUserRole('user');
        setIsLoading(false);
        return;
      }

      // Query users table to get role
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_role')
        .eq('auth_user_id', user.id)
        .single();

      if (userError || !userData) {
        // User not found in users table, default to read-only
        console.warn('User not found in users table, defaulting to read-only:', userError);
        setUserRole('user');
        setIsLoading(false);
        return;
      }

      // Set the user role
      const role = (userData.user_role === 'admin' ? 'admin' : 'user') as UserRole;
      setUserRole(role);
    } catch (error) {
      console.error('Error fetching user role:', error);
      // On error, default to read-only for security
      setUserRole('user');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserRole();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshRole = async () => {
    await fetchUserRole();
  };

  const isAdmin = userRole === 'admin';
  const isReadOnly = userRole === 'user';

  return (
    <UserRoleContext.Provider value={{ 
      userRole, 
      isLoading, 
      isAdmin, 
      isReadOnly, 
      refreshRole 
    }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error('useUserRole must be used within a UserRoleProvider');
  }
  return context;
}
