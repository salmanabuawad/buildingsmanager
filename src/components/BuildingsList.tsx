import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Search, AlertCircle, Plus, Loader2, Eye, Save, X, Trash2 } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';

interface BuildingsListProps {
  onSelectBuilding: (buildingNumber: number, taxRegions?: string) => void;
  onOpenAssetTypes?: () => void;
  onOpenAssetSearch?: () => void;
  onOpenValidationRules?: () => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
}

export function BuildingsList({ 
  onSelectBuilding, 
  onOpenAssetTypes, 
  onOpenAssetSearch, 
  onOpenValidationRules, 
  showCreateModal, 
  setShowCreateModal 
}: BuildingsListProps) {
  const { t } = useTranslation();
  
  // State management
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const [newBuilding, setNewBuilding] = useState({ building_number: '', tax_region: '' });
  
  // Change tracking
  const [dirtyBuildings, setDirtyBuildings] = useState<Map<number, Partial<Building>>>(new Map());
  const [originalBuildings, setOriginalBuildings] = useState<Building[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<number, Record<string, string>>>(new Map());
  const [buildingsToDelete, setBuildingsToDelete] = useState<Set<number>>(new Set());
  const [newBuildings, setNewBuildings] = useState<Set<number>>(new Set());
  
  // Grid reference and preferences
  const gridRef = useRef<AgGridReact<Building>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'buildings_list_column_state');

  // Calculate total changes: new buildings count as 1 each, even if edited
  const totalChanges = useMemo(() => {
    const newBuildingsCount = newBuildings.size;
    let editedExistingBuildings = 0;
    for (const buildingNumber of dirtyBuildings.keys()) {
      if (!newBuildings.has(buildingNumber) && buildingNumber >= 0) {
        editedExistingBuildings++;
      }
    }
    const deletedCount = buildingsToDelete.size;
    return newBuildingsCount + editedExistingBuildings + deletedCount;
  }, [newBuildings, dirtyBuildings, buildingsToDelete]);

  // Fetch buildings from API
  const fetchBuildings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await api.buildings.getAll();
      
      // Preserve new buildings that haven't been saved yet (failed saves remain visible)
      setBuildings(prevBuildings => {
        const existingNewBuildings = prevBuildings.filter(b => newBuildings.has(b.building_number));
        const mergedBuildings = [...(data || []), ...existingNewBuildings];
        setFilteredBuildings(mergedBuildings);
        return mergedBuildings;
      });
      
      setOriginalBuildings(JSON.parse(JSON.stringify(data || [])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buildings');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildings(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter buildings by building number
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

  // Handle cell value changes
  const onCellValueChanged = useCallback(async (event: any) => {
    // Safety checks
    if (!event || !event.data || !event.colDef) {
      console.warn('[CELL CHANGED] Invalid event data, skipping');
      return;
    }

    const { data, colDef } = event;
    const field = colDef?.field;
    const buildingNumber = data?.building_number;
    const newValue = event.newValue;

    if (!field || buildingNumber === undefined || buildingNumber === null) {
      return;
    }

    // Skip checkbox fields - they're handled by cellRenderer
    if (['elevator', 'single_double_family', 'condo', 'townhouses'].includes(field)) {
      return;
    }

    // Prevent AG-Grid from randomly updating building_number for existing buildings
    if (field === 'building_number' && buildingNumber >= 0 && !newBuildings.has(buildingNumber)) {
      if (event.node && typeof event.node.setDataValue === 'function') {
        event.node.setDataValue('building_number', buildingNumber);
      }
      return;
    }

    // Prevent invalid building_number values
    if (field === 'building_number') {
      const isNewBuilding = buildingNumber < 0 || newBuildings.has(buildingNumber);
      if (isNewBuilding) {
        if (newValue !== null && newValue !== undefined && newValue !== '') {
          const numValue = Number(newValue);
          if (isNaN(numValue) || numValue <= 0) {
            if (event.node && typeof event.node.setDataValue === 'function') {
              event.node.setDataValue('building_number', buildingNumber);
            }
            return;
          }
        }
      } else {
        if (event.node && typeof event.node.setDataValue === 'function') {
          event.node.setDataValue('building_number', buildingNumber);
        }
        return;
      }
    }

    // Special handling for building_number changes in new buildings
    const isNewBuilding = buildingNumber < 0 || newBuildings.has(buildingNumber);
    let newBuildingNumber = buildingNumber;
    
    if (field === 'building_number' && isNewBuilding && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
      const newValueNum = Number(newValue);
      setNewBuildings(prev => {
        const next = new Set(prev);
        next.delete(buildingNumber);
        next.add(newValueNum);
        return next;
      });
      setDirtyBuildings(prev => {
        const next = new Map(prev);
        const existingChanges = next.get(buildingNumber) || {};
        const mergedChanges = { ...existingChanges, [field]: newValue };
        next.delete(buildingNumber);
        next.set(newValueNum, mergedChanges);
        return next;
      });
      newBuildingNumber = newValueNum;
    }

    // Update local state
    setBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        if (b.building_number === buildingNumber) {
          const updated = { ...b, [field]: newValue };
          if (field === 'building_number' && isNewBuilding && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
            updated.building_number = Number(newValue);
          }
          return updated;
        }
        return b;
      });
    });
    setFilteredBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        if (b.building_number === buildingNumber) {
          const updated = { ...b, [field]: newValue };
          if (field === 'building_number' && isNewBuilding && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
            updated.building_number = Number(newValue);
          }
          return updated;
        }
        return b;
      });
    });

    // Update dirty tracking
    const hasMeaningfulValue = newValue !== null && newValue !== undefined && newValue !== '';
    if (field !== 'building_number' || !isNewBuilding) {
      if (!isNewBuilding || hasMeaningfulValue) {
        setDirtyBuildings(prev => {
          const next = new Map(prev);
          const existingChanges = next.get(newBuildingNumber) || {};
          if (hasMeaningfulValue) {
            next.set(newBuildingNumber, { ...existingChanges, [field]: newValue });
          } else {
            const updatedChanges = { ...existingChanges };
            delete updatedChanges[field];
            if (Object.keys(updatedChanges).length > 0) {
              next.set(newBuildingNumber, updatedChanges);
            } else {
              next.delete(newBuildingNumber);
            }
          }
          return next;
        });
      }
    }

    // Validate all fields
    const updatedBuilding = { ...data, [field]: newValue };
    const validation = await buildingValidators.validateAllFields(updatedBuilding);

    setValidationErrors(prev => {
      const next = new Map(prev);
      if (!validation.valid) {
        next.set(buildingNumber, validation.errors);
      } else {
        next.delete(buildingNumber);
      }
      return next;
    });

    // Update tax region validation state
    if (field === 'tax_region') {
      const isInvalid = await buildingValidators.checkTaxRegionInvalid(newValue);
      setInvalidTaxRegions(prev => {
        const next = new Set(prev);
        if (isInvalid) {
          next.add(buildingNumber);
        } else {
          next.delete(buildingNumber);
        }
        return next;
      });
    }

    // Refresh grid
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ rowNodes: [event.node], force: true });
    }
  }, [newBuildings]);

  // Add empty building row
  const addEmptyBuildingRow = () => {
    const tempId = -Date.now();
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
    setNewBuildings(prev => new Set(prev).add(tempId));

    setTimeout(() => {
      if (gridRef.current) {
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.setFocusedCell(0, 'building_number');
        gridRef.current.api.startEditingCell({ rowIndex: 0, colKey: 'building_number' });
      }
    }, 100);
  };

  // Save all changes
  const handleSaveAll = async () => {
    if (dirtyBuildings.size === 0 && buildingsToDelete.size === 0 && newBuildings.size === 0) return;

    // Check validation errors
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
    setError(null);
    
    try {
      let savedCount = 0;
      let deletedCount = 0;
      const errors: string[] = [];
      const successfullyDeleted = new Set<number>();
      const successfullySaved = new Set<number>();

      // Process deletions
      for (const buildingNumber of buildingsToDelete) {
        try {
          if (newBuildings.has(buildingNumber)) {
            deletedCount++;
            successfullyDeleted.add(buildingNumber);
            continue;
          }
          await api.deleteAssetsByBuilding(buildingNumber);
          await api.deleteBuilding(buildingNumber);
          deletedCount++;
          successfullyDeleted.add(buildingNumber);
        } catch (err) {
          const building = buildings.find(b => b.building_number === buildingNumber);
          const buildingIdent = building?.building_number || buildingNumber;
          errors.push(`מבנה ${buildingIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      }

      // Collect buildings to save
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

      // Process saves
      for (const buildingNumber of allBuildingsToSave) {
        try {
          let building = buildings.find(b => b.building_number === buildingNumber);
          
          if (!building && newBuildings.has(buildingNumber)) {
            building = buildings.find(b => b.building_number === buildingNumber);
            if (!building) {
              building = buildings.find(b => {
                if (b.building_number < 0) {
                  const tempIdChanges = dirtyBuildings.get(b.building_number);
                  if (tempIdChanges && tempIdChanges.building_number === buildingNumber) {
                    return true;
                  }
                }
                return false;
              });
            }
            if (!building) {
              building = buildings.find(b => newBuildings.has(b.building_number));
            }
          }
          
          if (!building) continue;

          const changes = dirtyBuildings.get(buildingNumber) || {};
          const isNewBuilding = newBuildings.has(buildingNumber) || buildingNumber < 0 || building.building_number < 0;

          if (isNewBuilding) {
            const finalBuilding = { ...building, ...changes };
            
            if (!finalBuilding.building_number || finalBuilding.building_number < 0) {
              errors.push(`מבנה חדש: מספר מבנה נדרש ו חייב להיות חיובי`);
              continue;
            }
            if (!finalBuilding.tax_region) {
              errors.push(`מבנה ${finalBuilding.building_number}: אזור מיסים נדרש`);
              continue;
            }

            const { building_number, tax_region, shared_area, shared_business_area, area_for_control, total_building_area, elevator, single_double_family, condo, townhouses } = finalBuilding;
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
            savedCount++;
            successfullySaved.add(buildingNumber);
          } else {
            const actualBuildingNumber = building.building_number;
            if (!actualBuildingNumber || actualBuildingNumber < 0) {
              errors.push(`מבנה ${buildingNumber}: לא ניתן לעדכן מבנה עם מספר מבנה לא תקין`);
              continue;
            }
            await api.buildings.update(actualBuildingNumber, changes);
            savedCount++;
            successfullySaved.add(buildingNumber);
          }
        } catch (err) {
          const building = buildings.find(b => b.building_number === buildingNumber);
          const buildingIdent = building?.building_number || buildingNumber;
          errors.push(`מבנה ${buildingIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Clear successfully processed buildings
      setDirtyBuildings(prev => {
        const next = new Map(prev);
        for (const buildingNumber of successfullySaved) {
          next.delete(buildingNumber);
        }
        return next;
      });
      setBuildingsToDelete(prev => {
        const next = new Set(prev);
        for (const buildingNumber of successfullyDeleted) {
          next.delete(buildingNumber);
        }
        return next;
      });
      setNewBuildings(prev => {
        const next = new Set(prev);
        for (const buildingNumber of successfullySaved) {
          next.delete(buildingNumber);
        }
        return next;
      });
      setValidationErrors(prev => {
        const next = new Map(prev);
        for (const buildingNumber of successfullySaved) {
          next.delete(buildingNumber);
        }
        for (const buildingNumber of successfullyDeleted) {
          next.delete(buildingNumber);
        }
        return next;
      });

      if (errors.length > 0) {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} מבנים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} מבנים`);
        setError(`${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        setError(null);
      }

      await fetchBuildings(false);
    } catch (error: any) {
      const errorMsg = `שגיאה בשמירה: ${error.message || error.toString()}`;
      console.error('[BuildingsList] Error saving changes:', error);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Cancel all changes
  const handleCancelAll = async () => {
    setBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    setFilteredBuildings(JSON.parse(JSON.stringify(originalBuildings)));
    setDirtyBuildings(new Map());
    setValidationErrors(new Map());
    setBuildingsToDelete(new Set());
    setNewBuildings(new Set());
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
      gridRef.current.api.refreshClientSideRowModel('filter');
    }

    setTimeout(() => {
      const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
      if (gridElement) {
        gridElement.scrollLeft = 0;
      }
    }, 100);
  };

  // Delete building handler
  const handleDeleteBuilding = useCallback((buildingNumber: number) => {
    const isCurrentlyMarked = buildingsToDelete.has(buildingNumber);
    setBuildingsToDelete(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyMarked) {
        newSet.delete(buildingNumber);
      } else {
        newSet.add(buildingNumber);
      }
      return newSet;
    });
    setDirtyBuildings(prev => {
      const newMap = new Map(prev);
      if (isCurrentlyMarked) {
        newMap.delete(buildingNumber);
      } else {
        newMap.set(buildingNumber, { deleted: true, deleted_at: new Date().toISOString() });
      }
      return newMap;
    });
  }, [buildingsToDelete]);

  // Helper function to get cell style
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

  // Handle checkbox change
  const handleCheckboxChange = (buildingNumber: number, field: string, newValue: string | null) => {
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
    setDirtyBuildings(prev => {
      const next = new Map(prev);
      const existing = next.get(buildingNumber) || {};
      next.set(buildingNumber, { ...existing, [field]: newValue });
      return next;
    });
    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  // Column definitions
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
        if (!params || !params.data) return false;
        const building = params.data as Building;
        if (!building || building.building_number === undefined || building.building_number === null) return false;
        return building.building_number < 0 || newBuildings.has(building.building_number);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        if (isNaN(numValue) || numValue <= 0) {
          return params.oldValue !== undefined 
            ? params.oldValue 
            : (params.data?.building_number !== undefined ? params.data.building_number : null);
        }
        return numValue;
      },
      cellRenderer: (params: any) => {
        if (!params || !params.data) return '';
        const building = params.data as Building;
        if (!building || building.building_number === undefined || building.building_number === null) return '';
        const isNewBuilding = building.building_number < 0 || newBuildings.has(building.building_number);
        const errors = validationErrors.get(building.building_number);
        const errorMsg = errors && errors['building_number'];
        const value = params.value != null ? String(params.value) : '';
        
        if (isNewBuilding && (params.value < 0 || params.value === null || params.value === undefined)) {
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
                params.node.setDataValue('elevator', newValue);
                handleCheckboxChange(building.building_number, 'elevator', newValue);
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
                params.node.setDataValue('single_double_family', newValue);
                handleCheckboxChange(building.building_number, 'single_double_family', newValue);
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
                params.node.setDataValue('condo', newValue);
                handleCheckboxChange(building.building_number, 'condo', newValue);
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
                params.node.setDataValue('townhouses', newValue);
                handleCheckboxChange(building.building_number, 'townhouses', newValue);
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
  ], [onSelectBuilding, handleDeleteBuilding, buildingsToDelete, t, invalidTaxRegions, validationErrors, dirtyBuildings, newBuildings]);

  // Handle create building modal
  const handleCreateBuilding = async () => {
    try {
      const buildingNumber = parseInt(newBuilding.building_number);
      const taxRegion = newBuilding.tax_region ? newBuilding.tax_region.trim() : null;

      if (isNaN(buildingNumber)) {
        setError('Invalid building number');
        setTimeout(() => setError(null), 3000);
        return;
      }

      await api.buildings.create({
        building_number: buildingNumber,
        tax_region: taxRegion,
        elevator: undefined
      });

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
      const errorMsg = `Failed to create building: ${error.message || error.toString()}`;
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    }
  };

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
              disabled={loading || totalChanges === 0}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={loading || totalChanges === 0 || invalidTaxRegions.size > 0}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {loading ? t('saving') : `${t('saveAll')}${totalChanges > 0 ? ` (${totalChanges})` : ''}`}
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
                const hasSavedState = await loadColumnState();
                if (!hasSavedState) {
                  setTimeout(() => {
                    const allColumnIds = params.api.getAllDisplayedColumns()
                      .map(col => col.getColId())
                      .filter(id => id !== 'actions');
                    if (allColumnIds.length > 0) {
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 100);
                }
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
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              onFirstDataRendered={async (params) => {
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'actions');
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                }
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              onColumnResized={saveColumnState}
              onColumnMoved={(params) => {
                const actionsColumn = params.columnApi.getColumn('actions');
                if (actionsColumn) {
                  const allColumns = params.columnApi.getAllColumns() || [];
                  const actionsIndex = allColumns.findIndex(col => col.getColId() === 'actions');
                  if (actionsIndex !== 0) {
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
