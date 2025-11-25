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
  const [newBuildings, setNewBuildings] = useState<Set<number>>(new Set()); // Track new buildings with temp IDs

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

    // Skip checkbox fields - they're handled by cellRenderer
    if (['elevator', 'single_double_family', 'condo', 'townhouses'].includes(field)) {
      return;
    }

    console.log(`[CELL CHANGED] Building ${buildingNumber}, field: ${field}, value:`, newValue);

    // Update local state first
    setBuildings(prevBuildings => {
      return prevBuildings.map(b =>
        b.building_number === buildingNumber ? { ...b, [field]: newValue } : b
      );
    });
    setFilteredBuildings(prevBuildings => {
      return prevBuildings.map(b =>
        b.building_number === buildingNumber ? { ...b, [field]: newValue } : b
      );
    });

    // Update the dirty tracking - only mark as dirty if value is meaningful
    // For new buildings, only mark dirty after user enters data (not on initial empty state)
    const isNewBuilding = buildingNumber < 0;
    const hasMeaningfulValue = newValue !== null && newValue !== undefined && newValue !== '';
    
    // For new buildings, only track changes if a meaningful value is entered
    // For existing buildings, track all changes
    if (!isNewBuilding || hasMeaningfulValue) {
      setDirtyBuildings(prev => {
        const next = new Map(prev);
        const existingChanges = next.get(buildingNumber) || {};
        if (hasMeaningfulValue) {
          next.set(buildingNumber, { ...existingChanges, [field]: newValue });
        } else {
          // Remove the field from dirty tracking if value is cleared
          const updatedChanges = { ...existingChanges };
          delete updatedChanges[field];
          if (Object.keys(updatedChanges).length > 0) {
            next.set(buildingNumber, updatedChanges);
          } else {
            next.delete(buildingNumber);
          }
        }
        return next;
      });
    }

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

  const addEmptyBuildingRow = () => {
    const tempId = -Date.now(); // Use negative timestamp as temp ID

    const newBuilding: Building = {
      building_number: tempId,
      tax_region: null,
      shared_area: null,
      shared_business_area: null,
      area_for_control: null,
      total_building_area: null,
      elevator: null,
      single_double_family: null,
      condo: null,
      townhouses: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setBuildings(prev => [newBuilding, ...prev]);
    setFilteredBuildings(prev => [newBuilding, ...prev]);
    setNewBuildings(prev => new Set(prev).add(tempId)); // Track the new building

    setTimeout(() => {
      if (gridRef.current) {
        // Refresh the grid to show the new row
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.setFocusedCell(0, 'building_number');
        gridRef.current.api.startEditingCell({ rowIndex: 0, colKey: 'building_number' });
      }
    }, 100);
  };

  const handleSaveAll = async () => {
    if (dirtyBuildings.size === 0 && buildingsToDelete.size === 0 && newBuildings.size === 0) return;

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
        // Skip deletion if it's a temp building (not saved to database yet)
        if (newBuildings.has(buildingNumber)) {
          continue;
        }
        // Delete all assets for this building first
        await api.deleteAssetsByBuilding(buildingNumber);
        // Delete the building
        await api.deleteBuilding(buildingNumber);
      }

      // Process new buildings and updates
      const allBuildingsToSave = new Set<number>();
      for (const [buildingNumber] of dirtyBuildings.entries()) {
        if (!buildingsToDelete.has(buildingNumber)) {
          allBuildingsToSave.add(buildingNumber);
        }
      }
      for (const newBuildingNumber of newBuildings) {
        if (!buildingsToDelete.has(newBuildingNumber)) {
          allBuildingsToSave.add(newBuildingNumber);
        }
      }

      for (const buildingNumber of allBuildingsToSave) {
        const building = buildings.find(b => b.building_number === buildingNumber);
        if (!building) continue;

        const changes = dirtyBuildings.get(buildingNumber) || {};
        const isNewBuilding = newBuildings.has(buildingNumber);

        if (isNewBuilding) {
          // Validate required fields for new buildings
          if (!building.building_number || building.building_number < 0) {
            setError('מספר מבנה נדרש ו חייב להיות חיובי');
            setLoading(false);
            return;
          }
          if (!building.tax_region) {
            setError(`מבנה ${building.building_number}: אזור מיסים נדרש`);
            setLoading(false);
            return;
          }

          // Create new building
          const { building_number, tax_region, shared_area, shared_business_area, area_for_control, total_building_area, elevator, single_double_family, condo, townhouses } = building;
          await api.buildings.create({
            building_number,
            tax_region,
            shared_area,
            shared_business_area,
            area_for_control,
            total_building_area,
            elevator,
            single_double_family,
            condo,
            townhouses
          });
        } else {
          // Update existing building
          await api.buildings.update(buildingNumber, changes);
        }
      }

      setDirtyBuildings(new Map());
      setValidationErrors(new Map());
      setBuildingsToDelete(new Set());
      setNewBuildings(new Set()); // Clear new buildings tracking
      setError(null); // Clear any previous errors on success
      await fetchBuildings(false);
    } catch (error: any) {
      const errorMsg = `שגיאה בשמירה: ${error.message || error.toString()}`;
      console.error('[BuildingsList] Error saving changes:', error);
      setError(errorMsg);
      // Don't clear error automatically - let user see it
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAll = async () => {
    // Simply restore original buildings (this automatically excludes new buildings)
    setBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    setFilteredBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    
    setDirtyBuildings(new Map());
    setValidationErrors(new Map());
    setBuildingsToDelete(new Set());
    setNewBuildings(new Set()); // Clear new buildings tracking
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

    // Force grid to update with new data
    if (gridRef.current?.api) {
      // Set the row data directly to ensure new buildings are removed
      gridRef.current.api.setRowData(JSON.parse(JSON.stringify(originalBuildings)));
      gridRef.current.api.refreshCells({ force: true });
      gridRef.current.api.refreshClientSideRowModel('filter');
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

  // Helper function to get cell style for dirty fields
  const getCellStyle = (params: any, fieldName: string) => {
    const building = params.data as Building;
    const errors = validationErrors.get(building.building_number);
    const hasError = errors && errors[fieldName];
    const isDirty = dirtyBuildings.has(building.building_number) && dirtyBuildings.get(building.building_number)?.hasOwnProperty(fieldName);
    return {
      textAlign: 'right',
      fontWeight: isDirty ? 'bold' : 'normal',
      border: hasError ? '2px solid #dc2626' : undefined
    };
  };

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
      suppressHeaderMenuButton: true,
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
              title={markedForDeletion ? 'מסומן למחיקה' : 'מחק מבנה'}
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: 'מספר מבנה *',
      editable: (params: any) => {
        // Editable only for new buildings (negative building_number)
        return params.data.building_number < 0;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const isNewBuilding = building.building_number < 0;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['building_number'];
        const value = params.value != null ? String(params.value) : '';
        
        // Show empty string for new buildings
        if (isNewBuilding && params.value < 0) {
          return '';
        }

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
      cellStyle: (params) => getCellStyle(params, 'building_number')
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      editable: true,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const isNewBuilding = building.building_number < 0;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['tax_region'];
        
        // Show blank for new buildings if value is null/undefined/empty
        if (isNewBuilding && (params.value === null || params.value === undefined || params.value === '')) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'tax_region')
    },
    {
      field: 'shared_area',
      headerName: 'שטח משותף מגורים',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const isNewBuilding = building.building_number < 0;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['shared_area'];
        
        // Show blank for new buildings or if value is null/undefined
        if (isNewBuilding && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'shared_area')
    },
    {
      field: 'shared_business_area',
      headerName: 'שטח משותף עסקים',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        const isNewBuilding = building.building_number < 0;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['shared_business_area'];
        
        // Show blank for new buildings or if value is null/undefined
        if (isNewBuilding && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'shared_business_area')
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
        const isNewBuilding = building.building_number < 0;
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['area_for_control'];
        
        // Show blank for new buildings or if value is null/undefined
        if (isNewBuilding && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'area_for_control')
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
                const newValue = e.target.checked ? 'כן' : null;
                const buildingNumber = building.building_number;
                
                // Update grid cell data directly
                params.node.setDataValue('elevator', newValue);
                
                // Update local state
                setBuildings(prevBuildings => {
                  return prevBuildings.map(b =>
                    b.building_number === buildingNumber ? { ...b, elevator: newValue } : b
                  );
                });
                setFilteredBuildings(prevBuildings => {
                  return prevBuildings.map(b =>
                    b.building_number === buildingNumber ? { ...b, elevator: newValue } : b
                  );
                });
                
                // Track the change in dirtyBuildings
                setDirtyBuildings(prev => {
                  const next = new Map(prev);
                  const existing = next.get(buildingNumber) || {};
                  next.set(buildingNumber, { ...existing, elevator: newValue });
                  return next;
                });
                
                // Refresh only this specific cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['elevator'],
                    force: true 
                  });
                }
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
                const newValue = e.target.checked ? 'כן' : null;
                const buildingNumber = building.building_number;
                
                // Update grid cell data directly
                params.node.setDataValue('single_double_family', newValue);
                
                // Track the change in dirtyBuildings
                setDirtyBuildings(prev => {
                  const next = new Map(prev);
                  const existing = next.get(buildingNumber) || {};
                  next.set(buildingNumber, { ...existing, single_double_family: newValue });
                  return next;
                });
                
                // Refresh only this specific cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['single_double_family'],
                    force: true 
                  });
                }
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
                const newValue = e.target.checked ? 'כן' : null;
                const buildingNumber = building.building_number;
                
                // Update grid cell data directly
                params.node.setDataValue('condo', newValue);
                
                // Track the change in dirtyBuildings
                setDirtyBuildings(prev => {
                  const next = new Map(prev);
                  const existing = next.get(buildingNumber) || {};
                  next.set(buildingNumber, { ...existing, condo: newValue });
                  return next;
                });
                
                // Refresh only this specific cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['condo'],
                    force: true 
                  });
                }
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
      headerName: 'מבנים צמודי קרקע טוריים מעל 2 יחידות',
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
                const newValue = e.target.checked ? 'כן' : null;
                const buildingNumber = building.building_number;
                
                // Update grid cell data directly
                params.node.setDataValue('townhouses', newValue);
                
                // Track the change in dirtyBuildings
                setDirtyBuildings(prev => {
                  const next = new Map(prev);
                  const existing = next.get(buildingNumber) || {};
                  next.set(buildingNumber, { ...existing, townhouses: newValue });
                  return next;
                });
                
                // Refresh only this specific cell
                if (gridRef.current) {
                  gridRef.current.api.refreshCells({ 
                    rowNodes: [params.node], 
                    columns: ['townhouses'],
                    force: true 
                  });
                }
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
  ], [onSelectBuilding, handleDeleteBuilding, buildingsToDelete, t, invalidTaxRegions, validationErrors, dirtyBuildings]);

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
      <div className="w-full px-2 sm:px-4 md:px-6 py-2 sm:py-4">
        <div className="mb-4 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <img src="/buildings.png" alt="Buildings" className="w-8 h-8 bg-white rounded-lg p-1.5 shadow-sm" />
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white">{t('propertyListings')}</h1>
              <span className="text-xs sm:text-sm text-teal-50 bg-white/20 px-2 sm:px-3 py-1 rounded-lg font-semibold">
                <span className="font-semibold">סה"כ מבנים:</span> {buildings.length}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative w-full sm:max-w-xs">
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

        <div className="mb-4 flex flex-col sm:flex-row justify-between gap-2 sm:gap-3">
          <div className="flex gap-2">
            <button
              onClick={addEmptyBuildingRow}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
            >
              <Plus className="h-4 w-4" />
              הוסף מבנה
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancelAll}
              disabled={loading || (dirtyBuildings.size === 0 && buildingsToDelete.size === 0 && newBuildings.size === 0)}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={loading || (dirtyBuildings.size === 0 && buildingsToDelete.size === 0 && newBuildings.size === 0) || invalidTaxRegions.size > 0}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {loading ? t('saving') : `${t('saveAll')}${dirtyBuildings.size + buildingsToDelete.size + newBuildings.size > 0 ? ` (${dirtyBuildings.size + buildingsToDelete.size + newBuildings.size})` : ''}`}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 w-full">
          <div className="ag-theme-alpine buildings-list-grid" style={{ height: 'calc(100vh - 300px)', minHeight: '400px', width: '100%', minWidth: '100%' }}>
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
                  Tax Region (comma-separated for multiple regions)
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

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-6">
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
