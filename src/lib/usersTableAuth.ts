import { client } from './client';

const STORAGE_KEY = 'buildingsmanager_users_table_session';
const FILE_SESSION_COOKIE = 'file_session';
const FILE_SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

export interface UsersTableSession {
  user_id: number;
  user_name: string;
  user_role: 'admin' | 'user' | 'inspector';
  access_token?: string;
}

/** Set file_session cookie so backend file endpoints (view-url, download, etc.) accept auth via cookie. */
export function setFileSessionCookie(session: UsersTableSession): void {
  if (typeof document === 'undefined') return;
  const payload = JSON.stringify({
    user_id: session.user_id,
    user_name: session.user_name,
    user_role: session.user_role,
  });
  const value = btoa(unescape(encodeURIComponent(payload)));
  document.cookie = `${FILE_SESSION_COOKIE}=${value}; path=/; max-age=${FILE_SESSION_MAX_AGE}; SameSite=Lax`;
}

export function clearFileSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${FILE_SESSION_COOKIE}=; path=/; max-age=0`;
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
  setFileSessionCookie(session);
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  clearFileSessionCookie();
}

/** Pass to backend REST payloads as p_user_id (auth_user_id). Users-table users use uid:user_id. */
export function getAuthUserIdForBackend(): string | null {
  const s = getSession();
  return s ? `uid:${s.user_id}` : null;
}

/** Alias for getAuthUserIdForBackend - used by api.ts (origin pattern). */
export const getAuthUserIdForRpc = getAuthUserIdForBackend;

/** Access token for Bearer auth on API requests. */
export function getAccessToken(): string | null {
  const s = getSession();
  return s?.access_token ?? null;
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
    const { data, error } = await client.rpc('auth_login', {
      p_user_name: user_name.trim(),
      p_password: password,
    });

    if (error) {
      return { success: false, error: authLoginErrorToHebrew(error.message) };
    }

    const d = data as { user_id: number; user_name: string; user_role: string; access_token?: string } | null;
    if (!d?.user_id || !d?.user_name) {
      return { success: false, error: 'שגיאה בהתחברות.' };
    }

    const role = (d.user_role === 'admin' ? 'admin' : d.user_role === 'inspector' ? 'inspector' : 'user') as 'admin' | 'user' | 'inspector';
    const session: UsersTableSession = {
      user_id: d.user_id,
      user_name: d.user_name,
      user_role: role,
      access_token: d.access_token,
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
          'בדוק חיבור לאינטרנט, וודא שכתובת Supabase והמפתח בסביבת הבנייה נכונים.',
      };
    }
    return { success: false, error: authLoginErrorToHebrew(msg) || 'שגיאה בהתחברות.' };
  }
}

export function logoutUsersTable(): void {
  clearSession();
}

/** Login using one-time OTP from email (6-digit code). No password required. */
export async function loginByOtp(
  otp: string
): Promise<{ success: true; session: UsersTableSession; taskId?: number } | { success: false; error: string }> {
  try {
    const { data, error } = await client.rpc('auth_login_by_otp', {
      p_otp: otp.trim(),
    });

    if (error) {
      return { success: false, error: error.message || 'קוד לא תקף או שפג תוקפו' };
    }

    const d = data as { user_id: number; user_name: string; user_role: string; task_id?: number; access_token?: string } | null;
    if (!d?.user_id || !d?.user_name) {
      return { success: false, error: 'קוד לא תקף או שפג תוקפו.' };
    }

    const role = (d.user_role === 'admin' ? 'admin' : d.user_role === 'inspector' ? 'inspector' : 'user') as 'admin' | 'user' | 'inspector';
    const session: UsersTableSession = {
      user_id: d.user_id,
      user_name: d.user_name,
      user_role: role,
      access_token: d.access_token,
    };
    setSession(session);
    return { success: true, session, taskId: d.task_id ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg || 'שגיאה בהתחברות עם הקוד.' };
  }
}

/** Login using one-time task access token (from email deep link). No password required. */
export async function loginByTaskToken(
  token: string
): Promise<{ success: true; session: UsersTableSession; taskId: number } | { success: false; error: string }> {
  try {
    const { data, error } = await client.rpc('auth_login_by_task_token', {
      p_token: token.trim(),
    });

    if (error) {
      return { success: false, error: error.message || 'טוקן לא תקף או שפג תוקפו' };
    }

    const d = data as { user_id: number; user_name: string; user_role: string; task_id: number; access_token?: string } | null;
    if (!d?.user_id || !d?.user_name || d.task_id == null) {
      return { success: false, error: 'טוקן לא תקף או שפג תוקפו.' };
    }

    const role = (d.user_role === 'admin' ? 'admin' : d.user_role === 'inspector' ? 'inspector' : 'user') as 'admin' | 'user' | 'inspector';
    const session: UsersTableSession = {
      user_id: d.user_id,
      user_name: d.user_name,
      user_role: role,
      access_token: d.access_token,
    };
    setSession(session);
    return { success: true, session, taskId: d.task_id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg || 'שגיאה בהתחברות עם הטוקן.' };
  }
}
