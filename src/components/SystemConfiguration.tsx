import { useState, useEffect } from 'react';
import { api, SystemConfiguration } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, Settings, Save, RefreshCw, Plus, X, Trash2, AlertCircle, Edit2, Mail, Send } from 'lucide-react';
import { Toast } from './Toast';
import { emailService } from '../lib/emailService';
import type { EmailConfig } from '../lib/emailService';

export function SystemConfigurationManager() {
  const { isAdmin } = useUserRole();
  const [configurations, setConfigurations] = useState<SystemConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    value: '',
    description: '',
  });

  const [emailConfig, setEmailConfig] = useState<Partial<EmailConfig> | null>(null);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);
  const [emailConfigLoading, setEmailConfigLoading] = useState(true);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [showEmailSection, setShowEmailSection] = useState(true);

  useEffect(() => {
    fetchConfigurations();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmailConfigLoading(true);
      try {
        const config = await api.systemConfiguration.getEmailConfig();
        if (!cancelled && config) setEmailConfig(config);
        else if (!cancelled) setEmailConfig({ smtp_encryption: 'tls', smtp_port: 587 });
      } catch {
        if (!cancelled) setEmailConfig({ smtp_encryption: 'tls', smtp_port: 587 });
      } finally {
        if (!cancelled) setEmailConfigLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      const data = await api.systemConfiguration.getAll();
      setConfigurations(data);
    } catch (err) {
      console.error('Error fetching configurations:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בטעינת ההגדרות',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (config: SystemConfiguration) => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לערוך הגדרות', type: 'error' });
      return;
    }
    setFormData({
      name: config.name,
      value: config.value,
      description: config.description || '',
    });
    setEditingId(config.id);
    setAddingNew(false);
  };

  const handleAdd = () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה להוסיף הגדרות', type: 'error' });
      return;
    }
    setFormData({
      name: '',
      value: '',
      description: '',
    });
    setEditingId(null);
    setAddingNew(true);
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      value: '',
      description: '',
    });
    setEditingId(null);
    setAddingNew(false);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לשמור הגדרות', type: 'error' });
      return;
    }

    if (!formData.name.trim() || !formData.value.trim()) {
      setToast({ message: 'שם וערך הם שדות חובה', type: 'error' });
      return;
    }

    try {
      setSaving(editingId || 0);
      setToast(null);

      if (addingNew) {
        const newConfig = await api.systemConfiguration.create({
          name: formData.name.trim(),
          value: formData.value.trim(),
          description: formData.description.trim() || null,
        });
        setConfigurations([...configurations, newConfig]);
        setToast({ message: 'ההגדרה נוספה בהצלחה', type: 'success' });
      } else if (editingId) {
        const updatedConfig = await api.systemConfiguration.update(editingId, {
          name: formData.name.trim(),
          value: formData.value.trim(),
          description: formData.description.trim() || null,
        });
        setConfigurations(configurations.map(c => c.id === editingId ? updatedConfig : c));
        setToast({ message: 'ההגדרה עודכנה בהצלחה', type: 'success' });
        
        // If UI config was updated, reload the page to apply changes
        if (formData.name === 'ui_config') {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }

      handleCancel();
    } catch (err) {
      console.error('Error saving configuration:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בשמירת ההגדרה',
        type: 'error'
      });
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה למחוק הגדרות', type: 'error' });
      return;
    }

    try {
      setDeleting(id);
      await api.systemConfiguration.delete(id);
      setConfigurations(configurations.filter(c => c.id !== id));
      setToast({ message: 'ההגדרה נמחקה בהצלחה', type: 'success' });
      setDeleteConfirmOpen(null);
    } catch (err) {
      console.error('Error deleting configuration:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה במחיקת ההגדרה',
        type: 'error'
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveEmailConfig = async () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לשמור הגדרות', type: 'error' });
      return;
    }
    const c = emailConfig;
    if (!c?.smtp_host?.trim() || !c.from_email?.trim()) {
      setToast({ message: 'שרת SMTP וכתובת השולח הם שדות חובה', type: 'error' });
      return;
    }
    const port = c.smtp_port ?? 587;
    if (port < 1 || port > 65535) {
      setToast({ message: 'פורט SMTP לא תקין', type: 'error' });
      return;
    }
    setEmailConfigSaving(true);
    setToast(null);
    try {
      await api.systemConfiguration.upsert(
        'email_config',
        JSON.stringify({
          smtp_host: c.smtp_host.trim(),
          smtp_port: port,
          smtp_encryption: c.smtp_encryption || 'tls',
          smtp_username: (c.smtp_username ?? '').trim(),
          smtp_password: (c.smtp_password ?? '').trim(),
          from_email: c.from_email.trim(),
          from_name: (c.from_name ?? '').trim() || undefined,
          reply_to_email: (c.reply_to_email ?? '').trim() || undefined,
        }),
        'הגדרות SMTP לשליחת דוא"ל'
      );
      setToast({ message: 'הגדרות הדוא"ל נשמרו בהצלחה', type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בשמירת הגדרות הדוא"ל',
        type: 'error',
      });
    } finally {
      setEmailConfigSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    const to = testEmailTo.trim();
    if (!to || !to.includes('@')) {
      setToast({ message: 'הזן כתובת דוא"ל תקינה לשליחת מייל בדיקה', type: 'error' });
      return;
    }
    setSendingTestEmail(true);
    setToast(null);
    try {
      const result = await emailService.sendTestEmail(to);
      if (result.success) {
        setToast({ message: 'מייל הבדיקה נשלח בהצלחה', type: 'success' });
      } else {
        setToast({ message: result.error || 'שליחת מייל הבדיקה נכשלה', type: 'error' });
      }
    } finally {
      setSendingTestEmail(false);
    }
  };

  const isJsonValue = (value: string): boolean => {
    try {
      JSON.parse(value);
      return value.trim().startsWith('{') || value.trim().startsWith('[');
    } catch {
      return false;
    }
  };

  const formatValue = (value: string): string => {
    if (isJsonValue(value)) {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  };

  const getValuePreview = (value: string): string => {
    if (isJsonValue(value)) {
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed);
      } catch {
        return value;
      }
    }
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">טוען הגדרות מערכת...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-4 py-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={3000}
        />
      )}

      {/* Email (SMTP) settings */}
      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-800">הגדרות דוא&quot;ל (SMTP)</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowEmailSection((v) => !v)}
            className="text-sm text-slate-600 hover:text-slate-800"
          >
            {showEmailSection ? 'הסתר' : 'הצג'}
          </button>
        </div>
        {showEmailSection && (
          <>
            {emailConfigLoading ? (
              <div className="flex items-center gap-2 text-slate-600 py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                טוען הגדרות דוא&quot;ל...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שרת SMTP *</label>
                  <input
                    type="text"
                    value={emailConfig?.smtp_host ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, smtp_host: e.target.value }))}
                    placeholder="smtp.example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">פורט</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={emailConfig?.smtp_port ?? 587}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, smtp_port: parseInt(e.target.value, 10) || 587 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">הצפנה</label>
                  <select
                    value={emailConfig?.smtp_encryption ?? 'tls'}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, smtp_encryption: e.target.value as 'tls' | 'ssl' | 'none' }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="tls">TLS</option>
                    <option value="ssl">SSL</option>
                    <option value="none">ללא</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם משתמש SMTP</label>
                  <input
                    type="text"
                    value={emailConfig?.smtp_username ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, smtp_username: e.target.value }))}
                    placeholder="אופציונלי"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה SMTP</label>
                  <input
                    type="password"
                    value={emailConfig?.smtp_password ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, smtp_password: e.target.value }))}
                    placeholder="אופציונלי"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">כתובת שולח *</label>
                  <input
                    type="email"
                    value={emailConfig?.from_email ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, from_email: e.target.value }))}
                    placeholder="noreply@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם השולח</label>
                  <input
                    type="text"
                    value={emailConfig?.from_name ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, from_name: e.target.value }))}
                    placeholder="מערכת ניהול נכסים"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reply-To</label>
                  <input
                    type="email"
                    value={emailConfig?.reply_to_email ?? ''}
                    onChange={(e) => setEmailConfig((c) => ({ ...c, reply_to_email: e.target.value }))}
                    placeholder="אופציונלי"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
            {!emailConfigLoading && (
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSaveEmailConfig}
                  disabled={emailConfigSaving || !isAdmin}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  שמור הגדרות דוא&quot;ל
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="כתובת לשליחת מייל בדיקה"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-56"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail || !isAdmin}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingTestEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    שליחת מייל בדיקה
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-800">הגדרות מערכת</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchConfigurations}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              רענן
            </button>
            {isAdmin && (
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                הוסף הגדרה
              </button>
            )}
          </div>
        </div>

        {/* Add/Edit Form */}
        {(addingNew || editingId !== null) && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">
              {addingNew ? 'הוסף הגדרה חדשה' : 'ערוך הגדרה'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="לדוגמה: ui_config, email_config, mail_config"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  disabled={!addingNew}
                />
                {!addingNew && (
                  <p className="text-xs text-slate-500 mt-1">לא ניתן לשנות את השם בעריכה</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ערך *</label>
                <textarea
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder="הזן ערך טקסט או JSON"
                  rows={isJsonValue(formData.value) ? 10 : 4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  ניתן להזין ערך טקסט פשוט או JSON (לדוגמה: {"{"}"validation_rules_enabled": true{"}"})
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="תיאור קצר של ההגדרה"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={saving !== null}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                שמור
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Configurations List */}
        <div className="space-y-4">
          {configurations.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              אין הגדרות להצגה
            </div>
          ) : (
            configurations.map((config) => (
              <div
                key={config.id}
                className="p-4 border border-slate-200 bg-slate-50 rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="h-5 w-5 text-slate-600" />
                      <h3 className="text-lg font-semibold text-slate-800">
                        {config.name}
                      </h3>
                    </div>
                    {config.description && (
                      <p className="text-sm text-slate-600 mb-2">{config.description}</p>
                    )}
                    <div className="bg-white p-3 rounded border border-slate-200 mb-2">
                      <div className="text-xs font-medium text-slate-500 mb-1">ערך:</div>
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap break-words font-mono">
                        {getValuePreview(config.value)}
                      </pre>
                    </div>
                    <div className="text-xs text-slate-500">
                      נוצר: {new Date(config.created_at).toLocaleDateString('he-IL')}
                      {config.updated_at !== config.created_at && (
                        <span> | עודכן: {new Date(config.updated_at).toLocaleDateString('he-IL')}</span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(config)}
                        className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1"
                      >
                        <Edit2 className="h-4 w-4" />
                        ערוך
                      </button>
                      <button
                        onClick={() => setDeleteConfirmOpen(config.id)}
                        className="px-3 py-1.5 text-sm bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">מחיקת הגדרה</h3>
            </div>
            <p className="text-slate-600 mb-6">
              האם אתה בטוח שברצונך למחוק את ההגדרה? פעולה זו לא ניתנת לביטול.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmOpen)}
                disabled={deleting === deleteConfirmOpen}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting === deleteConfirmOpen ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
