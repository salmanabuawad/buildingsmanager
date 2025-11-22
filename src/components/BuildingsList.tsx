import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Tag, Search, AlertCircle, Plus, Settings, Upload, Building2, Loader2, Eye, Save, X, Trash2 } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';

interface BuildingsListProps {
  onSelectBuilding: (buildingNumber: number, taxRegions?: string) => void;
  onOpenAssetTypes?: () => void;
  onOpenAssetSearch?: () => void;
  onOpenValidationRules?: () => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
}

export function BuildingsList({ onSelectBuilding, onOpenAssetTypes, onOpenAssetSearch, onOpenValidationRules, showCreateModal, setShowCreateModal }: BuildingsListProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const [newBuilding, setNewBuilding] = useState({ building_number: '', tax_region: '' });
  const gridRef = useRef<AgGridReact<Building>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'buildings_list_column_state');
  const [dirtyBuildings, setDirtyBuildings] = useState<Map<number, Partial<Building>>>(new Map());
  const [originalBuildings, setOriginalBuildings] = useState<Building[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<number, Record<string, string>>>(new Map());
  const [buildingsToDelete, setBuildingsToDelete] = useState<Set<number>>(new Set());

  const fetchBuildings = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      console.log('[BuildingsList] Fetching buildings at', new Date().toISOString());
      const data = await api.buildings.getAll();
      console.log('[BuildingsList] Received buildings:', data);
      setBuildings(data || []);
      setOriginalBuildings(JSON.parse(JSON.stringify(data || [])));
      setFilteredBuildings(data || []);
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

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.redrawRows();
    }
  }, [invalidTaxRegions]);



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
        has_elevator: false,
        elevator: undefined
      });
      console.log('[CREATE] Building created successfully');

      if (taxRegion) {
        const isInvalid = await buildingValidators.checkTaxRegionInvalid(taxRegion);
        if (isInvalid) {
          setInvalidTaxRegions(prev => new Set(prev).add(buildingNumber));
        }
      }

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
    const { data, colDef } = event;
    const field = colDef.field;
    const buildingNumber = data.building_number;
    const newValue = event.newValue;

    console.log(`[CELL CHANGED] Building ${buildingNumber}, field: ${field}, value:`, newValue);

    // Update local state first
    setBuildings(prevBuildings => {
      return prevBuildings.map(b =>
        b.building_number === buildingNumber ? { ...b, [field]: newValue } : b
      );
    });

    // Update the dirty tracking
    setDirtyBuildings(prev => {
      const next = new Map(prev);
      const existingChanges = next.get(buildingNumber) || {};
      next.set(buildingNumber, { ...existingChanges, [field]: newValue });
      return next;
    });

    // Create updated building object with the new value
    const updatedBuilding = { ...data, [field]: newValue };

    // Validate all fields for this row
    console.log('[VALIDATION] Running all field validations for building:', buildingNumber);
    const validation = await buildingValidators.validateAllFields(updatedBuilding);

    // Store validation errors for this row
    setValidationErrors(prev => {
      const next = new Map(prev);
      if (!validation.valid) {
        console.log('[VALIDATION] Validation failed:', validation.errors);
        next.set(buildingNumber, validation.errors);
      } else {
        console.log('[VALIDATION] All validations passed');
        next.delete(buildingNumber);
      }
      return next;
    });

    // Update tax region validation state
    if (field === 'tax_region') {
      console.log('[VALIDATION] Validating tax_region for building:', buildingNumber, 'value:', newValue);
      const isInvalid = await buildingValidators.checkTaxRegionInvalid(newValue);
      console.log('[VALIDATION] Validation result for building', buildingNumber, ':', isInvalid ? 'INVALID' : 'VALID');
      setInvalidTaxRegions(prev => {
        const next = new Set(prev);
        if (isInvalid) {
          console.log('[VALIDATION] Adding building', buildingNumber, 'to invalid set');
          next.add(buildingNumber);
        } else {
          console.log('[VALIDATION] Removing building', buildingNumber, 'from invalid set');
          next.delete(buildingNumber);
        }
        console.log('[VALIDATION] New invalid set:', Array.from(next));
        return next;
      });
    }

    // Refresh grid to show updated validation state
    if (gridRef.current?.api) {
      console.log('[VALIDATION] Refreshing grid cell');
      gridRef.current.api.refreshCells({ rowNodes: [event.node], force: true });
    }
  }, []);

  const handleSaveAll = async () => {
    if (dirtyBuildings.size === 0) return;

    // Check if there are any validation errors (skip for buildings marked for deletion)
    const nonDeletedErrors = new Map();
    for (const [buildingNumber, errors] of validationErrors.entries()) {
      if (!buildingsToDelete.has(buildingNumber)) {
        nonDeletedErrors.set(buildingNumber, errors);
      }
    }

    if (nonDeletedErrors.size > 0) {
      const errorMessages: string[] = [];
      for (const [buildingNumber, errors] of nonDeletedErrors.entries()) {
        const fieldErrors = Object.entries(errors)
          .map(([field, msg]) => `${field}: ${msg}`)
          .join(', ');
        errorMessages.push(`Building ${buildingNumber}: ${fieldErrors}`);
      }
      setError(`Cannot save. Please fix validation errors: ${errorMessages.join('; ')}`);
      setTimeout(() => setError(null), 8000);
      return;
    }

    setLoading(true);
    try {
      // Process deletions first
      for (const buildingNumber of buildingsToDelete) {
        // Delete all assets for this building first
        await api.deleteAssetsByBuilding(buildingNumber);
        // Delete the building
        await api.deleteBuilding(buildingNumber);
      }

      // Process updates for non-deleted buildings
      for (const [buildingNumber, changes] of dirtyBuildings.entries()) {
        if (!buildingsToDelete.has(buildingNumber)) {
          await api.buildings.update(buildingNumber, changes);
        }
      }

      setDirtyBuildings(new Map());
      setValidationErrors(new Map());
      setBuildingsToDelete(new Set());
      await fetchBuildings(false);
      setError(null);
    } catch (error: any) {
      const errorMsg = `Failed to save changes: ${error.message || error.toString()}`;
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAll = async () => {
    setBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    setFilteredBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    setDirtyBuildings(new Map());
    setValidationErrors(new Map());
    setBuildingsToDelete(new Set());
    setError(null);

    const newInvalidSet = new Set<number>();
    for (const building of originalBuildings) {
      if (building.tax_region) {
        const isInvalid = await buildingValidators.checkTaxRegionInvalid(building.tax_region);
        if (isInvalid) {
          newInvalidSet.add(building.building_number);
        }
      }
    }
    setInvalidTaxRegions(newInvalidSet);

    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }

    // Scroll to left after cancel
    setTimeout(() => {
      const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
      if (gridElement) {
        gridElement.scrollLeft = 0;
      }
    }, 100);
  };

  const handleDeleteBuilding = useCallback((buildingNumber: number) => {
    const isCurrentlyMarked = buildingsToDelete.has(buildingNumber);

    setBuildingsToDelete(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyMarked) {
        // Cancel deletion mark
        newSet.delete(buildingNumber);
      } else {
        // Add deletion mark
        newSet.add(buildingNumber);
      }
      return newSet;
    });

    // Toggle dirty state
    setDirtyBuildings(prev => {
      const newMap = new Map(prev);
      if (isCurrentlyMarked) {
        // Remove from dirty if canceling deletion
        newMap.delete(buildingNumber);
      } else {
        // Mark as dirty for deletion
        newMap.set(buildingNumber, { deleted: true, deleted_at: new Date().toISOString() });
      }
      return newMap;
    });
  }, [buildingsToDelete]);

  const columnDefs: ColDef<Building>[] = useMemo(() => [
    {
      colId: 'actions',
      headerName: 'פעולות',
      editable: false,
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressSizeToFit: true,
      suppressMenu: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const hasTaxRegionError = invalidTaxRegions.has(building.building_number);
        const markedForDeletion = buildingsToDelete.has(building.building_number);

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {hasTaxRegionError && (
                <span title={t('invalidTaxRegion')} className="flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </span>
              )}
            </div>
            <button
              onClick={() => onSelectBuilding(params.data.building_number, params.data.tax_region)}
              className="p-1 text-teal-600 hover:text-teal-700 transition-colors hover:scale-110"
              title={t('viewAssets')}
            >
              <Eye className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteBuilding(building.building_number)}
              className={`p-1 transition-colors hover:scale-110 ${
                markedForDeletion
                  ? 'text-red-800 bg-red-100 rounded'
                  : 'text-red-600 hover:text-red-700'
              }`}
              title={markedForDeletion ? 'מסומן למחיקה' : 'מחק בניין'}
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: 'מספר בניין',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['building_number'];
        const value = params.value != null ? String(params.value) : '';

        if (errorMsg) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{value}</span>
            </div>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasError = errors && errors['building_number'];
        return {
          textAlign: 'right',
          border: hasError ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      editable: true,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['tax_region'];
        const value = params.value != null ? params.value : '';

        if (errorMsg) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{value}</span>
            </div>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasError = errors && errors['tax_region'];
        return {
          textAlign: 'right',
          border: hasError ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'shared_area',
      headerName: 'שטח משותף',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['shared_area'];
        const value = params.value ? params.value.toLocaleString() : '';

        if (errorMsg) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{value}</span>
            </div>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasError = errors && errors['shared_area'];
        return {
          textAlign: 'right',
          border: hasError ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'total_building_area',
      headerName: 'ס"כ גודל',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasAreaMismatch = errors && errors['area_for_control'];
        const value = params.value ? params.value.toLocaleString() : '0';

        if (hasAreaMismatch) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={hasAreaMismatch} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{value}</span>
            </div>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasAreaMismatch = errors && errors['area_for_control'];
        return {
          textAlign: 'right',
          backgroundColor: '#f0f9ff',
          fontWeight: '600',
          border: hasAreaMismatch ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'area_for_control',
      headerName: 'שטח לבקרה',
      editable: (params) => {
        const building = params.data as Building;
        return !buildingsToDelete.has(building.building_number);
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['area_for_control'];
        const value = params.value ? params.value.toLocaleString() : '';

        if (errorMsg) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{value}</span>
            </div>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasError = errors && errors['area_for_control'];
        return {
          textAlign: 'right',
          border: hasError ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'elevator',
      headerName: 'מעלית',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['elevator'];
        const markedForDeletion = buildingsToDelete.has(building.building_number);

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '100%' }}>
            {errorMsg && (
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
            )}
            <input
              type="checkbox"
              checked={params.value === 'כן' || params.value === true}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : '';
                params.node.setDataValue('elevator', newValue);
              }}
              className={`w-5 h-5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        const errors = validationErrors.get(building.building_number);
        const hasError = errors && errors['elevator'];
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: hasError ? '2px solid #dc2626' : undefined
        };
      }
    },
    {
      field: 'single_double_family',
      headerName: 'בית פרטי חד משפחתי דו משפחתי',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const markedForDeletion = buildingsToDelete.has(building.building_number);
        const isChecked = params.value === 'כן' || params.value === true;

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : '';
                params.node.setDataValue('single_double_family', newValue);
              }}
              className={`w-5 h-5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
    {
      field: 'condo',
      headerName: 'בית משותף',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const markedForDeletion = buildingsToDelete.has(building.building_number);
        const isChecked = params.value === 'כן' || params.value === true;

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : '';
                params.node.setDataValue('condo', newValue);
              }}
              className={`w-5 h-5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
    {
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const markedForDeletion = buildingsToDelete.has(building.building_number);
        const isChecked = params.value === 'כן' || params.value === true;

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : '';
                params.node.setDataValue('penthouse', newValue);
              }}
              className={`w-5 h-5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
    {
      field: 'townhouses',
      headerName: 'בניינים צמודי קרקע טוריים מעל 2 יחידות',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const markedForDeletion = buildingsToDelete.has(building.building_number);
        const isChecked = params.value === 'כן' || params.value === true;

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : '';
                params.node.setDataValue('townhouses', newValue);
              }}
              className={`w-5 h-5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }
  ], [onSelectBuilding, handleDeleteBuilding, buildingsToDelete, t, invalidTaxRegions, validationErrors]);

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
      <div className="w-full px-4 sm:px-6 py-4">
        <div className="mb-4 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-4">
          <div className="flex items-center gap-3">
            <img src="/buildings.png" alt="Buildings" className="w-8 h-8 bg-white rounded-lg p-1.5 shadow-sm" />
            <div className="flex items-center gap-4">
              <h1 className="text-xl sm:text-2xl font-bold text-white">{t('propertyListings')}</h1>
              <span className="text-sm text-teal-50 bg-white/20 px-3 py-1 rounded-lg font-semibold">
                <span className="font-semibold">סה"כ בניינים:</span> {buildings.length}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative max-w-xs">
            <input
              type="text"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              placeholder={t('searchByBuildingNumber')}
              className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right text-sm shadow-sm hover:shadow-md transition-shadow"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="mb-4 flex justify-end gap-3">
          <button
            onClick={handleCancelAll}
            disabled={loading || dirtyBuildings.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <X className="h-4 w-4" />
            {t('cancel')}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={loading || dirtyBuildings.size === 0 || invalidTaxRegions.size > 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {loading ? t('saving') : `${t('saveAll')}${dirtyBuildings.size > 0 ? ` (${dirtyBuildings.size})` : ''}`}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 w-full">
          <div className="ag-theme-alpine buildings-list-grid" style={{ height: '60vh', width: '100%', minWidth: '100%' }}>
            <AgGridReact
              ref={gridRef}
              rowData={filteredBuildings}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
                cellStyle: { textAlign: 'right', fontSize: '16px' },
                headerClass: 'buildings-list-header',
                headerStyle: { fontSize: '10px', textAlign: 'left' }
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={async (params) => {
                // Load saved column state first
                const hasSavedState = await loadColumnState();
                
                // If no saved state, apply default sizing
                if (!hasSavedState) {
                  // Wait for grid to fully render
                  setTimeout(() => {
                    const allColumnIds = params.api.getAllDisplayedColumns()
                      .map(col => col.getColId())
                      .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                    
                    if (allColumnIds.length > 0) {
                      // Auto-size columns based on content
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 100);
                }

                // Ensure actions column is always pinned and in correct position
                setTimeout(() => {
                  const columnState = params.api.getColumnState();
                  const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                  if (actionsCol) {
                    params.api.applyColumnState({
                      state: [{
                        ...actionsCol,
                        colId: 'actions',
                        pinned: 'right',
                        lockPosition: true,
                        lockPinned: true
                      }],
                      defaultState: { pinned: null }
                    });
                  }
                }, 150);

                // Scroll to left on grid ready
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              onFirstDataRendered={async (params) => {
                // Load saved column state if not already loaded
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  
                  // If no saved state, apply default sizing
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                      
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                }
              }}
              onColumnResized={saveColumnState}
              onColumnMoved={(params) => {
                // Prevent actions column from being moved - force it back to first position
                const actionsColumn = params.columnApi.getColumn('actions');
                if (actionsColumn) {
                  const allColumns = params.columnApi.getAllColumns() || [];
                  const actionsIndex = allColumns.findIndex(col => col.getColId() === 'actions');
                  if (actionsIndex !== 0) {
                    // Actions column was moved, force it back to first position
                    setTimeout(() => {
                      if (gridRef.current?.api) {
                        const columnState = gridRef.current.api.getColumnState();
                        const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                        const otherCols = columnState.filter((col: any) => col.colId !== 'actions');
                        if (actionsCol) {
                          gridRef.current.api.applyColumnState({
                            state: [{ ...actionsCol, pinned: 'right', lockPosition: true }, ...otherCols],
                            applyOrder: true
                          });
                        }
                      }
                    }, 0);
                    return;
                  }
                }
                saveColumnState();
              }}
              onSortChanged={saveColumnState}
              onFirstDataRendered={async (params) => {
                // Load saved column state if not already loaded
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  
                  // If no saved state, apply default sizing
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                      
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                }

                // Scroll to left after data render
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              domLayout="normal"
              suppressHorizontalScroll={false}
              enableRtl={true}
              rowClass="ag-row"
              getRowStyle={(params) => {
                const building = params.data as Building;
                const hasTaxRegionError = invalidTaxRegions.has(building.building_number);
                const markedForDeletion = buildingsToDelete.has(building.building_number);

                if (markedForDeletion) {
                  return {
                    background: '#fee2e2',
                    textDecoration: 'line-through',
                    opacity: 0.6
                  };
                }

                if (hasTaxRegionError) {
                  return {
                    border: '3px solid #ef4444',
                    borderRadius: '4px',
                    background: '#fee2e2'
                  };
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
