import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, Building } from '../lib/api';
import { assetValidators, validateAll } from '../lib/validation';
import { Save, Plus, Trash2, Upload } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface AssetRow {
  id: string;
  building_number: number | null;
  payer_id: string;
  asset_id: string;
  main_asset_type: string;
  main_asset_size: number;
  sub_asset_type_1: string;
  sub_asset_size_1: number;
  sub_asset_type_2: string;
  sub_asset_size_2: number;
  sub_asset_type_3: string;
  sub_asset_size_3: number;
  sub_asset_type_4: string;
  sub_asset_size_4: number;
  sub_asset_type_5: string;
  sub_asset_size_5: number;
  sub_asset_type_6: string;
  sub_asset_size_6: number;
  total_size: number;
  _isNew?: boolean;
}

export function AssetDataEntry() {
  const { t } = useTranslation();
  const gridRef = useRef<AgGridReact>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rowData, setRowData] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchBuildings();
    addEmptyRow();
  }, []);

  const fetchBuildings = async () => {
    try {
      const data = await api.buildings.getAll();
      setBuildings(data);
    } catch (err) {
      console.error('Error fetching buildings:', err);
    }
  };

  const createEmptyRow = (): AssetRow => ({
    id: `new_${Date.now()}_${Math.random()}`,
    building_number: null,
    payer_id: '',
    asset_id: '',
    main_asset_type: '',
    main_asset_size: 0,
    sub_asset_type_1: '',
    sub_asset_size_1: 0,
    sub_asset_type_2: '',
    sub_asset_size_2: 0,
    sub_asset_type_3: '',
    sub_asset_size_3: 0,
    sub_asset_type_4: '',
    sub_asset_size_4: 0,
    sub_asset_type_5: '',
    sub_asset_size_5: 0,
    sub_asset_type_6: '',
    sub_asset_size_6: 0,
    total_size: 0,
    _isNew: true
  });

  const addEmptyRow = () => {
    setRowData(prev => [...prev, createEmptyRow()]);
  };

  const calculateTotalSize = (row: AssetRow): number => {
    return (
      (row.main_asset_size || 0) +
      (row.sub_asset_size_1 || 0) +
      (row.sub_asset_size_2 || 0) +
      (row.sub_asset_size_3 || 0) +
      (row.sub_asset_size_4 || 0) +
      (row.sub_asset_size_5 || 0) +
      (row.sub_asset_size_6 || 0)
    );
  };

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const updatedRow = event.data as AssetRow;
    updatedRow.total_size = calculateTotalSize(updatedRow);

    setRowData(prev =>
      prev.map(row => row.id === updatedRow.id ? updatedRow : row)
    );

    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }, []);

  const handleSaveAll = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const rowsToSave = rowData.filter(row =>
        row._isNew && row.building_number && row.asset_id
      );

      if (rowsToSave.length === 0) {
        throw new Error('No valid rows to save. Building Number and Asset ID are required.');
      }

      let savedCount = 0;
      const errors: string[] = [];

      for (const row of rowsToSave) {
        try {
          const validation = await validateAll([
            assetValidators.validateBuildingNumber(row.building_number),
            assetValidators.validateAssetId(row.asset_id),
            assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
            assetValidators.validateAssetType(row.sub_asset_type_1, 'sub_asset_type_1'),
            assetValidators.validateAssetType(row.sub_asset_type_2, 'sub_asset_type_2'),
            assetValidators.validateAssetType(row.sub_asset_type_3, 'sub_asset_type_3'),
            assetValidators.validateAssetType(row.sub_asset_type_4, 'sub_asset_type_4'),
            assetValidators.validateAssetType(row.sub_asset_type_5, 'sub_asset_type_5'),
            assetValidators.validateAssetType(row.sub_asset_type_6, 'sub_asset_type_6'),
          ]);

          if (!validation.valid) {
            errors.push(`Asset ${row.asset_id} (Building ${row.building_number}): ${validation.error}`);
            continue;
          }

          const assetData: Omit<Asset, 'id' | 'created_at'> = {
            building_number: row.building_number!,
            payer_id: row.payer_id || null,
            asset_id: row.asset_id,
            main_asset_type: row.main_asset_type || undefined,
            main_asset_size: row.main_asset_size || 0,
            sub_asset_type_1: row.sub_asset_type_1 || undefined,
            sub_asset_size_1: row.sub_asset_size_1 || 0,
            sub_asset_type_2: row.sub_asset_type_2 || undefined,
            sub_asset_size_2: row.sub_asset_size_2 || 0,
            sub_asset_type_3: row.sub_asset_type_3 || undefined,
            sub_asset_size_3: row.sub_asset_size_3 || 0,
            sub_asset_type_4: row.sub_asset_type_4 || undefined,
            sub_asset_size_4: row.sub_asset_size_4 || 0,
            sub_asset_type_5: row.sub_asset_type_5 || undefined,
            sub_asset_size_5: row.sub_asset_size_5 || 0,
            sub_asset_type_6: row.sub_asset_type_6 || undefined,
            sub_asset_size_6: row.sub_asset_size_6 || 0,
            total_size: row.total_size
          };

          await api.assets.create(assetData);
          savedCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Asset ${row.asset_id} (Building ${row.building_number}): ${errorMsg}`);
        }
      }

      if (errors.length > 0) {
        const errorDetails = errors.join('\n');
        if (savedCount > 0) {
          setError(`Partially saved: ${savedCount} succeeded, ${errors.length} failed:\n${errorDetails}`);
        } else {
          setError(`All saves failed:\n${errorDetails}`);
        }
      } else {
        setSuccess(`${savedCount} asset(s) created successfully!`);
        setRowData([createEmptyRow()]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save assets';
      setError(`Critical error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = useCallback((rowId: string) => {
    setRowData(prev => {
      const filtered = prev.filter(row => row.id !== rowId);
      return filtered.length > 0 ? filtered : [createEmptyRow()];
    });
  }, []);

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n');
    const result: string[][] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      result.push(values);
    }

    return result;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = parseCSV(text);

        if (lines.length === 0) {
          throw new Error('CSV file is empty');
        }

        const headers = lines[0].map(h => h.toLowerCase().trim());
        const newRows: AssetRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i];
          if (values.length === 0 || values.every(v => !v)) continue;

          const row: AssetRow = {
            id: `new_${Date.now()}_${Math.random()}_${i}`,
            building_number: null,
            payer_id: '',
            asset_id: '',
            main_asset_type: '',
            main_asset_size: 0,
            sub_asset_type_1: '',
            sub_asset_size_1: 0,
            sub_asset_type_2: '',
            sub_asset_size_2: 0,
            sub_asset_type_3: '',
            sub_asset_size_3: 0,
            sub_asset_type_4: '',
            sub_asset_size_4: 0,
            sub_asset_type_5: '',
            sub_asset_size_5: 0,
            sub_asset_type_6: '',
            sub_asset_size_6: 0,
            total_size: 0,
            _isNew: true
          };

          headers.forEach((header, index) => {
            const value = values[index] || '';

            switch (header) {
              case 'building_number':
              case 'מבנה':
              case 'מספר בנין':
                row.building_number = value ? parseInt(value) : null;
                break;
              case 'payer_id':
              case 'זיהוי משלם':
                row.payer_id = value;
                break;
              case 'asset_id':
              case 'נכס':
              case 'זיהוי נכס':
                row.asset_id = value;
                break;
              case 'main_asset_type':
              case 'סוג נכס':
                row.main_asset_type = value;
                break;
              case 'main_asset_size':
              case 'גודל נכס':
                row.main_asset_size = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_1':
              case 'נכס משנה 1':
                row.sub_asset_type_1 = value;
                break;
              case 'sub_asset_size_1':
              case 'גודל נכס משנה 1':
                row.sub_asset_size_1 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_2':
              case 'נכס משנה 2':
                row.sub_asset_type_2 = value;
                break;
              case 'sub_asset_size_2':
              case 'גודל נכס משנה 2':
                row.sub_asset_size_2 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_3':
              case 'נכס משנה 3':
                row.sub_asset_type_3 = value;
                break;
              case 'sub_asset_size_3':
              case 'גודל נכס משנה 3':
                row.sub_asset_size_3 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_4':
              case 'נכס משנה 4':
                row.sub_asset_type_4 = value;
                break;
              case 'sub_asset_size_4':
              case 'גודל נכס משנה 4':
                row.sub_asset_size_4 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_5':
              case 'נכס משנה 5':
                row.sub_asset_type_5 = value;
                break;
              case 'sub_asset_size_5':
              case 'גודל נכס משנה 5':
                row.sub_asset_size_5 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_6':
              case 'סוג נכס משני 6':
                row.sub_asset_type_6 = value;
                break;
              case 'sub_asset_size_6':
              case 'גודל נכסי משני 6':
                row.sub_asset_size_6 = value ? parseFloat(value) : 0;
                break;
            }
          });

          row.total_size = calculateTotalSize(row);
          newRows.push(row);
        }

        if (newRows.length === 0) {
          throw new Error('No valid data rows found in CSV');
        }

        setRowData(newRows);
        setSuccess(`Imported ${newRows.length} row(s) from CSV`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const columnDefs: ColDef<AssetRow>[] = useMemo(() => [
    {
      headerName: '',
      width: 60,
      pinned: 'left',
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => handleDeleteRow(params.data.id)}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Delete row"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        );
      }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 130,
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00',
      cellStyle: { backgroundColor: '#e6f7ff', fontWeight: 'bold' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 150,
      editable: true
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 150,
      editable: true
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 150,
      editable: true
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 150,
      editable: true
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 150,
      editable: true
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 150,
      editable: true
    },
    {
      field: 'main_asset_size',
      headerName: t('mainAssetSize'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 150,
      editable: true
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 150,
      editable: true,
      cellStyle: { backgroundColor: '#fff9e6' }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 150,
      editable: true
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      width: 150,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: buildings.map(b => b.building_number)
      },
      cellStyle: { backgroundColor: '#fff9e6' }
    }
  ], [t, buildings, handleDeleteRow]);

  return (
    <div className="max-w-[95vw] mx-auto px-4 py-8">
      <div className="mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Plus className="h-8 w-8 text-white" />
              <h1 className="text-3xl font-bold text-white">{t('assetDataEntry')}</h1>
            </div>
            <p className="text-teal-50">Excel-like data entry for assets</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm font-semibold"
            >
              <Upload className="h-5 w-5" />
              Import CSV
            </button>
            <button
              onClick={addEmptyRow}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm font-semibold"
            >
              <Plus className="h-5 w-5" />
              Add Row
            </button>
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-white text-teal-600 rounded-lg hover:bg-teal-50 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              <Save className="h-5 w-5" />
              {loading ? 'Saving...' : 'Save All'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <p className="text-red-800 font-medium whitespace-pre-line">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border-l-4 border-green-500 rounded-lg p-4">
          <p className="text-green-800 font-medium">{success}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true
            }}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            theme="legacy"
          />
        </div>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tips:</strong> Click any cell to edit. Yellow-highlighted fields (Building Number and Asset ID) are required. Payer ID is optional.
          Total Size is calculated automatically. Use Tab or Enter to navigate between cells.
        </p>
        <p className="text-sm text-blue-700 mt-2">
          <strong>CSV Format:</strong> Headers should match: building_number (or מבנה), payer_id, asset_id (or נכס), main_asset_type, main_asset_size,
          sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3,
          sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
