import React, { useEffect, useState, useMemo, useCallback, useRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, AddressList, api } from '../lib/api';
import { buildingValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellEditorParams } from 'ag-grid-community';
import { Search, AlertCircle, Plus, Loader2, Eye, Save, X, Trash2, CheckCircle2 } from 'lucide-react';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';

// Custom cell editor for address dropdown with filtering
interface AddressCellEditorParams extends ICellEditorParams {
  addressList: AddressList[];
}

const AddressCellEditor = React.forwardRef<any, AddressCellEditorParams>((props, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const selectedValueRef = useRef<number | null>(null);
  
  // Store a ref to the latest props.data to avoid closure issues
  const dataRef = useRef(props.data);
  useEffect(() => {
    dataRef.current = props.data;
  }, [props.data]);

  const { addressList = [] } = props;

  // Expose getValue method to AG Grid
  // Don't include props.data in dependencies to avoid recreating the function
  // Access props.data via ref to always get the latest value
  useImperativeHandle(ref, () => ({
    getValue: () => {
      // ALWAYS check the ref first - this is the source of truth
      let value = selectedValueRef.current;
      
      // If ref is null, try to get from data object as fallback
      const currentData = dataRef.current;
      if (value === null && currentData && currentData.building_address != null) {
        value = currentData.building_address;
        selectedValueRef.current = value; // Sync the ref
      }
      
      // If still null, try props.data directly (last resort)
      if (value === null && props.data && props.data.building_address != null) {
        value = props.data.building_address;
        selectedValueRef.current = value;
      }
      
      console.log('[AddressCellEditor] getValue() called:', {
        refValue: selectedValueRef.current,
        dataRefValue: currentData?.building_address,
        propsDataValue: props.data?.building_address,
        returning: value,
        hasDataRef: !!currentData,
        hasPropsData: !!props.data
      });
      
      // CRITICAL: If we have a value, ensure it's set in all data objects
      if (value !== null && value !== undefined) {
        if (currentData) {
          currentData.building_address = value;
        }
        if (props.data) {
          props.data.building_address = value;
        }
        console.log('[AddressCellEditor] Synced value to all data objects:', value);
      } else {
        console.error('[AddressCellEditor] getValue() returning NULL! This will cause the cell to be empty.');
      }
      
      return value;
    }
  }), [selectedValue, props.data]); // Include props.data to recreate when it changes

  // Initialize with current value
  useEffect(() => {
    const streetCode = props.value;
    if (streetCode != null) {
      setSelectedValue(streetCode);
      selectedValueRef.current = streetCode;
      const address = addressList.find(a => Number(a.street_code) === Number(streetCode));
      if (address) {
        setSearchValue(`${address.street_code} - ${address.street_description}`);
      } else {
        setSearchValue(String(streetCode));
      }
    } else {
      setSelectedValue(null);
      selectedValueRef.current = null;
      setSearchValue('');
    }
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Place cursor at end instead of selecting all, so user can type immediately
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }, 0);
  }, [addressList]); // Removed props.value from dependencies to prevent resetting after selection

  // Filter addresses based on search
  const filteredAddresses = useMemo(() => {
    if (!searchValue.trim()) {
      return addressList;
    }
    const searchLower = searchValue.toLowerCase();
    return addressList.filter(a => 
      String(a.street_code).includes(searchValue) ||
      a.street_description?.toLowerCase().includes(searchLower) ||
      `${a.street_code} - ${a.street_description}`.toLowerCase().includes(searchLower)
    );
  }, [searchValue, addressList]);

  // Handle input change - use useCallback to prevent duplicate handlers
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    setShowDropdown(true);
    setSelectedIndex(-1);
  }, []);
  
  // Handle keydown - only handle navigation, let browser handle all input
  const handleKeyDownForInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only handle navigation keys, let browser handle all printable characters
    handleKeyDown(e);
  };

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < filteredAddresses.length - 1 ? prev + 1 : prev
      );
      setShowDropdown(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
      setShowDropdown(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredAddresses.length) {
        selectAddress(filteredAddresses[selectedIndex]);
      } else if (filteredAddresses.length === 1) {
        selectAddress(filteredAddresses[0]);
      } else {
        // Try to parse as number and find match
        const parsed = Number(searchValue.trim());
        if (!isNaN(parsed) && parsed > 0) {
          const match = addressList.find(a => Number(a.street_code) === parsed);
          if (match) {
            selectAddress(match);
          } else {
            props.stopEditing();
          }
        } else {
          props.stopEditing();
        }
      }
    } else if (e.key === 'Escape') {
      props.stopEditing();
    }
  };

  // Select an address
  const selectAddress = (address: AddressList) => {
    const streetCode = address.street_code;
    const oldValue = props.value;
    
    console.log('[AddressCellEditor] Selecting address:', {
      streetCode,
      oldValue,
      currentRefValue: selectedValueRef.current
    });
    
    // CRITICAL: Set value in ref FIRST - this is what getValue() will return
    selectedValueRef.current = streetCode;
    setSelectedValue(streetCode);
    
    // Update data object immediately - use both props.data and dataRef
    if (props.data) {
      props.data.building_address = streetCode;
      console.log('[AddressCellEditor] Updated props.data.building_address to:', streetCode, 'verified:', props.data.building_address);
    }
    // Also update the ref to ensure consistency
    if (dataRef.current) {
      dataRef.current.building_address = streetCode;
      console.log('[AddressCellEditor] Updated dataRef.current.building_address to:', streetCode, 'verified:', dataRef.current.building_address);
    }
    
    // Close dropdown
    setShowDropdown(false);
    
    // Verify ref and data are set before stopping
    console.log('[AddressCellEditor] Before stopEditing - ref:', selectedValueRef.current, 'data:', props.data?.building_address, 'node:', props.node?.data?.building_address);
    
    // Use setDataValue BEFORE stopEditing to ensure value is set and dirty bit works
    if (props.node && props.column) {
      const colId = props.column.getColId();
      console.log('[AddressCellEditor] Calling setDataValue before stopEditing:', { colId, streetCode, oldValue });
      props.node.setDataValue(colId, streetCode);
    }
    
    // Stop editing - AG Grid will:
    // 1. Call getValue() which returns selectedValueRef.current (streetCode)
    // 2. Call valueSetter to update the data object (if value changed)
    // 3. Trigger onCellValueChanged (if value changed)
    props.stopEditing();
    
    // After stopEditing, use setDataValue to ensure the value is set on the node
    // This is a backup in case getValue()/valueSetter didn't work
    setTimeout(() => {
      if (props.node && props.column && props.api) {
        const colId = props.column.getColId();
        const currentValue = props.node.data?.building_address;
        if (currentValue !== streetCode) {
          console.log('[AddressCellEditor] Value mismatch after stopEditing, calling setDataValue:', { 
            colId, 
            expected: streetCode, 
            actual: currentValue 
          });
          props.node.setDataValue(colId, streetCode);
          // Refresh to ensure the cell updates
          props.api.refreshCells({ 
            rowNodes: [props.node], 
            columns: [colId], 
            force: true 
          });
        }
      }
    }, 10);
    
    // After stopEditing, verify the value was set correctly
    console.log('[AddressCellEditor] After stopEditing - ref:', selectedValueRef.current, 'data:', props.data?.building_address);
    
    // Force refresh to ensure cell displays the value
    setTimeout(() => {
      if (props.api && props.column && props.node) {
        const colId = props.column.getColId();
        const currentDataValue = props.data?.building_address;
        const nodeDataValue = props.node.data?.building_address;
        console.log('[AddressCellEditor] Refreshing cell:', { 
          colId, 
          streetCode,
          refValue: selectedValueRef.current,
          dataValue: currentDataValue,
          nodeDataValue: nodeDataValue
        });
        props.api.refreshCells({ 
          rowNodes: [props.node], 
          columns: [colId], 
          force: true 
        });
      }
    }, 100);
  };


  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        props.stopEditing();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <input
        ref={inputRef}
        key="address-editor-input"
        type="text"
        value={searchValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDownForInput}
        onFocus={() => {
          setShowDropdown(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          direction: 'rtl',
          textAlign: 'right'
        }}
      />
      {showDropdown && filteredAddresses.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            direction: 'rtl',
            textAlign: 'right'
          }}
        >
          {filteredAddresses.map((address, index) => (
            <div
              key={address.street_code}
              onClick={() => selectAddress(address)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: selectedIndex === index ? '#e3f2fd' : 'white',
                borderBottom: index < filteredAddresses.length - 1 ? '1px solid #eee' : 'none'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{address.street_code}</div>
              <div style={{ fontSize: '0.9em', color: '#666' }}>{address.street_description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

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
  const [success, setSuccess] = useState<string | null>(null);
  const [invalidTaxRegions, setInvalidTaxRegions] = useState<Set<number>>(new Set());
  const [newBuilding, setNewBuilding] = useState({ building_number: '', tax_region: '', building_address: null as number | null });
  const [addressSearchValue, setAddressSearchValue] = useState<string>('');
  const [showAddressDropdown, setShowAddressDropdown] = useState<boolean>(false);
  const [addressSelectedIndex, setAddressSelectedIndex] = useState<number>(-1);
  const [createModalClosing, setCreateModalClosing] = useState(false);
  const [addressList, setAddressList] = useState<AddressList[]>([]);
  
  // Tax region validation modal state
  const [taxRegionValidationModal, setTaxRegionValidationModal] = useState<{
    isOpen: boolean;
    buildingNumber: number;
    removedTaxRegions: number[];
    assetCount: number;
    oldTaxRegion: string | null | undefined;
    buildingKey: string | number;
  }>({
    isOpen: false,
    buildingNumber: 0,
    removedTaxRegions: [],
    assetCount: 0,
    oldTaxRegion: null,
    buildingKey: ''
  });

  // Track buildings with invalid tax region changes (for visual error indication)
  const [invalidTaxRegionBuildings, setInvalidTaxRegionBuildings] = useState<Set<string | number>>(new Set());
  
  // Change tracking - use tempId (string) for new buildings instead of negative numbers
  const [dirtyBuildings, setDirtyBuildings] = useState<Map<string | number, Partial<Building>>>(new Map());
  const [originalBuildings, setOriginalBuildings] = useState<Building[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<string | number, Record<string, string>>>(new Map());
  const [buildingsToDelete, setBuildingsToDelete] = useState<Set<string | number>>(new Set());
  const [newBuildings, setNewBuildings] = useState<Set<string | number>>(new Set());
  
  // Grid reference
  const gridRef = useRef<AgGridReact<Building>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'buildings-list',
    'default'
  );

  // Calculate total changes: new buildings count as 1 each, even if edited
  const totalChanges = useMemo(() => {
    const newBuildingsCount = newBuildings.size;
    let editedExistingBuildings = 0;
    for (const buildingKey of dirtyBuildings.keys()) {
      // If key is a string (tempId), it's a new building, skip it
      // If key is a number >= 0 and not in newBuildings and not marked for deletion, it's an existing building edit
      if (typeof buildingKey === 'number' && !newBuildings.has(buildingKey) && !buildingsToDelete.has(buildingKey) && buildingKey >= 0) {
        editedExistingBuildings++;
      }
    }
    const deletedCount = buildingsToDelete.size;
    return newBuildingsCount + editedExistingBuildings + deletedCount;
  }, [newBuildings, dirtyBuildings, buildingsToDelete]);

  // Check if there are any validation errors
  const hasValidationErrors = useMemo(() => {
    if (validationErrors.size === 0) return false;
    // Check if any building has errors
    for (const errors of validationErrors.values()) {
      if (errors && Object.keys(errors).length > 0) {
        return true;
      }
    }
    return false;
  }, [validationErrors]);

  // Fetch buildings from API
  const fetchBuildings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await api.buildings.getAll();
      
      // Preserve new buildings that haven't been saved yet (failed saves remain visible)
      setBuildings(prevBuildings => {
        const existingNewBuildings = prevBuildings.filter(b => {
          const key = b._tempId || b.building_number;
          return newBuildings.has(key);
        });
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
    // Load address list for building address dropdown
    const loadAddressList = async () => {
      try {
        const addresses = await api.addressList.getAll();
        setAddressList(addresses);
      } catch (err) {
        console.error('Error loading address list:', err);
      }
    };
    loadAddressList();
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

  // Helper function to check if building is new
  const isNewBuilding = useCallback((building: Building): boolean => {
    return !!(building._isNew || building._tempId);
  }, []);

  // Helper function to get building key for tracking
  const getBuildingKey = useCallback((building: Building): string | number => {
    return building._tempId || building.building_number;
  }, []);

  // Helper function to find building by key
  const findBuildingByKey = useCallback((key: string | number): Building | undefined => {
    return buildings.find(b => {
      const bKey = getBuildingKey(b);
      return bKey === key;
    });
  }, [buildings, getBuildingKey]);

  // Validate tax region removal - check if removing tax regions would orphan assets
  const validateTaxRegionRemoval = useCallback(async (
    buildingNumber: number,
    oldTaxRegions: string | null | undefined,
    newTaxRegions: string | null | undefined
  ): Promise<{ valid: boolean; removedTaxRegions: number[]; assetCount: number }> => {
    // Skip validation for new buildings (not yet saved)
    if (!buildingNumber || buildingNumber <= 0) {
      return { valid: true, removedTaxRegions: [], assetCount: 0 };
    }

    // Parse old and new tax regions
    const oldRegions: number[] = oldTaxRegions
      ? String(oldTaxRegions).split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r))
      : [];
    
    const newRegions: number[] = newTaxRegions
      ? String(newTaxRegions).split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r))
      : [];

    // Find removed tax regions
    const removedTaxRegions = oldRegions.filter(region => !newRegions.includes(region));

    // If no tax regions were removed, validation passes
    if (removedTaxRegions.length === 0) {
      return { valid: true, removedTaxRegions: [], assetCount: 0 };
    }

    // Fetch all assets for this building
    try {
      const assets = await api.assets.getAll(buildingNumber);
      
      // Count assets that have tax_region matching any of the removed tax regions
      const orphanedAssets = assets.filter(asset => {
        if (asset.tax_region == null) return false;
        const assetTaxRegion = typeof asset.tax_region === 'string' 
          ? parseInt(asset.tax_region, 10) 
          : asset.tax_region;
        return !isNaN(assetTaxRegion) && removedTaxRegions.includes(assetTaxRegion);
      });

      if (orphanedAssets.length > 0) {
        return {
          valid: false,
          removedTaxRegions,
          assetCount: orphanedAssets.length
        };
      }

      return { valid: true, removedTaxRegions: [], assetCount: 0 };
    } catch (error) {
      console.error('Error validating tax region removal:', error);
      // On error, allow the change (fail open to avoid blocking user)
      return { valid: true, removedTaxRegions: [], assetCount: 0 };
    }
  }, []);

  // Handle cell value changes
  const onCellValueChanged = useCallback(async (event: any) => {
    // Safety checks
    if (!event || !event.data || !event.colDef) {
      console.warn('[CELL CHANGED] Invalid event data, skipping');
      return;
    }

    const { data, colDef } = event;
    const field = colDef?.field;
    const building = data as Building;
    const buildingKey = getBuildingKey(building);
    const isNew = isNewBuilding(building);
    const newValue = event.newValue;

    // Debug log for building_address changes
    if (field === 'building_address') {
      console.log('[CELL CHANGED] building_address changed:', {
        oldValue: event.oldValue,
        newValue: newValue,
        buildingKey: buildingKey,
        building: building,
        dataBuildingAddress: building.building_address
      });
    }

    if (!field || !building) {
      return;
    }

    // Skip checkbox fields - they're handled by cellRenderer
    if (['elevator', 'single_double_family', 'condo', 'townhouses'].includes(field)) {
      return;
    }

    // Prevent AG-Grid from randomly updating building_number for existing buildings
    if (field === 'building_number' && !isNew) {
      if (event.node && typeof event.node.setDataValue === 'function') {
        event.node.setDataValue('building_number', building.building_number);
      }
      return;
    }

    // Prevent invalid building_number values
    if (field === 'building_number') {
      if (isNew) {
        if (newValue !== null && newValue !== undefined && newValue !== '') {
          const numValue = Number(newValue);
          if (isNaN(numValue) || numValue <= 0) {
            if (event.node && typeof event.node.setDataValue === 'function') {
              event.node.setDataValue('building_number', building.building_number || 0);
            }
            return;
          }
        }
      } else {
        if (event.node && typeof event.node.setDataValue === 'function') {
          event.node.setDataValue('building_number', building.building_number);
        }
        return;
      }
    }

    // Special handling for building_number changes in new buildings
    let newBuildingKey: string | number = buildingKey;
    
    if (field === 'building_number' && isNew && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
      const newValueNum = Number(newValue);
      const oldTempId = building._tempId;
      
      // Update newBuildings tracking to use the new building_number
      setNewBuildings(prev => {
        const next = new Set(prev);
        if (oldTempId) {
          next.delete(oldTempId);
        }
        next.add(newValueNum);
        return next;
      });
      
      // Update dirtyBuildings tracking to use the new building_number
      setDirtyBuildings(prev => {
        const next = new Map(prev);
        const existingChanges = oldTempId ? next.get(oldTempId) : (next.get(buildingKey) || {});
        const mergedChanges = { ...existingChanges, [field]: newValue };
        if (oldTempId) {
          next.delete(oldTempId);
        } else {
          next.delete(buildingKey);
        }
        next.set(newValueNum, mergedChanges);
        return next;
      });
      
      newBuildingKey = newValueNum;
    }

    // For building_address, extract the code from formatted string if needed
    let valueToUpdate = newValue;
    if (field === 'building_address') {
      if (typeof newValue === 'string' && newValue.includes(' - ')) {
        const codeStr = newValue.split(' - ')[0].trim();
        const code = Number(codeStr);
        valueToUpdate = isNaN(code) || code <= 0 ? null : code;
      } else if (newValue != null) {
        const code = Number(newValue);
        valueToUpdate = isNaN(code) || code <= 0 ? null : code;
      }
    }
    
    // Update local state
    setBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        const bKey = getBuildingKey(b);
        if (bKey === buildingKey) {
          const updated = { ...b, [field]: valueToUpdate };
          if (field === 'building_number' && isNew && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
            updated.building_number = Number(newValue);
            // Keep _isNew and _tempId until saved to database
          }
          return updated;
        }
        return b;
      });
    });
    setFilteredBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        const bKey = getBuildingKey(b);
        if (bKey === buildingKey) {
          const updated = { ...b, [field]: valueToUpdate };
          if (field === 'building_number' && isNew && newValue !== null && newValue !== undefined && newValue !== '' && Number(newValue) > 0) {
            updated.building_number = Number(newValue);
            // Keep _isNew and _tempId until saved to database
          }
          return updated;
        }
        return b;
      });
    });

    // Update dirty tracking
    // For building_address, ensure we store the number, not the formatted string
    let valueToStore = newValue;
    if (field === 'building_address') {
      // If newValue is a formatted string "code - description", extract the code
      if (typeof newValue === 'string' && newValue.includes(' - ')) {
        const codeStr = newValue.split(' - ')[0].trim();
        const code = Number(codeStr);
        valueToStore = isNaN(code) || code <= 0 ? null : code;
      } else if (newValue != null) {
        // Ensure it's a number
        valueToStore = Number(newValue);
        if (isNaN(valueToStore) || valueToStore <= 0) {
          valueToStore = null;
        }
      }
    }
    
    const hasMeaningfulValue = valueToStore !== null && valueToStore !== undefined && valueToStore !== '';
    
    // Calculate updated dirty changes for validation (before state update)
    const existingDirtyChanges = dirtyBuildings.get(newBuildingKey) || {};
    const valueForValidation = field === 'building_address' ? valueToUpdate : newValue;
    const valueForDirty = field === 'building_address' ? valueToUpdate : valueToStore;
    
    let updatedDirtyChanges: Partial<Building>;
    if (hasMeaningfulValue) {
      updatedDirtyChanges = { ...existingDirtyChanges, [field]: valueForDirty };
    } else {
      updatedDirtyChanges = { ...existingDirtyChanges };
      delete updatedDirtyChanges[field as keyof Building];
    }
    
    if (field !== 'building_number' || !isNew) {
      if (!isNew || hasMeaningfulValue) {
        setDirtyBuildings(prev => {
          const next = new Map(prev);
          if (hasMeaningfulValue) {
            next.set(newBuildingKey, updatedDirtyChanges);
          } else {
            if (Object.keys(updatedDirtyChanges).length > 0) {
              next.set(newBuildingKey, updatedDirtyChanges);
            } else {
              next.delete(newBuildingKey);
            }
          }
          return next;
        });
      }
    }

    // Validate all fields - merge with all dirty changes to get complete row state
    // Merge base building data with all dirty changes to get complete current state
    const updatedBuilding = { 
      ...building, 
      ...updatedDirtyChanges,
      [field]: valueForValidation // Use the parsed value for validation
    };
    
    // Validate the complete row
    const validation = await buildingValidators.validateAllFields(updatedBuilding);

    setValidationErrors(prev => {
      const next = new Map(prev);
      if (!validation.valid) {
        next.set(newBuildingKey, validation.errors);
      } else {
        next.delete(newBuildingKey);
      }
      return next;
    });

    // Update tax region validation state
    if (field === 'tax_region') {
      // Only validate removal for existing buildings (not new ones)
      if (!isNew && building.building_number && building.building_number > 0) {
        // Get original tax region from originalBuildings
        const originalBuilding = originalBuildings.find(b => b.building_number === building.building_number);
        const oldTaxRegion = originalBuilding?.tax_region;
        
        // Validate tax region removal
        const removalValidation = await validateTaxRegionRemoval(
          building.building_number,
          oldTaxRegion,
          newValue
        );

        if (!removalValidation.valid) {
          // Show modal with error message
          setTaxRegionValidationModal({
            isOpen: true,
            buildingNumber: building.building_number,
            removedTaxRegions: removalValidation.removedTaxRegions,
            assetCount: removalValidation.assetCount,
            oldTaxRegion: oldTaxRegion,
            buildingKey: buildingKey
          });

          // Mark this building as having invalid tax region (for visual error indication)
          setInvalidTaxRegionBuildings(prev => new Set(prev).add(buildingKey));

          // Add validation error for tax_region field
          setValidationErrors(prev => {
            const next = new Map(prev);
            const existingErrors = next.get(newBuildingKey) || {};
            next.set(newBuildingKey, {
              ...existingErrors,
              tax_region: `לא ניתן להסיר אזור מס ${removalValidation.removedTaxRegions.join(', ')} - קיימים ${removalValidation.assetCount} נכסים`
            });
            return next;
          });

          // Refresh grid to show error styling
          if (gridRef.current?.api) {
            setTimeout(() => {
              if (gridRef.current?.api) {
                gridRef.current.api.refreshCells({
                  rowNodes: [event.node],
                  columns: [field],
                  force: true
                });
              }
            }, 0);
          }
        } else {
          // Validation passed - remove from invalid set
          setInvalidTaxRegionBuildings(prev => {
            const next = new Set(prev);
            next.delete(buildingKey);
            return next;
          });
        }
      }

      const isInvalid = await buildingValidators.checkTaxRegionInvalid(newValue);
      setInvalidTaxRegions(prev => {
        const next = new Set(prev);
        if (isInvalid) {
          // Use building_number for invalidTaxRegions (always a number)
          const bldgNum = updatedBuilding.building_number || 0;
          if (bldgNum > 0) {
            next.add(bldgNum);
          }
        } else {
          const bldgNum = updatedBuilding.building_number || 0;
          if (bldgNum > 0) {
            next.delete(bldgNum);
          }
        }
        return next;
      });
    }

    // Refresh grid to show dirty state and validation errors
    if (gridRef.current?.api) {
      // Refresh the changed cell
      gridRef.current.api.refreshCells({ 
        rowNodes: [event.node], 
        columns: [field],
        force: true 
      });
      
      // If there are validation errors, refresh all cells in the row to show error styling
      if (!validation.valid && Object.keys(validation.errors).length > 0) {
        setTimeout(() => {
          if (gridRef.current?.api) {
            gridRef.current.api.refreshCells({ 
              rowNodes: [event.node], 
              force: true 
            });
          }
        }, 0);
      }
    }
  }, [newBuildings, isNewBuilding, getBuildingKey, dirtyBuildings, validationErrors, validateTaxRegionRemoval, originalBuildings, buildings, setBuildings, setFilteredBuildings, setDirtyBuildings]);

  // Add empty building row
  const addEmptyBuildingRow = () => {
    const tempId = `temp-${Date.now()}`;
    const newBuilding: Building = {
      building_number: 0, // Use 0 as placeholder, will be updated when user enters real number
      tax_region: null,
      shared_area: null,
      shared_business_area: null,
      area_for_control: null,
      total_building_area: null,
      elevator: null,
      single_double_family: null,
      condo: null,
      townhouses: null,
      building_address: null,
      overload_ratio: null,
      gosh: null,
      helka: null,
      building_number_in_street: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _tempId: tempId,
      _isNew: true
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

  // Validate all buildings with changes
  const handleValidateAll = useCallback(async () => {
    // Don't set loading to avoid refreshing the tab
    setError(null);
    setSuccess(null);
    
    try {
      const newValidationErrors = new Map<string | number, Record<string, string>>();
      const buildingsToValidate: Array<{ building: Building; key: string | number }> = [];
      
      // Collect all buildings to validate (always validate all buildings, not just those with changes)
      for (const building of buildings) {
        const buildingKey = getBuildingKey(building);
        
        // Validate all buildings except those marked for deletion
        if (!buildingsToDelete.has(buildingKey)) {
          buildingsToValidate.push({ building, key: buildingKey });
        }
      }
      
      if (buildingsToValidate.length === 0) {
        setSuccess('אין מבנים לבדיקה');
        setTimeout(() => setSuccess(null), 3000);
        return;
      }
      
      // Validate each building
      for (const { building, key } of buildingsToValidate) {
        // Get all dirty changes for this building
        const dirtyChanges = dirtyBuildings.get(key) || {};
        
        // Merge base building data with all dirty changes to get complete current state
        const updatedBuilding = { 
          ...building, 
          ...dirtyChanges
        };
        
        // Validate the complete row
        const validation = await buildingValidators.validateAllFields(updatedBuilding);
        
        if (!validation.valid) {
          newValidationErrors.set(key, validation.errors);
        }
      }
      
      // Update validation errors
      setValidationErrors(newValidationErrors);
      
      // Refresh grid to show validation errors and row borders
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
        // Also refresh rows to update row borders
        gridRef.current.api.refreshClientSideRowModel('filter');
      }
      
      const errorCount = newValidationErrors.size;
      if (errorCount > 0) {
        setError(`נמצאו שגיאות תקינות ב-${errorCount} מבנים`);
        setTimeout(() => setError(null), 5000);
      } else {
        setSuccess(`כל ${buildingsToValidate.length} המבנים תקינים`);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Error validating buildings:', err);
      setError('שגיאה בבדיקת תקינות המבנים');
      setTimeout(() => setError(null), 5000);
    }
  }, [buildings, dirtyBuildings, buildingsToDelete, getBuildingKey, isNewBuilding, totalChanges]);

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
    setSuccess(null);
    
    try {
      let savedCount = 0;
      let deletedCount = 0;
      const errors: string[] = [];
      const successfullyDeleted = new Set<string | number>();
      const successfullySaved = new Set<string | number>();

      // Process deletions
      for (const buildingKey of buildingsToDelete) {
        try {
          if (newBuildings.has(buildingKey)) {
            deletedCount++;
            successfullyDeleted.add(buildingKey);
            continue;
          }
          // Only delete if it's a number (existing building)
          if (typeof buildingKey === 'number') {
            await api.deleteAssetsByBuilding(buildingKey);
            await api.deleteBuilding(buildingKey);
            deletedCount++;
            successfullyDeleted.add(buildingKey);
          }
        } catch (err) {
          const building = findBuildingByKey(buildingKey);
          const buildingIdent = building?.building_number || buildingKey;
          errors.push(`מבנה ${buildingIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      }

      // Collect buildings to save
      const allBuildingsToSave = new Set<string | number>();
      
      // Add all dirty buildings (including new ones that were edited)
      for (const [buildingKey] of dirtyBuildings.entries()) {
        if (!buildingsToDelete.has(buildingKey)) {
          allBuildingsToSave.add(buildingKey);
        }
      }
      
      // Add new buildings that haven't been edited yet (not in dirtyBuildings)
      for (const newBuildingKey of newBuildings) {
        if (!dirtyBuildings.has(newBuildingKey) && !buildingsToDelete.has(newBuildingKey)) {
          allBuildingsToSave.add(newBuildingKey);
        }
      }

      // Process saves
      for (const buildingKey of allBuildingsToSave) {
        try {
          let building = findBuildingByKey(buildingKey);
          
          if (!building) {
            console.warn(`[BuildingsList] Building not found for key: ${buildingKey}`);
            continue;
          }
          
          console.log(`[BuildingsList] Processing building:`, { buildingKey, building, isNew: isNewBuilding(building) });

          // For new buildings not in dirtyBuildings, use empty changes object
          const changes = dirtyBuildings.get(buildingKey) || {};
          const isNew = isNewBuilding(building);

          if (isNew) {
            const finalBuilding = { ...building, ...changes };
            
            console.log(`[BuildingsList] Saving new building:`, { 
              buildingKey, 
              building, 
              changes, 
              finalBuilding,
              building_number: finalBuilding.building_number,
              tax_region: finalBuilding.tax_region
            });
            
            if (!finalBuilding.building_number || finalBuilding.building_number <= 0) {
              errors.push(`מבנה חדש: מספר מבנה נדרש ו חייב להיות חיובי`);
              continue;
            }
            if (!finalBuilding.tax_region) {
              errors.push(`מבנה ${finalBuilding.building_number}: אזור מיסים נדרש`);
              continue;
            }

            // Prepare building data for API - exclude internal fields
            const { _tempId, _isNew, created_at, updated_at, ...buildingData } = finalBuilding;
            console.log(`[BuildingsList] Calling api.buildings.create with:`, buildingData);
            const createdBuilding = await api.buildings.create(buildingData);
            console.log(`[BuildingsList] Building created successfully:`, createdBuilding);
            
            // Remove the old building from state - fetchBuildings will add it back from database
            setBuildings(prev => prev.filter(b => {
              const bKey = getBuildingKey(b);
              return bKey !== buildingKey;
            }));
            setFilteredBuildings(prev => prev.filter(b => {
              const bKey = getBuildingKey(b);
              return bKey !== buildingKey;
            }));
            
            savedCount++;
            // Add both the original key and the new building_number to successfullySaved
            // because dirtyBuildings might have been updated to use the new building_number
            successfullySaved.add(buildingKey);
            if (createdBuilding.building_number && createdBuilding.building_number > 0) {
              successfullySaved.add(createdBuilding.building_number);
            }
          } else {
            const actualBuildingNumber = building.building_number;
            if (!actualBuildingNumber || actualBuildingNumber <= 0) {
              errors.push(`מבנה ${buildingKey}: לא ניתן לעדכן מבנה עם מספר מבנה לא תקין`);
              continue;
            }
            await api.buildings.update(actualBuildingNumber, changes);
            savedCount++;
            successfullySaved.add(buildingKey);
          }
        } catch (err) {
          const building = findBuildingByKey(buildingKey);
          const buildingIdent = building?.building_number || buildingKey;
          errors.push(`מבנה ${buildingIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Clear successfully processed buildings BEFORE fetchBuildings
      // Collect all possible keys (tempId and building_number) for each saved building
      const allKeysToClear = new Set<string | number>();
      
      // Add keys for successfully saved buildings
      for (const buildingKey of successfullySaved) {
        allKeysToClear.add(buildingKey);
        const building = findBuildingByKey(buildingKey);
        if (building) {
          // Add the building_number if it exists
          if (building.building_number && building.building_number > 0) {
            allKeysToClear.add(building.building_number);
          }
          // Add the tempId if it exists
          if (building._tempId) {
            allKeysToClear.add(building._tempId);
          }
        }
      }
      
      // Add keys for successfully deleted buildings
      for (const buildingKey of successfullyDeleted) {
        allKeysToClear.add(buildingKey);
        const building = findBuildingByKey(buildingKey);
        if (building) {
          // Add the building_number if it exists
          if (building.building_number && building.building_number > 0) {
            allKeysToClear.add(building.building_number);
          }
          // Add the tempId if it exists
          if (building._tempId) {
            allKeysToClear.add(building._tempId);
          }
        }
      }

      setDirtyBuildings(prev => {
        const next = new Map(prev);
        for (const key of allKeysToClear) {
          next.delete(key);
        }
        return next;
      });
      setBuildingsToDelete(prev => {
        const next = new Set(prev);
        for (const buildingKey of successfullyDeleted) {
          next.delete(buildingKey);
        }
        return next;
      });
      setNewBuildings(prev => {
        const next = new Set(prev);
        for (const buildingKey of successfullySaved) {
          next.delete(buildingKey);
        }
        return next;
      });
      setValidationErrors(prev => {
        const next = new Map(prev);
        for (const key of allKeysToClear) {
          next.delete(key);
        }
        for (const buildingKey of successfullyDeleted) {
          next.delete(buildingKey);
        }
        return next;
      });

      if (errors.length > 0) {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} מבנים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} מבנים`);
        setError(`${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
        setSuccess(null);
      } else {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} מבנים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} מבנים`);
        if (successMsg.length > 0) {
          setSuccess(successMsg.join(', '));
          setTimeout(() => setSuccess(null), 3000);
        }
        setError(null);
      }

      // Remove deleted buildings from state before fetching
      setBuildings(prev => prev.filter(b => {
        const key = getBuildingKey(b);
        return !successfullyDeleted.has(key);
      }));
      setFilteredBuildings(prev => prev.filter(b => {
        const key = getBuildingKey(b);
        return !successfullyDeleted.has(key);
      }));
      
      // Refresh data to get updated buildings from database
      // This will also update originalBuildings for future cancel operations
      await fetchBuildings(false);
      
      // Force refresh grid to clear dirty styling after state updates
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
      
      // Update originalBuildings after successful save
      setOriginalBuildings(prev => {
        const updated = [...prev];
        for (const buildingKey of successfullySaved) {
          const building = findBuildingByKey(buildingKey);
          if (building && !building._isNew && !building._tempId) {
            // Replace or add the saved building
            const index = updated.findIndex(b => b.building_number === building.building_number);
            if (index >= 0) {
              updated[index] = { ...building };
            } else {
              updated.push({ ...building });
            }
          }
        }
        return updated;
      });
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
    // Restore original buildings completely - replace current state with original
    const restored = JSON.parse(JSON.stringify(originalBuildings));
    setBuildings(restored);
    setFilteredBuildings(restored);
    
    // Clear all change tracking
    setDirtyBuildings(new Map());
    setBuildingsToDelete(new Set());
    setNewBuildings(new Set());
    setValidationErrors(new Map());
    setInvalidTaxRegionBuildings(new Set()); // Clear invalid tax region buildings
    setError(null);

    // Re-validate tax regions for original buildings
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

    // Refresh the grid to show reverted values
    if (gridRef.current?.api) {
      // Force refresh all cells to show original values
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
    const building = buildings.find(b => b.building_number === buildingNumber);
    if (!building) return;
    
    const buildingKey = getBuildingKey(building);
    const isCurrentlyMarked = buildingsToDelete.has(buildingKey);
    
    setBuildingsToDelete(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyMarked) {
        newSet.delete(buildingKey);
      } else {
        newSet.add(buildingKey);
      }
      return newSet;
    });
    setDirtyBuildings(prev => {
      const newMap = new Map(prev);
      if (isCurrentlyMarked) {
        newMap.delete(buildingKey);
      } else {
        newMap.set(buildingKey, { deleted: true, deleted_at: new Date().toISOString() });
      }
      return newMap;
    });
  }, [buildingsToDelete, buildings, getBuildingKey]);

  // Helper function to get cell style
  const getCellStyle = (params: any, fieldName: string) => {
    const building = params.data as Building;
    if (!building) return { textAlign: 'right' };
    const buildingKey = getBuildingKey(building);
    const errors = validationErrors.get(buildingKey);
    const hasError = errors && errors[fieldName];
    const isDirty = dirtyBuildings.has(buildingKey) && dirtyBuildings.get(buildingKey)?.hasOwnProperty(fieldName);
    const hasInvalidTaxRegion = fieldName === 'tax_region' && invalidTaxRegionBuildings.has(buildingKey);
    
    return {
      textAlign: 'right',
      fontWeight: isDirty ? 'bold' : 'normal',
      border: hasError || hasInvalidTaxRegion ? '3px solid #dc2626' : undefined,
      borderRadius: hasError || hasInvalidTaxRegion ? '4px' : undefined,
      backgroundColor: hasInvalidTaxRegion ? '#fee2e2' : undefined,
      padding: hasInvalidTaxRegion ? '2px 4px' : undefined
    };
  };

  // Handle checkbox change
  const handleCheckboxChange = (building: Building, field: string, newValue: string | null) => {
    const buildingKey = getBuildingKey(building);
    setBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        const bKey = getBuildingKey(b);
        return bKey === buildingKey ? { ...b, [field]: newValue } : b;
      });
    });
    setFilteredBuildings(prevBuildings => {
      return prevBuildings.map(b => {
        const bKey = getBuildingKey(b);
        return bKey === buildingKey ? { ...b, [field]: newValue } : b;
      });
    });
    setDirtyBuildings(prev => {
      const next = new Map(prev);
      const existing = next.get(buildingKey) || {};
      next.set(buildingKey, { ...existing, [field]: newValue });
      return next;
    });
    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  // Column definitions
  const columnDefs: ColDef<Building>[] = useMemo(() => {
    const defs: ColDef<Building>[] = [
    {
      colId: 'actions',
      headerName: 'פעולות',
      editable: false,
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return null;
        const buildingKey = getBuildingKey(building);
        const hasTaxRegionError = building.building_number > 0 && invalidTaxRegions.has(building.building_number);
        const markedForDeletion = buildingsToDelete.has(buildingKey);
        const errors = validationErrors.get(buildingKey);
        const hasValidationError = errors && Object.keys(errors).length > 0;
        const allErrorMessages = hasValidationError 
          ? Object.entries(errors || {}).map(([field, msg]) => `${field}: ${msg}`).join('; ')
          : '';

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {(hasValidationError || hasTaxRegionError) && (
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <span 
                  title={hasValidationError ? allErrorMessages : (hasTaxRegionError ? t('invalidTaxRegion') : '')} 
                  className="flex items-center justify-center"
                >
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </span>
              </div>
            )}
            <button
              onClick={async () => {
                // First check if building has multiple tax regions defined
                // If building has multiple tax regions, use them even if no assets exist yet
                const buildingTaxRegions = params.data.tax_region;
                const hasMultipleTaxRegions = buildingTaxRegions && typeof buildingTaxRegions === 'string' && buildingTaxRegions.includes(',');
                
                if (hasMultipleTaxRegions) {
                  // Building has multiple tax regions - use them directly
                  console.log('[BuildingsList] Building has multiple tax regions:', buildingTaxRegions);
                  onSelectBuilding(params.data.building_number, buildingTaxRegions);
                } else {
                  // Try to get tax regions from assets, fallback to building tax_region if available
                  try {
                    const availableTaxRegions = await api.buildings.getAvailableTaxRegions(params.data.building_number);
                    console.log('[BuildingsList] Available tax regions from assets:', availableTaxRegions);
                    // If no tax regions from assets but building has tax_region, use building's tax_region
                    const taxRegionsToUse = availableTaxRegions || (buildingTaxRegions ? String(buildingTaxRegions) : undefined);
                    onSelectBuilding(params.data.building_number, taxRegionsToUse);
                  } catch (err) {
                    console.error('Error getting available tax regions:', err);
                    // Fallback to building tax_region if available
                    const fallbackTaxRegions = buildingTaxRegions ? String(buildingTaxRegions) : undefined;
                    onSelectBuilding(params.data.building_number, fallbackTaxRegions);
                  }
                }
              }}
              className="p-1 text-teal-600 hover:text-teal-700 transition-colors hover:scale-110"
              title={t('viewAssets')}
            >
              <Eye className="h-4 w-4" />
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
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: 'מספר מבנה',
      editable: (params: any) => {
        if (!params || !params.data) return false;
        const building = params.data as Building;
        if (!building) return false;
        return isNewBuilding(building);
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
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const value = params.value != null && params.value !== 0 ? String(params.value) : '';
        
        if (isNew && (params.value === 0 || params.value === null || params.value === undefined)) {
          return '';
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
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['tax_region'];
        const hasInvalidTaxRegion = invalidTaxRegionBuildings.has(buildingKey);
        
        if (isNew && (params.value === null || params.value === undefined || params.value === '')) {
          return '';
        }
        const value = params.value != null ? params.value : '';
        
        if (errorMsg || hasInvalidTaxRegion) {
          const displayErrorMsg = errorMsg || 'לא ניתן להסיר אזור מס זה - קיימים נכסים באזור מס זה';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={displayErrorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
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
      field: 'overload_ratio',
      headerName: 'אחוז העמסה',
      editable: (params: any) => {
        if (!params || !params.data) return false;
        const building = params.data as Building;
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        return isNew || !buildingsToDelete.has(buildingKey);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        // Remove % sign if present
        const cleanValue = String(newValue).replace('%', '').trim();
        const numValue = Number(cleanValue);
        return isNaN(numValue) ? null : numValue;
      },
      valueFormatter: (params: any) => {
        if (params.value == null || params.value === undefined) return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num)) return '';
        return `${num.toFixed(2)}%`;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['overload_ratio'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null ? `${Number(params.value).toFixed(2)}%` : '';
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
      cellStyle: (params) => getCellStyle(params, 'overload_ratio')
    },
    {
      field: 'shared_area',
      headerName: 'שטח משותף מגורים',
      editable: (params: any) => {
        if (!params || !params.data) return false;
        const building = params.data as Building;
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        return isNew || !buildingsToDelete.has(buildingKey);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['shared_area'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
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
      editable: (params: any) => {
        if (!params || !params.data) return false;
        const building = params.data as Building;
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        return isNew || !buildingsToDelete.has(buildingKey);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['shared_business_area'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
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
      editable: (params: any) => {
        if (!params || !params.data) return false;
        const building = params.data as Building;
        return isNewBuilding(building);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '0';
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const hasAreaMismatch = errors && errors['area_for_control'];
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
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
        if (!building) return { textAlign: 'right', backgroundColor: '#f0f9ff', fontWeight: '600' };
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
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
        if (!params || !params.data) return false;
        const building = params.data as Building;
        if (!building) return false;
        const buildingKey = getBuildingKey(building);
        const isNew = isNewBuilding(building);
        return isNew || !buildingsToDelete.has(buildingKey);
      },
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['area_for_control'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
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
        if (!building) return null;
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['elevator'];
        const markedForDeletion = buildingsToDelete.has(buildingKey);
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
                handleCheckboxChange(building, 'elevator', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />
          </div>
        );
      },
      cellStyle: (params) => {
        const building = params.data as Building;
        if (!building) return { display: 'flex', alignItems: 'center', justifyContent: 'center' };
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
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
        if (!building) return null;
        const buildingKey = getBuildingKey(building);
        const markedForDeletion = buildingsToDelete.has(buildingKey);
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
                handleCheckboxChange(building, 'single_double_family', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
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
        if (!building) return null;
        const buildingKey = getBuildingKey(building);
        const markedForDeletion = buildingsToDelete.has(buildingKey);
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
                handleCheckboxChange(building, 'condo', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
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
        if (!building) return null;
        const buildingKey = getBuildingKey(building);
        const markedForDeletion = buildingsToDelete.has(buildingKey);
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
                handleCheckboxChange(building, 'townhouses', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
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
      field: 'building_address',
      headerName: 'כתובת',
      editable: true,
      valueGetter: (params: any) => {
        // Return the street code from the data object
        return params.data?.building_address ?? null;
      },
      valueSetter: (params: any) => {
        // Ensure the value is set on the data object
        console.log('[valueSetter] building_address:', {
          oldValue: params.oldValue,
          newValue: params.newValue,
          hasData: !!params.data,
          dataBefore: params.data?.building_address
        });
        if (params.data) {
          params.data.building_address = params.newValue;
          console.log('[valueSetter] Updated data.building_address to:', params.newValue, 'verified:', params.data.building_address);
        } else {
          console.warn('[valueSetter] params.data is null!');
        }
        return true;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        // Always read from building data directly - this is the source of truth
        const streetCode = building.building_address;
        if (!streetCode) return '';
        
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['building_address'];
        
        // Find the address description - ensure type consistency (compare as numbers)
        const address = addressList.find(a => Number(a.street_code) === Number(streetCode));
        const displayValue = address ? address.street_description : (streetCode ? String(streetCode) : '');
        
        if (isNew && !streetCode) {
          return '';
        }
        
        if (errorMsg) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
              <span title={errorMsg} style={{ color: '#dc2626', cursor: 'help' }}>
                <AlertCircle size={16} />
              </span>
              <span>{displayValue}</span>
            </div>
          );
        }
        
        return displayValue;
      },
      cellEditor: AddressCellEditor,
      cellEditorParams: {
        addressList: addressList || [],
      },
      cellStyle: (params) => getCellStyle(params, 'building_address')
    },
    {
      field: 'gosh',
      headerName: 'גוש',
      editable: true,
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['gosh'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'gosh')
    },
    {
      field: 'helka',
      headerName: 'חלקה',
      editable: true,
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['helka'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'helka')
    },
    {
      field: 'building_number_in_street',
      headerName: 'מספר בניין',
      editable: true,
      valueParser: (params: any) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        const buildingKey = getBuildingKey(building);
        const errors = validationErrors.get(buildingKey);
        const errorMsg = errors && errors['building_number_in_street'];
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
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
      cellStyle: (params) => getCellStyle(params, 'building_number_in_street')
    },
    {
      field: 'extra_field_1',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
    ];
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [onSelectBuilding, handleDeleteBuilding, buildingsToDelete, t, invalidTaxRegions, validationErrors, dirtyBuildings, newBuildings, isNewBuilding, getBuildingKey, handleCheckboxChange, addressList]);

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
        building_address: newBuilding.building_address || undefined,
        elevator: undefined
      });

      if (taxRegion) {
        const isInvalid = await buildingValidators.checkTaxRegionInvalid(taxRegion);
        if (isInvalid) {
          setInvalidTaxRegions(prev => new Set(prev).add(buildingNumber));
        }
      }

      setShowCreateModal(false);
      setNewBuilding({ building_number: '', tax_region: '', building_address: null });
      setAddressSearchValue('');
      setShowAddressDropdown(false);
      // Refresh data to get updated buildings from database
      // This will also update originalBuildings for future cancel operations
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
      {success && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-slide-in">
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-lg">
            <p className="text-green-800 font-medium">{success}</p>
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
                <span className="font-semibold">סה"כ מבנים:</span> {filteredBuildings.length}
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
              type="button"
              onClick={addEmptyBuildingRow}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
            >
              <Plus className="h-4 w-4" />
              הוסף מבנה
            </button>
            <button
              type="button"
              onClick={handleValidateAll}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
            >
              <CheckCircle2 className="h-4 w-4" />
              אמת הכל
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelAll}
              disabled={loading || totalChanges === 0}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={loading || totalChanges === 0 || invalidTaxRegions.size > 0 || hasValidationErrors}
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
          <div className="ag-theme-alpine buildings-list-grid" style={{ height: 'calc(100vh - 400px)', minHeight: '300px', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
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
                headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: '600', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
                minWidth: 40
              }}
              gridOptions={{
                suppressColumnVirtualisation: true,
                alwaysShowHorizontalScroll: true,
              }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={async (params) => {
                // Load saved column state first
                await gridPreferences.loadColumnState(params.api);
                setTimeout(() => {
                  const columnState = params.api.getColumnState();
                  const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                  if (actionsCol) {
                    // Preserve the order of all columns, just update actions column properties
                    const updatedState = columnState.map((col: any) => {
                      if (col.colId === 'actions') {
                        return {
                          ...col,
                          pinned: 'right',
                          lockPosition: true,
                          lockPinned: true
                        };
                      }
                      return col;
                    });
                    params.api.applyColumnState({
                      state: updatedState,
                      defaultState: { pinned: null }
                    });
                  }
                }, 150);
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                  // Detect and apply text overflow fade
                  detectAndApplyTextOverflow(params.api);
                }, 200);
              }}
              onFirstDataRendered={async (params) => {
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                  // Detect and apply text overflow fade
                  detectAndApplyTextOverflow(params.api);
                  // Set up observer for dynamic changes
                  setupTextOverflowObserver(params.api);
                }, 200);
              }}
              onColumnResized={(params) => {
                gridPreferences.handleColumnResized();
                // Re-check overflow after column resize
                setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
              }}
              onColumnMoved={(params) => {
                // Preserve column order, only ensure actions column is pinned to right
                try {
                  if (gridRef.current?.api) {
                    setTimeout(() => {
                      if (gridRef.current?.api) {
                        const columnState = gridRef.current.api.getColumnState();
                        const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                        if (actionsCol && actionsCol.pinned !== 'right') {
                          // Preserve the order of all columns, just update actions column properties
                          const updatedState = columnState.map((col: any) => {
                            if (col.colId === 'actions') {
                              return {
                                ...col,
                                pinned: 'right',
                                lockPosition: true,
                                lockPinned: true
                              };
                            }
                            return col;
                          });
                          gridRef.current.api.applyColumnState({
                            state: updatedState,
                            applyOrder: false // Don't reorder, just update properties
                          });
                        }
                      }
                    }, 0);
                  }
                } catch (error) {
                  // Silently ignore errors
                  console.warn('Error handling column move:', error);
                }
                // Save column state after move
                gridPreferences.handleColumnMoved();
              }}
              onSortChanged={() => {}}
              domLayout="normal"
              suppressHorizontalScroll={false}
              enableRtl={true}
              rowClass="ag-row"
              getRowStyle={(params) => {
                const building = params.data as Building;
                if (!building) return {};
                const buildingKey = getBuildingKey(building);
                const hasTaxRegionError = building.building_number > 0 && invalidTaxRegions.has(building.building_number);
                const markedForDeletion = buildingsToDelete.has(buildingKey);
                const errors = validationErrors.get(buildingKey);
                const hasValidationError = errors && Object.keys(errors).length > 0;

                if (markedForDeletion) {
                  return {
                    background: '#fee2e2',
                    textDecoration: 'line-through',
                    opacity: 0.6
                  };
                }

                if (hasValidationError || hasTaxRegionError) {
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
        <div 
          className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
            createModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transition-all duration-300 ${
              createModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
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
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address (Street Code)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addressSearchValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAddressSearchValue(value);
                      setShowAddressDropdown(true);
                      setAddressSelectedIndex(-1);
                      
                      // Try to parse as number and clear selection if invalid
                      const parsed = Number(value.trim());
                      if (value.trim() === '') {
                        setNewBuilding(prev => ({ ...prev, building_address: null }));
                      } else if (!isNaN(parsed) && parsed > 0) {
                        setNewBuilding(prev => ({ ...prev, building_address: parsed }));
                      }
                    }}
                    onFocus={() => setShowAddressDropdown(true)}
                    onBlur={() => {
                      // Delay hiding dropdown to allow click events
                      setTimeout(() => setShowAddressDropdown(false), 200);
                    }}
                    onKeyDown={(e) => {
                      const filteredAddresses = addressSearchValue.trim()
                        ? addressList.filter(a => 
                            String(a.street_code).includes(addressSearchValue) ||
                            a.street_description?.toLowerCase().includes(addressSearchValue.toLowerCase()) ||
                            `${a.street_code} - ${a.street_description}`.toLowerCase().includes(addressSearchValue.toLowerCase())
                          )
                        : addressList;

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAddressSelectedIndex(prev => 
                          prev < filteredAddresses.length - 1 ? prev + 1 : prev
                        );
                        setShowAddressDropdown(true);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAddressSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                        setShowAddressDropdown(true);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (addressSelectedIndex >= 0 && addressSelectedIndex < filteredAddresses.length) {
                          const address = filteredAddresses[addressSelectedIndex];
                          setNewBuilding(prev => ({ ...prev, building_address: address.street_code }));
                          setAddressSearchValue(`${address.street_code} - ${address.street_description}`);
                          setShowAddressDropdown(false);
                        } else if (filteredAddresses.length === 1) {
                          const address = filteredAddresses[0];
                          setNewBuilding(prev => ({ ...prev, building_address: address.street_code }));
                          setAddressSearchValue(`${address.street_code} - ${address.street_description}`);
                          setShowAddressDropdown(false);
                        }
                      } else if (e.key === 'Escape') {
                        setShowAddressDropdown(false);
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Type street code or name..."
                  />
                  {showAddressDropdown && (() => {
                    const filteredAddresses = addressSearchValue.trim()
                      ? addressList.filter(a => 
                          String(a.street_code).includes(addressSearchValue) ||
                          a.street_description?.toLowerCase().includes(addressSearchValue.toLowerCase()) ||
                          `${a.street_code} - ${a.street_description}`.toLowerCase().includes(addressSearchValue.toLowerCase())
                        )
                      : addressList;
                    
                    if (filteredAddresses.length === 0) {
                      return (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                          <div className="px-4 py-2 text-slate-500 text-sm">No addresses found</div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {filteredAddresses.map((address, index) => (
                          <div
                            key={address.street_code}
                            onClick={() => {
                              setNewBuilding(prev => ({ ...prev, building_address: address.street_code }));
                              setAddressSearchValue(`${address.street_code} - ${address.street_description}`);
                              setShowAddressDropdown(false);
                            }}
                            onMouseEnter={() => setAddressSelectedIndex(index)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              backgroundColor: addressSelectedIndex === index ? '#e3f2fd' : 'white',
                              borderBottom: index < filteredAddresses.length - 1 ? '1px solid #eee' : 'none'
                            }}
                          >
                            <div style={{ fontWeight: 'bold' }}>{address.street_code}</div>
                            <div style={{ fontSize: '0.9em', color: '#666' }}>{address.street_description}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-6">
              <button
                onClick={() => {
                  setCreateModalClosing(true);
                  setTimeout(() => {
                    setShowCreateModal(false);
                    setNewBuilding({ building_number: '', tax_region: '', building_address: null });
                    setAddressSearchValue('');
                    setShowAddressDropdown(false);
                    setCreateModalClosing(false);
                  }, 300);
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

      {/* Tax Region Validation Modal */}
      {taxRegionValidationModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setTaxRegionValidationModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              <h2 className="text-2xl font-bold text-slate-800">לא ניתן לשנות אזורי מס</h2>
            </div>
            
            <div className="mb-6 space-y-3">
              <p className="text-slate-700">
                לא ניתן להסיר אזורי מס מהמבנה <strong>#{taxRegionValidationModal.buildingNumber}</strong> כי קיימים נכסים עם אזורי המס הבאים:
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-semibold text-red-900 mb-2">אזורי מס שהוסרו:</p>
                <p className="text-red-800 text-lg">
                  {taxRegionValidationModal.removedTaxRegions.join(', ')}
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="font-semibold text-yellow-900 mb-1">מספר נכסים מושפעים:</p>
                <p className="text-yellow-800 text-xl font-bold">
                  {taxRegionValidationModal.assetCount} נכסים
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-900 text-sm">
                  <strong>פעולה נדרשת:</strong> יש למחוק את הנכסים הרלוונטיים לפני שינוי אזורי המס של המבנה.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setTaxRegionValidationModal(prev => ({ ...prev, isOpen: false }))}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                הבנתי
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
