import React, { useEffect, useState, useMemo, useCallback, useRef, useImperativeHandle, forwardRef, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Building, AddressList, api } from '../lib/api';
import { buildingValidators, getAssetTypes, setLatestExportDate } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellEditorParams } from 'ag-grid-community';
import { Search, AlertCircle, Plus, Loader2, Save, X, Trash2, CheckCircle2, Download, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { useFieldConfigVersion } from '../contexts/FieldConfigContext';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { useFillHandle } from '../lib/useFillHandle';
import { exportToExcel, createExcelBlob } from '../lib/excelExport';
import { createAndDownloadZip } from '../lib/zipExport';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { useUserRole } from '../contexts/UserRoleContext';
import { useUIConfig } from '../contexts/UIConfigContext';
import { Toast } from './Toast';

// Validation tooltip icon component that uses fixed positioning to avoid overflow clipping
const ValidationTooltipIcon = ({ message }: { message: string }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left
      });
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <>
      <div 
        ref={iconRef}
        className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AlertCircle className="h-4 w-4 text-red-600" />
      </div>
      {isHovered && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            right: `${position.right + 8}px`,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        >
          <div style={{
            backgroundColor: '#f9fafb',
            color: '#1f2937',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            maxWidth: '500px',
            minWidth: '300px',
            direction: 'rtl',
            textAlign: 'right',
            lineHeight: '1.6',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '2px solid #ef4444',
            whiteSpace: 'pre-line'
          }}>
            {message}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

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
  
  // Debug: Log addressList when it changes
  useEffect(() => {
  }, [addressList]);

  // Get the field name from column (address is the default now)
  const fieldName = props.column?.getColId() || 'address';

  // Expose methods to AG Grid
  // Don't include props.data in dependencies to avoid recreating the function
  // Access props.data via ref to always get the latest value
  useImperativeHandle(ref, () => ({
    getValue: () => {
      // ALWAYS check the ref first - this is the source of truth
      let value = selectedValueRef.current;
      
      // Ensure value is a number (street_code should be a number)
      if (value != null) {
        const numValue = Number(value);
        if (!isNaN(numValue) && numValue > 0) {
          value = numValue;
        } else {
          value = null;
        }
      }
      
      
      return value;
    },
    // Tell ag-grid this editor uses a popup (for better positioning)
    isPopup: () => false // We use fixed positioning, not ag-grid's popup system
  }), [selectedValue, fieldName]); // Removed props.data to avoid recreating unnecessarily

  // Initialize with current value
  useEffect(() => {
    // Try to get value from props.value first, then from data object using fieldName
    let streetCode = props.value;
    
    // If props.value is null/undefined, try to get from data object
    if (streetCode == null && props.data) {
      streetCode = props.data[fieldName];
    }
    if (streetCode == null && dataRef.current) {
      streetCode = dataRef.current[fieldName];
    }
    
    
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
  }, [addressList, fieldName]); // Include fieldName to properly initialize

  // Filter addresses based on search
  const filteredAddresses = useMemo(() => {
    
    if (!searchValue.trim()) {
      return addressList;
    }
    const searchLower = searchValue.toLowerCase();
    const filtered = addressList.filter(a => 
      String(a.street_code).toLowerCase().includes(searchLower) ||
      a.street_description?.toLowerCase().includes(searchLower) ||
      `${a.street_code} - ${a.street_description}`.toLowerCase().includes(searchLower)
    );
    return filtered;
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
  const selectAddress = useCallback((address: AddressList) => {
    const streetCode = Number(address.street_code); // Ensure it's a number
    const oldValue = props.value;
    
    
    // CRITICAL: Set value in ref FIRST - this is what getValue() will return
    selectedValueRef.current = streetCode;
    setSelectedValue(streetCode);
    
    // Close dropdown first
    setShowDropdown(false);
    
    // Update search value to show selected address
    setSearchValue(`${address.street_code} - ${address.street_description}`);
    
    
    // CRITICAL: Don't call setDataValue before stopEditing - it causes issues
    // Instead, let ag-grid's natural flow handle it:
    // 1. stopEditing() will call getValue() which returns selectedValueRef.current
    // 2. ag-grid will call valueSetter with the value from getValue()
    // 3. ag-grid will trigger onCellValueChanged
    
    // Just ensure the ref is set correctly
    
    // Stop editing - AG Grid will:
    // 1. Call getValue() which returns selectedValueRef.current (streetCode)
    // 2. Call valueSetter to update node.data[fieldName]
    // 3. Trigger onCellValueChanged
    props.stopEditing();
    
    // After stopEditing, use setDataValue to ensure the value is persisted
    // This is needed because sometimes ag-grid doesn't properly update the value
    const node = props.node;
    const column = props.column;
    const api = props.api;
    
    setTimeout(() => {
      if (node && column) {
        const colId = column.getColId();
        const currentValue = node.data?.[fieldName];
        
        // If value doesn't match, force update
        if (currentValue !== streetCode && streetCode != null) {
          console.warn('[AddressCellEditor] Value mismatch after stopEditing, forcing update');
          node.setDataValue(colId, streetCode);
          
          // Refresh to ensure display is updated
          if (api) {
            api.refreshCells({ 
              rowNodes: [node], 
              columns: [colId], 
              force: true 
            });
            api.redrawRows({ rowNodes: [node] });
          }
        } else if (currentValue === streetCode) {
          // Value is correct, just refresh display
          if (api) {
            api.refreshCells({ 
              rowNodes: [node], 
              columns: [colId], 
              force: true 
            });
            api.redrawRows({ rowNodes: [node] });
          }
        }
      }
    }, 50);
    
    // Refresh to ensure display is updated after stopEditing completes
    setTimeout(() => {
      if (node && column && api) {
        const colId = column.getColId();
        api.refreshCells({ 
          rowNodes: [node], 
          columns: [colId], 
          force: true 
        });
        api.redrawRows({ rowNodes: [node] });
      }
    }, 100);
  }, [fieldName]); // Remove props from dependencies to avoid recreating unnecessarily


  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedOnDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      const clickedOnInput = inputRef.current && inputRef.current.contains(target);
      
      
      // Only close if click is truly outside both dropdown and input
      if (
        dropdownRef.current &&
        !clickedOnDropdown &&
        inputRef.current &&
        !clickedOnInput
      ) {
        // Use setTimeout to allow dropdown item clicks to process first
        setTimeout(() => {
          props.stopEditing();
        }, 100);
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
      {showDropdown && createPortal(
        (() => {
          // Calculate dropdown position using input element
          let dropdownTop = 0;
          let dropdownLeft = 0;
          let dropdownWidth = 300;
          
          if (inputRef.current) {
            const inputRect = inputRef.current.getBoundingClientRect();
            dropdownTop = inputRect.bottom;
            dropdownLeft = inputRect.left;
            dropdownWidth = Math.max(inputRect.width, 300);
          } else if (props.eGridCell) {
            const cellRect = props.eGridCell.getBoundingClientRect();
            dropdownTop = cellRect.bottom;
            dropdownLeft = cellRect.left;
            dropdownWidth = Math.max(cellRect.width, 300);
          }
          
          return (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed', // Use fixed positioning to escape grid clipping
                top: `${dropdownTop}px`,
                left: `${dropdownLeft}px`,
                width: `${dropdownWidth}px`,
                maxHeight: '200px',
                overflowY: 'auto',
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 99999, // Very high z-index to appear above everything
                direction: 'rtl',
                textAlign: 'right'
              }}
            >
              {filteredAddresses.length > 0 ? (
                filteredAddresses.map((address, index) => (
                  <div
                    key={address.id || `${address.street_code}-${index}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Use setTimeout to ensure the click event is fully processed
                      setTimeout(() => {
                        selectAddress(address);
                      }, 0);
                    }}
                    onMouseDown={(e) => {
                      // Also handle mousedown to ensure click works
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === index ? '#e3f2fd' : 'white',
                      borderBottom: index < filteredAddresses.length - 1 ? '1px solid #eee' : 'none',
                      userSelect: 'none' // Prevent text selection
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{address.street_code}</div>
                    <div style={{ fontSize: '0.9em', color: '#666' }}>{address.street_description}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px 12px', color: '#666', fontStyle: 'italic' }}>
                  {addressList.length === 0 ? 'אין כתובות זמינות' : 'לא נמצאו תוצאות'}
                </div>
              )}
            </div>
          );
        })(),
        document.body
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

export interface BuildingsListRef {
  hasUnsavedChanges: () => boolean;
  refreshExportCount: () => Promise<void>;
}

// BuildingsList component with forwardRef
export const BuildingsList = forwardRef<BuildingsListRef, BuildingsListProps>(({ 
  onSelectBuilding, 
  onOpenAssetTypes, 
  onOpenAssetSearch, 
  onOpenValidationRules,
  showCreateModal, 
  setShowCreateModal 
}, ref) => {
  const { t } = useTranslation();
  const { isReadOnly } = useUserRole();
  const { shouldValidateBeforeSave, shouldValidateOnBlur } = useUIConfig();

  // State management
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false); // Export to automation in progress - keep content visible
  const [exportProgressMessage, setExportProgressMessage] = useState(''); // Progress text in modal, not toast
  const [isSaving, setIsSaving] = useState(false); // Separate saving state to avoid full refresh appearance
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
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
  // Track cell values when editing starts - only mark dirty if value actually changed during edit
  const cellEditStartValues = useRef<Map<string, any>>(new Map());
  // Track if user actually interacted with the editor (typed, selected, etc.) - not just clicked
  const cellEditUserInteracted = useRef<Map<string, boolean>>(new Map());
  // Save is gated behind an explicit Validate action.
  // Any edit resets this back to false.
  const [isValidatedForSave, setIsValidatedForSave] = useState(false);
  const [buildingsToDelete, setBuildingsToDelete] = useState<Set<string | number>>(new Set());
  const [newBuildings, setNewBuildings] = useState<Set<string | number>>(new Set());
  const [exportToAutomationCount, setExportToAutomationCount] = useState<number>(0);

  // Any change invalidates the last validation snapshot (user must re-validate).
  useEffect(() => {
    const hasChanges = dirtyBuildings.size > 0 || buildingsToDelete.size > 0 || newBuildings.size > 0;
    if (hasChanges) {
      setIsValidatedForSave(false);
      // Clear stale validation messages (no online validation UX)
      setValidationErrors(new Map());
      setInvalidTaxRegions(new Set());
      setInvalidTaxRegionBuildings(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyBuildings, buildingsToDelete, newBuildings]);

  // Translate field names from English to Hebrew for error messages
  const translateFieldName = useCallback((fieldName: string): string => {
    const fieldTranslations: Record<string, string> = {
      'building_number': 'מזהה מבנה',
      'tax_region': 'אזור מיסים',
      'residence_shared_area': 'שטח משותף מגורים',
      'business_shared_area': 'שטח משותף עסקים',
      'net_area': 'שטח נטו',
      'asset_count': 'מספר נכסים ברמת בניין',
      'total_building_area': 'סה"כ שטח',
      'area_for_control': 'שטח לבקרה',
      'shared_parking_area': 'שטח חניה משותף',
      'number_of_parking_units': 'מספר יחידות חניה',
      'overload_ratio': 'אחוז העמסה',
      'elevator': 'מעלית',
      'single_double_family': 'בית פרטי',
      'condo': 'בית משותף',
      'townhouses': 'טוריים',
      'building_address': 'כתובת',
      'gosh': 'גוש',
      'helka': 'חלקה',
      'parcel': 'מגרש'
    };
    return fieldTranslations[fieldName] || fieldName;
  }, []);

  // Translate error message by replacing English field names with Hebrew
  // Uses the same Hebrew names as shown in the grid column headers
  const translateErrorMessage = useCallback((errorMsg: string): string => {
    if (!errorMsg) return errorMsg;
    let translated = String(errorMsg);
    
    // Field name translations matching the grid column headers (headerName)
    const fieldTranslations: Record<string, string> = {
      // Match exact English field names to Hebrew (as shown in grid headers)
      'area_for_control': 'שטח לבקרה',
      'shared_parking_area': 'שטח חניה משותף',
      'number_of_parking_units': 'מספר יחידות חניה',
      'building_number': 'מזהה מבנה',
      'tax_region': 'אזור מיסים',
      'residence_shared_area': 'שטח משותף מגורים',
      'business_shared_area': 'שטח משותף עסקים',
      'net_area': 'שטח נטו',
      'asset_count': 'מספר נכסים ברמת בניין',
      'total_building_area': 'סה"כ שטח',
      'overload_ratio': 'אחוז העמסה',
      'single_double_family': 'בית פרטי',
      'building_address': 'כתובת',
      'building_number_in_street': 'מספר מבנה ברחוב',
      'elevator': 'מעלית',
      'condo': 'בית משותף',
      'townhouses': 'טוריים',
      'gosh': 'גוש',
      'helka': 'חלקה',
      'parcel': 'מגרש'
    };

    // Complete error message translations (exact matches)
    const completeMessageTranslations: Array<[string, string]> = [
      ['Area for control must be a positive number', 'שטח לבקרה חייב להיות מספר חיובי'],
      ['Residence shared area must be a positive number', 'שטח משותף מגורים חייב להיות מספר חיובי'],
      ['Business shared area must be a positive number', 'שטח משותף עסקים חייב להיות מספר חיובי'],
      ['Building number is invalid', 'מזהה מבנה אינו תקף'],
      ['Tax region is invalid', 'אזור מיסים אינו תקף'],
      ['Invalid tax regions by business type', 'אזורי מס לא תקפים לפי סוג עסק'],
    ];

    // First, replace complete messages (exact matches)
    completeMessageTranslations.forEach(([en, he]) => {
      translated = translated.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), he);
    });

    // Then replace field name phrases (space-separated)
    const phraseTranslations: Array<[string, string]> = [
      ['Area for control', 'שטח לבקרה'],
      ['area for control', 'שטח לבקרה'],
      ['Residence shared area', 'שטח משותף מגורים'],
      ['residence shared area', 'שטח משותף מגורים'],
      ['Business shared area', 'שטח משותף עסקים'],
      ['business shared area', 'שטח משותף עסקים'],
      ['Building number', 'מזהה מבנה'],
      ['building number', 'מזהה מבנה'],
      ['Tax region', 'אזור מיסים'],
      ['tax region', 'אזור מיסים'],
      ['Total building area', 'סה"כ שטח'],
      ['total building area', 'סה"כ שטח'],
    ];

    phraseTranslations.forEach(([en, he]) => {
      translated = translated.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), he);
    });

    // Finally, replace underscored field names (simple replace, no word boundaries for underscores)
    Object.entries(fieldTranslations).forEach(([en, he]) => {
      // For names with underscores, replace directly without word boundaries
      // For single words, use word boundaries
      if (en.includes('_')) {
        const regex = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        translated = translated.replace(regex, he);
      } else {
        const regex = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        translated = translated.replace(regex, he);
      }
    });
    
    return translated;
  }, []);
  
  // Grid reference
  const gridRef = useRef<AgGridReact<Building>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'buildings-list',
    'default'
  );

  // Fill handle hook for drag-to-fill functionality
  useFillHandle({
    gridRef,
    enabled: false
  });

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

  // Expose hasUnsavedChanges via ref (will be updated after fetchExportToAutomationCount is defined)

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
      const existingNewBuildings = buildings.filter(b => {
        const key = b._tempId || b.building_number;
        return newBuildings.has(key);
      });
      const mergedBuildings = [...(data || []), ...existingNewBuildings];
      
      // Batch state updates in a transition to prevent multiple grid refreshes
      // This tells React these updates are non-urgent and can be batched together
      startTransition(() => {
        setBuildings(mergedBuildings);
        setFilteredBuildings(mergedBuildings);
        setOriginalBuildings(JSON.parse(JSON.stringify(data || [])));
      });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load buildings', type: 'error' });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch count of assets to export
  const fetchExportToAutomationCount = useCallback(async () => {
    try {
      const result = await api.assets.getExportToAutomationCount();
      if (result.success) {
        setExportToAutomationCount(result.count);
      }
    } catch (err) {
      console.error('Error fetching export to automation count:', err);
    }
  }, []);

  // Expose hasUnsavedChanges and refreshExportCount via ref (after fetchExportToAutomationCount is defined)
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => totalChanges > 0,
    refreshExportCount: fetchExportToAutomationCount
  }), [totalChanges, fetchExportToAutomationCount]);

  useEffect(() => {
    fetchBuildings(true);
    // Load address list for building address dropdown
    const loadAddressList = async () => {
      try {
        const addresses = await api.addressList.getAll();
        setAddressList(addresses);
      } catch (err) {
        console.error('Error loading address list:', err);
        setAddressList([]); // Set empty array on error
      }
    };
    loadAddressList();
    // Fetch export count
    fetchExportToAutomationCount();
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

  // Sort buildings to put errored rows first
  const sortedBuildings = useMemo(() => {
    return [...filteredBuildings].map((building, idx) => ({ building, idx }))
      .sort((a, b) => {
        const aKey = getBuildingKey(a.building);
        const bKey = getBuildingKey(b.building);
        const aHasError = validationErrors.has(aKey) && validationErrors.get(aKey) && Object.keys(validationErrors.get(aKey)!).length > 0;
        const bHasError = validationErrors.has(bKey) && validationErrors.get(bKey) && Object.keys(validationErrors.get(bKey)!).length > 0;
        if (aHasError !== bHasError) {
          return aHasError ? -1 : 1;
        }
        // Preserve original order within error/non-error groups
        return a.idx - b.idx;
      })
      .map(x => x.building);
  }, [filteredBuildings, validationErrors, getBuildingKey]);

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

  // Validate all buildings with changes
  // Helper function to run validation programmatically (without UI feedback)
  const runValidationProgrammatically = useCallback(async (): Promise<{ hasErrors: boolean; errorMessage?: string }> => {
    try {
      const newValidationErrors = new Map<string | number, Record<string, string>>();
      const buildingsToValidate: Array<{ building: Building; key: string | number }> = [];
      
      // Collect only buildings with dirty changes (or new buildings)
      for (const building of buildings) {
        const buildingKey = getBuildingKey(building);
        
        // Only validate buildings with changes (or new buildings), except those marked for deletion
        if (!buildingsToDelete.has(buildingKey) && (dirtyBuildings.has(buildingKey) || newBuildings.has(buildingKey))) {
          buildingsToValidate.push({ building, key: buildingKey });
        }
      }
      
      if (buildingsToValidate.length === 0) {
        return { hasErrors: false };
      }
      
      // Validate each building
      for (const { building, key } of buildingsToValidate) {
        const dirtyChanges = dirtyBuildings.get(key) || {};
        const updatedBuilding = { ...building, ...dirtyChanges };
        const validation = await buildingValidators.validateAllFields(updatedBuilding);
        
        if (!validation.valid) {
          newValidationErrors.set(key, validation.errors);
        }
      }

      // Check invalid tax regions
      const newInvalidTaxRegions = new Set<number>();
      for (const { building, key } of buildingsToValidate) {
        if (buildingsToDelete.has(key)) continue;
        const dirtyChanges = dirtyBuildings.get(key) || {};
        const updatedBuilding = { ...building, ...dirtyChanges };
        if (updatedBuilding.tax_region) {
          try {
            const isInvalid = await buildingValidators.checkTaxRegionInvalid(updatedBuilding.tax_region);
            if (isInvalid && updatedBuilding.building_number && updatedBuilding.building_number > 0) {
              newInvalidTaxRegions.add(updatedBuilding.building_number);
            }
          } catch {
            // ignore
          }
        }
      }

      // Update validation errors state
      setValidationErrors(newValidationErrors);
      setInvalidTaxRegions(newInvalidTaxRegions);

      if (newValidationErrors.size > 0 || newInvalidTaxRegions.size > 0) {
        const errorMessages: string[] = [];
        for (const [buildingKey, errors] of newValidationErrors.entries()) {
          const building = findBuildingByKey(buildingKey);
          const buildingIdent = building?.building_number || buildingKey;
          const fieldErrors = Object.entries(errors).map(([field, msg]) => `${field}: ${msg}`).join(', ');
          errorMessages.push(`מבנה ${buildingIdent}: ${fieldErrors}`);
        }
        if (newInvalidTaxRegions.size > 0) {
          errorMessages.push(`${newInvalidTaxRegions.size} מבנים עם אזור מיסים לא תקין`);
        }
        return {
          hasErrors: true,
          errorMessage: `נמצאו שגיאות אימות ב-${newValidationErrors.size} מבנים:\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? `\n...ועוד ${errorMessages.length - 5} מבנים` : ''}`
        };
      }

      return { hasErrors: false };
    } catch (err) {
      console.error('Error running validation:', err);
      return {
        hasErrors: true,
        errorMessage: `שגיאה בבדיקת תקינות: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}`
      };
    }
  }, [buildings, dirtyBuildings, buildingsToDelete, newBuildings, getBuildingKey, findBuildingByKey]);

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
    const oldValue = event.oldValue;

    if (!field || !building) {
      return;
    }
    
    const cellKey = `${buildingKey}_${field}`;
    
    // CRITICAL: Only process if user actually interacted AND value changed
    const editStartValue = cellEditStartValues.current.get(cellKey);
    const userInteracted = cellEditUserInteracted.current.get(cellKey);
    
    // Check if this is a numeric field
    const isNumericField = ['residence_shared_area', 'business_shared_area', 'area_for_control', 'shared_parking_area', 'number_of_parking_units', 'overload_ratio', 'total_building_area', 'net_area', 'asset_count', 'gosh', 'helka', 'building_number_in_street'].includes(field);
    
    // Quick normalization for comparison
    const normalizeQuick = (val: any): any => {
      if (val == null || val === '') {
        // For numeric fields, treat null/empty as 0 for comparison
        return isNumericField ? 0 : null;
      }
      if (field === 'address') {
        const num = Number(val);
        return isNaN(num) || num <= 0 ? null : num;
      }
      if (field === 'note') {
        return String(val).trim() || null;
      }
      if (isNumericField) {
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      }
      return val;
    };
    
    const normOld = normalizeQuick(oldValue);
    const normNew = normalizeQuick(newValue);
    const valuesAreSame = normOld === normNew || (normOld == null && normNew == null);
    
    // CRITICAL: If user didn't interact and values are the same, skip entirely
    // This prevents dirty state from being set when just clicking a cell without editing
    if (userInteracted === false && valuesAreSame && !isNew) {
      cellEditStartValues.current.delete(cellKey);
      cellEditUserInteracted.current.delete(cellKey);
      return; // EARLY RETURN - don't mark dirty, don't update state
    }
    
    // If onCellValueChanged is called AND values are different, mark as interacted
    // This means the user actually typed something that changed the value
    if (!valuesAreSame && editStartValue !== undefined) {
      cellEditUserInteracted.current.set(cellKey, true);
    }
    
    // For numeric fields: normalize zero/null/empty to 0 for comparison
    const normalizeNumericForCompare = (val: any): number | null => {
      if (val == null || val === '' || val === undefined) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };
    
    // Special handling for numeric fields with zero values
    if (isNumericField && !isNew) {
      const numOld = normalizeNumericForCompare(oldValue);
      const numNew = normalizeNumericForCompare(newValue);
      const numStart = editStartValue !== undefined ? normalizeNumericForCompare(editStartValue) : null;
      
      // CRITICAL: If edit started with 0 (or null/empty) and new value is also 0, skip
      // This catches the case where user clicks a zero cell but doesn't change it
      if (numStart !== null && numStart === 0 && numNew === 0) {
        cellEditStartValues.current.delete(cellKey);
        cellEditUserInteracted.current.delete(cellKey);
        return; // EARLY RETURN - don't mark dirty, don't update state
      }
      
      // If both old and new are 0 (or null/empty treated as 0), and user hasn't interacted, skip
      if (numOld === 0 && numNew === 0 && userInteracted === false) {
        cellEditStartValues.current.delete(cellKey);
        cellEditUserInteracted.current.delete(cellKey);
        return; // EARLY RETURN - don't mark dirty, don't update state
      }
      
      // If values are different, mark that user interacted
      if (numOld !== numNew) {
        cellEditUserInteracted.current.set(cellKey, true);
      }
    }
    
    // STRICT CHECK: If user hasn't interacted AND values are the same, skip immediately
    // This catches the case where user just clicks cell without editing
    if (!isNew && userInteracted === false && valuesAreSame) {
      cellEditStartValues.current.delete(cellKey);
      cellEditUserInteracted.current.delete(cellKey);
      return;
    }
    
    // If values are different, mark that user interacted
    if (!valuesAreSame && editStartValue !== undefined) {
      cellEditUserInteracted.current.set(cellKey, true);
    }
    
    // Normalize values for comparison (with special handling for numeric fields)
    const normalizeForCompare = (val: any): any => {
      // For numeric fields, normalize null/empty to 0 for consistent comparison
      if (isNumericField) {
        if (val == null || val === '' || val === undefined) return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      }
      // For address field
      if (field === 'address') {
        if (val == null || val === '') return null;
        const num = Number(val);
        return isNaN(num) || num <= 0 ? null : num;
      }
      // For note field
      if (field === 'note') {
        return val == null || val === '' ? null : String(val).trim() || null;
      }
      // Default normalization
      if (val == null || val === '') return null;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return val.trim() || null;
      return val;
    };
    
    // Get original value from originalBuildings (before any edits) - most reliable source
    const originalBuilding = !isNew ? originalBuildings.find(b => getBuildingKey(b) === buildingKey) : null;
    let originalDataValue: any = originalBuilding ? (originalBuilding as any)[field] : undefined;
    if (field === 'address' && originalBuilding) {
      originalDataValue = (originalBuilding as any).address ?? (originalBuilding as any).building_address ?? null;
    }
    
    // Normalize both values for comparison
    const normalizedOriginalValue = normalizeForCompare(originalDataValue);
    const normalizedNewValue = normalizeForCompare(newValue);
    
    // Check if value changed from original data value (most reliable check)
    if (!isNew && normalizedOriginalValue === normalizedNewValue) {
      // Clean up any tracking
      cellEditStartValues.current.delete(cellKey);
      cellEditUserInteracted.current.delete(cellKey);
      return; // EARLY RETURN - don't mark dirty, don't update state
    }
    
    // Check edit start value if available (MOST RELIABLE - compares with value when editing started)
    if (editStartValue !== undefined) {
      const normalizedStartValue = normalizeForCompare(editStartValue);
      if (normalizedNewValue === normalizedStartValue) {
        // Clean up tracking
        cellEditStartValues.current.delete(cellKey);
        cellEditUserInteracted.current.delete(cellKey);
        return; // EARLY RETURN - don't mark dirty, don't update state
      }
    }
    
    // Also check oldValue === newValue as final safeguard
    if (!isNew && oldValue !== undefined && newValue !== undefined) {
      const normalizedOld = normalizeForCompare(oldValue);
      if (normalizedOld === normalizedNewValue) {
        cellEditStartValues.current.delete(cellKey);
        cellEditUserInteracted.current.delete(cellKey);
        return; // EARLY RETURN - don't mark dirty, don't update state
      }
    }
    
    // If we get here, value actually changed - mark user as interacted
    if (editStartValue !== undefined && userInteracted !== true) {
      cellEditUserInteracted.current.set(cellKey, true);
    }

    // Debug log for address field
    if (field === 'address') {
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

    // Validate tax_region changes: prevent change if building has assets under that region
    if (field === 'tax_region' && !isNew && building.building_number && building.building_number > 0) {
      try {
        // Get all assets for this building
        const assets = await api.assets.getAll(building.building_number);
        
        if (assets && assets.length > 0) {
          // Get unique tax regions from assets
          const assetTaxRegions = new Set<number>();
          for (const asset of assets) {
            if (asset.tax_region != null) {
              const taxRegionNum = typeof asset.tax_region === 'string' 
                ? parseInt(asset.tax_region, 10) 
                : asset.tax_region;
              if (!isNaN(taxRegionNum)) {
                assetTaxRegions.add(taxRegionNum);
              }
            }
          }

          // If there are assets with tax regions, prevent changing the building's tax_region
          if (assetTaxRegions.size > 0) {
            // Parse old and new tax regions
            const oldTaxRegions = building.tax_region 
              ? String(building.tax_region).split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r))
              : [];
            
            const newTaxRegionsStr = newValue != null ? String(newValue) : '';
            const newTaxRegions = newTaxRegionsStr.trim() !== ''
              ? newTaxRegionsStr.split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r))
              : [];

            // Check if any asset tax regions would be removed
            const assetTaxRegionsArray = Array.from(assetTaxRegions);
            const removedRegions = assetTaxRegionsArray.filter(region => !newTaxRegions.includes(region));

            if (removedRegions.length > 0) {
              // Revert the change
              if (event.node && typeof event.node.setDataValue === 'function') {
                event.node.setDataValue('tax_region', building.tax_region);
              }
              
              // Mark building as having invalid tax region change
              setInvalidTaxRegionBuildings(prev => {
                const next = new Set(prev);
                next.add(buildingKey);
                return next;
              });
              
              // Add validation error
              setValidationErrors(prev => {
                const next = new Map(prev);
                const existingErrors = next.get(buildingKey) || {};
                const regionsStr = removedRegions.sort((a, b) => a - b).join(', ');
                next.set(buildingKey, {
                  ...existingErrors,
                  tax_region: `לא ניתן לשנות את אזור המס של המבנה. יש נכסים תחת אזורי המס הבאים: ${regionsStr}`
                });
                return next;
              });
              
              // Show toast error message
              const regionsStr = removedRegions.sort((a, b) => a - b).join(', ');
              setToast({
                message: `לא ניתן לשנות את אזור המס של המבנה. יש נכסים תחת אזורי המס הבאים: ${regionsStr}`,
                type: 'error'
              });
              setTimeout(() => setToast(null), 5000);
              
              // Refresh the row to show error styling
              if (gridRef.current?.api) {
                gridRef.current.api.refreshCells({ 
                  rowNodes: [event.node], 
                  force: true 
                });
              }
              
              return;
            } else {
              // Valid change - clear any previous error for this building
              setInvalidTaxRegionBuildings(prev => {
                const next = new Set(prev);
                next.delete(buildingKey);
                return next;
              });
              
              // Clear validation error for tax_region field
              setValidationErrors(prev => {
                const next = new Map(prev);
                const existingErrors = next.get(buildingKey);
                if (existingErrors) {
                  const { tax_region, ...rest } = existingErrors;
                  if (Object.keys(rest).length > 0) {
                    next.set(buildingKey, rest);
                  } else {
                    next.delete(buildingKey);
                  }
                }
                return next;
              });
            }
          }
        }
      } catch (error) {
        console.error('Error validating tax region change:', error);
        // On error, allow the change (fail open to avoid blocking user)
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

    // For address, extract the code from formatted string if needed
    // Note: newValue should already be a number from valueSetter, but handle string case too
    let valueToUpdate = newValue;
    if (field === 'address') {
      if (typeof newValue === 'string' && newValue.includes(' - ')) {
        const codeStr = newValue.split(' - ')[0].trim();
        const code = Number(codeStr);
        valueToUpdate = isNaN(code) || code <= 0 ? null : code;
      } else if (newValue != null && newValue !== '') {
        const code = Number(newValue);
        valueToUpdate = isNaN(code) || code <= 0 ? null : code;
      } else {
        valueToUpdate = null;
      }
    }
    // For note, preserve string value (including empty string as null)
    if (field === 'note') {
      valueToUpdate = newValue === '' || newValue === null || newValue === undefined ? null : String(newValue);
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
    // For address, ensure we store the number, not the formatted string
    let valueToStore = newValue;
    if (field === 'address') {
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
    // For note, always store the value (including null for empty string)
    if (field === 'note') {
      valueToStore = newValue === '' || newValue === null || newValue === undefined ? null : String(newValue);
    }
    
    // Get original building value to compare with new value (reuse variables from earlier check)
    const originalBuildingForDirty = !isNew ? originalBuildings.find(b => getBuildingKey(b) === buildingKey) : null;
    const originalValueForDirty = originalBuildingForDirty ? (originalBuildingForDirty as any)[field] : undefined;
    
    // For address, normalize original value (could be building_address or address)
    let normalizedOriginalValueForDirty = originalValueForDirty;
    if (field === 'address' && originalBuildingForDirty) {
      normalizedOriginalValueForDirty = (originalBuildingForDirty as any).address ?? (originalBuildingForDirty as any).building_address ?? null;
      // Normalize to number for comparison
      if (normalizedOriginalValueForDirty != null) {
        normalizedOriginalValueForDirty = Number(normalizedOriginalValueForDirty);
        if (isNaN(normalizedOriginalValueForDirty) || normalizedOriginalValueForDirty <= 0) {
          normalizedOriginalValueForDirty = null;
        }
      }
    }
    // For note, normalize original (null/undefined/empty string all become null)
    if (field === 'note') {
      normalizedOriginalValueForDirty = originalValueForDirty === '' || originalValueForDirty === null || originalValueForDirty === undefined ? null : String(originalValueForDirty);
    }
    
    // Calculate updated dirty changes for validation (before state update)
    const existingDirtyChanges = dirtyBuildings.get(newBuildingKey) || {};
    const valueForValidation = field === 'address' ? valueToUpdate : newValue;
    // For address, use valueToUpdate (the number) directly, not valueToStore which might be null
    // For note, use valueToStore (the string or null)
    const valueForDirty = field === 'address' ? valueToUpdate : valueToStore;
    
    // Compare new value with original value - only mark as dirty if they're different
    const valuesAreEqual = (a: any, b: any): boolean => {
      // Handle null/undefined comparison
      if (a == null && b == null) return true;
      if (a == null || b == null) return false;
      // For numbers, compare numerically
      if (typeof a === 'number' && typeof b === 'number') return a === b;
      // For strings, compare after trimming
      if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
      // Default comparison
      return a === b;
    };
    
    // Compare with edit start value first (most reliable - user actually edited)
    const editStartValueForDirty = cellEditStartValues.current.get(`${buildingKey}_${field}`);
    let valueChanged = false;
    
    if (editStartValueForDirty !== undefined) {
      // We have the edit start value - compare with it
      const normalizeForDirtyCompare = (val: any): any => {
        if (val == null || val === '') return null;
        if (field === 'address') {
          const num = Number(val);
          return isNaN(num) || num <= 0 ? null : num;
        }
        if (field === 'note') {
          return String(val).trim() || null;
        }
        return val;
      };
      const normalizedStart = normalizeForDirtyCompare(editStartValueForDirty);
      const normalizedDirty = normalizeForDirtyCompare(valueForDirty);
      valueChanged = normalizedStart !== normalizedDirty;
    } else {
      // Fallback: compare with original building value
      valueChanged = !valuesAreEqual(valueForDirty, normalizedOriginalValueForDirty);
    }
    
    // Only mark as dirty if the value actually changed (or if it's a new building with a value)
    const shouldMarkAsDirty = isNew 
      ? (valueForDirty != null && valueForDirty !== '') // New buildings: mark if has value
      : valueChanged; // Existing buildings: mark only if changed
    
    let updatedDirtyChanges: Partial<Building>;
    if (shouldMarkAsDirty) {
      updatedDirtyChanges = { ...existingDirtyChanges, [field]: valueForDirty };
    } else {
      updatedDirtyChanges = { ...existingDirtyChanges };
      delete updatedDirtyChanges[field as keyof Building];
    }
    
    if (field !== 'building_number' || !isNew) {
      if (!isNew || shouldMarkAsDirty) {
        setDirtyBuildings(prev => {
          const next = new Map(prev);
          if (shouldMarkAsDirty) {
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

    // When "מתי להריץ אימות" is "אונליין", run validation after each cell edit (on blur)
    if (shouldValidateOnBlur) {
      runValidationProgrammatically().catch(() => {});
    }

    // Refresh grid to show dirty state and validation errors
    if (gridRef.current?.api) {
      // Refresh the changed cell - use field name, not colId
      const columnToRefresh = field;
      gridRef.current.api.refreshCells({ 
        rowNodes: [event.node], 
        columns: [columnToRefresh],
        force: true 
      });
      
      // If there are validation errors for this building, refresh all cells in the row to show error styling
      const buildingErrors = validationErrors.get(newBuildingKey);
      if (buildingErrors && Object.keys(buildingErrors).length > 0) {
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
  }, [newBuildings, isNewBuilding, getBuildingKey, dirtyBuildings, validationErrors, validateTaxRegionRemoval, originalBuildings, buildings, setBuildings, setFilteredBuildings, setDirtyBuildings, shouldValidateOnBlur, runValidationProgrammatically]);

  // Ensure clearing a numeric cell (e.g. shared areas) always triggers dirty when edit stops.
  const onCellEditingStopped = useCallback((event: any) => {
    const { data, column, colDef } = event;
    const field = colDef?.field ?? column?.getColDef?.()?.field;
    if (!field || !data) return;
    const skip = ['building_number', 'tax_region', 'elevator', 'single_double_family', 'condo', 'townhouses', 'building_address', 'overload_ratio', 'total_building_area', 'net_area', 'asset_count'];
    if (skip.includes(field)) return;
    const building = data as Building;
    const buildingKey = getBuildingKey(building);
    const isNew = isNewBuilding(building);
    
    // Get the new value
    let newValue = event.newValue ?? event.node?.data?.[field];
    if (newValue === '' || newValue === null || newValue === undefined) {
      const nullableNumeric = ['area_for_control', 'shared_parking_area', 'number_of_parking_units'];
      newValue = (field === 'residence_shared_area' || field === 'business_shared_area') ? 0 : (nullableNumeric.includes(field) ? null : null);
    }
    
    // Normalize numeric building fields for comparison and storage
    if (['residence_shared_area', 'business_shared_area', 'area_for_control', 'shared_parking_area', 'number_of_parking_units'].includes(field)) {
      if (newValue === '' || newValue === null || newValue === undefined) {
        newValue = (field === 'residence_shared_area' || field === 'business_shared_area') ? 0 : null;
      } else {
        const num = Number(newValue);
        newValue = isNaN(num) ? null : num;
      }
    }
    
    // Check if value changed from when editing started (most reliable check)
    const cellKey = `${buildingKey}_${field}`;
    const editStartValue = cellEditStartValues.current.get(cellKey);
    const userInteracted = cellEditUserInteracted.current.get(cellKey);
    
    // Normalize for comparison
    const normalizeForCompare = (val: any): any => {
      if (val == null || val === '') return null;
      if (typeof val === 'number') return isNaN(val) ? null : val;
      if (typeof val === 'string') return val.trim() || null;
      return val;
    };
    
    const normalizedNewValue = normalizeForCompare(newValue);
    const normalizedStartValue = normalizeForCompare(editStartValue);
    
    // If we have a tracked start value, compare with it
    let valueChanged = false;
    if (editStartValue !== undefined) {
      valueChanged = normalizedNewValue !== normalizedStartValue;
    } else {
      // Fallback: compare with original building value
      const originalBuilding = !isNew ? originalBuildings.find(b => getBuildingKey(b) === buildingKey) : null;
      const originalValue = originalBuilding ? (originalBuilding as any)[field] : undefined;
      let normalizedOriginalValue = normalizeForCompare(originalValue);
      valueChanged = normalizedNewValue !== normalizedOriginalValue;
    }
    
    // CRITICAL: If user didn't interact (just clicked without typing) OR value didn't change, skip entirely
    if (!isNew && (userInteracted === false || !valueChanged)) {
      // Clean up tracking
      cellEditStartValues.current.delete(cellKey);
      cellEditUserInteracted.current.delete(cellKey);
      return; // EARLY RETURN - don't mark dirty, don't update state
    }
    
    // Clean up tracking
    cellEditStartValues.current.delete(cellKey);
    cellEditUserInteracted.current.delete(cellKey);
    
    // Only update if value changed (or if it's a new building)
    if (isNew || valueChanged) {
      setDirtyBuildings(prev => {
        const next = new Map(prev);
        const existing = next.get(buildingKey) || {};
        if (valueChanged || isNew) {
          next.set(buildingKey, { ...existing, [field]: newValue });
        } else {
          // Value didn't change, remove from dirty if it was there
          const updated = { ...existing };
          delete updated[field as keyof Building];
          if (Object.keys(updated).length > 0) {
            next.set(buildingKey, updated);
          } else {
            next.delete(buildingKey);
          }
        }
        return next;
      });
      const applyBuildingUpdate = (b: Building) => {
        if (getBuildingKey(b) !== buildingKey) return b;
        const updated = { ...b, [field]: newValue };
        // Recalculate total_building_area when any shared area field changes (formula: net + residence + business + parking)
        if (['residence_shared_area', 'business_shared_area', 'shared_parking_area'].includes(field)) {
          const total =
            (Number(updated.net_area) || 0) +
            (Number(updated.residence_shared_area) || 0) +
            (Number(updated.business_shared_area) || 0) +
            (Number(updated.shared_parking_area) || 0);
          return { ...updated, total_building_area: total };
        }
        return updated;
      };
      setBuildings(prev => prev.map(applyBuildingUpdate));
      setFilteredBuildings(prev => prev.map(applyBuildingUpdate));
    }
  }, [getBuildingKey, isNewBuilding, originalBuildings]);

  // Track when cell editing starts - store initial value
  const onCellEditingStarted = useCallback((event: any) => {
    if (!event || !event.data || !event.colDef) return;
    
    const field = event.colDef?.field;
    const building = event.data as Building;
    if (!field || !building) return;
    
    const buildingKey = getBuildingKey(building);
    const cellKey = `${buildingKey}_${field}`;
    
    // Check if this is a numeric field
    const isNumericField = ['residence_shared_area', 'business_shared_area', 'area_for_control', 'shared_parking_area', 'number_of_parking_units', 'overload_ratio', 'total_building_area', 'net_area', 'asset_count', 'gosh', 'helka', 'building_number_in_street'].includes(field);
    
    // Get initial value from the building data
    let initialValue = (building as any)[field];
    
    // Normalize initial value for address field
    if (field === 'address') {
      initialValue = building.address ?? building.building_address ?? null;
      if (initialValue != null) {
        const num = Number(initialValue);
        initialValue = isNaN(num) || num <= 0 ? null : num;
      }
    }
    // Normalize initial value for numeric fields - treat null/undefined/empty as 0
    else if (isNumericField) {
      if (initialValue == null || initialValue === '' || initialValue === undefined) {
        initialValue = 0;
      } else {
        const num = Number(initialValue);
        initialValue = isNaN(num) ? 0 : num;
      }
    }
    
    // Store initial value and mark that editing started (but user hasn't interacted yet)
    cellEditStartValues.current.set(cellKey, initialValue);
    cellEditUserInteracted.current.set(cellKey, false); // User hasn't interacted yet
    
  }, [getBuildingKey]);

  // Add empty building row
  const addEmptyBuildingRow = () => {
    const tempId = `temp-${Date.now()}`;
    const newBuilding: Building = {
      building_number: 0, // Use 0 as placeholder, will be updated when user enters real number
      tax_region: null,
      residence_shared_area: null,
      business_shared_area: null,
      area_for_control: null,
      shared_parking_area: null,
      number_of_parking_units: null,
      total_building_area: null,
      elevator: false,
      single_double_family: false,
      condo: false,
      townhouses: false,
      building_address: null,
      overload_ratio: null,
      gosh: null,
      helka: null,
      building_number_in_street: null,
      note: null,
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

  // Refresh grid when validation errors change to ensure visual updates
  // Skip refresh during save operations - handleSaveAll handles refresh manually
  useEffect(() => {
    if (validationErrors.size > 0 && !isSaving && gridRef.current?.api) {
      // Use requestAnimationFrame and setTimeout to ensure React has processed state updates
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (gridRef.current?.api && !isSaving) {
            gridRef.current.api.refreshCells({ force: true });
            gridRef.current.api.redrawRows();
          }
        }, 100);
      });
    }
  }, [validationErrors, isSaving]);

  const handleValidateAll = useCallback(async () => {
    // Don't set loading to avoid refreshing the tab
    setToast(null);
    
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
        setToast({ message: 'אין מבנים לבדיקה', type: 'info' });
        setTimeout(() => setToast(null), 3000);
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

      // Recalculate invalid tax regions (deferred - only on Validate)
      const newInvalidTaxRegions = new Set<number>();
      for (const { building, key } of buildingsToValidate) {
        // Skip buildings marked for deletion
        if (buildingsToDelete.has(key)) continue;

        const dirtyChanges = dirtyBuildings.get(key) || {};
        const updatedBuilding = { ...building, ...dirtyChanges };
        if (updatedBuilding.tax_region) {
          try {
            const isInvalid = await buildingValidators.checkTaxRegionInvalid(updatedBuilding.tax_region);
            if (isInvalid && updatedBuilding.building_number && updatedBuilding.building_number > 0) {
              newInvalidTaxRegions.add(updatedBuilding.building_number);
            }
          } catch {
            // ignore
          }
        }
      }
      setInvalidTaxRegions(newInvalidTaxRegions);
      
      // Refresh grid to show validation errors and row borders
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
        // Also refresh rows to update row borders
        gridRef.current.api.refreshClientSideRowModel('filter');
      }
      
      const errorCount = newValidationErrors.size;
      if (errorCount > 0) {
        setToast({ message: `נמצאו שגיאות תקינות ב-${errorCount} מבנים`, type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setIsValidatedForSave(false);
      } else {
        setToast({ message: `כל ${buildingsToValidate.length} המבנים תקינים`, type: 'success' });
        setTimeout(() => setToast(null), 3000);
        // Validated state enables Save button (until next edit)
        setIsValidatedForSave(true);
      }
    } catch (err) {
      console.error('Error validating buildings:', err);
      setToast({ message: 'שגיאה בבדיקת תקינות המבנים', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  }, [buildings, dirtyBuildings, buildingsToDelete, getBuildingKey, isNewBuilding, totalChanges]);

  // Helper function to get area_description_for_tab from tax region number
  // Uses synchronous getAssetTypes() function from validation module
  const getAreaDescriptionForTaxRegion = useCallback((taxRegionNum: string | number | null | undefined): string => {
    if (!taxRegionNum) {
      return String(taxRegionNum || '');
    }
    
    const taxRegion = typeof taxRegionNum === 'string' ? parseInt(taxRegionNum.trim(), 10) : taxRegionNum;
    if (isNaN(taxRegion)) {
      return String(taxRegionNum);
    }
    
    // Use cached asset types from validation (synchronous, no API call)
    const cachedAssetTypes = getAssetTypes();
    if (cachedAssetTypes && Array.isArray(cachedAssetTypes) && cachedAssetTypes.length > 0) {
      const matchingAssetType = cachedAssetTypes.find((at: any) =>
        at && at.tax_region === taxRegion && at.area_description_for_tab
      );
      if (matchingAssetType?.area_description_for_tab) {
        return matchingAssetType.area_description_for_tab;
      }
    }
    
    return String(taxRegion);
  }, []);

  // Export buildings list to Excel
  const handleExportBuildingsToExcel = useCallback(async () => {
    try {
      if (!buildings || buildings.length === 0) {
        setToast({ message: 'אין מבנים לייצוא', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Filter out deleted buildings and apply dirty changes
      const buildingsToExport = buildings
        .filter(building => {
          const buildingKey = getBuildingKey(building);
          return !buildingsToDelete.has(buildingKey);
        })
        .map(building => {
          const buildingKey = getBuildingKey(building);
          const dirtyChanges = dirtyBuildings.get(buildingKey) || {};
          return { ...building, ...dirtyChanges };
        });

      // Define headers
      const headers = [
        'מזהה מבנה',
        'אזור מיסים',
        'אחוז העמסה',
        'שטח משותף מגורים',
        'שטח משותף עסקים',
        'שטח נטו',
        'מספר נכסים ברמת בניין',
        'ס"כ גודל',
        'שטח לבקרה',
        'שטח חניה משותף',
        'מספר יחידות חניה',
        'מעלית',
        'בית פרטי חד משפחתי דו משפחתי',
        'בית משותף',
        'מבנים צמודי קרקע טוריים מעל 2 יחידות',
        'כתובת',
        'גוש',
        'חלקה',
        'מספר בניין',
        'הערות'
      ];

      // Helper function to format tax region with descriptions
      const formatTaxRegion = (taxRegion: string | null | undefined): string => {
        if (!taxRegion) return '';
        if (typeof taxRegion === 'string' && taxRegion.includes(',')) {
          const taxRegions = taxRegion.split(',').map(tr => tr.trim()).filter(tr => tr);
          return taxRegions.map(tr => getAreaDescriptionForTaxRegion(tr)).join(', ');
        }
        return getAreaDescriptionForTaxRegion(taxRegion);
      };

      // Helper function to get address description
      const getAddressDescription = (streetCode: number | null | undefined): string => {
        if (!streetCode) return '';
        const address = addressList.find(a => Number(a.street_code) === Number(streetCode));
        return address ? `${address.street_code} - ${address.street_description}` : String(streetCode);
      };

      // Convert buildings to rows
      const rows = buildingsToExport.map(building => [
        building.building_number || '',
        formatTaxRegion(building.tax_region),
        building.overload_ratio != null ? `${Number(building.overload_ratio).toFixed(2)}%` : '',
        building.residence_shared_area != null && building.residence_shared_area !== 0 ? building.residence_shared_area : '',
        building.business_shared_area != null && building.business_shared_area !== 0 ? building.business_shared_area : '',
        building.net_area != null && building.net_area !== 0 ? building.net_area : '',
        building.asset_count != null ? building.asset_count : '',
        building.total_building_area != null && building.total_building_area !== 0 ? building.total_building_area : '',
        building.area_for_control != null && building.area_for_control !== 0 ? building.area_for_control : '',
        building.shared_parking_area != null && building.shared_parking_area !== 0 ? building.shared_parking_area : '',
        building.number_of_parking_units != null && building.number_of_parking_units !== 0 ? building.number_of_parking_units : '',
        building.elevator === true ? 'כן' : '',
        building.single_double_family === true ? 'כן' : '',
        building.condo === true ? 'כן' : '',
        building.townhouses === true ? 'כן' : '',
        getAddressDescription(building.address),
        building.gosh != null ? building.gosh : '',
        building.helka != null ? building.helka : '',
        building.building_number_in_street != null ? building.building_number_in_street : '',
        building.note || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const filename = `רשימת_מבנים_${dateStr}.xlsx`;

      // Export to Excel
      exportToExcel({
        filename,
        sheetName: 'מבנים',
        data,
        columnWidths: [
          { wch: 12 }, // מזהה מבנה
          { wch: 20 }, // אזור מיסים
          { wch: 12 }, // אחוז העמסה
          { wch: 18 }, // שטח משותף מגורים
          { wch: 18 }, // שטח משותף עסקים
          { wch: 12 }, // שטח נטו
          { wch: 10 }, // מספר נכסים ברמת בניין
          { wch: 12 }, // ס"כ גודל
          { wch: 12 }, // שטח לבקרה
          { wch: 12 }, // שטח חניה משותף
          { wch: 12 }, // מספר יחידות חניה
          { wch: 8 },  // מעלית
          { wch: 35 }, // בית פרטי חד משפחתי דו משפחתי
          { wch: 12 }, // בית משותף
          { wch: 40 }, // מבנים צמודי קרקע טוריים מעל 2 יחידות
          { wch: 30 }, // כתובת
          { wch: 10 }, // גוש
          { wch: 10 }, // חלקה
          { wch: 12 }, // מספר בניין
          { wch: 30 }  // הערות
        ]
      });

      setToast({ message: `יוצאו ${buildingsToExport.length} מבנים בהצלחה`, type: 'success' });
      setTimeout(() => setToast(null), 5000);
    } catch (error: any) {
      console.error('Error exporting buildings to Excel:', error);
      setToast({ message: error.message || 'שגיאה בייצוא מבנים ל-Excel', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  }, [buildings, buildingsToDelete, dirtyBuildings, addressList, getBuildingKey, getAreaDescriptionForTaxRegion]);

  // Export assets to automation system
  const handleExportToAutomation = useCallback(async () => {
    setExporting(true);
    setExportProgressMessage('מתחיל שליחה...');
    setToast(null);
    document.body.style.cursor = 'wait';

    try {
      // Get measured-not-exported assets; do not mark as exported until after successful send
      const assetsToExport = await api.assets.getMeasuredNotExported();
      if (!assetsToExport || assetsToExport.length === 0) {
        setToast({ message: 'אין נכסים לשליחה - כל הנכסים כבר נשלחו לעירייה', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        setExportToAutomationCount(0);
        return;
      }

      const numericAssetIdsForQuery = assetsToExport
        .map((asset: any) => {
          const id = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
          return !isNaN(id) && id > 0 ? id : null;
        })
        .filter((id: number | null): id is number => id !== null);

      if (numericAssetIdsForQuery.length === 0) {
        setToast({ message: 'לא נמצאו נכסים לייצוא', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        return;
      }

      // Fetch assets in batches to avoid timeouts with large exports
      let exportedAssets: any[];
      try {
        exportedAssets = await api.assets.getAssetsByIdsBatched(numericAssetIdsForQuery);
      } catch (fetchError: any) {
        console.error('Error fetching exported assets:', fetchError);
        setToast({ message: 'לא ניתן היה לייצא את הנכסים לקובץ Excel', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        return;
      }

      if (!exportedAssets || exportedAssets.length === 0) {
        setToast({ message: 'לא נמצאו נכסים לייצוא', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        setExportToAutomationCount(0);
        return;
      }

      // Define headers for asset export - matching export_automatiom_sample.xlsx format
      const headers = [
        'זיהוי משלם',
        'זיהוי נכס',
        'תחילת שינוי',
        'סוף שינוי',
        'סוג נכס',
        'גודל נכס',
        'נכס משנה 1',
        'גודל נכס משנה 1',
        'נכס משנה 2',
        'גודל נכס משנה 2',
        'נכס משנה 3',
        'גודל נכס משנה 3',
        'נכס משנה 4',
        'גודל נכס משנה 4',
        'נכס משנה 5',
        'גודל נכס משנה 5',
        'נכס משנה 6',
        'גודל נכס משנה 6',
        'מנה',
        'מקום גביה',
        'מספר פקודה',
        'שנת כספים',
        'תאריך גביה',
        'יום ערך'
      ];

      // Get asset types to determine business/residence type
      const assetTypes = getAssetTypes();
      
      // Helper function to calculate export asset size (asset_size + business_distribution_area for business assets)
      const getExportAssetSize = (asset: any): number | string => {
        const assetSize = asset.asset_size || 0;
        
        // Check if this is a business asset
        if (asset.main_asset_type && assetTypes.length > 0) {
          const assetTypeName = String(asset.main_asset_type).trim();
          
          // Try string lookup first
          let assetType = assetTypes.find((at: any) => {
            const atName = String(at.name || '').trim();
            return atName === assetTypeName;
          });
          
          // If not found, try numeric comparison
          if (!assetType) {
            const assetTypeNum = parseInt(assetTypeName, 10);
            if (!isNaN(assetTypeNum)) {
              assetType = assetTypes.find((at: any) => {
                const atName = String(at.name || '').trim();
                const atNameNum = parseInt(atName, 10);
                return !isNaN(atNameNum) && atNameNum === assetTypeNum;
              });
            }
          }
          
          // If it's a business asset, add business_distribution_area to asset_size
          if (assetType?.business_residence === 'עסקים') {
            const areaFromDistribution = asset.business_distribution_area || 0;
            return assetSize + areaFromDistribution;
          }
        }
        
        // For non-business assets, return asset_size as is
        return assetSize || '';
      };

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');

      // Group assets by tax region BEFORE creating Excel files
      const assetsByTaxRegionForExcel = new Map<string, any[]>();
      exportedAssets.forEach(asset => {
        const taxRegion = asset.tax_region ? String(asset.tax_region).trim() : 'unknown';
        if (!assetsByTaxRegionForExcel.has(taxRegion)) {
          assetsByTaxRegionForExcel.set(taxRegion, []);
        }
        assetsByTaxRegionForExcel.get(taxRegion)!.push(asset);
      });

      // Get all files for exported assets
      const numericAssetIdsForFiles = numericAssetIdsForQuery;
      const filesByAsset = await api.assets.files.getAllBulk(numericAssetIdsForFiles);
      
      // Create a map of asset_id to asset data for lookup
      // Ensure asset_id is converted to number for consistent key matching
      const assetMap = new Map<number, any>();
      exportedAssets.forEach(asset => {
        const assetId = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
        if (!isNaN(assetId) && assetId > 0) {
          assetMap.set(assetId, asset);
        }
      });
      
      setExportProgressMessage('מכין קבצים ל-ZIP...');
      // Prepare files array for ZIP
      const zipFiles: Array<{ filename: string; data: Blob }> = [];

      // Group assets by tax region for folder organization (for files)
      const assetsByTaxRegion = new Map<string, Array<{ assetId: number; asset: any; files: any[] }>>();
      
      // Build file list and organize by tax region
      for (const [assetId, files] of filesByAsset.entries()) {
        if (!files || files.length === 0) continue;
        
        const asset = assetMap.get(assetId);
        if (!asset) continue;
        
        const taxRegion = asset?.tax_region ? String(asset.tax_region).trim() : 'unknown';
        
        // Initialize tax region group if needed
        if (!assetsByTaxRegion.has(taxRegion)) {
          assetsByTaxRegion.set(taxRegion, []);
        }
        
        assetsByTaxRegion.get(taxRegion)!.push({
          assetId,
          asset,
          files
        });
      }
      
      // Process each tax region: create Excel file and download files
      // Iterate over all tax regions that have assets (not just those with files)
      for (const [taxRegion, regionAssetsForExcel] of assetsByTaxRegionForExcel.entries()) {
        // Get files for this tax region (if any)
        const regionAssets = assetsByTaxRegion.get(taxRegion) || [];
        
        // Convert assets to rows for this tax region
        const rows = regionAssetsForExcel.map(asset => [
          asset.payer_id || '',                                    // זיהוי משלם
          asset.asset_id != null ? String(asset.asset_id) : '',   // זיהוי נכס (convert to string)
          formatDateToDDMMYYYY(asset.discount_date_from) || '',  // תחילת שינוי
          formatDateToDDMMYYYY(asset.discount_date_to) || '',    // סוף שינוי
          asset.main_asset_type || '',                             // סוג נכס
          getExportAssetSize(asset),                               // גודל נכס (asset_size + business_distribution_area for business)
          asset.sub_asset_type_1 || '',                            // נכס משנה 1
          asset.sub_asset_size_1 || '',                            // גודל נכס משנה 1
          asset.sub_asset_type_2 || '',                            // נכס משנה 2
          asset.sub_asset_size_2 || '',                            // גודל נכס משנה 2
          asset.sub_asset_type_3 || '',                            // נכס משנה 3
          asset.sub_asset_size_3 || '',                            // גודל נכס משנה 3
          asset.sub_asset_type_4 || '',                            // נכס משנה 4
          asset.sub_asset_size_4 || '',                            // גודל נכס משנה 4
          asset.sub_asset_type_5 || '',                            // נכס משנה 5
          asset.sub_asset_size_5 || '',                            // גודל נכס משנה 5
          asset.sub_asset_type_6 || '',                            // סוג נכס משני 6
          asset.sub_asset_size_6 || '',                            // גודל נכסי משני 6
          '',                                                      // מנה (empty in sample)
          '',                                                      // מקום גביה (empty in sample)
          '',                                                      // מספר פקודה (empty in sample)
          '',                                                      // שנת כספים (empty in sample)
          '',                                                      // תאריך גביה (empty in sample)
          ''                                                       // יום ערך (empty in sample)
        ]);

        // Create data array with headers and rows for this tax region
        const data = [headers, ...rows];

        // Create Excel file for this tax region
        const excelFilename = `שליחת_נתונים_${taxRegion}_${dateStr}.xlsx`;
        const regionExcelBlob = createExcelBlob({
          filename: excelFilename,
          sheetName: 'נכסים',
          data,
          columnWidths: [
            { wch: 15 }, // זיהוי משלם
            { wch: 15 }, // זיהוי נכס
            { wch: 20 }, // תחילת שינוי
            { wch: 20 }, // סוף שינוי
            { wch: 12 }, // סוג נכס
            { wch: 12 }, // גודל נכס
            { wch: 15 }, // נכס משנה 1
            { wch: 15 }, // גודל נכס משנה 1
            { wch: 15 }, // נכס משנה 2
            { wch: 15 }, // גודל נכס משנה 2
            { wch: 15 }, // נכס משנה 3
            { wch: 15 }, // גודל נכס משנה 3
            { wch: 15 }, // נכס משנה 4
            { wch: 15 }, // גודל נכס משנה 4
            { wch: 15 }, // נכס משנה 5
            { wch: 15 }, // גודל נכס משנה 5
            { wch: 15 }, // נכס משנה 6
            { wch: 15 }, // גודל נכס משנה 6
            { wch: 10 }, // מנה
            { wch: 12 }, // מקום גביה
            { wch: 12 }, // מספר פקודה
            { wch: 12 }, // שנת כספים
            { wch: 15 }, // תאריך גביה
            { wch: 15 }  // יום ערך
          ]
        });
        
        // Add Excel file to ZIP in tax region folder
        zipFiles.push({
          filename: `${taxRegion}/${excelFilename}`,
          data: regionExcelBlob
        });
        
        // Prepare file list data for this tax region
        const fileListData: any[][] = [
          ['מזהה נכס', 'מזהה משלם', 'שם קובץ']
        ];
        
        // Download and add files for this tax region
        for (const { assetId, asset, files } of regionAssets) {
          const payerId = asset?.payer_id || '';
          
          for (const file of files) {
            // Extract file name from URL if file_name is not available
            let fileName = file.file_name;
            if (!fileName && file.file_url) {
              const urlParts = file.file_url.split('/');
              fileName = urlParts[urlParts.length - 1].split('?')[0];
            }
            
            // Add row to file list Excel: asset_id, payer_id, file_name
            fileListData.push([
              assetId,
              payerId,
              fileName || ''
            ]);
            
            // Download file from storage and add to ZIP
            try {
              // Extract file path from URL
              const urlParts = file.file_url.split('/');
              const urlFileName = urlParts[urlParts.length - 1].split('?')[0];
              
              // Try to extract path from URL (format: .../structure-drawings/{assetId}/{filename})
              let filePath = '';
              const structureDrawingsIndex = file.file_url.indexOf('structure-drawings/');
              if (structureDrawingsIndex !== -1) {
                filePath = file.file_url.substring(structureDrawingsIndex + 'structure-drawings/'.length).split('?')[0];
              } else {
                // Fallback: construct path from assetId and filename
                filePath = `${assetId}/${urlFileName}`;
              }
              
              // Download file from storage
              const { data: fileData, error: downloadError } = await api.storage
                .from('structure-drawings')
                .download(filePath);
              
              if (downloadError || !fileData) {
                // Check for bucket not found error
                if (downloadError?.message?.includes('Bucket not found') || downloadError?.statusCode === '404') {
                  console.error(
                    'Storage bucket "structure-drawings" not found. ' +
                    'Storage bucket "structure-drawings" not found. Configure backend file storage.'
                  );
                  // Show error to user
                  setToast({ message: 'Storage bucket "structure-drawings" not found. Configure backend file storage.', type: 'error' });
                  setTimeout(() => setToast(null), 10000);
                  continue;
                }
                console.warn(`Error downloading file for asset ${assetId}:`, downloadError);
                continue;
              }
              
              // Add file to ZIP in tax region folder: {tax_region}/{assetId}_{filename}
              const zipFilePath = `${taxRegion}/${assetId}_${fileName || urlFileName}`;
              zipFiles.push({
                filename: zipFilePath,
                data: fileData
              });
            } catch (err) {
              console.warn(`Error processing file for asset ${assetId}:`, err);
            }
          }
        }
        
        // Create file list Excel for this tax region
        if (fileListData.length > 1) {
          const fileListFilename = `רשימת_קבצים_${taxRegion}_${dateStr}.xlsx`;
          const fileListExcelBlob = createExcelBlob({
            filename: fileListFilename,
            sheetName: 'רשימת קבצים',
            data: fileListData,
            columnWidths: [
              { wch: 15 }, // מזהה נכס
              { wch: 15 }, // מזהה משלם
              { wch: 30 }  // שם קובץ
            ]
          });
          
          // Add file list Excel to ZIP in tax region folder
          zipFiles.push({
            filename: `${taxRegion}/${fileListFilename}`,
            data: fileListExcelBlob
          });
        }
      }
      
      // Create ZIP file as Blob
      const zipFilename = `שליחת_נתונים_${dateStr}.zip`;
      const { createZipBlob } = await import('../lib/zipExport');
      const zipBlob = await createZipBlob(zipFiles);
      
      const dateStrHe = new Date().toLocaleDateString('he-IL');
      const { emailService } = await import('../lib/emailService');
      const [templateOp, templateMgr] = await Promise.all([
        api.systemConfiguration.getEmailTemplate('email_template_operator'),
        api.systemConfiguration.getEmailTemplate('email_template_manager'),
      ]).catch(() => [null, null]);
      const applyTpl = (t: string, name: string, assetCount?: number) =>
        t.replace(/\{\{name\}\}/g, name).replace(/\{\{date\}\}/g, dateStrHe).replace(/\{\{assetCount\}\}/g, assetCount != null ? String(assetCount) : '');
      const operatorsList = await api.operators.getAll();
      setExportProgressMessage('מכין מיילים למפעילים ולמנהלים...');
      const byOperator = new Map<number, typeof exportedAssets>();
      for (const a of exportedAssets) {
        const id = a.operator_id;
        if (id != null) {
          if (!byOperator.has(id)) byOperator.set(id, []);
          byOperator.get(id)!.push(a);
        }
      }
      const sendItems: Array<{ to: string; recipientName: string; subject: string; body: string; attachmentFilename: string; attachmentBlob: Blob }> = [];
      for (const [operatorId, operatorAssets] of byOperator) {
        const operator = operatorsList.find(o => o.id === operatorId);
        if (!operator?.email || !operator.email.includes('@')) continue;
        const opRows = operatorAssets.map(asset => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const opData = [headers, ...opRows];
        const opExcelBlob = createExcelBlob({
          filename: `נכסים_מפעיל_${operatorId}_${dateStr}_${operatorAssets.length}נכסים.xlsx`,
          sheetName: 'נכסים',
          data: opData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        const subj = templateOp ? applyTpl(templateOp.subject, operator.name, operatorAssets.length) : `שליחת נתונים - ${dateStrHe}`;
        const body = templateOp ? applyTpl(templateOp.body, operator.name, operatorAssets.length) : `שלום ${operator.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
        sendItems.push({ to: operator.email, recipientName: operator.name, subject: subj, body, attachmentFilename: `נכסים_מפעיל_${operator.name}_${dateStr}_${operatorAssets.length}נכסים.xlsx`, attachmentBlob: opExcelBlob });
      }
      if (sendItems.length === 0) {
        const fullRows = exportedAssets.map((asset: any) => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const fullExcelBlob = createExcelBlob({
          filename: `נכסים_שליחה_${dateStr}_${exportedAssets.length}נכסים.xlsx`,
          sheetName: 'נכסים',
          data: [headers, ...fullRows],
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        for (const operator of operatorsList) {
          if (!operator?.email || !operator.email.includes('@')) continue;
          const subj = templateOp ? applyTpl(templateOp.subject, operator.name, exportedAssets.length) : `שליחת נתונים - ${dateStrHe}`;
          const body = templateOp ? applyTpl(templateOp.body, operator.name, exportedAssets.length) : `שלום ${operator.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
          sendItems.push({ to: operator.email, recipientName: operator.name, subject: subj, body, attachmentFilename: `נכסים_שליחה_${dateStr}_${exportedAssets.length}נכסים.xlsx`, attachmentBlob: fullExcelBlob });
        }
      }
      const managersList = await api.managers.getAll();
      for (const manager of managersList) {
        if (!manager.email || !manager.email.includes('@')) continue;
        const regionStrs = (manager.tax_regions || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const regionSet = new Set(regionStrs.map((s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; }).filter((n: number | null): n is number => n !== null));
        const managerAssets = exportedAssets.filter((a: any) => {
          const tr = a.tax_region != null ? (typeof a.tax_region === 'string' ? parseInt(a.tax_region, 10) : a.tax_region) : null;
          return tr != null && regionSet.has(tr);
        });
        if (managerAssets.length === 0) continue;
        const mgrRows = managerAssets.map((asset: any) => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const mgrData = [headers, ...mgrRows];
        const mgrExcelBlob = createExcelBlob({
          filename: `נכסים_מנהל_${manager.id}_${dateStr}_${managerAssets.length}נכסים.xlsx`,
          sheetName: 'נכסים',
          data: mgrData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        const subj = templateMgr ? applyTpl(templateMgr.subject, manager.name, managerAssets.length) : `שליחת נתונים - ${dateStrHe}`;
        const body = templateMgr ? applyTpl(templateMgr.body, manager.name, managerAssets.length) : `שלום ${manager.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
        sendItems.push({ to: manager.email, recipientName: manager.name, subject: subj, body, attachmentFilename: `נכסים_מנהל_${manager.name}_${dateStr}_${managerAssets.length}נכסים.xlsx`, attachmentBlob: mgrExcelBlob });
      }
      let sentCount = 0;
      if (sendItems.length > 0) {
        const { sentCount: n } = await emailService.sendExportEmailsWithProgress(
          sendItems.map((item) => ({
            to: item.to,
            subject: item.subject,
            body: item.body,
            attachmentFilename: item.attachmentFilename,
            attachmentBlob: item.attachmentBlob,
          })),
          {
            concurrency: 3,
            onProgress: (sent, total) =>
              setExportProgressMessage(`שולח מיילים ${sent} מתוך ${total}...`),
          }
        );
        sentCount = n;
      }
      setExportProgressMessage('מוריד קובץ ZIP...');
      const { createAndDownloadZip } = await import('../lib/zipExport');
      await createAndDownloadZip(zipFilename, zipFiles);

      // Mark as exported only after successful send so the count updates correctly
      try {
        await api.assets.markExportedByIds(numericAssetIdsForQuery);
        const d = new Date();
        setLatestExportDate(
          `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
        );
      } catch (markErr: any) {
        console.error('[BuildingsList] Error marking assets as exported after send:', markErr);
      }

      let successMessage = `נשלחו ${numericAssetIdsForQuery.length} נכסים לעירייה בהצלחה. הקובץ הורד.`;
      if (sentCount > 0) successMessage += ` ${sentCount} מיילים נשלחו למפעילים ולמנהלים.`;
      setToast({ message: successMessage, type: 'success' });
      setTimeout(() => setToast(null), 8000);
      await fetchExportToAutomationCount();
      window.dispatchEvent(new CustomEvent('exportToAutomationSuccess'));
    } catch (error: any) {
      console.error('Error exporting to automation:', error);
      setToast({ message: error.message || 'שגיאה בשליחת נכסים לעירייה', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setExporting(false);
      setExportProgressMessage('');
      document.body.style.cursor = '';
    }
  }, [fetchExportToAutomationCount]);

  // Save all changes
  const handleSaveAll = async () => {
    if (dirtyBuildings.size === 0 && buildingsToDelete.size === 0 && newBuildings.size === 0) return;

    // DON'T set loading=true here - it causes full component refresh (shows loading spinner)
    // Use isSaving for save button state instead to avoid tab refresh appearance
    setIsSaving(true);
    setToast(null);
    
    try {
      // מתי להריץ אימות: when validation_mode is 'off', skip validation before save
      if (shouldValidateBeforeSave) {
        const validationResult = await runValidationProgrammatically();
        if (validationResult.hasErrors) {
          setIsSaving(false);
          setToast({
            message: validationResult.errorMessage || 'נמצאו שגיאות אימות. אנא תקן לפני השמירה.',
            type: 'error',
          });
          setTimeout(() => setToast(null), 8000);
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (gridRef.current?.api) {
                gridRef.current.api.refreshCells({ force: true });
                gridRef.current.api.redrawRows();
                setTimeout(() => {
                  if (gridRef.current?.api && validationErrors.size > 0) {
                    const firstErrorBuildingKey = Array.from(validationErrors.keys())[0];
                    gridRef.current.api.forEachNode(node => {
                      const building = node.data as Building;
                      if (!building) return;
                      const buildingKey = getBuildingKey(building);
                      if (buildingKey === firstErrorBuildingKey || String(buildingKey) === String(firstErrorBuildingKey)) {
                        node.setSelected(true);
                        gridRef.current.api.ensureNodeVisible(node, 'top');
                      }
                    });
                  }
                }, 200);
              }
            }, 200);
          });
          return;
        }
      }
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
            // deleteAssetsByBuilding deletes assets (transactional) and the building
            await api.deleteAssetsByBuilding(buildingKey);
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
      try {
        // Collect bulk creates/updates
        const buildingsToCreate: any[] = [];
        const buildingsToUpdate: Array<{ building_number: number; updates: any }> = [];

        for (const buildingKey of allBuildingsToSave) {
          const building = findBuildingByKey(buildingKey);
          if (!building) continue;
          if (buildingsToDelete.has(buildingKey)) continue;

          const changes = dirtyBuildings.get(buildingKey) || {};
          const isNew = isNewBuilding(building);


          if (isNew) {
            const finalBuilding = { ...building, ...changes };
            if (!finalBuilding.building_number || finalBuilding.building_number <= 0) {
              errors.push(`מבנה חדש: מזהה מבנה נדרש ו חייב להיות חיובי`);
              continue;
            }
            if (!finalBuilding.tax_region) {
              errors.push(`מבנה ${finalBuilding.building_number}: אזור מיסים נדרש`);
              continue;
            }

            const { _tempId, _isNew, created_at, updated_at, ...buildingData } = finalBuilding as any;
            buildingsToCreate.push(buildingData);
            successfullySaved.add(buildingKey);
            successfullySaved.add(finalBuilding.building_number);
          } else {
            const actualBuildingNumber = building.building_number;
            if (!actualBuildingNumber || actualBuildingNumber <= 0) {
              errors.push(`מבנה ${buildingKey}: לא ניתן לעדכן מבנה עם מזהה מבנה לא תקין`);
              continue;
            }
            // Merge current building state for shared/parking fields so displayed values are always sent
            const updates: Record<string, unknown> = { ...changes };
            const sharedAndParkingKeys = ['residence_shared_area', 'business_shared_area', 'shared_parking_area', 'number_of_parking_units'] as const;
            for (const k of sharedAndParkingKeys) {
              const v = (building as any)[k];
              if (v !== undefined) (updates as any)[k] = v;
            }
            buildingsToUpdate.push({ building_number: actualBuildingNumber, updates });
            successfullySaved.add(buildingKey);
            successfullySaved.add(actualBuildingNumber);
          }
        }

        // Execute bulk create/update (each is one API call)
        if (buildingsToCreate.length > 0) {
          const createResult = await api.buildings.createBulk(buildingsToCreate);
          if (!createResult.success) {
            throw new Error(createResult.error || 'שגיאה בשמירת מבנים חדשים');
          }
          savedCount += createResult.count;
        }

        if (buildingsToUpdate.length > 0) {
          const updateResult = await api.buildings.updateBulk(buildingsToUpdate);
          if (!updateResult.success) {
            throw new Error(updateResult.error || 'שגיאה בעדכון מבנים');
          }
          savedCount += updateResult.count;
          
          // Update building state with returned buildings (includes updated distribution flags).
          // Recalculate total_building_area from shared areas so UI shows correct total after e.g. shared_parking_area update.
          if (updateResult.buildings && updateResult.buildings.length > 0) {
            const withRecalcTotal = (b: Building) => {
              const total = (Number(b.net_area) || 0) + (Number(b.residence_shared_area) || 0) + (Number(b.business_shared_area) || 0) + (Number(b.shared_parking_area) || 0);
              return { ...b, total_building_area: total };
            };
            setBuildings(prevBuildings => {
              const updated = [...prevBuildings];
              for (const b of updateResult.buildings!) {
                const index = updated.findIndex(p => getBuildingKey(p) === getBuildingKey(b));
                if (index >= 0) updated[index] = withRecalcTotal(b as Building);
              }
              return updated;
            });
            setOriginalBuildings(prevOriginal => {
              const updated = [...prevOriginal];
              for (const b of updateResult.buildings!) {
                const index = updated.findIndex(p => getBuildingKey(p) === getBuildingKey(b));
                if (index >= 0) updated[index] = withRecalcTotal(b as Building);
              }
              return updated;
            });
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'שגיאה בשמירה');
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
        setToast({ message: `${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`, type: 'error' });
      } else {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} מבנים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} מבנים`);
        if (successMsg.length > 0) {
          setToast({ message: successMsg.join(', '), type: 'success' });
          setTimeout(() => setToast(null), 3000);
        }
      }

      // Refresh data to get updated buildings from database
      // fetchBuildings will handle updating buildings, filteredBuildings, and originalBuildings
      // No need to manually remove deleted buildings - fetchBuildings gets fresh data from DB
      // Note: No manual grid refresh needed - fetchBuildings updates state which naturally refreshes the grid
      await fetchBuildings(false);
    } catch (error: any) {
      const errorMsg = `שגיאה בשמירה: ${error.message || error.toString()}`;
      console.error('[BuildingsList] Error saving changes:', error);
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setIsSaving(false);
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
    setToast(null); // Clear toast notifications

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
    const isDirty = dirtyBuildings.has(buildingKey) && dirtyBuildings.get(buildingKey)?.hasOwnProperty(fieldName);

    return {
      textAlign: 'right',
      fontWeight: isDirty ? 'bold' : 'normal'
    };
  };

  // Handle checkbox change
  const handleCheckboxChange = (building: Building, field: string, newValue: boolean) => {
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

  const hasBuildingBusiness = useCallback((b: Building | null | undefined): boolean => {
    if (!b) return false;
    return b.need_business_distribution === true || (b.business_shared_area != null && Number(b.business_shared_area) !== 0);
  }, []);

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
          ? Object.values(errors || {}).map((msg) => translateErrorMessage(String(msg))).join('\n')
          : '';

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {(hasValidationError || hasTaxRegionError) && (
              <ValidationTooltipIcon
                message={hasValidationError ? allErrorMessages : (hasTaxRegionError ? t('invalidTaxRegion') : '')}
              />
            )}
            {!isReadOnly && (
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
            )}
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: 'מזהה מבנה',
      editable: (params: any) => {
        if (isReadOnly) return false;
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

        const isClickable = !isNew;
        if (isClickable) {
          return (
            <span 
              style={{
                color: '#059669',
                fontWeight: '600',
                textDecoration: 'underline',
                textDecorationColor: '#10b981',
                textUnderlineOffset: '2px',
                cursor: 'default',
                transition: 'all 0.2s ease'
              }}
              className="hover:text-emerald-700 hover:decoration-emerald-600"
              title={t('viewAssets') || 'לחץ לצפייה בנכסים'}
            >
              {value}
            </span>
          );
        }
        return value;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params, 'building_number');
        const building = params.data as Building;
        if (building && !isNewBuilding(building)) {
          return {
            ...baseStyle,
            cursor: 'default',
            color: '#059669',
            fontWeight: '600',
            textDecoration: 'underline',
            textDecorationColor: '#10b981',
            textUnderlineOffset: '2px'
          };
        }
        return baseStyle;
      },
      onCellClicked: async (params: any) => {
        const building = params.data as Building;
        if (building && !isNewBuilding(building)) {
          // First check if building has multiple tax regions defined
          // If building has multiple tax regions, use them even if no assets exist yet
          const buildingTaxRegions = building.tax_region;
          const hasMultipleTaxRegions = buildingTaxRegions && typeof buildingTaxRegions === 'string' && buildingTaxRegions.includes(',');
          
          if (hasMultipleTaxRegions) {
            // Building has multiple tax regions - use them directly
            onSelectBuilding(building.building_number, buildingTaxRegions);
          } else {
            // Try to get tax regions from assets, fallback to building tax_region if available
            try {
              const availableTaxRegions = await api.buildings.getAvailableTaxRegions(building.building_number);
              // If no tax regions from assets but building has tax_region, use building's tax_region
              const taxRegionsToUse = availableTaxRegions || (buildingTaxRegions ? String(buildingTaxRegions) : undefined);
              onSelectBuilding(building.building_number, taxRegionsToUse);
            } catch (err) {
              console.error('Error getting available tax regions:', err);
              // Fallback to building tax_region if available
              const fallbackTaxRegions = buildingTaxRegions ? String(buildingTaxRegions) : undefined;
              onSelectBuilding(building.building_number, fallbackTaxRegions);
            }
          }
        }
      }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      headerTooltip: 'אזור מיסים',
      tooltipValueGetter: (params: any) => {
        if (params.value == null) return '';
        // Handle comma-separated tax regions (multiple tax regions in a building)
        if (typeof params.value === 'string' && params.value.includes(',')) {
          const taxRegions = params.value.split(',').map((tr: string) => tr.trim()).filter((tr: string) => tr);
          return taxRegions.map((tr: string) => getAreaDescriptionForTaxRegion(tr)).join(', ');
        }
        return getAreaDescriptionForTaxRegion(params.value);
      },
      editable: !isReadOnly,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const isNew = isNewBuilding(building);
        
        if (isNew && (params.value === null || params.value === undefined || params.value === '')) {
          return '';
        }
        const value = params.value != null ? params.value : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'tax_region')
    },
    {
      field: 'overload_ratio',
      headerName: 'אחוז העמסה',
      editable: false, // overload_ratio is readonly in all tabs
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null ? `${Number(params.value).toFixed(2)}%` : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'overload_ratio')
    },
    {
      field: 'residence_shared_area',
      headerName: 'שטח משותף מגורים',
      editable: (params: any) => {
        if (isReadOnly) return false;
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'residence_shared_area')
    },
    {
      field: 'business_shared_area',
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'business_shared_area')
    },
    {
      field: 'net_area',
      headerName: 'שטח נטו',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const value = params.value != null && params.value !== 0 ? params.value.toLocaleString() : '';
        return value;
      },
      cellStyle: (params) => ({ textAlign: 'right' as const })
    },
    {
      field: 'asset_count',
      headerName: 'מספר נכסים ברמת בניין',
      editable: false,
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        const value = params.value != null && params.value !== '' ? String(params.value) : '';
        return value;
      },
      cellStyle: (params) => ({ textAlign: 'right' as const })
    },
    {
      field: 'total_building_area',
      headerName: 'ס"כ גודל',
      editable: false,
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
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
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
        if (isReadOnly) return false;
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value && params.value !== 0 ? params.value.toLocaleString() : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'area_for_control')
    },
    {
      field: 'shared_parking_area',
      headerName: 'שטח חניה משותף',
      editable: (params: any) => {
        if (isReadOnly) return false;
        if (!params || !params.data) return false;
        const building = params.data as Building;
        const buildingKey = getBuildingKey(building);
        return !buildingsToDelete.has(buildingKey);
      },
      valueGetter: (params) => params?.data?.shared_parking_area,
      valueSetter: (params: any) => {
        if (params?.data == null) return;
        const newValue = params.newValue;
        const num = (newValue === null || newValue === undefined || newValue === '') ? null : (Number(newValue));
        (params.data as any).shared_parking_area = (num != null && !isNaN(num)) ? num : null;
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null && params.value !== 0 ? String(params.value).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'shared_parking_area')
    },
    {
      field: 'number_of_parking_units',
      headerName: 'מספר יחידות חניה',
      editable: (params: any) => {
        if (isReadOnly) return false;
        if (!params || !params.data) return false;
        const building = params.data as Building;
        const buildingKey = getBuildingKey(building);
        return !buildingsToDelete.has(buildingKey);
      },
      valueGetter: (params) => params?.data?.number_of_parking_units,
      valueSetter: (params: any) => {
        if (params?.data == null) return;
        const newValue = params.newValue;
        const num = (newValue === null || newValue === undefined || newValue === '') ? null : (Number(newValue));
        (params.data as any).number_of_parking_units = (num != null && !isNaN(num) && Number.isInteger(num)) ? num : null;
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null && params.value !== 0 ? String(params.value).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'number_of_parking_units')
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
        const markedForDeletion = buildingsToDelete.has(buildingKey);
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '100%' }}>
            <input
              type="checkbox"
              checked={params.value === true}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? true : false;
                params.node.setDataValue('elevator', newValue);
                handleCheckboxChange(building, 'elevator', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? ' opacity-50' : 'cursor-pointer'}`}
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
        const isChecked = params.value === true;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? true : false;
                params.node.setDataValue('single_double_family', newValue);
                handleCheckboxChange(building, 'single_double_family', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? ' opacity-50' : 'cursor-pointer'}`}
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
        const isChecked = params.value === true;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked ? true : false;
                params.node.setDataValue('condo', newValue);
                handleCheckboxChange(building, 'condo', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? ' opacity-50' : 'cursor-pointer'}`}
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
        const isChecked = params.value === true;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={markedForDeletion}
              onChange={(e) => {
                const newValue = e.target.checked;
                params.node.setDataValue('townhouses', newValue);
                handleCheckboxChange(building, 'townhouses', newValue);
              }}
              className={`w-3.5 h-3.5 ${markedForDeletion ? ' opacity-50' : 'cursor-pointer'}`}
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
      field: 'address',
      headerName: 'כתובת',
      editable: !isReadOnly,
      valueGetter: (params: any) => {
        // Return the street code from the data object
        const value = params.data?.address ?? null;
        return value;
      },
      valueSetter: (params: any) => {
        // Ensure the value is set on the data object
        if (params.data) {
          const newValue = params.newValue;
          // Convert to number if it's a valid number, otherwise null
          const numValue = newValue != null && newValue !== '' ? Number(newValue) : null;
          const finalValue = (numValue != null && !isNaN(numValue) && numValue > 0) ? numValue : null;
          
          // CRITICAL: Set the value directly on the data object
          params.data.address = finalValue;
          
        }
        return true;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) {
          return '';
        }
        
        // Use params.value (from valueGetter) as primary source, fallback to building.address
        // params.value contains the street_code (number) that is stored in DB
        const streetCode = params.value != null ? params.value : (building.address ?? null);
        
        
        if (!streetCode) {
          return '';
        }
        
        const isNew = isNewBuilding(building);
        
        // Find the address description - ensure type consistency (compare as numbers)
        const address = addressList.find(a => Number(a.street_code) === Number(streetCode));
        
        // Display only the street description (name), not the code
        // The code is stored in DB, but we show the description to the user
        const displayValue = address ? address.street_description : (streetCode ? String(streetCode) : '');
        
        
        if (isNew && !streetCode) {
          return '';
        }
        
        return displayValue;
      },
      cellEditor: AddressCellEditor,
      cellEditorParams: (params: any) => {
        return {
          addressList: addressList || [],
        };
      },
      cellStyle: (params) => getCellStyle(params, 'address')
    },
    {
      field: 'gosh',
      headerName: 'גוש',
      editable: !isReadOnly,
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null ? String(params.value) : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'gosh')
    },
    {
      field: 'helka',
      headerName: 'חלקה',
      editable: !isReadOnly,
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null ? String(params.value) : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'helka')
    },
    {
      field: 'building_number_in_street',
      headerName: 'מספר בניין',
      editable: !isReadOnly,
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
        if (isNew && (params.value === null || params.value === undefined)) {
          return '';
        }
        const value = params.value != null ? String(params.value) : '';
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'building_number_in_street')
    },
    {
      field: 'note',
      headerName: 'הערות',
      editable: !isReadOnly,
      valueGetter: (params: any) => {
        // Return the note from the data object
        return params.data?.note ?? null;
      },
      valueSetter: (params: any) => {
        // Ensure the value is set on the data object
        if (params.data) {
          const newValue = params.newValue;
          // Convert empty string to null, otherwise keep as string
          params.data.note = (newValue === '' || newValue === null || newValue === undefined) ? null : String(newValue);
        }
        return true;
      },
      cellRenderer: (params: any) => {
        const building = params.data as Building;
        if (!building) return '';
        // Use params.value (from valueGetter) as primary source, fallback to building.note
        const value = params.value != null ? params.value : (building.note ?? null);
        const isNew = isNewBuilding(building);
        if (isNew && (value === null || value === undefined || value === '')) {
          return '';
        }
        return value != null ? String(value) : '';
      },
      cellStyle: (params) => getCellStyle(params, 'note')
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
  }, [onSelectBuilding, handleDeleteBuilding, buildingsToDelete, t, invalidTaxRegions, validationErrors, dirtyBuildings, newBuildings, isNewBuilding, getBuildingKey, handleCheckboxChange, addressList, hasBuildingBusiness, isReadOnly]);

  // Apply field configurations to column definitions (ref_only pattern: rely on columnDefs prop only)
  const configVersion = useFieldConfigVersion();
  const [configuredColumnDefs, fieldConfigLoading] = useFieldConfig(columnDefs, 'buildings-list');

  // Handle create building modal
  const handleCreateBuilding = async () => {
    try {
      const buildingNumber = parseInt(newBuilding.building_number);
      const taxRegion = newBuilding.tax_region ? newBuilding.tax_region.trim() : null;

      if (isNaN(buildingNumber)) {
        setToast({ message: 'Invalid building number', type: 'error' });
        setTimeout(() => setToast(null), 3000);
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
      setToast({ message: errorMsg, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-theme-tab-active animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingBuildings')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Overlay when exporting to automation - progress in modal */}
      {exporting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center" style={{ cursor: 'wait' }}>
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
            <Loader2 className="h-12 w-12 text-theme-tab-active animate-spin" />
            <p className="text-slate-700 font-medium text-lg">שולח נתונים לעירייה</p>
            <p className="text-slate-600 text-sm text-center">{exportProgressMessage || 'מתחיל...'}</p>
          </div>
        </div>
      )}
      <div className="flex flex-col flex-1 min-h-0 w-full px-2 sm:px-4 md:px-6 py-1.5 sm:py-2">
        <div className="page-header mb-1.5 rounded-md px-2 py-1.5 flex-shrink-0 w-full">
          <div className="relative flex items-center gap-1.5 flex-wrap w-full">
            <div className="page-header-icon shrink-0">
              <img src="/buildings.png" alt="Buildings" className="w-4 h-4" />
            </div>
            <h1 className="page-header-title text-sm sm:text-base font-bold">{t('propertyListings')}</h1>
            <span className="page-header-badge">סה"כ מבנים: {filteredBuildings.length}</span>
          </div>
        </div>

        <div className="mb-1.5 flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:max-w-[20rem]">
            <input
              type="text"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              placeholder={t('searchByBuildingNumber')}
              className="w-full px-2.5 py-1.5 pr-8 border border-app-input-border rounded-md focus:ring-2 focus:ring-app-accent focus:border-app-accent text-right text-sm bg-white"
            />
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="action-bar flex-1 min-w-0 py-1 px-2">
            <div className="flex flex-col sm:flex-row justify-end gap-1.5 sm:gap-2">
              <div className="flex gap-1.5">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={addEmptyBuildingRow}
                    className="btn btn-action btn-primary"
                  >
                    <Plus className="h-5 w-5" />
                    <span>הוסף מבנה</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleValidateAll}
                  className="btn btn-action btn-primary"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <span>אמת הכל</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportBuildingsToExcel}
                  disabled={loading || buildings.length === 0}
                  className="btn btn-action btn-export"
                  title="ייצא את כל המבנים לקובץ Excel"
                >
                  <Download className="h-5 w-5" />
                  <span>ייצא ל-Excel</span>
                </button>
              </div>
              {!isReadOnly && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleCancelAll}
                    className="btn btn-action btn-cancel"
                  >
                    <X className="h-5 w-5" />
                    <span>{t('cancel')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={isSaving || totalChanges === 0}
                    className="btn btn-action btn-primary"
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    <span>{loading ? t('saving') : `${t('saveAll')}${totalChanges > 0 ? ` (${totalChanges})` : ''}`}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-theme-action-accent w-full">
          {fieldConfigLoading ? (
            <div className="flex-1 min-h-[300px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-theme-tab-active" />
            </div>
          ) : (
          <div className="ag-theme-alpine buildings-list-grid flex-1 min-h-[300px]" style={{ width: '100%', minWidth: '100%', overflowX: 'auto' }}>
            <AgGridReact
              key={`buildings-grid-${configVersion}`}
              ref={gridRef}
              rowData={sortedBuildings}
              columnDefs={configuredColumnDefs}
                defaultColDef={{
                  resizable: false, // Disabled - use field configurations instead
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
                cellStyle: { textAlign: 'right', fontSize: '16px' },
                headerClass: 'buildings-list-header',
                headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
                minWidth: 40
              }}
              gridOptions={{
                suppressColumnVirtualisation: true,
                alwaysShowHorizontalScroll: true,
                suppressMovableColumns: true,
                suppressColumnMoveAnimation: true,
              }}
              onCellValueChanged={onCellValueChanged}
              onCellEditingStopped={onCellEditingStopped}
              onCellEditingStarted={onCellEditingStarted}
              onGridReady={async (params) => {
                await gridPreferences.loadColumnState(params.api);
                // ref_only pattern: only pin actions column, columnDefs prop drives width/order/headerName
                setTimeout(() => {
                  const columnState = params.api.getColumnState();
                  const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                  if (actionsCol) {
                    const updatedState = columnState.map((col: any) => ({
                      ...col,
                      pinned: col.colId === 'actions' ? 'right' : col.pinned,
                      lockPosition: col.colId === 'actions',
                      lockPinned: col.colId === 'actions',
                    }));
                    params.api.applyColumnState({
                      state: updatedState,
                      applyOrder: true,
                      defaultState: { pinned: null }
                    });
                  }
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) gridElement.scrollLeft = 0;
                }, 150);
              }}
              onFirstDataRendered={async (params) => {
                setTimeout(() => {
                  const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                  if (gridElement) {
                    gridElement.scrollLeft = 0;
                  }
                }, 200);
              }}
              onColumnResized={(params) => {
                gridPreferences.handleColumnResized();
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
              animateRows={false}
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
              rowSelection={{
                mode: 'singleRow',
                enableClickSelection: false,
                checkboxes: false,
                hideDisabledCheckboxes: true
              }}
              stopEditingWhenCellsLoseFocus={true}
            />
          </div>
          )}
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
                      const searchLower = addressSearchValue.toLowerCase();
                      const filteredAddresses = addressSearchValue.trim()
                        ? addressList.filter(a => 
                            String(a.street_code).toLowerCase().includes(searchLower) ||
                            a.street_description?.toLowerCase().includes(searchLower) ||
                            `${a.street_code} - ${a.street_description}`.toLowerCase().includes(searchLower)
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
                    const searchLower = addressSearchValue.toLowerCase();
                    const filteredAddresses = addressSearchValue.trim()
                      ? addressList.filter(a => 
                          String(a.street_code).toLowerCase().includes(searchLower) ||
                          a.street_description?.toLowerCase().includes(searchLower) ||
                          `${a.street_code} - ${a.street_description}`.toLowerCase().includes(searchLower)
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
                            key={address.id || `${address.street_code}-${index}`}
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
                className="flex-1 px-4 py-2 bg-theme-tab-active text-white rounded-lg hover:bg-theme-tab-active-hover transition-all shadow-md hover:shadow-lg"
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

              <div className="bg-theme-highlight border border-theme-card-border rounded-lg p-4">
                <p className="text-blue-900 text-sm">
                  <strong>פעולה נדרשת:</strong> יש למחוק את הנכסים הרלוונטיים לפני שינוי אזורי המס של המבנה.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setTaxRegionValidationModal(prev => ({ ...prev, isOpen: false }))}
                className="px-6 py-2 bg-theme-tab-active hover:bg-theme-tab-active-hover active:bg-theme-tab-active-active text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
              >
                הבנתי
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
});

BuildingsList.displayName = 'BuildingsList';
