import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { UnitType, api } from '../lib/api';
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Trash2 } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';

export function UnitTypes() {
  const { t } = useTranslation();
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<UnitType>>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tax_region: '',
  });

  useEffect(() => {
    fetchUnitTypes();
  }, []);

  async function fetchUnitTypes(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await api.unitTypes.getAll();
      setUnitTypes(data);
    } catch (error) {
      console.error('Error fetching unit types:', error);
      showMessage('error', t('error'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function resetForm() {
    setFormData({ name: '', description: '', tax_region: '' });
    setIsAdding(false);
  }

  function startAdd() {
    resetForm();
    setIsAdding(true);
  }

  async function handleSave() {
    const nameValidation = assetTypeValidators.validateName(formData.name);
    if (!nameValidation.valid) {
      showMessage('error', nameValidation.error!);
      return;
    }

    const taxRegionValidation = assetTypeValidators.validateTaxRegion(formData.tax_region);
    if (!taxRegionValidation.valid) {
      showMessage('error', taxRegionValidation.error!);
      return;
    }

    try{
      const dataToSave = {
        name: formData.name,
        description: formData.description,
        tax_region: formData.tax_region ? parseInt(formData.tax_region) : undefined,
      };

      await api.unitTypes.create(dataToSave);
      showMessage('success', t('unitTypeCreated'));
      await fetchUnitTypes();
      resetForm();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error saving unit type:', error);
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const unitTypeId = data.id;

      const updateData: Partial<UnitType> = {
        [field]: event.newValue
      };

      await api.unitTypes.update(unitTypeId, updateData);
      await fetchUnitTypes(false);
    } catch (error) {
      console.error('Error updating unit type:', error);
      await fetchUnitTypes(false);
    }
  }, []);

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

  const columnDefs: ColDef<UnitType>[] = useMemo(() => [
    {
      field: 'name',
      headerName: t('typeName'),
      flex: 1,
      editable: true,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'description',
      headerName: t('typeDescription'),
      flex: 2,
      editable: true,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: t('taxRegion'),
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value || '-',
      cellStyle: { textAlign: 'right' }
    },
    {
      headerName: t('actions'),
      width: 100,
      editable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => handleDelete(params.data.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      }
    }
  ], [t]);

  async function handleCSVImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(s => s.trim());
        const [name, description = ''] = parts;

        const nameValidation = assetTypeValidators.validateName(name || '');
        if (!nameValidation.valid) {
          errors.push(`Line ${i + 1}: ${nameValidation.error}`);
          errorCount++;
          continue;
        }

        try {
          await api.unitTypes.create({ name, description });
          successCount++;
        } catch (error) {
          errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchUnitTypes();

      if (errors.length > 0) {
        showMessage('error', `Imported ${successCount} types. ${errorCount} errors: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        showMessage('success', `Successfully imported ${successCount} unit types`);
      }
    } catch (error) {
      showMessage('error', 'Error reading CSV file');
      console.error('Error importing CSV:', error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
          {!isAdding && (
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="hidden sm:inline">{isImporting ? t('loading') : 'Import CSV'}</span>
              </button>
              <button
                onClick={startAdd}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                {t('addUnitType')}
              </button>
            </div>
          )}
        </div>

        {isAdding && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {t('addUnitType')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('typeName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (inputValidators.allowDigitsWithMaxLength(value, 3)) {
                      setFormData({ ...formData, name: value });
                    }
                  }}
                  maxLength={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="123"
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('taxRegion')}
                </label>
                <input
                  type="number"
                  step="1"
                  value={formData.tax_region}
                  onChange={(e) => setFormData({ ...formData, tax_region: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('save')}
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {!isAdding && (
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
            <p className="font-semibold mb-1">CSV Format:</p>
            <p className="font-mono text-xs">123,Description for type 123</p>
            <p className="font-mono text-xs">456,Description for type 456</p>
            <p className="mt-1 text-xs">Each line: 3-digit number (required), optional description (comma-separated)</p>
          </div>
        )}

        {unitTypes.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Tag className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg">{t('noUnitTypes')}</p>
          </div>
        ) : (
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
            <AgGridReact
              ref={gridRef}
              rowData={unitTypes}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                minWidth: 100
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={(params) => {
                params.api.autoSizeAllColumns(true);
              }}
              pagination={true}
              paginationPageSize={20}
              domLayout="normal"
              theme="legacy"
              suppressHorizontalScroll={false}
              rowClass="ag-row"
              getRowStyle={(params) => {
                if (params.node.rowIndex % 2 === 0) {
                  return { background: '#ffffff' };
                }
                return { background: '#f0f9ff' };
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
