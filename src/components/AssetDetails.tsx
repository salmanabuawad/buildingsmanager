import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Loader2, Edit2, Plus } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams, ValueSetterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { assetValidators, ValidationResult } from '../lib/validation';

interface AssetDetailsProps {
  assetId: number;
  onDataUpdate?: () => void;
}

export function AssetDetails({ assetId, onDataUpdate }: AssetDetailsProps) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [allMeasurements, setAllMeasurements] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const gridRef = useRef<AgGridReact<Asset>>(null);

  const latestMeasurementId = useMemo(() => {
    if (allMeasurements.length === 0) return null;
    return allMeasurements[0]?.id;
  }, [allMeasurements]);

  const getCellKey = (rowId: number, field: string) => `${rowId}_${field}`;

  const cellClassRules = {
    'ag-cell-error': (params: CellClassParams) => {
      if (params.data.id !== latestMeasurementId) return false;
      const cellKey = getCellKey(params.data.id, params.colDef.field || '');
      return !!cellErrors[cellKey];
    }
  };

  async function validateCell(rowId: number, field: string, value: any, rowData: Asset): Promise<ValidationResult> {
    if (!building) return { valid: true };

    switch (field) {
      case 'payer_id':
        return await assetValidators.validatePayerId(value);

      case 'main_asset_type':
        const mainTypeResult = await assetValidators.validateAssetType(value, field);
        if (!mainTypeResult.valid) return mainTypeResult;
        return await assetValidators.validateMainAssetTypeForBuilding(building.building_number, value);

      case 'asset_size':
        const sizeResult = await assetValidators.validateSize(value, field);
        if (!sizeResult.valid) return sizeResult;

        const subTypes = [
          rowData.sub_asset_type_1, rowData.sub_asset_type_2, rowData.sub_asset_type_3,
          rowData.sub_asset_type_4, rowData.sub_asset_type_5, rowData.sub_asset_type_6
        ];
        const subSizes = [
          rowData.sub_asset_size_1, rowData.sub_asset_size_2, rowData.sub_asset_size_3,
          rowData.sub_asset_size_4, rowData.sub_asset_size_5, rowData.sub_asset_size_6
        ];

        return await assetValidators.validateSubAssetSizeMatchesMain(value, subTypes, subSizes);

      case 'sub_asset_type_1':
      case 'sub_asset_type_2':
      case 'sub_asset_type_3':
      case 'sub_asset_type_4':
      case 'sub_asset_type_5':
      case 'sub_asset_type_6':
        if (!value) return { valid: true };
        const subTypeResult = await assetValidators.validateAssetType(value, field);
        if (!subTypeResult.valid) return subTypeResult;
        return await assetValidators.validateMainAssetTypeForBuilding(building.building_number, value);

      case 'sub_asset_size_1':
      case 'sub_asset_size_2':
      case 'sub_asset_size_3':
      case 'sub_asset_size_4':
      case 'sub_asset_size_5':
      case 'sub_asset_size_6':
        if (!value) return { valid: true };
        return await assetValidators.validateSize(value, field);

      default:
        return { valid: true };
    }
  }

  async function handleCellValueChanged(params: any) {
    const { data, colDef, newValue, oldValue, node } = params;
    const field = colDef.field;
    const cellKey = getCellKey(data.id, field);

    console.log('Cell value changed:', { field, newValue, oldValue });

    const result = await validateCell(data.id, field, newValue, data);
    console.log('Validation result:', result);

    if (!result.valid) {
      setCellErrors(prev => ({
        ...prev,
        [cellKey]: result.error || 'Validation failed'
      }));

      data[field] = oldValue;
      node.setData(data);

      gridRef.current?.api.refreshCells({
        rowNodes: [node],
        columns: [field],
        force: true
      });

      setToast({ message: result.error || 'Validation failed', type: 'error' });
      return;
    }

    setCellErrors(prev => {
      const updated = { ...prev };
      delete updated[cellKey];
      return updated;
    });

    gridRef.current?.api.refreshCells({
      rowNodes: [node],
      columns: [field],
      force: true
    });

    try {
      await api.assets.update(data.id, { [field]: newValue });
      setToast({ message: t('updatedSuccessfully'), type: 'success' });
      if (onDataUpdate) onDataUpdate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Failed to update', type: 'error' });

      data[field] = oldValue;
      node.setData(data);
      gridRef.current?.api.refreshCells({
        rowNodes: [node],
        columns: [field],
        force: true
      });
    }
  }

  async function handleUpdateRecord() {
    if (!latestMeasurementId || Object.keys(cellErrors).length > 0) {
      setToast({
        message: Object.keys(cellErrors).length > 0
          ? 'אנא תקן את כל השגיאות לפני השמירה'
          : 'אין רשומה לעדכון',
        type: 'error'
      });
      return;
    }

    const latestRow = allMeasurements.find(m => m.id === latestMeasurementId);
    if (!latestRow) return;

    setIsSaving(true);
    try {
      await api.assets.update(latestRow.id, latestRow);
      setToast({ message: 'הרשומה עודכנה בהצלחה', type: 'success' });
      if (onDataUpdate) onDataUpdate();
      await fetchData();
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'שגיאה בעדכון הרשומה',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleNewMeasurement() {
    if (!asset || !building) return;

    const latestRow = allMeasurements[0];
    if (!latestRow) {
      setToast({ message: 'לא נמצאה מדידה קיימת להעתקה', type: 'error' });
      return;
    }

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const newMeasurementDate = `${day}/${month}/${year}`;

    const newMeasurement = {
      asset_id: latestRow.asset_id,
      building_number: latestRow.building_number,
      measurement_date: newMeasurementDate,
      payer_id: latestRow.payer_id,
      main_asset_type: latestRow.main_asset_type,
      asset_size: latestRow.asset_size,
      sub_asset_type_1: latestRow.sub_asset_type_1,
      sub_asset_size_1: latestRow.sub_asset_size_1,
      sub_asset_type_2: latestRow.sub_asset_type_2,
      sub_asset_size_2: latestRow.sub_asset_size_2,
      sub_asset_type_3: latestRow.sub_asset_type_3,
      sub_asset_size_3: latestRow.sub_asset_size_3,
      sub_asset_type_4: latestRow.sub_asset_type_4,
      sub_asset_size_4: latestRow.sub_asset_size_4,
      sub_asset_type_5: latestRow.sub_asset_type_5,
      sub_asset_size_5: latestRow.sub_asset_size_5,
      sub_asset_type_6: latestRow.sub_asset_type_6,
      sub_asset_size_6: latestRow.sub_asset_size_6,
    };

    setIsSaving(true);
    try {
      await api.assets.create(newMeasurement);
      setToast({ message: 'מדידה חדשה נוצרה בהצלחה', type: 'success' });
      if (onDataUpdate) onDataUpdate();
      await fetchData();
      setCellErrors({});
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'שגיאה ביצירת מדידה חדשה',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 130,
      minWidth: 130,
      editable: false,
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      minWidth: 120,
      editable: false,
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 100,
      minWidth: 100,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 120,
      minWidth: 120,
      editable: (params) => params.data.id === latestMeasurementId,
      cellClassRules,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
  ], [t, assetTypes, latestMeasurementId, cellErrors]);

  useEffect(() => {
    fetchData();
  }, [assetId]);

  async function fetchData() {
    try {
      setLoading(true);

      const [assetData, assetTypesData] = await Promise.all([
        api.assets.getOne(String(assetId)),
        api.assetTypes.getAll()
      ]);

      if (!assetData) throw new Error('Asset not found');

      setAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

      const allAssetMeasurements = await api.assets.getAllByAssetId(String(assetData.asset_id), assetData.building_number);
      setAllMeasurements(allAssetMeasurements || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingDetails')}</p>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{t('error')}: {error || 'Asset not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={0}
        />
      )}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-2">
          <Home className="w-8 h-8 text-white bg-white/20 rounded-lg p-1.5" strokeWidth={1.5} />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <p className="text-xs sm:text-sm text-teal-50">
                {t('building')} {building.building_number}
              </p>
            )}
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {t('measurementHistory')} ({allMeasurements.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateRecord}
                  disabled={isSaving || Object.keys(cellErrors).length > 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  title={Object.keys(cellErrors).length > 0 ? 'תקן שגיאות לפני שמירה' : ''}
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Edit2 className="h-5 w-5" />
                  )}
                  <span className="hidden sm:inline">{t('updateRecord')}</span>
                </button>
                <button
                  onClick={handleNewMeasurement}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  <span className="hidden sm:inline">{t('newMeasurement')}</span>
                </button>
              </div>
            </div>
            <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '40vh', width: '100%' }}>
              <AgGridReact<Asset>
                ref={gridRef}
                rowData={allMeasurements}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true
                }}
                getRowId={(params) => String(params.data.id)}
                onGridReady={(params) => {
                  params.api.sizeColumnsToFit();
                }}
                onCellValueChanged={handleCellValueChanged}
                enableRtl={true}
                animateRows={true}
                tooltipShowDelay={200}
                tooltipHideDelay={10000}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
