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
      valueFormatter: (params) => params.value?.toLocaleString(),
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
      valueFormatter: (params) => params.value?.toLocaleString(),
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
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 120,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#dbeafe' }
    }
  ], [t, assetTypes]);

  const DetailCellRenderer = useCallback((props: IDetailCellRendererParams) => {
    const masterAsset = props.data as Asset;
    const historicalRecords = assets.filter(
      a => a.asset_id === masterAsset.asset_id && a.measurement_date !== masterAsset.measurement_date
    );

    if (historicalRecords.length === 0) {
      return (
        <div className="p-4 text-gray-500 text-sm italic bg-gray-50">
          {t('noMeasurements')}
        </div>
      );
    }

    return (
      <div className="p-4 bg-gradient-to-br from-blue-50 to-teal-50 border-l-4 border-teal-500">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1 w-1 rounded-full bg-teal-600"></div>
          <h3 className="text-sm font-bold text-teal-900">{t('measurementHistory')}</h3>
          <span className="text-xs text-teal-600 font-medium">({historicalRecords.length} {t('previousRecords')})</span>
        </div>
        <div className="ag-theme-alpine rounded-lg overflow-hidden shadow-sm" style={{ height: `${Math.min(historicalRecords.length * 42 + 60, 300)}px`, width: '100%' }}>
          <AgGridReact
            rowData={historicalRecords}
            columnDefs={detailColumnDefs}
            domLayout='autoHeight'
            headerHeight={38}
            rowHeight={38}
            suppressHorizontalScroll={true}
            enableRtl={true}
          />
        </div>
      </div>
    );
  }, [assets, t, detailColumnDefs]);

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
      headerName: '',
      width: 60,
      minWidth: 60,
      sortable: false,
      filter: false,
      editable: false,
      pinned: 'right',
      cellRenderer: (params: any) => {
        const hasHistory = assets.filter(a => a.asset_id === params.data.asset_id).length > 1;
        if (!hasHistory) return null;

        const ExpandButton = () => {
          const [expanded, setExpanded] = useState(params.node.expanded || false);

          useEffect(() => {
            const listener = () => {
              setExpanded(params.node.expanded || false);
            };
            params.node.addEventListener('expandedChanged', listener);
            return () => {
              params.node.removeEventListener('expandedChanged', listener);
            };
          }, []);

          const handleClick = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const newExpandedState = !expanded;
            params.node.setExpanded(newExpandedState);
            setExpanded(newExpandedState);
          };

          return (
            <button
              onClick={handleClick}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-100 transition-colors duration-200"
              title={expanded ? t('collapse') : t('expand')}
            >
              {expanded ? (
                <ChevronDown className="w-5 h-5 text-teal-700" />
              ) : (
                <ChevronRight className="w-5 h-5 text-teal-700" />
              )}
            </button>
          );
        };

        return <ExpandButton />;
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: false,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
      cellStyle: { textAlign: 'right', backgroundColor: '#ecfdf5', fontWeight: '700', color: '#065f46' }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 150,
      minWidth: 150,
      sortable: true,
      filter: true,
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
  ], [t, onSelectAsset, buildingNumber, assetTypes, assets]);

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
            rowData={masterAssets}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
            masterDetail={true}
            detailCellRenderer={DetailCellRenderer}
            detailRowAutoHeight={true}
            isRowMaster={(dataItem) => {
              return assets.filter(a => a.asset_id === dataItem.asset_id).length > 1;
            }}
            onCellValueChanged={onCellValueChanged}
            onFirstDataRendered={(params) => {
              const firstCol = params.api.getAllDisplayedColumns()[0];
              if (firstCol) {
                params.api.ensureColumnVisible(firstCol);
              }
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
              return {};
            }}
          />
        </div>
      </div>
    </>
  );
}
