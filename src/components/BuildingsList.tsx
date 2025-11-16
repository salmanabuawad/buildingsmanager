import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Tag, Search, AlertCircle, Plus, Settings, Upload, Building2 } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface BuildingsListProps {
  onSelectBuilding: (buildingNumber: number) => void;
  onOpenAssetTypes?: () => void;
  onOpenAssetSearch?: () => void;
  onOpenDataEntry?: () => void;
  onOpenValidationRules?: () => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
  showImportModal: boolean;
  setShowImportModal: (show: boolean) => void;
}

export function BuildingsList({ onSelectBuilding, onOpenAssetTypes, onOpenAssetSearch, onOpenDataEntry, onOpenValidationRules, showCreateModal, setShowCreateModal, showImportModal, setShowImportModal }: BuildingsListProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const [newBuilding, setNewBuilding] = useState({ building_number: '', tax_region: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
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



  const handleCreateBuilding = async () => {
    try {
      const buildingNumber = parseInt(newBuilding.building_number);
      const taxRegion = newBuilding.tax_region ? parseInt(newBuilding.tax_region) : null;

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

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());

      const buildingNumberIdx = headers.findIndex(h => h.toLowerCase().includes('building'));
      const taxRegionIdx = headers.findIndex(h => h.toLowerCase().includes('tax'));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const buildingNumber = parseInt(values[buildingNumberIdx]);
        const taxRegion = taxRegionIdx >= 0 && values[taxRegionIdx] ? parseInt(values[taxRegionIdx]) : null;

        if (!isNaN(buildingNumber)) {
          try {
            console.log(`[CSV IMPORT] Creating building ${buildingNumber} with tax region ${taxRegion}`);
            await api.buildings.create({
              building_number: buildingNumber,
              tax_region: taxRegion,
              total_assets: 0,
              total_building_area: 0
            });
            console.log(`[CSV IMPORT] Successfully created building ${buildingNumber}`);
          } catch (err: any) {
            console.error(`[CSV IMPORT ERROR] Building ${buildingNumber}:`, err);
            console.error(`[CSV IMPORT ERROR] Message:`, err.message);
            console.error(`[CSV IMPORT ERROR] Details:`, err.details);
            console.error(`[CSV IMPORT ERROR] Hint:`, err.hint);
            console.error(`[CSV IMPORT ERROR] Code:`, err.code);
          }
        }
      }

      await fetchBuildings(false);
      setShowImportModal(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error importing CSV:', error);
      setError('Failed to import CSV');
      setTimeout(() => setError(null), 3000);
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
      field: 'building_number',
      headerName: t('buildingNumber'),
      flex: 1.5,
      sortable: true,
      filter: true,
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
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value != null ? params.value.toLocaleString() : '',
      valueParser: (params) => {
        const val = params.newValue;
        if (val == null || val === '') return null;
        const num = typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val;
        return isNaN(num) ? null : num;
      },
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
      field: 'total_area_for_control',
      headerName: t('totalAreaForControl'),
      flex: 1.5,
      sortable: true,
      filter: true,
      editable: true,
      valueFormatter: (params) => params.value?.toLocaleString(),
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
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3">
            <img src="/buildings.png" alt="Buildings" className="w-10 h-10 bg-white rounded-lg p-2" />
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t('propertyListings')}</h1>
              <p className="text-sm sm:text-base text-teal-50">{t('browseBuildings')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%' }}>
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
              onFirstDataRendered={(params) => {
                const lastCol = params.api.getAllDisplayedColumns().slice(-1)[0];
                if (lastCol) {
                  params.api.ensureColumnVisible(lastCol);
                }
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = gridElement.scrollWidth;
                  }
                }, 100);
              }}
              pagination={true}
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50, 100]}
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
                  Tax Region
                </label>
                <input
                  type="number"
                  value={newBuilding.tax_region}
                  onChange={(e) => setNewBuilding(prev => ({ ...prev, tax_region: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Enter tax region (optional)"
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

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Import Buildings from CSV</h2>

            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Select a CSV file containing building data. The file should include columns for building number and tax region.
              </p>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
