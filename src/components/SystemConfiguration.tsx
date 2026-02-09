import { useState, useEffect } from 'react';
import { api, SystemConfiguration } from '../lib/api';
import { useUserRole } from '../contexts/UserRoleContext';
import { Loader2, Settings, Mail, Save, RefreshCw, Plus, X, Eye, EyeOff, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Toast } from './Toast';

export function SystemConfigurationManager() {
  const { isAdmin } = useUserRole();
  const [configurations, setConfigurations] = useState<SystemConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [showPassword, setShowPassword] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedConfigType, setSelectedConfigType] = useState<string>('all');

  const [formData, setFormData] = useState<Partial<SystemConfiguration>>({
    config_type: 'email',
    name: 'default',
    description: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_encryption: 'tls',
    smtp_username: '',
    smtp_password: '',
    from_email: '',
    from_name: '',
    reply_to_email: '',
    max_retries: 3,
    timeout_seconds: 30,
    is_active: true,
    config_data: null,
  });

  useEffect(() => {
    fetchConfigurations();
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
    setFormData({ ...config });
    setEditingId(config.id);
    setAddingNew(false);
  };

  const handleAdd = () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה להוסיף הגדרות', type: 'error' });
      return;
    }
    setFormData({
      config_type: 'email',
      name: 'default',
      description: '',
      smtp_host: '',
      smtp_port: 587,
      smtp_encryption: 'tls',
      smtp_username: '',
      smtp_password: '',
      from_email: '',
      from_name: '',
      reply_to_email: '',
      max_retries: 3,
      timeout_seconds: 30,
      is_active: true,
      config_data: null,
    });
    setEditingId(null);
    setAddingNew(true);
  };

  const handleCancel = () => {
    setFormData({
      config_type: 'email',
      name: 'default',
      description: '',
      smtp_host: '',
      smtp_port: 587,
      smtp_encryption: 'tls',
      smtp_username: '',
      smtp_password: '',
      from_email: '',
      from_name: '',
      reply_to_email: '',
      max_retries: 3,
      timeout_seconds: 30,
      is_active: true,
      config_data: null,
    });
    setEditingId(null);
    setAddingNew(false);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לשמור הגדרות', type: 'error' });
      return;
    }

    try {
      setSaving(editingId || 0);
      setToast(null);

      if (addingNew) {
        const newConfig = await api.systemConfiguration.create(formData as Omit<SystemConfiguration, 'id' | 'created_at' | 'updated_at'>);
        setConfigurations([...configurations, newConfig]);
        setToast({ message: 'ההגדרה נוספה בהצלחה', type: 'success' });
      } else if (editingId) {
        const updatedConfig = await api.systemConfiguration.update(editingId, formData);
        setConfigurations(configurations.map(c => c.id === editingId ? updatedConfig : c));
        setToast({ message: 'ההגדרה עודכנה בהצלחה', type: 'success' });
        
        // If UI config was updated, reload the page to apply changes
        if (formData.config_type === 'ui') {
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

  const handleToggleActive = async (config: SystemConfiguration) => {
    if (!isAdmin) {
      setToast({ message: 'אין לך הרשאה לשנות סטטוס', type: 'error' });
      return;
    }

    try {
      setSaving(config.id);
      const updatedConfig = await api.systemConfiguration.update(config.id, { is_active: !config.is_active });
      setConfigurations(configurations.map(c => c.id === config.id ? updatedConfig : c));
      setToast({
        message: updatedConfig.is_active ? 'ההגדרה הופעלה' : 'ההגדרה בוטלה',
        type: 'success'
      });
    } catch (err) {
      console.error('Error toggling active status:', err);
      setToast({
        message: err instanceof Error ? err.message : 'שגיאה בשינוי הסטטוס',
        type: 'error'
      });
    } finally {
      setSaving(null);
    }
  };

  const filteredConfigurations = selectedConfigType === 'all'
    ? configurations
    : configurations.filter(c => c.config_type === selectedConfigType);

  const configTypes = Array.from(new Set(configurations.map(c => c.config_type)));

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

        {/* Filter by config type */}
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">סוג הגדרה:</label>
          <select
            value={selectedConfigType}
            onChange={(e) => setSelectedConfigType(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="all">הכל</option>
            {configTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Add/Edit Form */}
        {(addingNew || editingId !== null) && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">
              {addingNew ? 'הוסף הגדרה חדשה' : 'ערוך הגדרה'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סוג הגדרה *</label>
                <select
                  value={formData.config_type || 'email'}
                  onChange={(e) => setFormData({ ...formData, config_type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="email">Email</option>
                  <option value="ui">UI</option>
                  <option value="general">כללי</option>
                  <option value="notification">התראות</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              {/* Email-specific fields */}
              {formData.config_type === 'email' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host *</label>
                    <input
                      type="text"
                      value={formData.smtp_host || ''}
                      onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                      placeholder="smtp.gmail.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Port *</label>
                    <input
                      type="number"
                      value={formData.smtp_port || 587}
                      onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) || 587 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">הצפנה *</label>
                    <select
                      value={formData.smtp_encryption || 'tls'}
                      onChange={(e) => setFormData({ ...formData, smtp_encryption: e.target.value })}
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
                      value={formData.smtp_username || ''}
                      onChange={(e) => setFormData({ ...formData, smtp_username: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה SMTP</label>
                    <div className="relative">
                      <input
                        type={showPassword === editingId ? 'text' : 'password'}
                        value={formData.smtp_password || ''}
                        onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(showPassword === editingId ? null : editingId || 0)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                      >
                        {showPassword === editingId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">כתובת שולח *</label>
                    <input
                      type="email"
                      value={formData.from_email || ''}
                      onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">שם שולח</label>
                    <input
                      type="text"
                      value={formData.from_name || ''}
                      onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">כתובת תשובה</label>
                    <input
                      type="email"
                      value={formData.reply_to_email || ''}
                      onChange={(e) => setFormData({ ...formData, reply_to_email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">מספר ניסיונות מקסימלי</label>
                    <input
                      type="number"
                      value={formData.max_retries || 3}
                      onChange={(e) => setFormData({ ...formData, max_retries: parseInt(e.target.value) || 3 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">זמן המתנה (שניות)</label>
                    <input
                      type="number"
                      value={formData.timeout_seconds || 30}
                      onChange={(e) => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || 30 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}

              {/* UI-specific fields */}
              {formData.config_type === 'ui' && (
                <>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="validation_rules_enabled"
                      checked={(formData.config_data as any)?.validation_rules_enabled || false}
                      onChange={(e) => {
                        const currentData = (formData.config_data as any) || {};
                        setFormData({
                          ...formData,
                          config_data: {
                            ...currentData,
                            validation_rules_enabled: e.target.checked,
                          },
                        });
                      }}
                      className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                    />
                    <label htmlFor="validation_rules_enabled" className="text-sm font-medium text-slate-700">
                      הפעל תפריט כללי תקינות
                    </label>
                  </div>
                </>
              )}

              <div className="md:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active || false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">פעיל</label>
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
          {filteredConfigurations.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              אין הגדרות להצגה
            </div>
          ) : (
            filteredConfigurations.map((config) => (
              <div
                key={config.id}
                className={`p-4 border rounded-lg ${
                  config.is_active ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {config.config_type === 'email' && <Mail className="h-5 w-5 text-blue-600" />}
                      {config.config_type !== 'email' && <Settings className="h-5 w-5 text-slate-600" />}
                      <h3 className="text-lg font-semibold text-slate-800">
                        {config.name} ({config.config_type})
                      </h3>
                      {config.is_active && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">פעיל</span>
                      )}
                    </div>
                    {config.description && (
                      <p className="text-sm text-slate-600 mb-2">{config.description}</p>
                    )}
                    {config.config_type === 'email' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600">
                        <div><span className="font-medium">Host:</span> {config.smtp_host || '-'}</div>
                        <div><span className="font-medium">Port:</span> {config.smtp_port || '-'}</div>
                        <div><span className="font-medium">From:</span> {config.from_email || '-'}</div>
                        <div><span className="font-medium">Encryption:</span> {config.smtp_encryption || '-'}</div>
                      </div>
                    )}
                    {config.config_type === 'ui' && config.config_data && (
                      <div className="text-sm text-slate-600">
                        <div>
                          <span className="font-medium">כללי תקינות מופעלים:</span>{' '}
                          {(config.config_data as any)?.validation_rules_enabled ? 'כן' : 'לא'}
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2">
                      נוצר: {new Date(config.created_at).toLocaleDateString('he-IL')}
                      {config.updated_at !== config.created_at && (
                        <span> | עודכן: {new Date(config.updated_at).toLocaleDateString('he-IL')}</span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(config)}
                        disabled={saving === config.id}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          config.is_active
                            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        } disabled:opacity-50`}
                      >
                        {saving === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : config.is_active ? (
                          'בטל הפעלה'
                        ) : (
                          'הפעל'
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(config)}
                        className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors"
                      >
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
