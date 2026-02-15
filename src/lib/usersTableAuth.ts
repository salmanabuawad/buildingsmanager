import { supabase } from './supabase';

const STORAGE_KEY = 'buildingsmanager_users_table_session';

export interface UsersTableSession {
  user_id: number;
  user_name: string;
  user_role: 'admin' | 'user';
}

export function getSession(): UsersTableSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as UsersTableSession;
    if (!s?.user_id || !s?.user_name) return null;
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

/** Pass to RPCs as p_user_id (auth_user_id). Users-table users use uid:user_id. */
export function getAuthUserIdForRpc(): string | null {
  const s = getSession();
  return s ? `uid:${s.user_id}` : null;
}

function authLoginErrorToHebrew(msg: string): string {
  if (msg.includes('user_name and password (min 6 chars) required')) {
    return 'נדרשים שם משתמש וסיסמה (לפחות 6 תווים).';
  }
  if (msg.includes('invalid credentials')) {
    return 'פרטי התחברות לא תקינים.';
  }
  if (msg.includes('user has no password set')) {
    return 'למשתמש לא הוגדרה סיסמה.';
  }
  return msg;
}

export async function loginUsersTable(
  user_name: string,
  password: string
): Promise<{ success: true; session: UsersTableSession } | { success: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('auth_login', {
      p_user_name: user_name.trim(),
      p_password: password,
    });

    if (error) {
      const msg = error.message || 'שגיאה בהתחברות';
      return { success: false, error: authLoginErrorToHebrew(msg) };
    }

    const d = data as { user_id: number; user_name: string; user_role: string } | null;
    if (!d?.user_id || !d?.user_name) {
      return { success: false, error: 'שגיאה בהתחברות.' };
    }

    const role = (d.user_role === 'admin' ? 'admin' : 'user') as 'admin' | 'user';
    const session: UsersTableSession = {
      user_id: d.user_id,
      user_name: d.user_name,
      user_role: role,
    };
    setSession(session);
    return { success: true, session };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Failed to fetch' || msg.includes('fetch')) {
      return {
        success: false,
        error:
          'לא ניתן להגיע לשרת.\n' +
          'בדוק חיבור לאינטרנט, וודא שכתובת Supabase והמפתח בסביבת הבנייה נכונים (וכן שהפרויקט לא מושהה).',
      };
    }
    return { success: false, error: authLoginErrorToHebrew(msg) || 'שגיאה בהתחברות.' };
  }
}

export function logoutUsersTable(): void {
  clearSession();
}
