import { useState, useEffect } from 'react';
import { X, Loader2, Save, User } from 'lucide-react';
import { api } from '../lib/api';
import { getSession } from '../lib/usersTableAuth';

interface Props {
  onClose: () => void;
}

export function UserProfileModal({ onClose }: Props) {
  const session = getSession();
  const userId = session?.user_id;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const { api: dbApi } = await import('../lib/apiClient');
        const { data } = await dbApi
          .from('users')
          .select('full_name, user_email, phone')
          .eq('user_id', userId)
          .single();
        if (data) {
          setFullName((data as any).full_name || '');
          setEmail((data as any).user_email || '');
          setPhone((data as any).phone || '');
        }
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const handleSave = async () => {
    if (!userId) return;
    setError(null);
    setSuccess(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setSaving(true);
    try {
      await api.users.update(userId, {
        full_name: fullName.trim() || null,
        user_email: email.trim() || undefined,
        phone: phone.trim() || null,
      });

      if (newPassword) {
        await api.users.changePassword(userId, newPassword);
        setNewPassword('');
        setConfirmPassword('');
      }

      setSuccess('הפרטים נשמרו בהצלחה');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-[95vw] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-app-accent" />
            <span className="font-semibold text-app-text">עריכת פרטים אישיים</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500">
                שם משתמש: <strong>{session?.user_name}</strong>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">שם מלא</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">דוא"ל</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">טלפון</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                  dir="ltr"
                />
              </div>

              <hr className="border-gray-200" />

              <p className="text-sm font-semibold text-gray-700">שינוי סיסמה</p>
              <p className="text-xs text-gray-500 -mt-3">השאר ריק אם אינך רוצה לשנות את הסיסמה</p>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">סיסמה חדשה</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">אישור סיסמה</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                  dir="ltr"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm bg-red-50 rounded px-3 py-2 border border-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-green-600 text-sm bg-green-50 rounded px-3 py-2 border border-green-200">
                  {success}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-action flex items-center justify-center gap-2 py-2 text-sm mt-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור פרטים
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
