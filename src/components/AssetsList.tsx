import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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

  async function fetchData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const [buildingData, assetsData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber)
      ]);

      setBuilding(buildingData);
      setAssets(assetsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
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
      field: 'asset_id',
      headerName: 'Asset ID',
      flex: 1,
      sortable: true,
      filter: true,
      editable: true,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_number',
      headerName: 'Building Number',
      flex: 1,
      sortable: true,
      filter: true,
      editable: false,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'created_at',
      headerName: 'Created',
      flex: 1,
      sortable: true,
      filter: true,
      editable: false,
      valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString() : '',
      cellStyle: { textAlign: 'right' }
    }
  ], []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">Loading assets...</p>
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
                  Building {building?.building_number} - Assets
                </h1>
              </div>
              <p className="text-sm sm:text-base text-teal-50">
                {assets.length} assets in this building
              </p>
            </div>
          </div>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
              editable: true
            }}
            onCellValueChanged={onCellValueChanged}
            animateRows={true}
            pagination={true}
            paginationPageSize={20}
            enableRtl={true}
          />
        </div>
      </div>
    </>
  );
}
