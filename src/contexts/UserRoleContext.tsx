import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSession } from '../lib/usersTableAuth';

export type UserRole = 'admin' | 'user';

interface UserRoleContextType {
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isReadOnly: boolean;
  isDev: boolean;
  refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [userName, setUserName] = useState<string | null>(null);

  const fetchUserRole = useCallback(() => {
    const s = getSession();
    if (!s) {
      setUserRole('user');
      setUserName(null);
      setIsLoading(false);
      return;
    }
    setUserRole((s.user_role === 'admin' ? 'admin' : 'user') as UserRole);
    setUserName(s.user_name ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const refreshRole = async () => {
    fetchUserRole();
  };

  const isAdmin = userRole === 'admin';
  const isReadOnly = userRole === 'user';
  const isDev = (userName?.toLowerCase().trim() === 'dev');

  return (
    <UserRoleContext.Provider value={{
      userRole,
      isLoading,
      isAdmin,
      isReadOnly,
      isDev,
      refreshRole,
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
