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
      showMessage('error', 'Failed to load validation rules');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshCache() {
    try {
      await loadValidationRules(true);
      showMessage('success', 'Validation cache refreshed');
    } catch (error) {
      showMessage('error', 'Failed to refresh cache');
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
      showMessage('error', 'Rule key is required');
      return;
    }

    if (!formData.field_name.trim()) {
      showMessage('error', 'Field name is required');
      return;
    }

    if (!formData.entity_type.trim()) {
      showMessage('error', 'Entity type is required');
      return;
    }

    try {
      await api.validationRules.create(formData);
      showMessage('success', 'Validation rule created');
      setIsAdding(false);
      setFormData(emptyRule);
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to create rule');
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
      showMessage('success', 'Validation rule updated');
      setEditingId(null);
      setEditValues({});
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to update rule');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this validation rule?')) return;

    try {
      await api.validationRules.delete(id);
      showMessage('success', 'Validation rule deleted');
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to delete rule');
    }
  }

  const columnDefs: ColDef[] = useMemo(() => [
    {
      headerName: 'Enabled',
      field: 'enabled',
      width: 100,
      editable: true,
      cellRenderer: (params: any) => {
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
    { headerName: 'Rule Key', field: 'rule_key', width: 250 },
    { headerName: 'Entity Type', field: 'entity_type', width: 120 },
    { headerName: 'Field Name', field: 'field_name', width: 150 },
    { headerName: 'Rule Type', field: 'rule_type', width: 130 },
    {
      headerName: 'Numeric Value',
      field: 'value_numeric',
      width: 130,
      cellRenderer: (params: any) => {
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
      headerName: 'Text Value',
      field: 'value_text',
      width: 150,
      cellRenderer: (params: any) => {
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
      headerName: 'Error Message',
      field: 'error_message',
      width: 250,
      cellRenderer: (params: any) => {
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
    { headerName: 'Compare Table', field: 'compare_table', width: 150 },
    { headerName: 'Compare Field', field: 'compare_field', width: 150 },
    { headerName: 'Join Field', field: 'join_field', width: 150 },
    { headerName: 'Operator', field: 'comparison_operator', width: 100 },
    {
      headerName: 'Actions',
      width: 120,
      cellRenderer: (params: any) => {
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => saveEdit(rule.id)}
                className="p-1 text-teal-600 hover:text-teal-700"
                title="Save"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="p-1 text-slate-600 hover:text-slate-700"
                title="Cancel"
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
              Edit
            </button>
            <button
              onClick={() => handleDelete(rule.id)}
              className="px-2 py-1 text-sm text-red-600 hover:text-red-700"
            >
              Delete
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
          <h2 className="text-2xl font-bold text-slate-800">Validation Rules</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefreshCache}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Cache
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Rule
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
          <h3 className="text-lg font-semibold mb-4">Add New Validation Rule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Rule Key *</label>
              <input
                type="text"
                value={formData.rule_key}
                onChange={(e) => setFormData({ ...formData, rule_key: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="asset_type_name_required"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Entity Type *</label>
              <select
                value={formData.entity_type}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select...</option>
                <option value="asset_type">Asset Type</option>
                <option value="asset">Asset</option>
                <option value="building">Building</option>
                <option value="measurement">Measurement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Field Name *</label>
              <input
                type="text"
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Type name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rule Type *</label>
              <select
                value={formData.rule_type}
                onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="required">Required</option>
                <option value="exact_length">Exact Length</option>
                <option value="min_length">Min Length</option>
                <option value="max_length">Max Length</option>
                <option value="pattern">Pattern</option>
                <option value="numeric">Numeric</option>
                <option value="positive_number">Positive Number</option>
                <option value="cross_table_comparison">Cross-Table Comparison</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Numeric Value</label>
              <input
                type="number"
                value={formData.value_numeric ?? ''}
                onChange={(e) => setFormData({ ...formData, value_numeric: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Text Value</label>
              <input
                type="text"
                value={formData.value_text ?? ''}
                onChange={(e) => setFormData({ ...formData, value_text: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="^\d{3}$"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Error Message</label>
              <input
                type="text"
                value={formData.error_message ?? ''}
                onChange={(e) => setFormData({ ...formData, error_message: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Field is required"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={formData.description ?? ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Description of what this rule validates"
              />
            </div>
            {formData.rule_type === 'cross_table_comparison' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Table</label>
                  <input
                    type="text"
                    value={formData.compare_table ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_table: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="buildings"
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
              <label className="text-sm font-medium">Enabled</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">Loading validation rules...</div>
          </div>
        ) : rules.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">No validation rules found. Click "Add Rule" to create one.</div>
          </div>
        ) : (
          <div className="ag-theme-alpine h-full">
            <div className="mb-2 text-sm text-slate-600">
              Showing {rules.length} validation rules
            </div>
            <AgGridReact
              rowData={rules}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onGridReady={onGridReady}
              pagination={true}
              paginationPageSize={20}
              domLayout="normal"
              theme="legacy"
            />
          </div>
        )}
      </div>
    </div>
  );
}
