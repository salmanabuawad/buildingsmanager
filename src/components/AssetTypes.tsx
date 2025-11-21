import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, api } from '../lib/api';
import { assetTypeValidators, inputValidators } from '../lib/validation';
import { Plus, Tag, Upload, Trash2 } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';

export function AssetTypes() {
  const { t } = useTranslation();
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<AssetType>>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tax_region: '',
    shared_area_yn: '',
    has_elevator: '',
    min_size: '',
    max_size: '',
  });

  useEffect(() => {
    fetchAssetTypes();
  }, []);

  async function fetchAssetTypes(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await api.assetTypes.getAll();
      setAssetTypes(data);
    } catch (error) {
      console.error('Error fetching asset types:', error);
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
    setFormData({ name: '', description: '', tax_region: '', shared_area_yn: '', has_elevator: '', min_size: '', max_size: '' });
    setIsAdding(false);
  }

  function startAdd() {
    resetForm();
    setIsAdding(true);
  }

  async function handleSave() {
    if (!formData.name) {
      showMessage('error', 'קוד נכס חייב להיות מספר');
      return;
    }

    const taxRegionValidation = await assetTypeValidators.validateTaxRegion(formData.tax_region);
    if (!taxRegionValidation.valid) {
      showMessage('error', taxRegionValidation.error!);
      return;
    }

    try {
      const dataToSave = {
        name: formData.name,
        description: formData.description,
        tax_region: formData.tax_region ? parseInt(formData.tax_region) : undefined,
        shared_area_yn: formData.shared_area_yn || undefined,
        has_elevator: formData.has_elevator || undefined,
        min_size: formData.min_size ? parseFloat(formData.min_size) : undefined,
        max_size: formData.max_size ? parseFloat(formData.max_size) : undefined,
      };

      await api.assetTypes.create(dataToSave);
      showMessage('success', t('assetTypeCreated'));
      await fetchAssetTypes();
      resetForm();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error saving asset type:', error);
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetTypeId = data.id;
      const newValue = event.newValue;

      if (field === 'name') {
        showMessage('error', 'לא ניתן לערוך את קוד הנכס');
        await fetchAssetTypes(false);
        return;
      } else if (field === 'tax_region') {
        const validation = await assetTypeValidators.validateTaxRegion(newValue);
        if (!validation.valid) {
          showMessage('error', validation.error!);
          await fetchAssetTypes(false);
          return;
        }
      }

      const updateData: Partial<AssetType> = {
        [field]: newValue
      };

      await api.assetTypes.update(assetTypeId, updateData);
      await fetchAssetTypes(false);
    } catch (error) {
      console.error('Error updating asset type:', error);
      showMessage('error', 'עדכון נכשל');
      await fetchAssetTypes(false);
    }
  }, []);

  async function handleDelete(id: number) {
    if (!confirm(t('confirmDeleteAssetType'))) return;

    try {
      await api.assetTypes.delete(id);
      showMessage('success', t('assetTypeDeleted'));
      await fetchAssetTypes();
    } catch (error) {
      showMessage('error', t('error'));
      console.error('Error deleting asset type:', error);
    }
  }

  const columnDefs: ColDef<AssetType>[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'קוד',
      flex: 0.5,
      editable: false,
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'description',
      headerName: t('typeDescription'),
      flex: 2,
      editable: true,
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'tax_region',
      headerName: t('taxRegion'),
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value || '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'shared_area_yn',
      headerName: t('sharedArea'),
      flex: 1,
      editable: true,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'א';
        return (
          <div className="flex items-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'א' : '';
                params.node.setDataValue(params.column.colId, newValue);
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'has_elevator',
      headerName: t('elevator'),
      flex: 1,
      editable: true,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'א';
        return (
          <div className="flex items-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'א' : '';
                params.node.setDataValue(params.column.colId, newValue);
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      },
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'condition_elevator',
      headerName: 'Condition Elevator',
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value ?? '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'condition_shared_area',
      headerName: 'Condition Shared Area',
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value ?? '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'condition_size',
      headerName: 'Condition Size',
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value ?? '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'min_size',
      headerName: t('minAssetSize'),
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'max_size',
      headerName: t('maxAssetSize'),
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '-',
      cellStyle: { textAlign: 'left' }
    },
    {
      field: 'notes',
      headerName: 'Notes',
      flex: 1.5,
      editable: true,
      valueFormatter: (params) => params.value || '-',
      cellStyle: { textAlign: 'left' }
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

        const nameValidation = await assetTypeValidators.validateName(name || '');
        if (!nameValidation.valid) {
          errors.push(`Line ${i + 1}: ${nameValidation.error}`);
          errorCount++;
          continue;
        }

        try {
          await api.assetTypes.create({ name, description });
          successCount++;
        } catch (error) {
          errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchAssetTypes();

      if (errors.length > 0) {
        showMessage('error', `יובאו ${successCount} סוגים. ${errorCount} שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        showMessage('success', `יובאו בהצלחה ${successCount} סוגי נכסים`);
      }
    } catch (error) {
      showMessage('error', 'שגיאה בקריאת קובץ CSV');
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
    <div className="max-w-5xl mx-auto px-4 py-3">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-2">
        <div className="flex items-center gap-2">
          <Tag className="w-7 h-7 text-white bg-white/20 rounded-lg p-1" />
          <h1 className="text-lg sm:text-xl font-bold text-white">{t('assetTypes')}</h1>
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
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">{t('assetTypes')}</h2>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
              {assetTypes.length} {assetTypes.length === 1 ? 'type' : 'types'}
            </span>
          </div>
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
                <span className="hidden sm:inline">{isImporting ? t('loading') : t('importCSV')}</span>
              </button>
              <button
                onClick={startAdd}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                {t('addAssetType')}
              </button>
            </div>
          )}
        </div>

        {isAdding && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {t('addAssetType')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  קוד נכס *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="199"
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('sharedArea')}
                </label>
                <select
                  value={formData.shared_area_yn}
                  onChange={(e) => setFormData({ ...formData, shared_area_yn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">לא</option>
                  <option value="א">כן</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('elevator')}
                </label>
                <select
                  value={formData.has_elevator}
                  onChange={(e) => setFormData({ ...formData, has_elevator: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">לא</option>
                  <option value="א">כן</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('minAssetSize')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_size}
                  onChange={(e) => setFormData({ ...formData, min_size: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('maxAssetSize')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.max_size}
                  onChange={(e) => setFormData({ ...formData, max_size: e.target.value })}
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
            <p className="font-semibold mb-1">פורמט CSV:</p>
            <p className="font-mono text-xs">123,תיאור לסוג 123</p>
            <p className="font-mono text-xs">456,תיאור לסוג 456</p>
            <p className="mt-1 text-xs">כל שורה: מספר בן 3 ספרות (נדרש), תיאור אופציונלי (מופרד בפסיק)</p>
          </div>
        )}

        {assetTypes.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Tag className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg">{t('noAssetTypes')}</p>
          </div>
        ) : (
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ width: '100%' }}>
            <AgGridReact
              ref={gridRef}
              rowData={assetTypes}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                minWidth: 100
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={(params) => {
                params.api.autoSizeAllColumns();
              }}
              onFirstDataRendered={(params) => {
                const firstCol = params.api.getAllDisplayedColumns()[0];
                if (firstCol) {
                  params.api.ensureColumnVisible(firstCol);
                }
                params.api.autoSizeAllColumns();
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 100);
              }}
              pagination={false}
              domLayout="autoHeight"
              suppressHorizontalScroll={false}
              enableRtl={true}
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
