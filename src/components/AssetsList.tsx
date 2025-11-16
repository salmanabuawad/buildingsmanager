import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface AssetsListProps {
  buildingNumber: number;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number) => void;
}

export function AssetsList({ buildingNumber, onSelectAsset }: AssetsListProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [masterAssets, setMasterAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidAssets, setInvalidAssets] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const [displayAssets, setDisplayAssets] = useState<Asset[]>([]);

  useEffect(() => {
    fetchData();
  }, [buildingNumber]);

  useEffect(() => {
    // Create display data with expanded rows
    const display: Asset[] = [];
    for (const asset of masterAssets) {
      display.push({ ...asset, _isMasterRow: true });
      if (expandedRows.has(asset.asset_id)) {
        const historicalRecords = assets.filter(
          a => a.asset_id === asset.asset_id && a.measurement_date !== asset.measurement_date
        );
        display.push(...historicalRecords.map(r => ({ ...r, _isMasterRow: false })));
      }
    }
    setDisplayAssets(display);
  }, [masterAssets, assets, expandedRows]);

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

      const assetsByAssetId = new Map<string, Asset[]>();
      for (const asset of assetsData || []) {
        if (!assetsByAssetId.has(asset.asset_id)) {
          assetsByAssetId.set(asset.asset_id, []);
        }
        assetsByAssetId.get(asset.asset_id)!.push(asset);
      }

      const masterAssetsList = Array.from(assetsByAssetId.values()).map(group => {
        group.sort((a, b) => new Date(b.measurement_date).getTime() - new Date(a.measurement_date).getTime());
        return group[0];
      });

      setMasterAssets(masterAssetsList);

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

      const updatedData = { ...data, [field]: newValue };

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

      if (field === 'main_asset_type' || field.includes('sub_asset_type') || field.includes('sub_asset_size') || field === 'asset_size') {
        const validation = await assetValidators.validateSubAssetsFor199Or299(
          updatedData.building_number,
          updatedData.main_asset_type,
          updatedData.asset_size,
          [
            updatedData.sub_asset_type_1,
            updatedData.sub_asset_type_2,
            updatedData.sub_asset_type_3,
            updatedData.sub_asset_type_4,
            updatedData.sub_asset_type_5,
            updatedData.sub_asset_type_6
          ],
          [
            updatedData.sub_asset_size_1,
            updatedData.sub_asset_size_2,
            updatedData.sub_asset_size_3,
            updatedData.sub_asset_size_4,
            updatedData.sub_asset_size_5,
            updatedData.sub_asset_size_6
          ]
        );

        if (!validation.valid) {
          setError(validation.error || 'Validation failed for 199/299 asset types');
          setTimeout(() => setError(null), 5000);
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

  const detailColumnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 150,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
      cellStyle: { textAlign: 'right', backgroundColor: '#fef3c7', fontWeight: '600' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 150,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 120,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 120,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 110,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 120,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 110,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 120,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#dbeafe' }
    }
  ], [t, assetTypes]);

  const toggleRowExpansion = useCallback((assetId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  }, []);

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: '',
      width: 50,
      
      
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
      
      
      editable: false,
      cellRenderer: (params: any) => {
        if (params.data._isMasterRow === false) return null;
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
      headerName: '',
      width: 60,
      minWidth: 60,
      
      
      editable: false,
      pinned: 'right',
      cellRenderer: (params: any) => {
        if (params.data._isMasterRow === false) return null;
        const hasHistory = assets.filter(a => a.asset_id === params.data.asset_id).length > 1;
        if (!hasHistory) return null;

        const isExpanded = expandedRows.has(params.data.asset_id);

        const handleClick = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          toggleRowExpansion(params.data.asset_id);
        };

        return (
          <button
            onClick={handleClick}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-100 transition-colors duration-200"
            title={isExpanded ? t('collapse') : t('expand')}
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-teal-700" />
            ) : (
              <ChevronRight className="w-5 h-5 text-teal-700 scale-x-[-1]" />
            )}
          </button>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 150,
      minWidth: 150,
      
      
      editable: false,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
      cellStyle: { textAlign: 'right', backgroundColor: '#ecfdf5', fontWeight: '700', color: '#065f46' }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      cellStyle: (params) => {
        const numericRegex = /^[0-9]+$/;
        const hasError = params.value && !numericRegex.test(params.value);
        return {
          textAlign: 'right',
          ...(hasError && { backgroundColor: '#fee2e2', border: '2px solid #ef4444' })
        };
      }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      cellStyle: (params) => {
        const numericRegex = /^[0-9]+$/;
        const hasError = params.value && !numericRegex.test(params.value);
        return {
          textAlign: 'right',
          ...(hasError && { backgroundColor: '#fee2e2', border: '2px solid #ef4444' })
        };
      }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 150,
      minWidth: 150,
      
      
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 150,
      minWidth: 150,
      
      
      editable: false,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f0f9ff' }
    }
  ], [t, onSelectAsset, buildingNumber, assetTypes, assets, expandedRows, toggleRowExpansion]);

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
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BuildingIcon className="w-8 h-8 text-white" />
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {t('buildingNumber')} {building?.building_number}
                </h1>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-xs sm:text-sm text-teal-50">
                  <span className="font-semibold">{t('uniqueAssets')}:</span> {masterAssets.length}
                </p>
                <p className="text-xs sm:text-sm text-teal-50">
                  <span className="font-semibold">{t('totalMeasurements')}:</span> {assets.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={displayAssets}
            columnDefs={columnDefs}
            defaultColDef={{
              
              
              resizable: true,
            }}
            onCellValueChanged={onCellValueChanged}
            getRowId={(params) => params.data.id}
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
            animateRows={true}
            pagination={true}
            paginationPageSize={20}
            enableRtl={true}
            suppressHorizontalScroll={false}
            getRowStyle={(params) => {
              if (invalidAssets.has(params.data.id)) {
                return { background: '#fee2e2' };
              }
              // Check if this is a historical record (not in masterAssets)
              const isMaster = masterAssets.some(m => m.id === params.data.id);
              if (!isMaster) {
                return {
                  background: 'linear-gradient(to right, #dbeafe 0%, #e0f2fe 100%)',
                  fontStyle: 'italic',
                  fontSize: '0.9em'
                };
              }
              return {};
            }}
          />
        </div>
      </div>
    </>
  );
}
