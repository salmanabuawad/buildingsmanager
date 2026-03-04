import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSession } from '../lib/usersTableAuth';

export type UserRole = 'admin' | 'user' | 'inspector';

interface UserRoleContextType {
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isInspector: boolean;
  isUser: boolean;
  isReadOnly: boolean; // same as isUser
  isDev: boolean; // user_name === 'dev' - required for inspection tasks access
  refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isDev, setIsDev] = useState(false);

  const fetchUserRole = useCallback(() => {
    const s = getSession();
    if (!s) {
      setUserRole('user');
      setIsDev(false);
      setIsLoading(false);
      return;
    }
    setUserRole(s.user_role === 'admin' ? 'admin' : s.user_role === 'inspector' ? 'inspector' : 'user');
    setIsDev(s.user_name === 'dev');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const refreshRole = async () => {
    fetchUserRole();
  };

  const isAdmin = userRole === 'admin';
  const isInspector = userRole === 'inspector';
  const isUser = userRole === 'user';
  const isReadOnly = isUser;

  return (
    <UserRoleContext.Provider value={{
      userRole,
      isLoading,
      isAdmin,
      isInspector,
      isUser,
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
