import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Tag, Search, AlertCircle, Plus, Settings, Upload, Building2, Loader2 } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface BuildingsListProps {
  onSelectBuilding: (buildingNumber: number, taxRegions?: string) => void;
  onOpenAssetTypes?: () => void;
  onOpenAssetSearch?: () => void;
  onOpenDataEntry?: () => void;
  onOpenValidationRules?: () => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
}

export function BuildingsList({ onSelectBuilding, onOpenAssetTypes, onOpenAssetSearch, onOpenDataEntry, onOpenValidationRules, showCreateModal, setShowCreateModal }: BuildingsListProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const [newBuilding, setNewBuilding] = useState({ building_number: '', tax_region: '' });
  const gridRef = useRef<AgGridReact<Building>>(null);

  const fetchBuildings = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      console.log('[BuildingsList] Fetching buildings at', new Date().toISOString());
      const data = await api.buildings.getAll();
      console.log('[BuildingsList] Received buildings:', data);
      setBuildings(data || []);
      setFilteredBuildings(data || []);

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

  useEffect(() => {
    if (buildingFilter === '') {
      setFilteredBuildings(buildings);
    } else {
      const filtered = buildings.filter(b =>
        b.building_number.toString().includes(buildingFilter)
      );
      setFilteredBuildings(filtered);
    }
  }, [buildingFilter, buildings]);



  const handleCreateBuilding = async () => {
    try {
      const buildingNumber = parseInt(newBuilding.building_number);
      const taxRegion = newBuilding.tax_region ? newBuilding.tax_region.trim() : null;

      if (isNaN(buildingNumber)) {
        setError('Invalid building number');
        setTimeout(() => setError(null), 3000);
        return;
      }

      console.log('[CREATE] Attempting to create building:', { buildingNumber, taxRegion });
      await api.buildings.create({
        building_number: buildingNumber,
        tax_region: taxRegion,
        total_assets: 0,
        total_building_area: 0
      });
      console.log('[CREATE] Building created successfully');

      setShowCreateModal(false);
      setNewBuilding({ building_number: '', tax_region: '' });
      await fetchBuildings(false);
    } catch (error: any) {
      console.error('[CREATE ERROR] Full error object:', error);
      console.error('[CREATE ERROR] Error message:', error.message);
      console.error('[CREATE ERROR] Error details:', error.details);
      console.error('[CREATE ERROR] Error hint:', error.hint);
      console.error('[CREATE ERROR] Error code:', error.code);
      const errorMsg = `Failed to create building: ${error.message || error.toString()}`;
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    }
  };


  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const buildingNumber = data.building_number;
      const newValue = event.newValue;

      console.log(`[UPDATE] Attempting to update building ${buildingNumber}, field: ${field}, value:`, newValue);

      if (field === 'tax_region') {
        const validation = await buildingValidators.validateTaxRegion(newValue);
        if (!validation.valid) {
          setError(validation.error || 'Invalid tax region');
          setTimeout(() => setError(null), 3000);
          await fetchBuildings(false);
          return;
        }
      } else if (field === 'total_area_for_control' || field === 'shared_area') {
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

      console.log('[UPDATE] Sending update data:', updateData);
      await api.buildings.update(buildingNumber, updateData);
      console.log('[UPDATE] Update successful');
      await fetchBuildings(false);
    } catch (error: any) {
      console.error('[UPDATE ERROR] Full error object:', error);
      console.error('[UPDATE ERROR] Error message:', error.message);
      console.error('[UPDATE ERROR] Error details:', error.details);
      console.error('[UPDATE ERROR] Error hint:', error.hint);
      console.error('[UPDATE ERROR] Error code:', error.code);
      const errorMsg = `Failed to update building: ${error.message || error.toString()}`;
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
      await fetchBuildings(false);
    }
  }, [fetchBuildings]);

  const columnDefs: ColDef<Building>[] = useMemo(() => [
    {
      headerName: '',
      width: 50,
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
          if (hasAreaDiscrepancy) errors.push(t('areaMismatch'));
          if (hasTaxRegionError) errors.push(t('invalidTaxRegion'));

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
      editable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectBuilding(params.data.building_number, params.data.tax_region)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewAssets')}
          </button>
        );
      }
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      flex: 1.5,
      editable: false,
      valueParser: (params) => {
        const val = params.newValue;
        if (val == null || val === '') return null;
        const num = typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val;
        return isNaN(num) ? null : num;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: t('taxRegion'),
      flex: 1,
      editable: true,
      valueFormatter: (params) => params.value != null ? params.value : '',
      valueParser: (params) => {
        const val = params.newValue;
        if (val == null || val === '') return null;
        return val.toString().trim();
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_assets',
      headerName: t('totalUnits'),
      flex: 1,
      editable: false,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_building_area',
      headerName: t('totalBuildingArea'),
      flex: 1.5,
      editable: false,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_area_for_control',
      headerName: t('totalAreaForControl'),
      flex: 1.5,
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'shared_area',
      headerName: 'שטח משותף',
      flex: 1.5,
      editable: true,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'has_elevator',
      headerName: 'מעלית',
      flex: 1,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['true', 'false']
      },
      valueFormatter: (params) => params.value ? 'כן' : 'לא',
      valueParser: (params) => {
        if (params.newValue === 'true' || params.newValue === true) return true;
        if (params.newValue === 'false' || params.newValue === false) return false;
        return params.newValue;
      },
      cellStyle: { textAlign: 'right' }
    }
  ], [onSelectBuilding, t, invalidTaxRegions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
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
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-3">
          <div className="flex items-center gap-2">
            <img src="/buildings.png" alt="Buildings" className="w-8 h-8 bg-white rounded-lg p-1.5" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{t('propertyListings')}</h1>
              <p className="text-xs sm:text-sm text-teal-50">{t('browseBuildings')}</p>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="relative max-w-xs">
            <input
              type="text"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              placeholder={t('searchByBuildingNumber')}
              className="w-full px-3 py-1.5 pr-9 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right text-sm"
            />
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%' }}>
            <AgGridReact
              ref={gridRef}
              rowData={filteredBuildings}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                minWidth: 100,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                cellStyle: { textAlign: 'right' }
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={(params) => {
                params.api.autoSizeAllColumns();
              }}
              onFirstDataRendered={(params) => {
                const lastCol = params.api.getAllDisplayedColumns().slice(-1)[0];
                if (lastCol) {
                  params.api.ensureColumnVisible(lastCol);
                }
                params.api.autoSizeAllColumns();
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = gridElement.scrollWidth;
                  }
                }, 100);
              }}
              domLayout="normal"
              suppressHorizontalScroll={false}
              enableRtl={true}
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
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Create New Building</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Building Number *
                </label>
                <input
                  type="number"
                  value={newBuilding.building_number}
                  onChange={(e) => setNewBuilding(prev => ({ ...prev, building_number: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Enter building number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tax Region (comma-separated for multiple zones)
                </label>
                <input
                  type="text"
                  value={newBuilding.tax_region}
                  onChange={(e) => setNewBuilding(prev => ({ ...prev, tax_region: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., 1 or 1,2,3"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewBuilding({ building_number: '', tax_region: '' });
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBuilding}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
