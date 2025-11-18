import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Loader2 } from 'lucide-react';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

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
  const gridRef = useRef<AgGridReact<Asset>>(null);

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 130,
      minWidth: 130,
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      minWidth: 120,
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      minWidth: 120,
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 150,
      minWidth: 150,
      valueFormatter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description ? `${code} - ${assetType.description}` : code;
      },
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 120,
      minWidth: 120,
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
    },
  ], [t, assetTypes]);

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
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
      <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Home className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <p className="text-sm sm:text-base text-teal-50">
                {t('building')} {building.building_number}
              </p>
            )}
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100">
          <div className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">
              {t('measurementHistory')} ({allMeasurements.length})
            </h2>
            <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
              <AgGridReact<Asset>
                ref={gridRef}
                rowData={allMeasurements}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  editable: false
                }}
                getRowId={(params) => String(params.data.id)}
                onGridReady={(params) => {
                  params.api.sizeColumnsToFit();
                }}
                enableRtl={true}
                animateRows={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
