import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UnitType, api } from '../lib/api';
import { Plus, Edit2, Trash2, Save, X, Tag } from 'lucide-react';

export function UnitTypes() {
  const { t } = useTranslation();
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    fetchUnitTypes();
  }, []);

  async function fetchUnitTypes() {
    try {
      setLoading(true);
      const data = await api.unitTypes.getAll();
      setUnitTypes(data);
    } catch (error) {
      console.error('Error fetching unit types:', error);
      showMessage('error', t('error'));
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function resetForm() {
    setFormData({ name: '', description: '' });
    setIsAdding(false);
    setEditingId(null);
  }

  function startAdd() {
    resetForm();
    setIsAdding(true);
  }

  function startEdit(unitType: UnitType) {
    setFormData({
      name: unitType.name,
      description: unitType.description,
    });
    setEditingId(unitType.id);
    setIsAdding(false);
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      showMessage('error', t('typeName') + ' is required');
      return;
    }

    try {
      if (editingId) {
        await api.unitTypes.update(editingId, formData);
        showMessage('success', t('unitTypeUpdated'));
      } else {
        await api.unitTypes.create(formData);
        showMessage('success', t('unitTypeCreated'));
      }
      await fetchUnitTypes();
      resetForm();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error saving unit type:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('confirmDeleteUnitType'))) return;

    try {
      await api.unitTypes.delete(id);
      showMessage('success', t('unitTypeDeleted'));
      await fetchUnitTypes();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error deleting unit type:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Tag className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" />
          <h1 className="text-3xl font-bold text-white">{t('unitTypes')}</h1>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">{t('unitTypes')}</h2>
          {!isAdding && !editingId && (
            <button
              onClick={startAdd}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              {t('addUnitType')}
            </button>
          )}
        </div>

        {(isAdding || editingId) && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingId ? t('editUnitType') : t('addUnitType')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('typeName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={t('typeName')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('typeDescription')}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={t('typeDescription')}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Save className="h-4 w-4" />
                {t('save')}
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {unitTypes.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Tag className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg">{t('noUnitTypes')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-right py-3 px-4 text-sm font-bold text-slate-700">
                    {t('typeName')}
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-slate-700">
                    {t('typeDescription')}
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-slate-700">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {unitTypes.map((unitType) => (
                  <tr
                    key={unitType.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <span className="font-semibold text-slate-900">{unitType.name}</span>
                    </td>
                    <td className="py-4 px-4 text-slate-600">{unitType.description || '-'}</td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(unitType)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(unitType.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
