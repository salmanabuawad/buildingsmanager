import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Tag, Search, AlertCircle, Plus, Settings } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface BuildingsListProps {
  onSelectBuilding: (buildingNumber: number) => void;
  onOpenAssetTypes?: () => void;
  onOpenAssetSearch?: () => void;
  onOpenDataEntry?: () => void;
  onOpenValidationRules?: () => void;
}

export function BuildingsList({ onSelectBuilding, onOpenAssetTypes, onOpenAssetSearch, onOpenDataEntry, onOpenValidationRules }: BuildingsListProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const gridRef = useRef<AgGridReact<Building>>(null);

  const fetchBuildings = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      console.log('[BuildingsList] Fetching buildings at', new Date().toISOString());
      const data = await api.buildings.getAll();
      console.log('[BuildingsList] Received buildings:', data);
      setBuildings(data || []);

      const invalidSet = new Set<number>();
      for (const building of data || []) {
        const isInvalid = await buildingValidators.checkTaxRegionInvalid(building.tax_region);
        if (isInvalid) {
          invalidSet.add(building.building_number);
        }
      }
      setInvalidTaxRegions(invalidSet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buildings');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuildings(true);
  }, [fetchBuildings]);



  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const buildingNumber = data.building_number;
      const newValue = event.newValue;

      if (field === 'tax_region') {
        const validation = await buildingValidators.validateTaxRegion(newValue);
        if (!validation.valid) {
          setError(validation.error || 'Invalid tax region');
          setTimeout(() => setError(null), 3000);
          await fetchBuildings(false);
          return;
        }
      } else if (field === 'total_area_for_control') {
        if (newValue != null && (isNaN(Number(newValue)) || Number(newValue) < 0)) {
          setError('Total area must be a positive number');
          setTimeout(() => setError(null), 3000);
          await fetchBuildings(false);
          return;
        }
      }

      const updateData: Partial<Building> = {
        [field]: newValue
      };

      await api.buildings.update(buildingNumber, updateData);
      await fetchBuildings(false);
    } catch (error) {
      console.error('Error updating building:', error);
      setError('Failed to update building');
      setTimeout(() => setError(null), 3000);
      await fetchBuildings(false);
    }
  }, [fetchBuildings]);

  const columnDefs: ColDef<Building>[] = useMemo(() => [
    {
      headerName: '',
      width: 50,
      filter: false,
      sortable: false,
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const hasAreaDiscrepancy = buildingValidators.checkAreaMismatch(
          building.total_area_for_control,
          building.total_building_area
        );
        const hasTaxRegionError = invalidTaxRegions.has(building.building_number);

        if (hasAreaDiscrepancy || hasTaxRegionError) {
          const errors = [];
          if (hasAreaDiscrepancy) errors.push('Area mismatch');
          if (hasTaxRegionError) errors.push('Invalid tax region');

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
      width: 130,
      filter: false,
      sortable: false,
      editable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectBuilding(params.data.building_number)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewAssets')}
          </button>
        );
      }
    },
    {
      field: 'total_area_for_control',
      headerName: t('totalAreaForControl'),
      flex: 1.5,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_building_area',
      headerName: t('totalBuildingArea'),
      flex: 1.5,
      sortable: true,
      filter: true,
      editable: false,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_assets',
      headerName: t('totalUnits'),
      flex: 1,
      sortable: true,
      filter: true,
      editable: false,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: t('taxRegion'),
      flex: 1,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      flex: 1.5,
      sortable: true,
      filter: true,
      editable: false,
      cellStyle: { textAlign: 'right' }
    }
  ], [onSelectBuilding, t, invalidTaxRegions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loadingBuildings')}</p>
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
                <img src="/buildings.png" alt="Buildings" className="w-10 h-10 bg-white rounded-lg p-2" />
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t('propertyListings')}</h1>
              </div>
              <p className="text-sm sm:text-base text-teal-50">{t('browseBuildings')}</p>
            </div>
            <div className="flex gap-2">
              {onOpenDataEntry && (
                <button
                  onClick={onOpenDataEntry}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
                >
                  <Plus className="h-5 w-5" />
                  <span className="hidden sm:inline">{t('addNewAsset')}</span>
                </button>
              )}
              {onOpenAssetSearch && (
                <button
                  onClick={onOpenAssetSearch}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
                >
                  <Search className="h-5 w-5" />
                  <span className="hidden sm:inline">{t('assetSearch') || 'Search'}</span>
                </button>
              )}
              {onOpenAssetTypes && (
                <button
                  onClick={onOpenAssetTypes}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
                >
                  <Tag className="h-5 w-5" />
                  <span className="hidden sm:inline">{t('assetTypes')}</span>
                </button>
              )}
              {onOpenValidationRules && (
                <button
                  onClick={onOpenValidationRules}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
                >
                  <Settings className="h-5 w-5" />
                  <span className="hidden sm:inline">Validation Rules</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={buildings}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
              minWidth: 100
            }}
            onCellValueChanged={onCellValueChanged}
            pagination={true}
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            domLayout="normal"
            suppressHorizontalScroll={false}
            rowClass="ag-row"
            getRowStyle={(params) => {
              const building = params.data as Building;
              const hasControlArea = building.total_area_for_control != null;
              const areasMatch = hasControlArea && building.total_area_for_control === building.total_building_area;
              const hasAreaDiscrepancy = hasControlArea && !areasMatch;
              const hasTaxRegionError = invalidTaxRegions.has(building.building_number);

              if (hasAreaDiscrepancy || hasTaxRegionError) {
                return { background: '#fee2e2' };
              }

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
