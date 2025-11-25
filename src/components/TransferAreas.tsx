import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Loader2, Save, X } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';

interface TransferAreasProps {
  buildingNumber: number;
  taxRegion?: string;
  selectedAssetIds: string[];
}

export function TransferAreas({ buildingNumber, taxRegion, selectedAssetIds }: TransferAreasProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'transfer_areas_column_state');

  useEffect(() => {
    fetchData();
  }, [buildingNumber, selectedAssetIds]);

  async function fetchData() {
    try {
      setLoading(true);
      const [buildingData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assetTypes.getAll()
      ]);

      setBuilding(buildingData);
      setAssetTypes(assetTypesData || []);

      // Fetch selected assets by their IDs
      const fetchedAssets: Asset[] = [];
      for (const assetId of selectedAssetIds) {
        try {
          const asset = await api.assets.getOne(Number(assetId));
          fetchedAssets.push(asset);
        } catch (err) {
          console.error(`Error fetching asset ${assetId}:`, err);
        }
      }

      setAssets(fetchedAssets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    const { data, colDef } = event;
    const field = colDef.field;
    const assetId = String(data.id);
    const newValue = event.newValue;

    // Track the change in dirtyAssets
    setDirtyAssets(prev => {
      const next = new Map(prev);
      const existing = next.get(assetId) || {};
      next.set(assetId, { ...existing, [field]: newValue });
      return next;
    });

    // Update local state
    setAssets(prevAssets => {
      return prevAssets.map(asset => {
        if (String(asset.id) === assetId) {
          return { ...asset, [field]: newValue };
        }
        return asset;
      });
    });
  }, []);

  const handleSaveAll = async () => {
    if (dirtyAssets.size === 0) {
      setSuccess('אין שינויים לשמירה');
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    setLoading(true);
    try {
      let savedCount = 0;
      const errors: string[] = [];

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          await api.assets.update(Number(assetId), changes);
          savedCount++;
        } catch (err) {
          errors.push(`נכס ${assetId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      if (errors.length > 0) {
        setError(`נשמרו ${savedCount} נכסים. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        setSuccess(`✓ נשמרו ${savedCount} נכסים בהצלחה`);
        setTimeout(() => setSuccess(null), 3000);
      }

      setDirtyAssets(new Map());
      await fetchData();
    } catch (err) {
      const errorMessage = `שגיאה בשמירה: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[TransferAreas] Error saving:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAll = () => {
    setDirtyAssets(new Map());
    fetchData();
  };

  const hasChanges = dirtyAssets.size > 0;

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'asset_id',
      headerName: t('assetId'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: t('assetSize'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
  ], [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3">
      <div className="mb-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg shadow-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BuildingIcon className="w-7 h-7 text-white" />
            <h1 className="text-lg sm:text-xl font-bold text-white">
              העברת שטחים - מבנה {building?.building_number}
            </h1>
            {taxRegion && (
              <p className="text-sm text-white font-semibold bg-purple-700 px-3 py-1 rounded">
                אזור מס: {taxRegion}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-2 bg-red-50 border-l-4 border-red-500 rounded-lg p-2">
          <p className="text-red-800 text-sm font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-2 bg-green-50 border-l-4 border-green-500 rounded-lg p-2">
          <p className="text-green-800 text-sm font-medium">{success}</p>
        </div>
      )}

      <div className="mb-2 flex justify-end gap-2">
        <button
          onClick={handleCancelAll}
          disabled={loading || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
        <button
          onClick={handleSaveAll}
          disabled={loading || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {loading ? 'שומר...' : `שמור הכל${hasChanges ? ` (${dirtyAssets.size})` : ''}`}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100">
        <div className="p-3">
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ width: '100%', height: '60vh', direction: 'ltr' }}>
            <AgGridReact<Asset>
              ref={gridRef}
              rowData={assets}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
                headerClass: 'ag-right-aligned-header'
              }}
              getRowId={(params) => String(params.data.id)}
              onCellValueChanged={onCellValueChanged}
              onGridReady={async (params) => {
                const hasSavedState = await loadColumnState();
                if (!hasSavedState) {
                  setTimeout(() => {
                    const allColumnIds = params.api.getAllDisplayedColumns()
                      .map(col => col.getColId());
                    if (allColumnIds.length > 0) {
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 100);
                }
              }}
              onFirstDataRendered={async (params) => {
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId());
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                }
              }}
              onColumnResized={saveColumnState}
              onColumnMoved={saveColumnState}
              onSortChanged={saveColumnState}
              enableRtl={true}
              animateRows={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

