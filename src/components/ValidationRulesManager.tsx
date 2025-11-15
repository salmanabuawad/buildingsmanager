import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationRule, api } from '../lib/api';
import { loadValidationRules } from '../lib/validation';
import { Settings, Plus, Save, X, RefreshCw } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export function ValidationRulesManager() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const emptyRule: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'> = {
    rule_key: '',
    rule_type: 'required',
    field_name: '',
    entity_type: '',
    value_numeric: undefined,
    value_text: '',
    enabled: true,
    error_message: '',
    description: '',
    compare_table: undefined,
    compare_field: undefined,
    join_field: undefined,
    comparison_operator: undefined,
  };

  const [formData, setFormData] = useState(emptyRule);
  const [editValues, setEditValues] = useState<Partial<ValidationRule>>({});

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      setLoading(true);
      console.log('Fetching validation rules...');
      const data = await api.validationRules.getAll();
      console.log('Fetched validation rules:', data.length, 'rules');
      console.log('Sample rule:', data[0]);
      setRules(data);
    } catch (error) {
      console.error('Error fetching validation rules:', error);
      showMessage('error', 'שגיאה בטעינת כללי תקינות');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshCache() {
    try {
      await loadValidationRules(true);
      showMessage('success', 'מטמון רוענן בהצלחה');
    } catch (error) {
      showMessage('error', 'שגיאה בריענון מטמון');
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function handleAdd() {
    setFormData(emptyRule);
    setIsAdding(true);
  }

  async function handleSave() {
    if (!formData.rule_key.trim()) {
      showMessage('error', 'מפתח כלל נדרש');
      return;
    }

    if (!formData.field_name.trim()) {
      showMessage('error', 'שם שדה נדרש');
      return;
    }

    if (!formData.entity_type.trim()) {
      showMessage('error', 'סוג ישות נדרש');
      return;
    }

    try {
      await api.validationRules.create(formData);
      showMessage('success', 'כלל תקינות נוצר בהצלחה');
      setIsAdding(false);
      setFormData(emptyRule);
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה ביצירת כלל');
    }
  }

  function startEdit(rule: ValidationRule) {
    setEditingId(rule.id);
    setEditValues({
      rule_key: rule.rule_key,
      rule_type: rule.rule_type,
      field_name: rule.field_name,
      entity_type: rule.entity_type,
      value_numeric: rule.value_numeric,
      value_text: rule.value_text,
      enabled: rule.enabled,
      error_message: rule.error_message,
      description: rule.description,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit(id: string) {
    try {
      await api.validationRules.update(id, editValues);
      showMessage('success', 'כלל תקינות עודכן בהצלחה');
      setEditingId(null);
      setEditValues({});
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה בעדכון כלל');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק כלל תקינות זה?')) return;

    try {
      await api.validationRules.delete(id);
      showMessage('success', 'כלל תקינות נמחק בהצלחה');
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה במחיקת כלל');
    }
  }

  const columnDefs: ColDef[] = useMemo(() => [
    {
      headerName: t('enabled'),
      field: 'enabled',
      width: 100,
      editable: true,
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="checkbox"
              checked={editValues.enabled ?? rule.enabled}
              onChange={(e) => setEditValues({ ...editValues, enabled: e.target.checked })}
              className="h-4 w-4"
            />
          );
        }
        return rule.enabled ? '✓' : '✗';
      }
    },
    { headerName: t('ruleKey'), field: 'rule_key', width: 250 },
    { headerName: t('entityType'), field: 'entity_type', width: 120 },
    { headerName: t('fieldName'), field: 'field_name', width: 150 },
    { headerName: t('ruleType'), field: 'rule_type', width: 130 },
    {
      headerName: t('numericValue'),
      field: 'value_numeric',
      width: 130,
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="number"
              value={editValues.value_numeric ?? rule.value_numeric ?? ''}
              onChange={(e) => setEditValues({ ...editValues, value_numeric: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.value_numeric ?? '';
      }
    },
    {
      headerName: t('textValue'),
      field: 'value_text',
      width: 150,
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="text"
              value={editValues.value_text ?? rule.value_text ?? ''}
              onChange={(e) => setEditValues({ ...editValues, value_text: e.target.value })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.value_text ?? '';
      }
    },
    {
      headerName: t('errorMessage'),
      field: 'error_message',
      width: 250,
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="text"
              value={editValues.error_message ?? rule.error_message ?? ''}
              onChange={(e) => setEditValues({ ...editValues, error_message: e.target.value })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.error_message ?? '';
      }
    },
    { headerName: t('compareTable'), field: 'compare_table', width: 150 },
    { headerName: t('compareField'), field: 'compare_field', width: 150 },
    { headerName: t('joinField'), field: 'join_field', width: 150 },
    { headerName: t('operator'), field: 'comparison_operator', width: 100 },
    {
      headerName: t('actions'),
      width: 120,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => saveEdit(rule.id)}
                className="p-1 text-teal-600 hover:text-teal-700"
                title={t('save')}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="p-1 text-slate-600 hover:text-slate-700"
                title={t('cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }
        return (
          <div className="flex gap-1">
            <button
              onClick={() => startEdit(rule)}
              className="px-2 py-1 text-sm text-teal-600 hover:text-teal-700"
            >
              {t('edit')}
            </button>
            <button
              onClick={() => handleDelete(rule.id)}
              className="px-2 py-1 text-sm text-red-600 hover:text-red-700"
            >
              {t('delete')}
            </button>
          </div>
        );
      }
    }
  ], [editingId, editValues]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  const onGridReady = useCallback(() => {
    console.log('Grid ready, rules count:', rules.length);
  }, [rules]);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-teal-600" />
          <h2 className="text-2xl font-bold text-slate-800">{t('validationRules')}</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefreshCache}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {t('refreshCache')}
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('addRule')}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mx-6 mt-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {isAdding && (
        <div className="m-6 p-6 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold mb-4">{t('addRule')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('ruleKey')} *</label>
              <input
                type="text"
                value={formData.rule_key}
                onChange={(e) => setFormData({ ...formData, rule_key: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="asset_type_name_required"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('entityType')} *</label>
              <select
                value={formData.entity_type}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">בחר...</option>
                <option value="asset_type">סוג נכס</option>
                <option value="asset">נכס</option>
                <option value="building">בניין</option>
                <option value="measurement">מדידה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('fieldName')} *</label>
              <input
                type="text"
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Type name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('ruleType')} *</label>
              <select
                value={formData.rule_type}
                onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="required">נדרש</option>
                <option value="exact_length">אורך מדויק</option>
                <option value="min_length">אורך מינימלי</option>
                <option value="max_length">אורך מקסימלי</option>
                <option value="pattern">תבנית</option>
                <option value="numeric">מספרי</option>
                <option value="positive_number">מספר חיובי</option>
                <option value="exists_in_table">קיים בטבלה</option>
                <option value="cross_table_comparison">השוואה בין טבלאות</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('numericValue')}</label>
              <input
                type="number"
                value={formData.value_numeric ?? ''}
                onChange={(e) => setFormData({ ...formData, value_numeric: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('textValue')}</label>
              <input
                type="text"
                value={formData.value_text ?? ''}
                onChange={(e) => setFormData({ ...formData, value_text: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="^\d{3}$"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t('errorMessage')}</label>
              <input
                type="text"
                value={formData.error_message ?? ''}
                onChange={(e) => setFormData({ ...formData, error_message: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Field is required"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t('description')}</label>
              <input
                type="text"
                value={formData.description ?? ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Description of what this rule validates"
              />
            </div>
            {formData.rule_type === 'exists_in_table' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Table</label>
                  <input
                    type="text"
                    value={formData.compare_table ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_table: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="asset_types"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Field</label>
                  <input
                    type="text"
                    value={formData.compare_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="tax_region"
                  />
                </div>
              </>
            )}
            {formData.rule_type === 'cross_table_comparison' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Table</label>
                  <input
                    type="text"
                    value={formData.compare_table ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_table: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="building"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Field</label>
                  <input
                    type="text"
                    value={formData.compare_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="total_area_for_control"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Join Field</label>
                  <input
                    type="text"
                    value={formData.join_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, join_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="building_number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Comparison Operator</label>
                  <select
                    value={formData.comparison_operator ?? ''}
                    onChange={(e) => setFormData({ ...formData, comparison_operator: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select...</option>
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                </div>
              </>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <label className="text-sm font-medium">{t('enabled')}</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              {t('save')}
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">{t('loading')}</div>
          </div>
        ) : rules.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">לא נמצאו כללי תקינות</div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="mb-2 text-sm text-slate-600">
              מציג {rules.length} כללי תקינות
            </div>
            <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
              <AgGridReact
                rowData={rules}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                onGridReady={onGridReady}
                onFirstDataRendered={(params) => {
                  params.api.ensureColumnVisible(columnDefs[columnDefs.length - 1].field || 0);
                }}
                pagination={true}
                paginationPageSize={20}
                paginationPageSizeSelector={[10, 20, 50, 100]}
                getRowId={(params) => params.data.id}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
