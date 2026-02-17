import { apiClient } from './apiClient';

const STORAGE_KEY = 'buildingsmanager_users_table_session';

export interface UsersTableSession {
  user_id: number;
  user_name: string;
  user_role: 'admin' | 'user';
}

export function getSession(): UsersTableSession | null {
  try {
    let raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const user = apiClient.getCurrentUser();
      if (user?.username) {
        const session: UsersTableSession = {
          user_id: 0,
          user_name: user.username,
          user_role: (user.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
        };
        setSession(session);
        return session;
      }
      return null;
    }
    const s = JSON.parse(raw) as UsersTableSession;
    if (!s?.user_name) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session: UsersTableSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Pass to RPCs as p_user_id (auth_user_id). Backend uses JWT; this is for compatibility. */
export function getAuthUserIdForRpc(): string | null {
  const s = getSession();
  return s ? `uid:${s.user_id}` : null;
}

function authLoginErrorToHebrew(msg: string): string {
  if (msg.includes('Incorrect username or password') || msg.includes('invalid credentials')) {
    return 'פרטי התחברות לא תקינים.';
  }
  if (msg.includes('User account is inactive')) {
    return 'חשבון המשתמש לא פעיל.';
  }
  return msg;
}

export async function loginUsersTable(
  user_name: string,
  password: string
): Promise<{ success: true; session: UsersTableSession } | { success: false; error: string }> {
  try {
    const data = await apiClient.login(user_name.trim(), password);
    const session: UsersTableSession = {
      user_id: 0,
      user_name: data.user.username,
      user_role: (data.user.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
    };
    setSession(session);
    return { success: true, session };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Failed to fetch' || msg.includes('fetch') || msg.includes('Network')) {
      return {
        success: false,
        error: 'לא ניתן להגיע לשרת. בדוק חיבור לאינטרנט וכתובת ה-API.',
      };
    }
    return { success: false, error: authLoginErrorToHebrew(msg) || 'שגיאה בהתחברות.' };
  }
}

export function logoutUsersTable(): void {
  apiClient.logout();
  clearSession();
}
