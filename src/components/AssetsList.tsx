import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);

  useEffect(() => {
    fetchData();
  }, [buildingNumber]);



  async function fetchData() {
    try {
      setLoading(true);

      const [buildingData, assetsData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber)
      ]);

      setBuilding(buildingData);
      setAssets(assetsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartments');
    } finally {
      setLoading(false);
    }
  }

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: t('actions'),
      width: 130,
      filter: false,
      sortable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectAsset(params.data.id, params.data.asset_id, buildingNumber)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
        );
      }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      flex: 1.2,
      sortable: true,
      filter: true
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      flex: 1.2,
      sortable: true,
      filter: true
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'main_asset_size',
      headerName: t('mainAssetSize'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      flex: 0.8,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    }
  ], [buildingNumber, onSelectAsset, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loadingAssets')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 max-w-md shadow-md">
          <p className="text-red-800 font-medium">{t('error')}: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        {building && (
          <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-1 sm:mb-2">
              <BuildingIcon className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t('building')} {building.building_number}</h1>
            </div>
          </div>
        )}

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
              minWidth: 100
            }}
            pagination={true}
            paginationPageSize={20}
            domLayout="normal"
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
      </div>
    </>
  );
}
