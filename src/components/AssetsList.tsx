import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface AssetsListProps {
  buildingNumber: number;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number) => void;
}

export function AssetsList({ buildingNumber, onSelectAsset }: AssetsListProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidAssets, setInvalidAssets] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);

  useEffect(() => {
    fetchData();
  }, [buildingNumber]);

  async function fetchData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const [buildingData, assetsData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber),
        api.assetTypes.getAll()
      ]);

      setBuilding(buildingData);
      setAssets(assetsData || []);
      setAssetTypes(assetTypesData || []);

      const invalidSet = new Set<string>();
      const numericRegex = /^[0-9]+$/;

      for (const asset of assetsData || []) {
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

        if (hasInvalidPayerId || hasInvalidAssetId) {
          invalidSet.add(asset.id);
        }
      }

      setInvalidAssets(invalidSet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartments');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = data.id;
      const newValue = event.newValue;

      if (field === 'payer_id') {
        const validation = await assetValidators.validatePayerId(newValue);
        if (!validation.valid) {
          setError(validation.error || 'Invalid payer ID');
          setTimeout(() => setError(null), 3000);
          await fetchData(false);
          return;
        }
      }

      if (field === 'asset_id') {
        const validation = await assetValidators.validateAssetId(newValue);
        if (!validation.valid) {
          setError(validation.error || 'Invalid asset ID');
          setTimeout(() => setError(null), 3000);
          await fetchData(false);
          return;
        }
      }

      if (field.includes('asset_type')) {
        const validation = await assetValidators.validateAssetType(newValue, field);
        if (!validation.valid) {
          setError(validation.error || 'Invalid asset type');
          setTimeout(() => setError(null), 3000);
          await fetchData(false);
          return;
        }
      }

      const updateData: Partial<Asset> = {
        [field]: newValue
      };

      await api.assets.update(assetId, updateData);
      await fetchData(false);
    } catch (error) {
      console.error('Error updating asset:', error);
      setError('Failed to update asset');
      setTimeout(() => setError(null), 3000);
      await fetchData(false);
    }
  }, []);

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: '',
      width: 50,
      filter: false,
      sortable: false,
      editable: false,
      cellRenderer: (params: any) => {
        const numericRegex = /^[0-9]+$/;
        const asset = params.data as Asset;
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

        if (hasInvalidPayerId || hasInvalidAssetId) {
          const errors = [];
          if (hasInvalidPayerId) errors.push('מזהה משלם לא נומרי');
          if (hasInvalidAssetId) errors.push('מזהה נכס לא נומרי');

          return (
            <div className="flex items-center justify-center h-full" title={errors.join(', ')}>
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          );
        }
        return null;
      }
    },
    {
      headerName: t('actions'),
      width: 150,
      minWidth: 150,
      filter: false,
      sortable: false,
      editable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectAsset(params.data.id, params.data.asset_id, buildingNumber)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
        );
      },
      cellClass: 'floating-action-cell'
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      cellStyle: { textAlign: 'right' },
      cellEditor: 'agNumberCellEditor',
      valueParser: (params) => {
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const parsed = Number(newValue);
        return isNaN(parsed) ? null : parsed;
      }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      cellStyle: { textAlign: 'right' },
      cellEditor: 'agNumberCellEditor',
      valueParser: (params) => {
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const parsed = Number(newValue);
        return isNaN(parsed) ? null : parsed;
      }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'main_asset_size',
      headerName: t('mainAssetSize'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 300,
      minWidth: 300,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: false,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f0f9ff' }
    }
  ], [t, onSelectAsset, buildingNumber, assetTypes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loadingApartments')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-slide-in">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-lg">
            <p className="text-red-800 font-medium">{t('error')}: {error}</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1 sm:mb-2">
                <BuildingIcon className="w-10 h-10 text-white" />
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
                  {t('buildingNumber')} {building?.building_number}
                </h1>
              </div>
              <p className="text-sm sm:text-base text-teal-50">{t('totalApartments')}: {assets.length}</p>
            </div>
          </div>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
            onCellValueChanged={onCellValueChanged}
            animateRows={true}
            pagination={true}
            paginationPageSize={20}
            enableRtl={true}
            suppressHorizontalScroll={false}
            getRowStyle={(params) => {
              if (invalidAssets.has(params.data.id)) {
                return { background: '#fee2e2' };
              }
              return {};
            }}
          />
        </div>
      </div>
    </>
  );
}
