import React, { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, AddressList, Operator, api, validateAndSaveBulkAssets } from '../lib/api';
import { assetValidators, validateAll, inputValidators, validateEntity } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams, ICellEditorParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, CheckCircle2, Download, MoveLeft, Upload, FileSpreadsheet, History, Share2, MapPin, MessageSquare, FileText, BarChart3, Copy } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { DistributionHistoryModal } from './DistributionHistoryModal';
import { TransferHistoryModal } from './TransferHistoryModal';
import { ChangeTaxRegionModal } from './ChangeTaxRegionModal';
import { useValidationRules } from '../contexts/ValidationContext';
import { supabase } from '../lib/supabase';
import { compressFile } from '../lib/fileCompression';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { getAssetTypes, setLatestExportDate } from '../lib/validation';
import { createExcelBlob } from '../lib/excelExport';
import { createAndDownloadZip } from '../lib/zipExport';
import { numericValueParser, numericValueParserInt } from '../lib/numberUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { exportToExcel } from '../lib/excelExport';
import { useUserRole } from '../contexts/UserRoleContext';
import { Toast } from './Toast';
import { FileViewer } from './FileViewer';
import { AssetFilesModal } from './AssetFilesModal';
import { AssetStatisticsModal } from './AssetStatisticsModal';
interface AssetsListProps {
  buildingNumber: number;
  taxRegion?: string;
  validateInline?: boolean;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number, taxRegion?: string) => void;
  onOpenTransferAreas?: (selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) => void;
  onOpenNewAsset?: (buildingNumber: number, taxRegion?: string) => void;
  selectedAssetIds?: string[]; // Optional: filter to show only these asset IDs
  onOpenAssetsTab?: (buildingNumber: number, taxRegion: string, assetIds?: string[]) => void;
  onCloseTabAndOpenMultiTax?: (buildingNumber: number) => void;
  onCloseTab?: () => void;
  isErrorFixingMode?: boolean; // When true, hide all buttons except Validate, Save, Save as new, and Cancel
}

export interface AssetsListRef {
  hasUnsavedChanges: () => boolean;
}

// Custom cell editor for operator dropdown with filtering (same pattern as address in BuildingsList)
interface OperatorCellEditorParams extends ICellEditorParams {
  operators: Operator[];
}

const OperatorCellEditor = React.forwardRef<any, OperatorCellEditorParams>((props, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const selectedValueRef = useRef<number | null>(null);
  const dataRef = useRef(props.data);
  useEffect(() => {
    dataRef.current = props.data;
  }, [props.data]);

  const { operators = [] } = props;
  const fieldName = props.column?.getColId() || 'operator_id';

  useImperativeHandle(ref, () => ({
    getValue: () => {
      let value = selectedValueRef.current;
      if (value != null) {
        const numValue = Number(value);
        if (!isNaN(numValue) && numValue > 0) return numValue;
        return null;
      }
      return null;
    },
    isPopup: () => false
  }), [selectedValue, fieldName]);

  useEffect(() => {
    let operatorId = props.value;
    if (operatorId == null && props.data) operatorId = props.data[fieldName];
    if (operatorId == null && dataRef.current) operatorId = dataRef.current[fieldName];
    if (operatorId != null) {
      const num = Number(operatorId);
      if (!isNaN(num) && num > 0) {
        selectedValueRef.current = num;
        setSelectedValue(num);
        const o = operators.find(x => x.id === num);
        setSearchValue(o ? `${o.id} - ${o.name}` : String(num));
      } else {
        selectedValueRef.current = null;
        setSelectedValue(null);
        setSearchValue('');
      }
    } else {
      selectedValueRef.current = null;
      setSelectedValue(null);
      setSearchValue('');
    }
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }, 0);
  }, [operators, fieldName]);

  const filteredOperators = useMemo(() => {
    if (!searchValue.trim()) return operators;
    const searchLower = searchValue.toLowerCase();
    return operators.filter(o =>
      String(o.id).toLowerCase().includes(searchLower) ||
      (o.name || '').toLowerCase().includes(searchLower) ||
      `${o.id} - ${o.name}`.toLowerCase().includes(searchLower)
    );
  }, [searchValue, operators]);

  const selectOperator = useCallback((operator: Operator) => {
    const id = Number(operator.id);
    selectedValueRef.current = id;
    setSelectedValue(id);
    setSearchValue(`${operator.id} - ${operator.name}`);
    setShowDropdown(false);
    props.stopEditing();
    const node = props.node;
    const column = props.column;
    const api = props.api;
    setTimeout(() => {
      if (node && column) {
        const colId = column.getColId();
        const currentValue = node.data?.[fieldName];
        if (currentValue !== id) {
          node.setDataValue(colId, id);
          if (api) {
            api.refreshCells({ rowNodes: [node], columns: [colId], force: true });
            api.redrawRows({ rowNodes: [node] });
          }
        } else if (api) {
          api.refreshCells({ rowNodes: [node], columns: [colId], force: true });
          api.redrawRows({ rowNodes: [node] });
        }
      }
    }, 50);
    setTimeout(() => {
      if (node && column && api) {
        api.refreshCells({ rowNodes: [node], columns: [column.getColId()], force: true });
        api.redrawRows({ rowNodes: [node] });
      }
    }, 100);
  }, [fieldName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredOperators.length - 1 ? prev + 1 : prev));
      setShowDropdown(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
      setShowDropdown(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchValue.trim() === '') {
        selectedValueRef.current = null;
        props.stopEditing();
        const node = props.node;
        const column = props.column;
        const api = props.api;
        if (node?.data && column) {
          node.data[fieldName] = null;
          if (api) api.refreshCells({ rowNodes: [node], columns: [column.getColId()], force: true });
        }
        return;
      }
      if (selectedIndex >= 0 && selectedIndex < filteredOperators.length) {
        selectOperator(filteredOperators[selectedIndex]);
      } else if (filteredOperators.length === 1) {
        selectOperator(filteredOperators[0]);
      } else {
        const parsed = Number(searchValue.trim());
        if (!isNaN(parsed) && parsed > 0) {
          const match = operators.find(o => o.id === parsed);
          if (match) selectOperator(match);
          else props.stopEditing();
        } else {
          props.stopEditing();
        }
      }
    } else if (e.key === 'Escape') {
      props.stopEditing();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedOnDropdown = dropdownRef.current?.contains(target);
      const clickedOnInput = inputRef.current?.contains(target);
      if (dropdownRef.current && !clickedOnDropdown && inputRef.current && !clickedOnInput) {
        setTimeout(() => props.stopEditing(), 100);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 28, height: '100%' }}>
      <input
        ref={inputRef}
        key="operator-editor-input"
        type="text"
        value={searchValue}
        onChange={(e) => {
          setSearchValue(e.target.value);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(true)}
        style={{
          width: '100%',
          minHeight: 28,
          height: '100%',
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          direction: 'rtl',
          textAlign: 'right',
          boxSizing: 'border-box'
        }}
      />
      {showDropdown && createPortal(
        (() => {
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
                position: 'fixed',
                top: `${dropdownTop}px`,
                left: `${dropdownLeft}px`,
                width: `${dropdownWidth}px`,
                maxHeight: '200px',
                overflowY: 'auto',
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 99999,
                direction: 'rtl',
                textAlign: 'right'
              }}
            >
              {filteredOperators.length > 0 ? (
                filteredOperators.map((operator, index) => (
                  <div
                    key={operator.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTimeout(() => selectOperator(operator), 0);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === index ? '#e3f2fd' : 'white',
                      borderBottom: index < filteredOperators.length - 1 ? '1px solid #eee' : 'none',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{operator.id}</div>
                    <div style={{ fontSize: '0.9em', color: '#666' }}>{operator.name}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px 12px', color: '#666', fontStyle: 'italic' }}>
                  {operators.length === 0 ? 'אין מפעילים זמינים' : 'לא נמצאו תוצאות'}
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
OperatorCellEditor.displayName = 'OperatorCellEditor';

function AssetsListInner(props: AssetsListProps, ref: React.ForwardedRef<AssetsListRef>) {
  const { buildingNumber, taxRegion, validateInline = true, onSelectAsset, onOpenTransferAreas, onOpenNewAsset, selectedAssetIds, onOpenAssetsTab, onCloseTabAndOpenMultiTax, onCloseTab, isErrorFixingMode = false } = props;
  const { t } = useTranslation();
  const { validationRules } = useValidationRules(); // Get validation rules from context
  const { isReadOnly } = useUserRole();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [buildingAddress, setBuildingAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false); // Export to automation in progress - keep content visible
  const [exportProgressMessage, setExportProgressMessage] = useState(''); // Progress text in modal, not toast
  const [isSaving, setIsSaving] = useState(false); // Separate saving state to avoid full refresh appearance
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [newAssets, setNewAssets] = useState<Set<string>>(new Set());
  const [deletedAssets, setDeletedAssets] = useState<Set<string>>(new Set());
  const [originalAssets, setOriginalAssets] = useState<Asset[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const validationErrorsRef = useRef<Map<string, string>>(new Map());
  validationErrorsRef.current = validationErrors;
  // Save is gated behind an explicit Validate action.
  // Any edit resets this back to false.
  const [isValidatedForSave, setIsValidatedForSave] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'assets-list',
    'default'
  );


  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<ValidationProgress | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<BatchValidationResults | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ assetId: number; progress: number; fileName: string } | null>(null);
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileViewerClosing, setFileViewerClosing] = useState(false);
  const [assetFilesModalOpen, setAssetFilesModalOpen] = useState(false);
  const [selectedAssetIdForFiles, setSelectedAssetIdForFiles] = useState<number | null>(null);
  const [assetFilesModalKey, setAssetFilesModalKey] = useState(0); // Key to force refresh
  const [assetsWithFiles, setAssetsWithFiles] = useState<Set<number>>(new Set()); // Track which assets have files
  const [operators, setOperators] = useState<Operator[]>([]);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const isRefreshingAfterSaveRef = useRef<boolean>(false);
  // Track assets that were just saved to prevent re-marking them as dirty in fetchData
  const recentlySavedAssetsRef = useRef<Set<string>>(new Set());
  // Track cell values when editing starts - only mark dirty if value actually changed during edit
  const cellEditStartValues = useRef<Map<string, any>>(new Map());
  // Track if user actually interacted with the editor (typed, selected, etc.) - not just clicked
  const cellEditUserInteracted = useRef<Map<string, boolean>>(new Map());
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [distributionResult, setDistributionResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assets' | 'distribution-history' | 'transfer-history'>('assets');
  const [distributionHistoryCount, setDistributionHistoryCount] = useState<number>(0);
  const [transferHistoryCount, setTransferHistoryCount] = useState<number>(0);
  const [changeTaxRegionModalOpen, setChangeTaxRegionModalOpen] = useState(false);
  const [showAssetStatisticsModal, setShowAssetStatisticsModal] = useState(false);
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [exportToAutomationCount, setExportToAutomationCount] = useState<number>(0);

  // Any change invalidates the last validation snapshot (user must re-validate).
  // When validateInline is true, do NOT clear validation errors – inline validation will set them.
  useEffect(() => {
    const hasChanges = dirtyAssets.size > 0 || newAssets.size > 0 || deletedAssets.size > 0;
    if (hasChanges) {
      setIsValidatedForSave(false);
      if (!validateInline) {
        setValidationErrors(new Map());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyAssets, newAssets, deletedAssets, validateInline]);

  
  // Save tax region in a variable for validation handler
  // This ensures the validation handler uses the tax region from the tab, not the building's tax regions
  const validationTaxRegion = useMemo(() => {
    const result = taxRegion && taxRegion.trim() !== '' ? taxRegion.trim() : undefined;
    // Return taxRegion if it exists and is not empty, otherwise undefined
    return result;
  }, [taxRegion, buildingNumber]);

  // Helper function to check if an asset type is non_accountable_for_total_area
  const isAssetTypeNotAccountableForTotalArea = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name - ensure both are strings for comparison
    const assetTypeNameStr = String(assetTypeName).trim();
    const assetType = assetTypes.find(at => String(at.name).trim() === assetTypeNameStr);
    return assetType?.non_accountable_for_total_area === true;
  }, [assetTypes]);

  // Helper function to check if an asset is non_accountable_for_total_area
  const isAssetNotAccountableForTotalArea = useCallback((asset: Asset): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountableForTotalArea(asset.main_asset_type);
  }, [isAssetTypeNotAccountableForTotalArea]);

  // Helper function to check if an asset type is non_accountable_for_distribution
  const isAssetTypeNotAccountableForDistribution = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name - ensure both are strings for comparison
    const assetTypeNameStr = String(assetTypeName).trim();
    const assetType = assetTypes.find(at => String(at.name).trim() === assetTypeNameStr);
    return assetType?.non_accountable_for_distribution === true;
  }, [assetTypes]);

  // Helper function to check if an asset is non_accountable_for_distribution
  const isAssetNotAccountableForDistribution = useCallback((asset: Asset): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountableForDistribution(asset.main_asset_type);
  }, [isAssetTypeNotAccountableForDistribution]);

  // Helper function to check if an asset has at least one type (main or subtype) that is accountable for distribution
  // An asset is valid for distribution if it has at least one type where non_accountable_for_distribution === false
  const hasAtLeastOneAccountableTypeForDistribution = useCallback((asset: Asset): boolean => {
    if (!asset || !assetTypes || assetTypes.length === 0) {
      return false;
    }

    // Check main asset type
    if (asset.main_asset_type) {
      const mainTypeStr = String(asset.main_asset_type).trim();
      const mainAssetType = assetTypes.find(at => String(at.name).trim() === mainTypeStr);
      if (mainAssetType && mainAssetType.non_accountable_for_distribution !== true) {
        return true; // Main type is accountable
      }
    }

    // Check all subtypes (1-6)
    for (let i = 1; i <= 6; i++) {
      const subTypeField = `sub_asset_type_${i}` as keyof Asset;
      const subType = asset[subTypeField] as string | undefined;
      if (subType && subType.trim() !== '') {
        const subTypeStr = String(subType).trim();
        const subAssetType = assetTypes.find(at => String(at.name).trim() === subTypeStr);
        if (subAssetType && subAssetType.non_accountable_for_distribution !== true) {
          return true; // At least one subtype is accountable
        }
      }
    }

    // No accountable types found
    return false;
  }, [assetTypes]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, all fields are readonly (main_asset_type is readonly in all tabs except TransferAreas)
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (isReadOnly) return false;
    if (!params || !params.data) return false;
    const asset = params.data as Asset;
    const assetId = String(asset.asset_id);
    const baseEditable = newAssets.has(assetId) || !!taxRegion;
    
    // For non-accountable assets, all fields are readonly (including main_asset_type)
    if (isAssetNotAccountableForTotalArea(asset)) {
      return false;
    }
    
    return baseEditable;
  }, [isAssetNotAccountableForTotalArea, newAssets, taxRegion, isReadOnly]);

  // Helper function to get area_description_for_tab from tax region number
  const getAreaDescriptionForTaxRegion = useCallback((taxRegionNum: string | number | null | undefined): string => {
    if (!taxRegionNum || !assetTypes || assetTypes.length === 0) {
      return String(taxRegionNum || '');
    }
    
    const taxRegion = typeof taxRegionNum === 'string' ? parseInt(taxRegionNum.trim(), 10) : taxRegionNum;
    if (isNaN(taxRegion)) {
      return String(taxRegionNum);
    }
    
    // Find first asset type with matching tax_region that has area_description_for_tab
    const matchingAssetType = assetTypes.find(at =>
      at.tax_region === taxRegion && at.area_description_for_tab
    );
    
    return matchingAssetType?.area_description_for_tab || String(taxRegion);
  }, [assetTypes]);

  // Helper function to generate comprehensive tooltip for asset types
  const getAssetTypeTooltip = useCallback((assetTypeName: string | null | undefined): string => {
    if (!assetTypeName) return '';
    const assetType = assetTypes?.find(at => at.name === assetTypeName);
    if (!assetType) return String(assetTypeName);

    const parts = [];

    // Description
    if (assetType.description) {
      parts.push(assetType.description);
    }

    // Size range
    if (assetType.min_size || assetType.max_size) {
      const minSize = assetType.min_size || 0;
      const maxSize = assetType.max_size || '∞';
      parts.push(`טווח שטח: ${minSize} - ${maxSize}`);
    }

    // Flags
    const flags = [];
    if (assetType.non_accountable_for_total_area) flags.push('לא נספר בשטח מבנה');
    if (assetType.non_accountable_for_distribution) flags.push('לא נכלל בפיזור');
    if (assetType.not_accountable_for_statistics) flags.push('לא נכלל בסטטיסטיקה');
    if (assetType.use_shared_area) flags.push('משמש לפיזור שטח משותף');

    if (flags.length > 0) {
      parts.push(flags.join(' • '));
    }

    return parts.join('\n');
  }, [assetTypes]);

  // מהות שימוש: description of main_asset_type from asset_types
  const getMainAssetTypeDescription = useCallback((mainAssetTypeName: string | null | undefined): string => {
    if (!mainAssetTypeName || !assetTypes?.length) return '';
    const nameStr = String(mainAssetTypeName).trim();
    const at = assetTypes.find(t => String(t.name).trim() === nameStr);
    return at?.description ?? '';
  }, [assetTypes]);

  // Calculate total changes: new assets count as 1 each, even if edited
  // Edited existing assets (not in newAssets) + new assets + deleted assets
  // Check if there are any assets with previous residence distribution
  const hasPreviousResidenceDistribution = useMemo(() => {
    if (!assets || assets.length === 0) return false;
    // Check if any residential assets have business_distribution_area > 0
    // Residence distribution now uses business_distribution_area (same as business)
    return assets.some(asset => {
      const areaFromDist = asset.business_distribution_area || 0;
      return areaFromDist > 0;
    });
  }, [assets]);

  // Check if there are any assets with previous business distribution
  const hasPreviousBusinessDistribution = useMemo(() => {
    if (!assets || assets.length === 0) return false;
    // Check if any business assets have business_distribution_area > 0
    return assets.some(asset => {
      const areaFromDist = asset.business_distribution_area || 0;
      return areaFromDist > 0;
    });
  }, [assets]);

  const totalChanges = useMemo(() => {
    let editedExistingAssets = 0;
    for (const assetId of dirtyAssets.keys()) {
      if (!newAssets.has(String(assetId))) {
        editedExistingAssets++;
      }
    }
    return newAssets.size + editedExistingAssets + deletedAssets.size;
  }, [newAssets, dirtyAssets, deletedAssets]);

  // Check if there are any validation errors for assets that have changes
  const hasValidationErrors = useMemo(() => {
    // Check validation errors for dirty assets (edited existing assets)
    for (const assetId of dirtyAssets.keys()) {
      if (validationErrors.has(String(assetId))) {
        return true;
      }
    }
    // Check validation errors for new assets
    for (const assetId of newAssets) {
      if (validationErrors.has(String(assetId))) {
        return true;
      }
    }
    return false;
  }, [validationErrors, dirtyAssets, newAssets]);

  // Expose hasUnsavedChanges via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => totalChanges > 0
  }), [totalChanges]);
  
  // Fetch export to automation count for current building
  const fetchExportToAutomationCount = useCallback(async () => {
    if (!buildingNumber) {
      setExportToAutomationCount(0);
      return;
    }
    
    try {
      // Count assets in this building that match export condition:
      // - measurement_date IS NOT NULL
      // - exported_to_automation IS NULL OR false
      // - data_from_automation IS NULL OR false
      // Use the same query pattern as getMeasuredNotExported
      const { data, error } = await supabase
        .from('assets')
        .select('asset_id')
        .eq('building_number', buildingNumber)
        .not('measurement_date', 'is', null)
        .or('exported_to_automation.is.null,exported_to_automation.eq.false');
      
      if (error) {
        console.error('[AssetsList] Error fetching export to automation count:', error);
        setExportToAutomationCount(0);
        return;
      }
      
      // Filter by data_from_automation in JavaScript (Supabase .or() doesn't work well with multiple conditions)
      const filtered = (data || []).filter(asset => {
        // Check data_from_automation: should be null or false
        // Since we don't have the full asset data, we need to fetch it or use a different approach
        // For now, count all assets that match the first conditions
        // The actual export will filter by data_from_automation
        return true;
      });
      
      // Actually, we need to check data_from_automation too
      // Let's fetch the full data to filter properly
      const { data: fullData, error: fullError } = await supabase
        .from('assets')
        .select('asset_id, data_from_automation')
        .eq('building_number', buildingNumber)
        .not('measurement_date', 'is', null)
        .or('exported_to_automation.is.null,exported_to_automation.eq.false');
      
      if (fullError) {
        console.error('[AssetsList] Error fetching export to automation count:', fullError);
        setExportToAutomationCount(0);
        return;
      }
      
      const count = (fullData || []).filter(asset => 
        !asset.data_from_automation || asset.data_from_automation === false
      ).length;
      
      setExportToAutomationCount(count);
    } catch (err) {
      console.error('[AssetsList] Error fetching export to automation count:', err);
      setExportToAutomationCount(0);
    }
  }, [buildingNumber]);

  // Export assets to automation system (for current building only)
  const handleExportToAutomation = useCallback(async () => {
    if (!buildingNumber || !building) {
      setToast({ message: 'לא ניתן לשלוח - אין מידע על המבנה', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setExporting(true);
    setExportProgressMessage('טוען נכסים...');
    setToast(null);
    document.body.style.cursor = 'wait';

    try {
      // STEP 1: Get assets in this building that match export condition
      // Use the same query pattern as getMeasuredNotExported
      const { data: assetsToExport, error: fetchAssetsError } = await supabase
        .from('assets')
        .select('*')
        .eq('building_number', buildingNumber)
        .not('measurement_date', 'is', null)
        .or('exported_to_automation.is.null,exported_to_automation.eq.false');
      
      // Filter by data_from_automation in JavaScript (Supabase .or() doesn't work well with multiple conditions)
      const filteredAssets = (assetsToExport || []).filter(asset => 
        !asset.data_from_automation || asset.data_from_automation === false
      );
      
      if (fetchAssetsError) {
        console.error('[AssetsList] Error fetching assets to export:', fetchAssetsError);
        setToast({ message: 'שגיאה בטעינת נכסים לשליחה', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        return;
      }
      
      if (!filteredAssets || filteredAssets.length === 0) {
        setToast({ message: 'אין נכסים לשליחה - כל הנכסים כבר נשלחו לעירייה', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        document.body.style.cursor = '';
        setExportToAutomationCount(0);
        return;
      }

      // STEP 2: Validate all assets before export
      setToast({ message: 'מאמת נכסים לפני שליחה...', type: 'info' });
      
      // Prepare cached data for validation
      const cachedData = {
        assetTypes: assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll(),
        building: building
      };

      // Validate assets for this building
      const batchResult = await AssetValidationHandler.validateBuildingAssets(
        filteredAssets as Asset[],
        buildingNumber,
        {
          mode: 'building',
          validateOnlyLatest: false,
          cachedData: cachedData,
          taxRegion: validationTaxRegion,
          onProgress: (progress) => {
            setToast({ 
              message: `מאמת נכסים... ${progress.current}/${progress.total} - ${progress.currentAsset}`, 
              type: 'info' 
            });
          }
        }
      );

      // Collect validation errors
      const allValidationResults: Array<{ assetId: string; buildingNumber: number; errors: string[] }> = [];
      for (const result of batchResult.results) {
        if (!result.valid && result.errors && result.errors.length > 0) {
          const assetId = typeof result.assetId === 'string' 
            ? result.assetId 
            : String(result.assetId);
          
          allValidationResults.push({
            assetId: assetId,
            buildingNumber: buildingNumber,
            errors: result.errors
          });
        }
      }

      // STEP 3: Check if validation passed
      if (allValidationResults.length > 0) {
        const invalidCount = allValidationResults.length;
        const errorMessages = allValidationResults
          .slice(0, 5)
          .map(r => `נכס ${r.assetId}: ${r.errors.join(', ')}`)
          .join('\n');
        
        const moreErrors = invalidCount > 5 ? `\nועוד ${invalidCount - 5} נכסים עם שגיאות...` : '';
        
        setToast({ 
          message: `לא ניתן לשלוח נכסים - נמצאו ${invalidCount} נכסים עם שגיאות אימות:\n${errorMessages}${moreErrors}\n\nיש לתקן את השגיאות לפני שליחה.`, 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 15000);
        setExporting(false);
        document.body.style.cursor = '';
        return;
      }

      // STEP 4: All assets passed validation - proceed with export
      setExportProgressMessage('מתחיל שליחה...');
      setToast({ message: 'כל הנכסים עברו אימות בהצלחה. מתחיל שליחה...', type: 'success' });
      
      // Get asset IDs from filtered assets (only assets in current building/tax region)
      const assetIdsToMark = filteredAssets
        .map(asset => {
          const assetId = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
          return !isNaN(assetId) && assetId > 0 ? assetId : null;
        })
        .filter((id): id is number => id !== null);

      if (assetIdsToMark.length === 0) {
        setToast({ message: 'אין נכסים לשליחה', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        setExportToAutomationCount(0);
        return;
      }

      // Mark only the filtered assets as exported (not all assets in the system)
      const exportDate = new Date();
      const day = String(exportDate.getDate()).padStart(2, '0');
      const month = String(exportDate.getMonth() + 1).padStart(2, '0');
      const year = exportDate.getFullYear();
      const exportDateStr = `${day}/${month}/${year}`;

      // Update each asset individually to avoid type mismatch issues with .in() operator
      const updatePromises = assetIdsToMark.map(async (assetId) => {
        const { error } = await supabase
          .from('assets')
          .update({ 
            exported_to_automation: true,
            export_to_automation_at: exportDateStr
          })
          .eq('asset_id', assetId);
        return error;
      });
      
      const updateErrors = await Promise.all(updatePromises);
      const updateError = updateErrors.find(err => err !== null);

      if (updateError) {
        console.error('[AssetsList] Error marking assets as exported:', updateError);
        setToast({ message: 'שגיאה בסימון נכסים כייצאו', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        return;
      }

      // Update latest export date cache
      setLatestExportDate(exportDateStr);

      // Fetch the exported assets to export them to Excel
      // Use RPC function to avoid type mismatch issues with .in() operator
      // Ensure assetIds are numbers (not strings) for the RPC call
      const numericAssetIdsForQuery = assetIdsToMark;

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
        console.error('[AssetsList] Error fetching exported assets:', fetchError);
        setToast({ message: 'הנכסים סומנו כייצאו אך לא ניתן היה לייצא אותם לקובץ Excel', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        return;
      }

      if (!exportedAssets || exportedAssets.length === 0) {
        setToast({ message: `סומנו ${assetIdsToMark.length} נכסים כייצאו בהצלחה`, type: 'success' });
        setTimeout(() => setToast(null), 5000);
        setExporting(false);
        setExportProgressMessage('');
        document.body.style.cursor = '';
        setExportToAutomationCount(0);
        await fetchData(false);
        await fetchExportToAutomationCount();
        window.dispatchEvent(new CustomEvent('exportToAutomationSuccess'));
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
      const assetTypesData = getAssetTypes();
      
      // Helper function to calculate export asset size (asset_size + business_distribution_area for business assets)
      const getExportAssetSize = (asset: any): number | string => {
        const assetSize = asset.asset_size || 0;
        
        // Check if this is a business asset
        if (asset.main_asset_type && assetTypesData.length > 0) {
          const assetTypeName = String(asset.main_asset_type).trim();
          
          // Try string lookup first
          let assetType = assetTypesData.find((at: any) => {
            const atName = String(at.name || '').trim();
            return atName === assetTypeName;
          });
          
          // If not found, try numeric comparison
          if (!assetType) {
            const assetTypeNum = parseInt(assetTypeName, 10);
            if (!isNaN(assetTypeNum)) {
              assetType = assetTypesData.find((at: any) => {
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

      // Filter exported assets to only include assets from the current building and tax region for Excel export
      // When exporting from AssetsList, we only want to export assets in this building/tab and tax region (if specified)
      const assetsForExcel = exportedAssets.filter(asset => {
        // Filter by building number
        const assetBuildingNumber = typeof asset.building_number === 'string' 
          ? parseInt(asset.building_number, 10) 
          : (asset.building_number || 0);
        if (assetBuildingNumber !== buildingNumber) {
          return false;
        }
        
        // Filter by tax region if specified
        if (taxRegion && taxRegion.trim() !== '') {
          const taxRegionNum = parseInt(taxRegion.trim(), 10);
          const assetTaxRegion = asset.tax_region;
          
          if (assetTaxRegion == null) {
            return false;
          }
          
          // Check if the asset's tax_region matches the requested taxRegion
          const assetTaxRegionNum = typeof assetTaxRegion === 'string' 
            ? parseInt(assetTaxRegion, 10) 
            : assetTaxRegion;
          const taxRegionMatches = assetTaxRegionNum === taxRegionNum || String(assetTaxRegionNum) === taxRegion.trim();
          
          if (!taxRegionMatches) {
            return false;
          }
        }
        
        return true;
      });

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');

      // Group assets by tax region BEFORE creating Excel files
      const assetsByTaxRegionForExcel = new Map<string, any[]>();
      assetsForExcel.forEach(asset => {
        const taxRegion = asset.tax_region ? String(asset.tax_region).trim() : 'unknown';
        if (!assetsByTaxRegionForExcel.has(taxRegion)) {
          assetsByTaxRegionForExcel.set(taxRegion, []);
        }
        assetsByTaxRegionForExcel.get(taxRegion)!.push(asset);
      });

      // Filter exported assets to only include assets from the current building and tax region
      // When exporting from AssetsList, we only want files for assets in this building/tab and tax region (if specified)
      const filteredExportedAssets = exportedAssets.filter(asset => {
        // Filter by building number
        const assetBuildingNumber = typeof asset.building_number === 'string' 
          ? parseInt(asset.building_number, 10) 
          : (asset.building_number || 0);
        if (assetBuildingNumber !== buildingNumber) {
          return false;
        }
        
        // Filter by tax region if specified
        if (taxRegion && taxRegion.trim() !== '') {
          const taxRegionNum = parseInt(taxRegion.trim(), 10);
          const assetTaxRegion = asset.tax_region;
          
          if (assetTaxRegion == null) {
            return false;
          }
          
          // Check if the asset's tax_region matches the requested taxRegion
          const assetTaxRegionNum = typeof assetTaxRegion === 'string' 
            ? parseInt(assetTaxRegion, 10) 
            : assetTaxRegion;
          const taxRegionMatches = assetTaxRegionNum === taxRegionNum || String(assetTaxRegionNum) === taxRegion.trim();
          
          if (!taxRegionMatches) {
            return false;
          }
        }
        
        return true;
      });
      
      // Get all files for exported assets in the current building only
      // Ensure assetIds are numbers (not strings)
      const numericAssetIdsForFiles = filteredExportedAssets
        .map(asset => {
          const assetId = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
          return !isNaN(assetId) && assetId > 0 ? assetId : null;
        })
        .filter((id): id is number => id !== null);
      
      const filesByAsset = numericAssetIdsForFiles.length > 0 
        ? await api.assets.files.getAllBulk(numericAssetIdsForFiles)
        : new Map<number, any[]>();
      
      // Create a map of asset_id to asset data for lookup (only for assets in current building)
      // Ensure asset_id is converted to number for consistent key matching
      const assetMap = new Map<number, any>();
      filteredExportedAssets.forEach(asset => {
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
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('structure-drawings')
                .download(filePath);
              
              if (downloadError || !fileData) {
                // Check for bucket not found error
                if (downloadError?.message?.includes('Bucket not found') || downloadError?.statusCode === '404') {
                  console.error(
                    'Storage bucket "structure-drawings" not found. ' +
                    'Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "structure-drawings". ' +
                    'See CREATE_STORAGE_BUCKETS.md for detailed instructions.'
                  );
                  // Show error to user
                  setToast({ message: 'Storage bucket "structure-drawings" not found. Please create it in Supabase Dashboard. See CREATE_STORAGE_BUCKETS.md for instructions.', type: 'error' });
                  setTimeout(() => setToast(null), 10000);
                  continue;
                }
                console.warn(`[AssetsList] Error downloading file for asset ${assetId}:`, downloadError);
                continue;
              }
              
              // Add file to ZIP in tax region folder: {tax_region}/{assetId}_{filename}
              const zipFilePath = `${taxRegion}/${assetId}_${fileName || urlFileName}`;
              zipFiles.push({
                filename: zipFilePath,
                data: fileData
              });
            } catch (err) {
              console.warn(`[AssetsList] Error processing file for asset ${assetId}:`, err);
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
      const byOperator = new Map<number, typeof assetsForExcel>();
      for (const a of assetsForExcel) {
        const id = a.operator_id;
        if (id != null) {
          if (!byOperator.has(id)) byOperator.set(id, []);
          byOperator.get(id)!.push(a);
        }
      }
      setExportProgressMessage('מכין מיילים למפעילים ולמנהלים...');
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
          filename: `נכסים_מפעיל_${operatorId}_${dateStr}.xlsx`,
          sheetName: 'נכסים',
          data: opData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        const subj = templateOp ? applyTpl(templateOp.subject, operator.name, operatorAssets.length) : `שליחת נתונים - ${dateStrHe}`;
        const body = templateOp ? applyTpl(templateOp.body, operator.name, operatorAssets.length) : `שלום ${operator.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
        sendItems.push({ to: operator.email, recipientName: operator.name, subject: subj, body, attachmentFilename: `נכסים_מפעיל_${operator.name}_${dateStr}.xlsx`, attachmentBlob: opExcelBlob });
      }
      if (sendItems.length === 0) {
        const fullRows = assetsForExcel.map((asset: any) => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const fullExcelBlob = createExcelBlob({
          filename: `נכסים_שליחה_${dateStr}.xlsx`,
          sheetName: 'נכסים',
          data: [headers, ...fullRows],
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        for (const operator of operatorsList) {
          if (!operator?.email || !operator.email.includes('@')) continue;
          const subj = templateOp ? applyTpl(templateOp.subject, operator.name, assetsForExcel.length) : `שליחת נתונים - ${dateStrHe}`;
          const body = templateOp ? applyTpl(templateOp.body, operator.name, assetsForExcel.length) : `שלום ${operator.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
          sendItems.push({ to: operator.email, recipientName: operator.name, subject: subj, body, attachmentFilename: `נכסים_שליחה_${dateStr}.xlsx`, attachmentBlob: fullExcelBlob });
        }
      }
      const managersList = await api.managers.getAll();
      for (const manager of managersList) {
        if (!manager.email || !manager.email.includes('@')) continue;
        const regionStrs = (manager.tax_regions || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const regionSet = new Set(regionStrs.map((s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; }).filter((n: number | null): n is number => n !== null));
        const managerAssets = assetsForExcel.filter((a: any) => {
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
          filename: `נכסים_מנהל_${manager.id}_${dateStr}.xlsx`,
          sheetName: 'נכסים',
          data: mgrData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        const subj = templateMgr ? applyTpl(templateMgr.subject, manager.name, managerAssets.length) : `שליחת נתונים - ${dateStrHe}`;
        const body = templateMgr ? applyTpl(templateMgr.body, manager.name, managerAssets.length) : `שלום ${manager.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
        sendItems.push({ to: manager.email, recipientName: manager.name, subject: subj, body, attachmentFilename: `נכסים_מנהל_${manager.name}_${dateStr}.xlsx`, attachmentBlob: mgrExcelBlob });
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
      let successMessage = `נשלחו ${assetIdsToMark.length} נכסים לעירייה בהצלחה. הקובץ הורד.`;
      if (sentCount > 0) successMessage += ` ${sentCount} מיילים נשלחו למפעילים ולמנהלים.`;
      setToast({ message: successMessage, type: 'success' });

      setTimeout(() => setToast(null), 8000);
      
      // Refresh data and export count
      await fetchData(false);
      await fetchExportToAutomationCount();
      
      // Notify other components
      window.dispatchEvent(new CustomEvent('exportToAutomationSuccess'));
    } catch (error: any) {
      console.error('[AssetsList] Error exporting to automation:', error);
      setToast({ 
        message: error?.message || 'שגיאה בשליחת נכסים לעירייה', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setExporting(false);
      setExportProgressMessage('');
      document.body.style.cursor = '';
    }
  }, [buildingNumber, building, assetTypes, validationTaxRegion, fetchExportToAutomationCount, fetchData]);

  useEffect(() => {
    fetchData();
    fetchExportToAutomationCount();
  }, [buildingNumber, taxRegion, fetchExportToAutomationCount]);

  useEffect(() => {
    api.operators.getAll().then(setOperators).catch(() => setOperators([]));
  }, []);

  // Listen for exportToAutomationSuccess event to refresh count
  useEffect(() => {
    const handleExportSuccess = () => {
      fetchExportToAutomationCount();
    };
    
    window.addEventListener('exportToAutomationSuccess', handleExportSuccess);
    return () => {
      window.removeEventListener('exportToAutomationSuccess', handleExportSuccess);
    };
  }, [fetchExportToAutomationCount]);

  // Listen for resetExportToAutomationSuccess event to refresh count
  useEffect(() => {
    const handleResetExportSuccess = () => {
      fetchExportToAutomationCount();
    };
    
    window.addEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
    return () => {
      window.removeEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
    };
  }, [fetchExportToAutomationCount]);

  // Clear selection when switching tabs (buildingNumber or taxRegion changes)
  useEffect(() => {
    setSelectedAssets(new Set());
  }, [buildingNumber, taxRegion]);

  // Refresh building state on mount and when window/tab gains focus (no periodic polling)
  useEffect(() => {
    if (!buildingNumber) return;

    const refreshBuilding = async () => {
      try {
        const updatedBuilding = await api.buildings.getOne(buildingNumber);
        setBuilding(prevBuilding => {
          if (!prevBuilding || 
              updatedBuilding.need_residence_distribution !== prevBuilding.need_residence_distribution ||
              updatedBuilding.need_business_distribution !== prevBuilding.need_business_distribution ||
              updatedBuilding.residence_shared_area !== prevBuilding.residence_shared_area ||
              updatedBuilding.business_shared_area !== prevBuilding.business_shared_area) {
            return updatedBuilding;
          }
          return prevBuilding;
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AssetsList] Failed to refresh building:', err);
        }
      }
    };

    refreshBuilding();
    const handleFocus = () => refreshBuilding();
    const handleVisibilityChange = () => { if (!document.hidden) refreshBuilding(); };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [buildingNumber]);

  // Refresh grid when validation errors change to show error styling and invalid icon
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    // Defer to next frame so React has committed validationErrors state; ref is already updated on render
    const rafId = requestAnimationFrame(() => {
      api.redrawRows();
      const rowNodes: any[] = [];
      api.forEachNode((node) => rowNodes.push(node));
      if (rowNodes.length > 0) {
        api.refreshCells({ rowNodes, columns: ['actions'], force: true });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [validationErrors]);
  async function fetchData(showLoading = true, skipBuildingFetch = false) {
    try {
      if (showLoading) setLoading(true);
      // Use cached asset types from validation (faster, no API call)
      const { getAssetTypes } = await import('../lib/validation');
      const cachedAssetTypes = getAssetTypes();
      
      // Skip building fetch if we already have fresh data (e.g., after save)
      const [buildingData, assetsData] = await Promise.all([
        skipBuildingFetch && building ? Promise.resolve(building) : api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber)
      ]);
      
      // If skipping building fetch, preserve existing building state (don't overwrite our updates)
      // Otherwise, update with fetched data
      if (!skipBuildingFetch || !building) {
        setBuilding(buildingData);
      }
      const assetTypesToUse = cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll();
      setAssetTypes(assetTypesToUse);
      
      // Fetch building address if address (street_code) exists (single optional request)
      if (buildingData?.address) {
        try {
          const address = await api.addressList.getOne(buildingData.address);
          setBuildingAddress(address.street_description);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.error('Error fetching building address:', err);
          setBuildingAddress(null);
        }
      } else if (buildingData?.building_address) {
        try {
          const address = await api.addressList.getOne(buildingData.building_address);
          setBuildingAddress(address.street_description);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.error('Error fetching building address:', err);
          setBuildingAddress(null);
        }
      } else {
        setBuildingAddress(null);
      }
      
      if (process.env.NODE_ENV === 'development') {
      }
      
      // Filter by tax region according to tab's tax region
      // If selectedAssetIds is provided (e.g., in error fixing mode), include those assets even if tax_region doesn't match
      let filteredAssets = assetsData || [];
      const selectedAssetIdsSet = selectedAssetIds && selectedAssetIds.length > 0 
        ? new Set(selectedAssetIds.map(id => String(id)))
        : null;
      
      if (taxRegion && taxRegion.trim() !== '') {
        const taxRegionNum = parseInt(taxRegion.trim());
        const taxRegionStr = taxRegion.trim();
        
        if (process.env.NODE_ENV === 'development') {
        }
        
        filteredAssets = [];
        let skippedNoTaxRegion = 0;
        let matched = 0;
        let includedFromSelectedIds = 0;
        
        for (const asset of assetsData || []) {
          // Use asset.tax_region directly from the asset
          const assetTaxRegion = asset.tax_region;
          const assetIdStr = String(asset.asset_id);
          
          // If this asset is in selectedAssetIds, include it even if tax_region doesn't match
          // This is needed for error fixing mode when changing tax regions
          if (selectedAssetIdsSet && selectedAssetIdsSet.has(assetIdStr)) {
            filteredAssets.push(asset);
            includedFromSelectedIds++;
            continue;
          }
          
          if (assetTaxRegion == null) {
            skippedNoTaxRegion++;
            continue;
          }
          
          // Check if the asset's tax_region matches the requested taxRegion
          const assetTaxRegionNum = typeof assetTaxRegion === 'string' 
            ? parseInt(assetTaxRegion, 10) 
            : assetTaxRegion;
          const taxRegionMatches = assetTaxRegionNum === taxRegionNum || String(assetTaxRegionNum) === taxRegionStr;
          
          if (taxRegionMatches) {
            matched++;
            filteredAssets.push(asset);
          } else {
            // Log why asset was filtered out for debugging
          }
        }
        
        
        // Always filter strictly by tax region - no fallback to all assets
        // This ensures the list is always according to the tab's tax region
        if (filteredAssets.length === 0 && (assetsData || []).length > 0) {
          const assetTaxRegions = (assetsData || []).map(a => a.tax_region).filter(tr => tr != null);
          console.warn(`[AssetsList] Tax region filter resulted in 0 assets. This tab will show no assets.`, {
            requestedTaxRegion: taxRegion,
            totalAssets: (assetsData || []).length,
            assetTaxRegions: [...new Set(assetTaxRegions)]
          });
          // Keep filteredAssets as empty array - strict filtering by tab tax region
        }
      } else {
        // No tax region specified - show all assets (for "all assets" tab)
      }
      
      // Additional filter: if selectedAssetIds is provided, filter to only show those assets
      // This is applied after tax region filtering (if any)
      // Note: Assets from selectedAssetIds are already included in tax region filtering above
      if (selectedAssetIds && selectedAssetIds.length > 0 && selectedAssetIdsSet) {
        filteredAssets = filteredAssets.filter(asset => 
          selectedAssetIdsSet.has(String(asset.asset_id))
        );
      }
      
      // If in error fixing mode with selectedAssetIds and taxRegion, update assets' tax_region to match the tab's tax region
      // This ensures assets are displayed with the new tax region before they're saved
      // BUT: Don't re-mark as dirty if these assets were just saved (they're in recentlySavedAssetsRef)
      if (isErrorFixingMode && selectedAssetIds && selectedAssetIds.length > 0 && taxRegion && taxRegion.trim() !== '') {
        const newTaxRegion = parseInt(taxRegion.trim(), 10);
        if (!isNaN(newTaxRegion)) {
          filteredAssets = filteredAssets.map(asset => {
            if (selectedAssetIdsSet && selectedAssetIdsSet.has(String(asset.asset_id))) {
              const assetId = String(asset.asset_id);
              const updatedAsset = {
                ...asset,
                tax_region: newTaxRegion
              };
              
              // Only track as dirty if this asset wasn't just saved
              // This prevents re-marking assets as dirty after a successful save
              if (!recentlySavedAssetsRef.current.has(assetId)) {
                // Track the tax_region change as a dirty change so it gets saved
                setDirtyAssets(prev => {
                  const newMap = new Map(prev);
                  const existing = newMap.get(assetId) || {};
                  newMap.set(assetId, { ...existing, tax_region: newTaxRegion });
                  return newMap;
                });
              } else {
              }
              
              return updatedAsset;
            }
            return asset;
          });
        }
      }
      
      // Ensure all assets have valid IDs
      const validFilteredAssets = (filteredAssets || []).filter(asset => {
        if (!asset) return false;
        if (asset.asset_id === undefined || asset.asset_id === null) {
          console.warn('[AssetsList] Asset missing asset_id:', asset);
          return false;
        }
        return true;
      });
      
      // Preserve new assets that haven't been saved yet (failed saves remain visible)
      const existingNewAssets = assets.filter(a => {
        if (!a || a.asset_id === undefined || a.asset_id === null) return false;
        return newAssets.has(String(a.asset_id));
      });
      const mergedAssets = [...validFilteredAssets, ...existingNewAssets];
      
      
      // Update assets state - use AG Grid transaction API for smoother updates when refreshing after save
      // This preserves scroll position and selection better than full rowData replacement
      if (gridRef.current?.api && isRefreshingAfterSaveRef.current && assets.length > 0) {
        // Use transaction API for incremental updates after save
        // This is smoother and preserves UI state better
        const currentAssetIds = new Set(assets.map(a => String(a.asset_id)));
        const newAssetIds = new Set(mergedAssets.map(a => String(a.asset_id)));
        
        // Find added, updated, and removed assets
        const toAdd = mergedAssets.filter(a => !currentAssetIds.has(String(a.asset_id)));
        const toUpdate = mergedAssets.filter(a => {
          const existing = assets.find(ca => String(ca.asset_id) === String(a.asset_id));
          return existing && JSON.stringify(existing) !== JSON.stringify(a);
        });
        const toRemove = assets.filter(a => !newAssetIds.has(String(a.asset_id)));
        
        // Apply transaction for smoother update (only if there are actual changes)
        if (toAdd.length > 0 || toUpdate.length > 0 || toRemove.length > 0) {
          try {
            gridRef.current.api.applyTransaction({
              add: toAdd,
              update: toUpdate,
              remove: toRemove
            });
            // Still update state for consistency
            setAssets(mergedAssets);
            
            // Check which assets have files
            if (mergedAssets.length > 0) {
              const assetIds = mergedAssets.map(a => a.asset_id).filter(id => id != null).map(id => Number(id)).filter(id => !isNaN(id));
              const filesMap = new Set<number>();
              
              // Bulk fetch files for all assets in a single API call
              if (assetIds.length > 0) {
                try {
                  const filesByAsset = await api.assets.files.getAllBulk(assetIds);
                  filesByAsset.forEach((files, assetId) => {
                    if (files && files.length > 0) {
                      filesMap.add(assetId);
                    }
                  });
                } catch (err) {
                  console.warn('[AssetsList] Error bulk fetching asset files:', err);
                  // Fallback: if bulk fails, try individual fetches
                  await Promise.all(
                    assetIds.map(async (assetId) => {
                      try {
                        const files = await api.assets.files.getAll(assetId);
                        if (files && files.length > 0) {
                          filesMap.add(assetId);
                        }
                      } catch (err) {
                        // Ignore errors - asset might not have files
                      }
                    })
                  );
                }
              }
              
              setAssetsWithFiles(filesMap);
            } else {
              setAssetsWithFiles(new Set());
            }
            
            return; // Early return to skip the setAssets call below
          } catch (err) {
            console.warn('[AssetsList] Transaction API failed, falling back to full update:', err);
            // Fall through to regular setAssets
          }
        } else {
          // No changes detected, just update state
          setAssets(mergedAssets);
          
          // Check which assets have files
          if (mergedAssets.length > 0) {
            const assetIds = mergedAssets.map(a => a.asset_id).filter(id => id != null).map(id => Number(id)).filter(id => !isNaN(id));
            const filesMap = new Set<number>();
            
            // Bulk fetch files for all assets in a single API call
            if (assetIds.length > 0) {
              try {
                const filesByAsset = await api.assets.files.getAllBulk(assetIds);
                filesByAsset.forEach((files, assetId) => {
                  if (files && files.length > 0) {
                    filesMap.add(assetId);
                  }
                });
              } catch (err) {
                console.warn('[AssetsList] Error bulk fetching asset files:', err);
                // Fallback: if bulk fails, try individual fetches
                await Promise.all(
                  assetIds.map(async (assetId) => {
                    try {
                      const files = await api.assets.files.getAll(assetId);
                      if (files && files.length > 0) {
                        filesMap.add(assetId);
                      }
                    } catch (err) {
                      // Ignore errors - asset might not have files
                    }
                  })
                );
              }
            }
            
            setAssetsWithFiles(filesMap);
          } else {
            setAssetsWithFiles(new Set());
          }
          
          return;
        }
      }
      
      // Regular update for initial load or when transaction API isn't available
      setAssets(mergedAssets);
      
      // Check which assets have files
      if (mergedAssets.length > 0) {
        const assetIds = mergedAssets.map(a => a.asset_id).filter(id => id != null).map(id => Number(id)).filter(id => !isNaN(id));
        const filesMap = new Set<number>();
        
        // Bulk fetch files for all assets in a single API call
        if (assetIds.length > 0) {
          try {
            const filesByAsset = await api.assets.files.getAllBulk(assetIds);
            filesByAsset.forEach((files, assetId) => {
              if (files && files.length > 0) {
                filesMap.add(assetId);
              }
            });
          } catch (err) {
            console.warn('[AssetsList] Error bulk fetching asset files:', err);
            // Fallback: if bulk fails, try individual fetches
            await Promise.all(
              assetIds.map(async (assetId) => {
                try {
                  const files = await api.assets.files.getAll(assetId);
                  if (files && files.length > 0) {
                    filesMap.add(assetId);
                  }
                } catch (err) {
                  // Ignore errors - asset might not have files
                }
              })
            );
          }
        }
        
        setAssetsWithFiles(filesMap);
      } else {
        setAssetsWithFiles(new Set());
      }
      
      // Store original assets for cancel functionality
      // Update originalAssets whenever we load fresh data and there are no pending changes
      // This ensures cancel button always has the correct baseline
      if (dirtyAssets.size === 0 && newAssets.size === 0 && deletedAssets.size === 0) {
        setOriginalAssets(JSON.parse(JSON.stringify(mergedAssets)));
      } else {
        // Even if there are pending changes, update originalAssets with the fresh data
        // This ensures that after save/delete operations, cancel will restore to the last saved state
        // We only skip updating if we're in the middle of editing
        const hasActiveChanges = dirtyAssets.size > 0 || newAssets.size > 0 || deletedAssets.size > 0;
        // Only update if we explicitly want to (like after a save operation that refreshed data)
        // This is handled separately in handleSaveAll after fetchData
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load assets', type: 'error' });
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  // Helper function to validate discount dates
  const validateDiscountDates = useCallback((asset: Asset): string[] => {
    const errors: string[] = [];
    
    // If discount_type is provided, dates must be provided
    if (asset.discount_type && asset.discount_type.trim() !== '') {
      if (!asset.discount_date_from || asset.discount_date_from.trim() === '') {
        errors.push('כאשר יש קוד הנחה, תאריך הנחה מ הוא חובה');
      }
      if (!asset.discount_date_to || asset.discount_date_to.trim() === '') {
        errors.push('כאשר יש קוד הנחה, תאריך הנחה עד הוא חובה');
      }
      
      // If both dates are provided, validate that date_to > date_from
      if (asset.discount_date_from && asset.discount_date_from.trim() !== '' &&
          asset.discount_date_to && asset.discount_date_to.trim() !== '') {
        const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const fromMatch = asset.discount_date_from.trim().match(dateFormatPattern);
        const toMatch = asset.discount_date_to.trim().match(dateFormatPattern);
        
        if (fromMatch && toMatch) {
          const fromDay = parseInt(fromMatch[1], 10);
          const fromMonth = parseInt(fromMatch[2], 10);
          const fromYear = parseInt(fromMatch[3], 10);
          const toDay = parseInt(toMatch[1], 10);
          const toMonth = parseInt(toMatch[2], 10);
          const toYear = parseInt(toMatch[3], 10);
          
          const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
          const toDate = new Date(toYear, toMonth - 1, toDay);
          
          if (toDate <= fromDate) {
            errors.push('תאריך הנחה עד חייב להיות גדול מתאריך הנחה מ');
          }
        }
      }
    }
    
    return errors;
  }, []);

  const getRowStyle = useCallback((params: { data?: { asset_id?: unknown; _validationError?: string }; } | null) => {
    if (!params?.data) return null;
    const assetId = String(params.data.asset_id);
    if (deletedAssets.has(assetId)) {
      return { backgroundColor: '#fee2e2', opacity: 0.7 };
    }
    const hasError = (params.data as any)._validationError != null || validationErrors?.has(assetId);
    if (hasError) {
      return { borderLeft: '3px solid #dc2626', backgroundColor: '#fef2f2' };
    }
    return null;
  }, [deletedAssets, validationErrors]);

  const onCellValueChanged = useCallback(async (event: any) => {
    // Skip validation if we're currently refreshing after save (prevents unnecessary API calls)
    // This is critical - when fetchData updates assets state, AG Grid may trigger this event
    // for cells that have changed values, even though the user didn't edit them
    if (isRefreshingAfterSaveRef.current) {
      // Still update the local state to reflect the change, but skip validation
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = String(data.asset_id);
      let newValue = event.newValue;

      // Normalize empty values: set to null for strings, 0 for numbers
      if (newValue === '' || newValue === null || newValue === undefined) {
        // Check if this is a numeric field based on column type
        const isNumericField = colDef.type === 'numericColumn' || 
          field === 'asset_size' || 
          field?.startsWith('sub_asset_size_') || 
          field === 'tax_region';
        
        if (isNumericField) {
          newValue = 0;
        } else {
          newValue = null;
        }
      }

      const updatedAsset = { ...data, [field]: newValue };
      
      // Even during refresh, if user manually changes a field, mark it as dirty
      // This ensures user edits are not lost during refresh
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        const changesToStore = { ...existing, [field]: newValue };
        newMap.set(assetId, changesToStore);
        return newMap;
      });
      
      // Update assets state without triggering validation
      setAssets(prevAssets =>
        prevAssets.map(asset =>
          String(asset.asset_id) === String(assetId) ? updatedAsset : asset
        )
      );
      return;
    }
    
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = String(data.asset_id);
      const isNew = newAssets.has(assetId);
      const oldValue = event.oldValue;
      let newValue = event.newValue;
      
      const cellKey = `${assetId}_${field}`;
      const editStartValue = cellEditStartValues.current.get(cellKey);
      const userInteracted = cellEditUserInteracted.current.get(cellKey);

      // Normalize empty values: set to null for strings, 0 for numbers
      if (newValue === '' || newValue === null || newValue === undefined) {
        // Check if this is a numeric field based on column type
        const isNumericField = colDef.type === 'numericColumn' || 
          field === 'asset_size' || 
          field?.startsWith('sub_asset_size_') || 
          field === 'tax_region';
        
        if (isNumericField) {
          newValue = 0;
        } else {
          newValue = null;
        }
      }

      // operator_id: ensure we always store id (number) or null; editor may pass name (string)
      if (field === 'operator_id' && operators?.length) {
        if (typeof newValue === 'string' && newValue.trim()) {
          const o = operators.find(x => x.name === newValue.trim());
          newValue = o?.id ?? null;
        } else if (typeof newValue !== 'number' || isNaN(newValue)) {
          newValue = null;
        }
      }

      // Quick normalization for comparison
      const normalizeQuick = (val: any): any => {
        if (val == null || val === '') {
          const isNumericField = colDef.type === 'numericColumn' || 
            field === 'asset_size' || 
            field?.startsWith('sub_asset_size_') || 
            field === 'tax_region';
          return isNumericField ? 0 : null;
        }
        if (typeof val === 'string') return val.trim() || null;
        if (typeof val === 'number') return isNaN(val) ? null : val;
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

      // Create updated asset with new value
      let updatedAsset = { ...data, [field]: newValue };

      // Handle main_asset_type changes (no online validation; only apply safe auto-fixes)
      if (field === 'main_asset_type' && newValue) {
        const newAssetTypeName = String(newValue).trim();
        const newAssetType = assetTypes?.find(at => {
          const atNameStr = String(at.name).trim();
          return atNameStr === newAssetTypeName;
        });
        
        // If asset type not found, try numeric comparison
        const newAssetTypeFinal = newAssetType || assetTypes?.find(at => {
          const atNameNum = parseInt(String(at.name).trim(), 10);
          const newTypeNum = parseInt(newAssetTypeName, 10);
          return !isNaN(atNameNum) && !isNaN(newTypeNum) && atNameNum === newTypeNum;
        });

        if (newAssetTypeFinal) {
          // If new asset type has non_accountable_for_distribution = true and asset has business_distribution_area > 0, set it to 0
          if (newAssetTypeFinal.non_accountable_for_distribution === true) {
            const currentAreaFromDistribution = updatedAsset.business_distribution_area || 0;
            if (currentAreaFromDistribution > 0) {
              updatedAsset = { ...updatedAsset, business_distribution_area: 0 };
            }
          }
        }
      }

      // Only mark as dirty if value actually changed (or if it's a new asset with a value)
      const shouldMarkAsDirty = isNew 
        ? (newValue != null && newValue !== '') // New assets: mark if has value
        : !valuesAreSame; // Existing assets: mark only if changed
      
      if (shouldMarkAsDirty) {
        // Track the change in dirtyAssets immediately (no debounce)
        setDirtyAssets(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(assetId) || {};
          const changesToStore = { ...existing, [field]: newValue };
          // Also include business_distribution_area change if it was set to 0
          if (updatedAsset.business_distribution_area !== data.business_distribution_area) {
            changesToStore.business_distribution_area = updatedAsset.business_distribution_area;
          }
          newMap.set(assetId, changesToStore);
          return newMap;
        });
      } else {
        // Value didn't change, remove from dirty if it was there
        setDirtyAssets(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(assetId) || {};
          if (Object.keys(existing).length > 0) {
            const updated = { ...existing };
            delete updated[field as keyof Asset];
            if (Object.keys(updated).length > 0) {
              newMap.set(assetId, updated);
            } else {
              newMap.delete(assetId);
            }
          }
          return newMap;
        });
      }

      // Don't update assets state here - wait until editing stops to prevent re-renders on every keystroke
      // The grid will show the updated value immediately via its internal state
      // We'll update our state in onCellEditingStopped
      // Also don't refresh cells here - wait until editing stops to prevent re-renders during typing

      // When validateInline is false, clear validation errors on edit (validate before save only).
      // When validateInline is true, run inline validation here (onCellValueChanged fires for dropdown/select edits; onCellEditingStopped may not)
      startTransition(() => {
        setIsValidatedForSave(false);
        if (!validateInline) {
          setValidationErrors(new Map());
        } else if (shouldMarkAsDirty) {
          const nextDirty = { ...(dirtyAssets.get(assetId) || {}), [field]: newValue };
          if (updatedAsset.business_distribution_area !== data.business_distribution_area) {
            nextDirty.business_distribution_area = updatedAsset.business_distribution_area;
          }
          const assetForValidation = { ...data, ...nextDirty };
          const cachedData = { assetTypes: assetTypes || [], building: building };
          AssetValidationHandler.validateSingleAsset(assetForValidation, { taxRegion: validationTaxRegion, cachedData })
            .then((result) => {
              const discountErrors = validateDiscountDates(assetForValidation);
              const allErrors = [...(result.errors || []), ...discountErrors];
              const actualValid = result.valid && allErrors.length === 0;
              setValidationErrors((prev) => {
                const next = new Map(prev);
                if (actualValid) next.delete(assetId);
                else if (allErrors.length > 0) next.set(assetId, allErrors.join('\n'));
                return next;
              });
              if (gridRef.current?.api) {
                gridRef.current.api.refreshCells({ force: true });
                gridRef.current.api.redrawRows();
              }
            })
            .catch((err) => console.error('[AssetsList] Inline validation error:', err));
        }
      });

    } catch (error) {
      console.error('Error tracking change:', error);
      setToast({ message: 'Failed to track change', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  }, [validationTaxRegion, assetTypes, building, setAssets, taxRegion, newAssets, originalAssets, operators, validateInline, dirtyAssets, validateDiscountDates]);

  // Track when cell editing starts - store initial value
  const onCellEditingStarted = useCallback((event: any) => {
    if (!event || !event.data || !event.colDef) return;
    
    const field = event.colDef?.field;
    const asset = event.data as Asset;
    if (!field || !asset) return;
    
    const assetId = String(asset.asset_id);
    const cellKey = `${assetId}_${field}`;
    
    // Check if this is a numeric field
    const isNumericField = event.colDef?.type === 'numericColumn' ||
      field === 'asset_size' || 
      field?.startsWith('sub_asset_size_') || 
      field === 'tax_region';
    
    // Get initial value from the asset data
    let initialValue = (asset as any)[field];
    
    // Normalize initial value for numeric fields - treat null/undefined/empty as 0
    if (isNumericField) {
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
  }, []);

  // Ensure clearing a cell (e.g. numeric → 0) always triggers dirty. onCellValueChanged may not
  // fire when parsed value equals current (e.g. 0→0). onCellEditingStopped always fires when edit ends.
  const onCellEditingStopped = useCallback((event: any) => {
    if (isRefreshingAfterSaveRef.current) return;
    const { data, column, colDef } = event;
    const field = colDef?.field ?? column?.getColDef?.()?.field;
    if (!data?.asset_id || !field) return;
    const assetId = String(data.asset_id);
    const isNew = newAssets.has(assetId);
    const cellKey = `${assetId}_${field}`;
    const editStartValue = cellEditStartValues.current.get(cellKey);
    const userInteracted = cellEditUserInteracted.current.get(cellKey);
    
    let newValue = event.newValue ?? event.node?.data?.[field];
    if (newValue === '' || newValue === null || newValue === undefined) {
      const isNumericField = colDef?.type === 'numericColumn' ||
        field === 'asset_size' || field?.startsWith('sub_asset_size_') ||
        field === 'tax_region';
      newValue = isNumericField ? 0 : null;
    }
    
    // Normalize for comparison
    const normalizeForCompare = (val: any): any => {
      if (val == null || val === '') {
        const isNumericField = colDef?.type === 'numericColumn' ||
          field === 'asset_size' || field?.startsWith('sub_asset_size_') ||
          field === 'tax_region';
        return isNumericField ? 0 : null;
      }
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
      // Fallback: compare with original asset value
      const originalAsset = !isNew ? originalAssets.find(a => String(a.asset_id) === assetId) : null;
      const originalValue = originalAsset ? (originalAsset as any)[field] : undefined;
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
    
    // Only update if value changed (or if it's a new asset)
    if (isNew || valueChanged) {
      const nextDirtyForAsset = { ...(dirtyAssets.get(assetId) || {}), [field]: newValue };
      const updatedAsset = { ...data, ...nextDirtyForAsset };
      setDirtyAssets(prev => {
        const next = new Map(prev);
        const existing = next.get(assetId) || {};
        next.set(assetId, { ...existing, [field]: newValue });
        return next;
      });
      // Update assets state only when editing stops (not on every keystroke)
      // This prevents re-renders during typing and improves performance
      // Use startTransition to prevent blocking the UI
      startTransition(() => {
        setAssets(prev => prev.map(a =>
          String(a.asset_id) === assetId ? { ...a, [field]: newValue } : a
        ));
        setIsValidatedForSave(false);
        if (!validateInline) {
          setValidationErrors(new Map());
        }
      });
      // When validateInline is true, run single-asset validation after cell blur
      if (validateInline) {
        const cachedData = { assetTypes: assetTypes || [], building: building };
        AssetValidationHandler.validateSingleAsset(updatedAsset, {
          taxRegion: validationTaxRegion,
          cachedData,
        }).then((result) => {
          const discountErrors = validateDiscountDates(updatedAsset);
          const allErrors = [...(result.errors || []), ...discountErrors];
          const actualValid = result.valid && allErrors.length === 0;
          setValidationErrors((prev) => {
            const next = new Map(prev);
            if (actualValid) {
              next.delete(assetId);
            } else if (allErrors.length > 0) {
              next.set(assetId, allErrors.join('\n'));
            }
            return next;
          });
          if (gridRef.current?.api) {
            gridRef.current.api.refreshCells({ force: true });
            gridRef.current.api.redrawRows();
          }
        }).catch((err) => {
          console.error('[AssetsList] Inline validation error:', err);
        });
      }
    }
  }, [newAssets, originalAssets, validateInline, validationTaxRegion, assetTypes, building, dirtyAssets, validateDiscountDates]);

  // Helper function to run validation programmatically (without modal)
  async function runValidationProgrammatically(): Promise<{ hasErrors: boolean; errorMessage?: string }> {
    try {
      // Use the assets currently displayed in the grid (not fetching from API)
      const gridAssets = assets || [];
      
      // Filter out historical records and non-accountable assets
      let latestAssets = gridAssets.filter(asset => {
        if (asset.is_latest === false) return false;
        if (isAssetNotAccountableForTotalArea(asset)) return false;
        return true;
      });
      
      // Pre-fetch required supporting data
      // Use cached building data if available to avoid redundant API calls
      const [assetTypesData, buildingData] = await Promise.all([
        api.assetTypes.getAll(),
        building ? Promise.resolve(building) : api.buildings.getOne(buildingNumber).catch(() => null)
      ]);

      // Only validate assets that have dirty changes (or are new)
      const assetsToValidate = latestAssets.filter(asset => {
        const assetIdKey = String(asset.asset_id);
        return dirtyAssets.has(assetIdKey) || newAssets.has(assetIdKey);
      });

      // Apply dirty changes to assets before validating
      const assetsWithChanges = assetsToValidate.map(asset => {
        const dirtyChanges = dirtyAssets.get(String(asset.asset_id));
        if (dirtyChanges) {
          return { ...asset, ...dirtyChanges };
        }
        return asset;
      });

      if (assetsWithChanges.length === 0) {
        return { hasErrors: false };
      }

      // Prepare cached data for validation
      const cachedData = {
        assetTypes: assetTypesData || [],
        building: buildingData
      };

      // Run validation
      const batchResult = await AssetValidationHandler.validateBuildingAssets(
        assetsWithChanges,
        buildingNumber,
        {
          mode: 'building',
          validateOnlyLatest: false,
          taxRegion: taxRegion || undefined,
          cachedData: cachedData,
          validationRules: validationRules
        }
      );

      // Add discount validation errors
      const resultsWithDiscountErrors = batchResult.results.map(result => {
        // result.assetId is the numeric asset_id, match by comparing asset_id directly
        const asset = assetsWithChanges.find(a => {
          // result.assetId can be string or number, so compare both ways
          return String(result.assetId) === String(a.asset_id) || 
                 Number(result.assetId) === Number(a.asset_id) ||
                 result.assetId === a.asset_id;
        });
        
        if (asset) {
          const discountErrors = validateDiscountDates(asset);
          if (discountErrors.length > 0) {
            const allErrors = [...(result.errors || []), ...discountErrors];
            return {
              ...result,
              errors: allErrors,
              valid: result.valid && allErrors.length === 0
            };
          }
        }
        return result;
      });

      // Check if there are any validation errors
      const hasAnyValidationErrors = resultsWithDiscountErrors.some(r => !r.valid || (r.errors && r.errors.length > 0));

      if (hasAnyValidationErrors) {
        // Build error message
        const errorAssets = resultsWithDiscountErrors
          .filter(r => !r.valid || (r.errors && r.errors.length > 0))
          .map(r => {
            // Match by asset_id (result.assetId is the numeric asset_id)
            const asset = assetsWithChanges.find(a => {
              return String(r.assetId) === String(a.asset_id) || 
                     Number(r.assetId) === Number(a.asset_id) ||
                     r.assetId === a.asset_id;
            });
            return `נכס ${asset?.asset_id || r.assetId}: ${(r.errors || []).join('; ')}`;
          });
        
        // Update validation errors state
        const newValidationErrors = new Map<string, string>();
        for (const result of resultsWithDiscountErrors) {
          if (!result.valid || (result.errors && result.errors.length > 0)) {
            // result.assetId is the numeric asset_id, not the assetIdentifier string
            // Match by comparing asset_id directly
            const asset = assetsWithChanges.find(a => {
              // result.assetId can be string or number, so compare both ways
              return String(result.assetId) === String(a.asset_id) || 
                     Number(result.assetId) === Number(a.asset_id) ||
                     result.assetId === a.asset_id;
            });
            
            if (asset) {
              const dbId = String(asset.asset_id);
              const errorMessage = (result.errors || []).join('; ');
              newValidationErrors.set(dbId, errorMessage);
              if (process.env.NODE_ENV === 'development') {
              }
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[AssetsList] Could not find asset for validation result:', {
                resultAssetId: result.assetId,
                resultAssetIdentifier: result.assetIdentifier,
                availableAssetIds: assetsWithChanges.map(a => a.asset_id)
                });
              }
            }
          }
        }
        // Set validation errors and ensure they're visible
        setValidationErrors(() => newValidationErrors);
        
        if (process.env.NODE_ENV === 'development') {
        }

        return {
          hasErrors: true,
          errorMessage: `נמצאו שגיאות אימות ב-${errorAssets.length} נכסים:\n${errorAssets.slice(0, 5).join('\n')}${errorAssets.length > 5 ? `\n...ועוד ${errorAssets.length - 5} נכסים` : ''}`,
          validationErrors: newValidationErrors // Return errors so caller can use them immediately
        };
      }

      // Clear validation errors if validation passed
      setValidationErrors(new Map());
      return { hasErrors: false };
    } catch (err) {
      console.error('Error running validation:', err);
      return {
        hasErrors: true,
        errorMessage: `שגיאה בבדיקת תקינות: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}`
      };
    }
  }

  async function handleBatchValidateBuildingAssets() {
    setShowBatchValidationModal(true);
    setBatchValidationLoading(true);
    setBatchValidationResults(null);
    setBatchValidationProgress(null);

    try {
      // Use the assets currently displayed in the grid (not fetching from API)
      // This ensures we validate exactly what the user sees in the grid
      // These assets are already filtered by tax region and exclude historical records
      const gridAssets = assets || [];
      

      // IMPORTANT: Filter out historical records - only validate latest measurements (is_latest === true)
      // Historical records (is_latest === false) should NOT be validated
      // Also filter out non-accountable assets - they should NOT be validated
      let latestAssets = gridAssets.filter(asset => {
        // If is_latest is not explicitly set, assume it's latest (for backward compatibility)
        if (asset.is_latest === false) return false;
        
        // Skip non-accountable assets - they should not be validated
        if (isAssetNotAccountableForTotalArea(asset)) return false;
        
        return true;
      });
      
      // Pre-fetch required supporting data (asset types and building data)
      // Use cached building data if available to avoid redundant API calls
      const [assetTypesData, buildingData] = await Promise.all([
        api.assetTypes.getAll(),
        building ? Promise.resolve(building) : api.buildings.getOne(buildingNumber).catch(() => null)
      ]);

      // If assets are selected, only validate selected ones; otherwise validate all
      let assetsToValidate: Asset[];
      if (selectedAssets.size > 0) {
        // Filter to only selected assets - match by asset_id (stored in selectedAssets)
        // selectedAssets contains asset.asset_id (primary key), not database id
        assetsToValidate = latestAssets.filter(asset => {
          const assetIdKey = String(asset.asset_id);
          return selectedAssets.has(assetIdKey);
        });
      } else {
        // Validate all assets shown in the grid
        assetsToValidate = latestAssets;
      }

      // Apply dirty changes to assets before validating (so we validate the current edited state)
      assetsToValidate = assetsToValidate.map(asset => {
        const dirtyChanges = dirtyAssets.get(String(asset.asset_id));
        if (dirtyChanges) {
          return { ...asset, ...dirtyChanges };
        }
        return asset;
      });

      // Check if there are any assets to validate
      if (assetsToValidate.length === 0) {
        console.warn(`[Batch Validation] No assets to validate. Grid assets: ${gridAssets.length}, Latest assets: ${latestAssets.length}, Selected: ${selectedAssets.size}`);
        setBatchValidationLoading(false);
        setShowBatchValidationModal(false);
        setToast({ message: 'לא נמצאו נכסים לבדיקה. יש לוודא שנכסים מוצגים בטבלה.', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        return;
      }


      // Prepare cached data for validation (all data is already in memory)
      const cachedData = {
        assetTypes: assetTypesData || [],
        building: buildingData
      };

      // Use unified validation handler
      // Pass taxRegion if we're in a specific tab (not "all assets")
      // This ensures validation checks:
      // 1. Asset's tax_region matches tab tax region (if tab is specific)
      // 2. Asset's tax_region is one of building's tax regions (if tab is "all")
      // 3. Asset type's tax_region matches asset's tax_region
      // Note: We already filtered out historical records (is_latest !== true) above, so validateOnlyLatest is not needed
      const batchResult = await AssetValidationHandler.validateBuildingAssets(
        assetsToValidate,
        buildingNumber,
        {
          mode: 'building',
          validateOnlyLatest: false, // Not needed - we already filtered by is_latest === true above
          taxRegion: taxRegion || undefined, // Pass taxRegion to validate against tab's tax region (if specific tab)
          cachedData: cachedData, // Pass cached data to avoid database queries (asset is added per-validation)
          validationRules: validationRules, // Pass validation rules to avoid loading from DB
          onProgress: (progress) => {
            setBatchValidationProgress({
              current: progress.current,
              total: progress.total,
              currentAssetId: progress.currentAsset || undefined
            });
          }
        }
      );

      // Add discount validation errors to each result
      const resultsWithDiscountErrors = batchResult.results.map(result => {
        // Find the corresponding asset to validate discount dates
        const asset = assetsToValidate.find(a => {
          const assetIdentifier = `נכס ${a.asset_id}${a.building_number ? ` (מבנה ${a.building_number})` : ''}`;
          return result.assetId === assetIdentifier || result.assetId === String(a.asset_id);
        });
        
        if (asset) {
          const discountErrors = validateDiscountDates(asset);
          if (discountErrors.length > 0) {
            const allErrors = [...(result.errors || []), ...discountErrors];
            const actualValid = result.valid && allErrors.length === 0;
            return {
              ...result,
              errors: allErrors,
              valid: actualValid
            };
          }
        }
        return result;
      });

      // Map unified handler results to the expected format
      // Include ALL results (both valid and invalid) in the errors array
      // The modal will filter them based on the selected filter (all/valid/invalid)
      // Verify counters match the results
      const actualValid = resultsWithDiscountErrors.filter(r => r.valid && (!r.errors || r.errors.length === 0)).length;
      const actualInvalid = resultsWithDiscountErrors.filter(r => !r.valid || (r.errors && r.errors.length > 0)).length;
      const actualTotal = resultsWithDiscountErrors.length;
      
      
      // Map ALL results (both valid and invalid) - the modal will filter them
      const results = {
        total: actualTotal, // Use actual count from results array
        valid: actualValid,  // Recalculate from results
        invalid: actualInvalid, // Recalculate from results
        errors: resultsWithDiscountErrors.map(result => {
          // Find the asset to get its database ID
          const asset = assetsToValidate.find(a => {
            const assetIdentifier = `נכס ${a.asset_id}${a.building_number ? ` (מבנה ${a.building_number})` : ''}`;
            return result.assetId === assetIdentifier || result.assetId === String(a.asset_id);
          });
          return {
            assetId: String(result.assetId),
            assetDbId: asset ? String(asset.asset_id) : undefined,
            buildingNumber: asset?.building_number || buildingNumber,
            errors: result.errors || [], // Ensure errors is always an array
            passed: result.passed,
            matchedAssetTypeRecord: result.matchedAssetTypeRecord
          };
        })
      };

      setBatchValidationResults(results);

      // IMPORTANT:
      // `results.errors` contains ALL rows (valid + invalid) for the modal filtering UX.
      // So we must detect "real" errors by checking if any row has `errors.length > 0`.
      const hasAnyValidationErrors = results.errors.some(r => (r.errors || []).length > 0);

      // Enable Save only if validation passed AND we actually have something dirty to save.
      // (If there are no pending changes, Save stays disabled anyway.)
      const hasDirtyChangesNow = dirtyAssets.size > 0 || newAssets.size > 0 || deletedAssets.size > 0;
      setIsValidatedForSave(!hasAnyValidationErrors && hasDirtyChangesNow);

      // Mark invalid assets in the grid
      if (hasAnyValidationErrors) {
        const newValidationErrors = new Map<string, string>();

        // Mark each invalid asset using database ID if available, otherwise fall back to asset_id lookup
        for (const errorInfo of results.errors) {
          // Only mark assets that have errors
          if (errorInfo.errors && errorInfo.errors.length > 0) {
            let dbId = errorInfo.assetDbId ? String(errorInfo.assetDbId) : null;
            
            // If no database ID, try to find it by asset_id
            if (!dbId) {
              const asset = assets.find(a => String(a.asset_id) === String(errorInfo.assetId));
              if (asset) {
                dbId = String(asset.asset_id);
              }
            }
            
            if (dbId) {
              // Combine all errors into a single error message
              const errorMessage = errorInfo.errors.join('; ');
              newValidationErrors.set(dbId, errorMessage);
            } else {
              console.warn(`[Batch Validation] Could not find asset for error:`, errorInfo);
            }
          }
        }

        
        // Set validation errors in state
        setValidationErrors(newValidationErrors);
        setIsValidatedForSave(false);

        // Refresh grid to show the validation errors - specifically refresh actions column and row styling
        if (gridRef.current?.api) {
          // Refresh actions column and cells with validation errors
          gridRef.current.api.refreshCells({
            columns: ['actions'],
            force: false
          });
          // Lightweight refresh to update cell styling for validation errors
          setTimeout(() => {
            if (gridRef.current?.api) {
              gridRef.current.api.refreshCells({ force: false });
            }
          }, 50);
        }
      } else {
        // Clear validation errors if all assets are valid
        setValidationErrors(new Map());
        setIsValidatedForSave(hasDirtyChangesNow);
      }
    } catch (error) {
      console.error('Error during batch validation:', error);
      setBatchValidationResults({
        total: 0,
        valid: 0,
        invalid: 0,
        errors: [{
          assetId: 'N/A',
          buildingNumber: buildingNumber,
          errors: [`שגיאה בביצוע אימות: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }]
      });
    } finally {
      setBatchValidationLoading(false);
    }
  }

  // Note: We intentionally do NOT auto-validate on load.
  // Save is disabled until user explicitly clicks Validate.

  const handleExportInvalidAssetsToFile = useCallback(() => {
    if (!batchValidationResults || batchValidationResults.errors.length === 0) {
      return;
    }

    // Create File header
    const headers = ['מזהה מבנה', 'מזהה נכס', 'שגיאות'];
    const rows: string[][] = [headers];

    // Add data rows
    batchValidationResults.errors.forEach(error => {
      // Join errors with newlines for multi-line display in File
      const errorsText = error.errors.join('\n');
      rows.push([
        String(error.buildingNumber),
        String(error.assetId),
        errorsText
      ]);
    });

    // Convert to File format
    const fileContent = rows.map(row => {
      return row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const cellStr = String(cell || '');
        // Always wrap in quotes if contains newline, comma, or quote
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',');
    }).join('\n');

    // Add BOM for Hebrew support in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + fileContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `נכסים_לא_תקינים_${timestamp}.file`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [batchValidationResults]);

  const handleSaveAll = async () => {
    if (dirtyAssets.size === 0 && deletedAssets.size === 0) {
      setToast({ message: 'אין שינויים לשמור', type: 'info' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // DON'T set loading=true here - it causes full component refresh (shows loading spinner)
    // Use isSaving for save button state instead to avoid tab refresh appearance
    setIsSaving(true);
    setToast(null);

    try {
      // Run validation before saving - MUST pass before proceeding to server
      const validationResult = await runValidationProgrammatically();
      if (validationResult.hasErrors) {
        // Stop save operation - don't submit to server
        setIsSaving(false);
        
        // Show toast error message
        setToast({ 
          message: validationResult.errorMessage || 'נמצאו שגיאות אימות. אנא תקן לפני השמירה.', 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 8000);
        
        // Force immediate grid refresh to show validation errors
        // The validationErrors state is set inside runValidationProgrammatically
        // Use requestAnimationFrame to ensure React has processed the state update
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (gridRef.current?.api) {
              if (process.env.NODE_ENV === 'development') {
              }
              
              // Lightweight refresh to show validation errors on rows
              gridRef.current.api.refreshCells({ force: false });

              // Scroll to first error row if possible
              setTimeout(() => {
                if (gridRef.current?.api && validationErrors.size > 0) {
                  const firstErrorAssetId = Array.from(validationErrors.keys())[0];
                  if (process.env.NODE_ENV === 'development') {
                  }
                  gridRef.current.api.forEachNode(node => {
                    const assetId = String(node.data?.asset_id);
                    if (assetId === firstErrorAssetId) {
                      node.setSelected(true);
                      gridRef.current.api.ensureNodeVisible(node, 'top');
                    }
                  });
                }
              }, 200);
            }
          }, 200); // Give React time to update state
        });
        
        return; // Stop here - don't proceed to save
      }
      let savedCount = 0;
      let deletedCount = 0;
      const errors: string[] = [];
      
      // Track successfully processed assets to remove from state
      const successfullyDeleted = new Set<string>();
      const successfullySaved = new Set<string>();

      // Process deletions first
      const tempDeletedIds: string[] = [];
      const dbDeletedIds: Array<string | number> = [];

      for (const assetId of deletedAssets) {
        // Skip deletion if it's a temp asset (not saved to database yet)
        if (String(assetId).startsWith('temp-')) {
          tempDeletedIds.push(String(assetId));
          continue;
        }
        dbDeletedIds.push(assetId);
      }

      // Temp deletions are local-only
      for (const tempId of tempDeletedIds) {
        deletedCount++;
        successfullyDeleted.add(tempId);
      }

      // DB deletions: bulk when more than one id
      if (dbDeletedIds.length === 1) {
        try {
          await api.assets.delete(dbDeletedIds[0]);
          deletedCount++;
          successfullyDeleted.add(String(dbDeletedIds[0]));
        } catch (err) {
          const asset = assets.find(a => String(a.asset_id) === String(dbDeletedIds[0]));
          const assetIdent = asset?.asset_id || dbDeletedIds[0];
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      } else if (dbDeletedIds.length > 1) {
        const bulkDelete = await api.assets.deleteBulkTransactional(dbDeletedIds, 'Bulk delete from AssetsList');
        if (!bulkDelete.success) {
          errors.push(`שגיאה במחיקה מרובה: ${bulkDelete.error || 'שגיאה לא ידועה'}`);
        } else {
          deletedCount += bulkDelete.count;
          dbDeletedIds.forEach(id => successfullyDeleted.add(String(id)));
        }
      }

      // Process new assets that haven't been edited yet (in newAssets but not in dirtyAssets)
      for (const newAssetId of newAssets) {
        if (!dirtyAssets.has(newAssetId) && !deletedAssets.has(newAssetId)) {
          // Add to dirtyAssets so it gets processed below
          const asset = assets.find(a => String(a.asset_id) === newAssetId);
          if (asset) {
            setDirtyAssets(prev => {
              const next = new Map(prev);
              next.set(newAssetId, {}); // Empty changes object, will use full asset data
              return next;
            });
          }
        }
      }

      // Collect ALL assets to save in a single bulk operation
      // This ensures all distribution-related assets are saved together in one transaction
      const assetsToSave: any[] = [];

      // Detect if this is a distribution save by checking for distribution-related changes
      let isDistributionSave = false;
      let distributionType: 'residence' | 'business' | null = null;
      
      // Check for distribution: look for business_distribution_area changes
      // Need to determine if it's business or residence based on asset types
      for (const [assetId, changes] of dirtyAssets.entries()) {
        if (deletedAssets.has(assetId)) continue;
        if (changes.business_distribution_area !== undefined) {
          isDistributionSave = true;
          // Determine type by checking asset's business_residence type
          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          if (asset && asset.main_asset_type) {
            const assetType = assetTypes.find(at => String(at.name) === String(asset.main_asset_type));
            if (assetType?.business_residence === 'עסקים') {
              distributionType = 'business';
            } else if (assetType?.business_residence === 'מגורים') {
              distributionType = 'residence';
            }
          }
          // If type not determined yet, check building flags as fallback
          if (!distributionType && building) {
            if (building.need_business_distribution) {
              distributionType = 'business';
            } else if (building.need_residence_distribution) {
              distributionType = 'residence';
            }
          }
          if (distributionType) break;
        }
      }
      
      // Check for residence distribution: look for main_asset_type changed to 199
      if (!isDistributionSave) {
        for (const [assetId, changes] of dirtyAssets.entries()) {
          if (deletedAssets.has(assetId)) continue;
          if (changes.main_asset_type === '199' || changes.main_asset_type === 199) {
            // Also check if original asset type was not 199 (to avoid false positives)
            const asset = assets.find(a => String(a.asset_id) === String(assetId));
            if (asset && String(asset.main_asset_type) !== '199') {
              isDistributionSave = true;
              distributionType = 'residence';
              break;
            }
          }
        }
      }
      
      // Fallback: check building flags if we couldn't determine from changes
      if (!isDistributionSave && building) {
        if (building.need_residence_distribution === true) {
          isDistributionSave = true;
          distributionType = 'residence';
        } else if (building.need_business_distribution === true) {
          isDistributionSave = true;
          distributionType = 'business';
        }
      }

      // Debug logging

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          if (deletedAssets.has(assetId)) continue;

          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };
          const isNewAsset = String(assetId).startsWith('temp-') || newAssets.has(String(assetId));

          // Ensure building_number is always present
          // Try multiple sources: updatedData, asset, changes, building object, or component prop
          let buildingNumberValue = updatedData.building_number ?? asset.building_number ?? changes.building_number;
          if (!buildingNumberValue && building) {
            buildingNumberValue = building.building_number;
          }
          if (!buildingNumberValue) {
            buildingNumberValue = buildingNumber; // Use the prop from the component scope
          }
          if (!buildingNumberValue) {
            console.error('[handleSaveAll] Missing building_number for asset:', {
              asset_id: assetId,
              asset: asset,
              changes: changes,
              updatedData: updatedData,
              building: building,
              component_buildingNumber: buildingNumber
            });
            errors.push(`נכס ${asset.asset_id || assetId}: חסר מספר מבנה`);
            continue;
          }

          if (isNewAsset) {
            const { id, _isMasterRow, created_at, ...assetData } = updatedData;
            // Ensure building_number is set
            assetData.building_number = buildingNumberValue;
            assetsToSave.push(assetData);
          } else {
            // For updates, send full asset data merged with changes to ensure all fields (including sub_asset_type fields) are present
            // CRITICAL: Explicitly include main_asset_type and asset_size when changed - DB needs them for distribution flag logic
            const payload: any = { ...updatedData, asset_id: assetId, building_number: buildingNumberValue };
            if (changes.main_asset_type !== undefined) payload.main_asset_type = changes.main_asset_type;
            if (changes.asset_size !== undefined) payload.asset_size = changes.asset_size;
            assetsToSave.push(payload);
          }
        } catch (err) {
          const asset = assets.find(a => String(a.id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בהכנת נתונים'}`);
        }
      }

      // When saving asset edits that include parking fields, DB sets need_business_distribution; keep UI in sync so distribute button enables
      const hadParkingChanges = Array.from(dirtyAssets.entries()).some(
        ([id, ch]) => !deletedAssets.has(id) && ('number_of_parking_units' in ch || 'shared_parking_area' in ch)
      );

      // Determine the new tax region from the assets that will be saved
      // This will be used after successful save to open the correct tab
      let newTaxRegionForTab = taxRegion || ''; // Default to current tax region
      
      if (assetsToSave.length > 0) {
        // Check if any asset has a tax_region in the saved data
        const assetWithTaxRegion = assetsToSave.find(a => a.tax_region != null);
        if (assetWithTaxRegion?.tax_region != null) {
          newTaxRegionForTab = String(assetWithTaxRegion.tax_region);
        }
        
        // Use 'business_distribution' or 'residence_distribution' action type if this is a distribution save
        let actionType: string = 'manual_update';
        if (isDistributionSave && distributionType) {
          actionType = distributionType === 'business' ? 'business_distribution' : 'residence_distribution';
        }
        
        // Create description for distribution saves (include Hebrew keywords for database detection)
        let description: string | null = null;
        let afterData: any = undefined;
        // Computed overload_ratio for business distribution (percentage) - used in afterData and success handler
        let computedOverloadRatioForSave: number | null = null;

        // Determine tab context (business or residence) for passing to API.
        // When multi-tax (no single taxRegion), pass undefined so API derives from assets' main_asset_type -
        // otherwise we may set the wrong distribution flag (e.g. need_business when asset is residence).
        const isBusinessContext = isMultiTaxRegion ? undefined : !isResidentTaxRegion;

        if (isDistributionSave && distributionType && building) {
          if (distributionType === 'business' && building?.business_shared_area != null) {
            // Recompute overload_ratio from assets we're saving so it is always correct
            const isClearing = building.business_shared_area <= 0;
            let totalForDist = 0;
            if (!isClearing && assetsToSave.length > 0 && assetTypes?.length) {
              for (const a of assetsToSave) {
                const at = assetTypes.find((t: any) => String(t.name) === String(a.main_asset_type));
                if (at?.business_residence !== 'עסקים') continue;
                const hasSubtypes = !!(a.sub_asset_type_1 && String(a.sub_asset_type_1).trim() !== '');
                totalForDist += hasSubtypes ? (Number(a.sub_asset_size_1) || 0) : (Number(a.asset_size) || 0);
              }
            }
            computedOverloadRatioForSave = isClearing || totalForDist <= 0
              ? 0
              : (building.business_shared_area / totalForDist) * 100;
          }

          if (distributionType === 'residence' && building?.residence_shared_area) {
            description = `Distributed residence shared area (מגורים) (${building.residence_shared_area.toLocaleString('he-IL')}) to ${assetsToSave.length} assets`;
          } else if (distributionType === 'business' && building?.business_shared_area != null) {
            const overloadRatioValue = computedOverloadRatioForSave ?? building.overload_ratio ?? 0;
            const overloadRatioStr = Number(overloadRatioValue).toFixed(2);
            const sharedAreaText = building.business_shared_area > 0
              ? building.business_shared_area.toLocaleString('he-IL')
              : '0 (clearing previous distribution)';
            description = `Distributed business shared area (עסקים) (${sharedAreaText}) to ${assetsToSave.length} assets. Overload ratio: ${overloadRatioStr}%`;
          }

          // For distribution operations, prepare after_data with overload_ratio and building (for history)
          afterData = {
            overload_ratio: distributionType === 'business'
              ? (computedOverloadRatioForSave ?? (building.business_shared_area! <= 0 ? 0 : (building.overload_ratio ?? null)))
              : undefined,
            building: {
              shared_parking_area: building.shared_parking_area ?? null,
              number_of_parking_units: building.number_of_parking_units ?? null
            }
          };
          if (distributionType === 'residence') delete afterData.overload_ratio;
        }
        
        // Debug logging

        // BULK SAVE: Save all assets in a single transaction
        // This ensures all distribution-related assets are saved together, not one by one
        const result = await api.assets.saveBulkTransactional(assetsToSave, actionType, undefined, afterData, description, isBusinessContext);

        if (result.success) {
          savedCount = result.count || 0;
          for (const assetId of dirtyAssets.keys()) {
            if (!deletedAssets.has(assetId)) {
              successfullySaved.add(String(assetId)); // Ensure string type
            }
          }
          
          // Note: Distribution flags for asset type changes are now set in the database transaction
          // via the set_distribution_flags_for_asset_type_change function, which ensures atomicity
          
          // Note: Distribution flags are automatically cleared by the database function save_assets_bulk_transactional
          // when action_type is 'business_distribution' or 'residence_distribution'
          // We update local state immediately to reflect the cleared flags (don't wait for API calls)
          
          // Update local building state immediately after successful distribution save
          // This ensures the UI updates instantly and flags disappear from screen right away
          // CRITICAL: Update building state BEFORE any other operations to ensure UI reflects changes immediately
          if (isDistributionSave && distributionType && building) {
            const updatedBuilding: Building = { ...building };
            
            // Clear the appropriate distribution flag (database already cleared it in the transaction)
            if (distributionType === 'business') {
              updatedBuilding.need_business_distribution = false;
              // Use computed overload_ratio (from assets we saved) so it is always correct
              const overloadRatioToSave = computedOverloadRatioForSave ?? (building.business_shared_area! <= 0 ? 0 : (building.overload_ratio ?? null));
              updatedBuilding.overload_ratio = overloadRatioToSave;
              
              // Save overload_ratio to database in background (non-blocking, don't wait)
              api.buildings.update(building.building_number, {
                overload_ratio: overloadRatioToSave
              }).catch(err => {
                console.warn('Failed to save overload_ratio to building:', err);
              });
            } else if (distributionType === 'residence') {
              updatedBuilding.need_residence_distribution = false;
            }
            
            // Update building state immediately (synchronous state update)
            setBuilding(updatedBuilding);

            if (process.env.NODE_ENV === 'development') {
            }
          }
          
          // Update distribution history counter after successful distribution save (async, don't wait)
          if (isDistributionSave && distributionType) {
            // Don't wait for this - update counter in background
            const actionType = distributionType === 'business' ? 'business_distribution' : 'residence_distribution';
            api.distributionAudit.getByBuilding(buildingNumber, actionType)
              .then(distributionHistory => {
                setDistributionHistoryCount(distributionHistory.length);
              })
              .catch(error => {
                console.error('Error updating distribution history count:', error);
                // Don't fail the save operation if counter update fails
              });
          } else if (!isDistributionSave && hadParkingChanges && building) {
            // Asset number_of_parking_units or shared_parking_area changed; DB sets need_business_distribution
            setBuilding(prev => prev ? { ...prev, need_business_distribution: true } : null);
          }
        } else {
          setIsSaving(false); // Clear saving state on error
          if (result.validationErrors && result.validationErrors.length > 0) {
            errors.push(...result.validationErrors);
          } else if (result.error) {
            errors.push(result.error);
          }
        }
      }


      // Clear saving state immediately after save completes (before data refresh)
      // This prevents the full loading state from showing during data refresh
      setIsSaving(false);
      
      // Only clear successfully processed assets from state
      // Keep failed assets in state so they remain visible on screen
      // Remove successfully saved/deleted assets from change tracking
      // Use functional updates to ensure we're working with the latest state
      setDirtyAssets(prev => {
        const next = new Map(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      setDeletedAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullyDeleted) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      setNewAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      // Clear validation errors for successfully saved/deleted assets
      setValidationErrors(prev => {
        const next = new Map(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId));
        }
        for (const assetId of successfullyDeleted) {
          next.delete(String(assetId));
        }
        return next;
      });
 
      // Track which assets were just saved to prevent re-marking them as dirty in fetchData
      // This is especially important in error fixing mode where fetchData would re-mark them
      recentlySavedAssetsRef.current = new Set(successfullySaved);
      
      // Set flag to prevent onCellValueChanged from triggering validations during refresh
      // Set this BEFORE fetchData to prevent any cell change events during the refresh
      isRefreshingAfterSaveRef.current = true;
      
      // Preserve scroll position and selection before refresh
      let scrollPosition = { top: 0, left: 0 };
      let selectedRows: any[] = [];
      if (gridRef.current?.api) {
        const scrollInfo = gridRef.current.api.getVerticalPixelRange();
        scrollPosition = {
          top: scrollInfo.top || 0,
          left: gridRef.current.api.getHorizontalPixelRange()?.left || 0
        };
        selectedRows = gridRef.current.api.getSelectedRows();
      }
      
      // Check if distribution flags might have changed due to asset saves
      // Distribution flags can change when:
      // 1. Asset type changes (main_asset_type) - triggers database trigger
      // 2. Asset size changes (asset_size) - for business assets
      // 3. Asset creation/deletion - affects distribution eligibility
      let shouldRefreshBuildingFlags = false;
      if (!isDistributionSave) {
        // Check for changes that might affect distribution flags
        for (const [assetId, changes] of dirtyAssets.entries()) {
          if (deletedAssets.has(assetId)) {
            // Deletion might affect flags
            shouldRefreshBuildingFlags = true;
            break;
          }
          // Asset type change might affect flags
          if (changes.main_asset_type !== undefined) {
            shouldRefreshBuildingFlags = true;
            break;
          }
          // Asset size change might affect flags (for business assets)
          if (changes.asset_size !== undefined) {
            shouldRefreshBuildingFlags = true;
            break;
          }
        }
        // New assets might affect flags
        if (newAssets.size > 0) {
          shouldRefreshBuildingFlags = true;
        }
        // Deletions might affect flags
        if (successfullyDeleted.size > 0) {
          shouldRefreshBuildingFlags = true;
        }
      }
      
      // Refresh building and/or assets data from server (parallel when both needed for performance)
      const needBuilding = shouldRefreshBuildingFlags && buildingNumber;
      try {
        let assetsData: Asset[] | null = null;
        if (needBuilding) {
          const [updatedBuilding, assets] = await Promise.all([
            api.buildings.getOne(buildingNumber),
            api.assets.getAll(buildingNumber)
          ]);
          setBuilding(updatedBuilding);
          assetsData = assets;
          if (process.env.NODE_ENV === 'development') {
          }
        } else {
          assetsData = await api.assets.getAll(buildingNumber);
        }
        
        if (assetsData == null) assetsData = [];
        
        // Filter by tax region if needed (same logic as fetchData)
        let filteredAssets = assetsData;
        const selectedAssetIdsSet = selectedAssetIds && selectedAssetIds.length > 0 
          ? new Set(selectedAssetIds.map(id => String(id)))
          : null;
        
        if (taxRegion && taxRegion.trim() !== '') {
          const taxRegionNum = parseInt(taxRegion.trim(), 10);
          filteredAssets = assetsData.filter(asset => {
            if (selectedAssetIdsSet && selectedAssetIdsSet.has(String(asset.asset_id))) {
              return true;
            }
            if (asset.tax_region == null) return false;
            const assetTaxRegionNum = typeof asset.tax_region === 'string' 
              ? parseInt(asset.tax_region, 10) 
              : asset.tax_region;
            return assetTaxRegionNum === taxRegionNum || String(assetTaxRegionNum) === taxRegion.trim();
          });
        }
        
        // Update assets state - use same logic as fetchData for consistency
        // Handle error fixing mode and tax region updates
        let finalAssets = filteredAssets;
        if (isErrorFixingMode && selectedAssetIds && selectedAssetIds.length > 0 && taxRegion && taxRegion.trim() !== '') {
          const newTaxRegion = parseInt(taxRegion.trim(), 10);
          if (!isNaN(newTaxRegion)) {
            finalAssets = filteredAssets.map(asset => {
              if (selectedAssetIdsSet && selectedAssetIdsSet.has(String(asset.asset_id))) {
                const assetId = String(asset.asset_id);
                if (!recentlySavedAssetsRef.current.has(assetId)) {
                  return { ...asset, tax_region: newTaxRegion };
                }
              }
              return asset;
            });
          }
        }
        
        setAssets(finalAssets);
        setOriginalAssets(JSON.parse(JSON.stringify(finalAssets)));
        
        // Bulk fetch asset files (non-blocking, in background - don't wait)
        if (finalAssets.length > 0) {
          const assetIds = finalAssets.map(a => a.asset_id).filter(id => id != null).map(id => Number(id)).filter(id => !isNaN(id));
          if (assetIds.length > 0) {
            // Don't await - run in background
            api.assets.files.getAllBulk(assetIds)
              .then(filesByAsset => {
                const filesMap = new Set<number>();
                filesByAsset.forEach((files, assetId) => {
                  if (files && files.length > 0) {
                    filesMap.add(assetId);
                  }
                });
                setAssetsWithFiles(filesMap);
              })
              .catch(err => {
                console.warn('[AssetsList] Error bulk fetching asset files after save:', err);
              });
          }
        }
      } catch (err) {
        console.error('[AssetsList] Error refreshing assets after save:', err);
        // Fallback to full fetchData if refresh fails (but preserve building state)
        const currentBuilding = building; // Save current building state
        await fetchData(false, true);
        // Restore building state if it was overwritten
        if (currentBuilding) {
          setBuilding(currentBuilding);
        }
      } finally {
        // Don't set loading state here - we didn't set it to true, so no need to clear it
        // This ensures no loading overlay appears during data refresh
      }
      
      // Restore scroll position and selection after a brief delay to allow grid to update
      if (gridRef.current?.api && (scrollPosition.top > 0 || selectedRows.length > 0)) {
        setTimeout(() => {
          if (gridRef.current?.api) {
            // Restore scroll position
            gridRef.current.api.ensureIndexVisible(
              Math.floor(scrollPosition.top / 24) // Approximate row index (24px per row)
            );
            // Restore selection if possible
            if (selectedRows.length > 0) {
              const assetIds = selectedRows.map(r => String(r.asset_id)).filter(Boolean);
              gridRef.current.api.forEachNode(node => {
                if (assetIds.includes(String(node.data?.asset_id))) {
                  node.setSelected(true);
                }
              });
            }
          }
        }, 100);
      }
      
      // Keep the flag set for a longer period to ensure all grid updates complete
      // AG Grid may batch updates, so we need to wait for all re-renders to finish
      setTimeout(() => {
        isRefreshingAfterSaveRef.current = false;
        // Clear the recently saved assets after a delay to allow fetchData to complete
        recentlySavedAssetsRef.current.clear();
      }, 3000);
      
      // After fetchData completes and state is cleared, originalAssets should be updated in fetchData
      // But to be safe, explicitly update it here after all state clearing is done
      // Use a timeout to ensure state updates have propagated
      setTimeout(() => {
        setAssets(currentAssets => {
          // Only update if we have assets and no pending changes
          if (currentAssets.length >= 0 && dirtyAssets.size === 0 && newAssets.size === 0 && deletedAssets.size === 0) {
            setOriginalAssets(JSON.parse(JSON.stringify(currentAssets)));
          }
          return currentAssets;
        });
      }, 0);

      if (errors.length > 0) {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setToast({ message: `${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`, type: 'error' });
      } else {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setToast({ message: `✓ ${successMsg.join(', ')} בהצלחה`, type: 'success' });
        setTimeout(() => setToast(null), 3000);
        
        // Close the error fixing mode tab and open normal assets tab after successful save
        if (isErrorFixingMode && onCloseTab && onOpenAssetsTab && newTaxRegionForTab) {
          // Use a small delay to allow the success message to be visible
          setTimeout(() => {
            // Close the error fixing tab
            onCloseTab();
            // Open a normal assets tab (not error fixing mode) with the new tax region
            // Don't pass assetIds to avoid error fixing mode
            onOpenAssetsTab(buildingNumber, newTaxRegionForTab);
          }, 500);
        } else if (isErrorFixingMode && onCloseTab) {
          // Fallback: just close the tab if onOpenAssetsTab is not available
          setTimeout(() => {
            onCloseTab();
          }, 500);
        }
      }
    } catch (err) {
      setIsSaving(false); // Clear saving state on error
      const errorMessage = `שגיאה בשמירה: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[AssetsList] Error saving all:', err);
      setToast({ message: errorMessage, type: 'error' });
      // Don't clear error automatically - let user see it
    } finally {
      // Always ensure saving state is cleared after save operation completes
      // Don't touch loading state - we never set it to true to avoid full refresh
      setIsSaving(false);
    }
  };

  const addEmptyRow = async () => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const tempId = `temp-${Date.now()}`;

    // Set tax_region from tab data if available
    const taxRegionValue = validationTaxRegion ? parseInt(validationTaxRegion, 10) : undefined;

    const newAsset: Asset = {
      id: tempId,
      building_number: buildingNumber,
      asset_id: '',
      payer_id: '',
      main_asset_type: '',
      asset_size: 0,
      sub_asset_type_1: '',
      sub_asset_size_1: 0,
      sub_asset_type_2: '',
      sub_asset_size_2: 0,
      sub_asset_type_3: '',
      sub_asset_size_3: 0,
      sub_asset_type_4: '',
      sub_asset_size_4: 0,
      sub_asset_type_5: '',
      sub_asset_size_5: 0,
      sub_asset_type_6: '',
      sub_asset_size_6: 0,
      measurement_date: dateStr,
      tax_region: taxRegionValue,
      penthouse: null,
      apartment_number: undefined,
      apartment_floor: undefined,
      storage_number: undefined,
      storage_floor: undefined,
      discount_type: undefined,
      discount_date_from: undefined,
      discount_date_to: undefined,
      comment: undefined,
      use_nature: undefined
    };

    setAssets(prev => [newAsset, ...prev]);
    setNewAssets(prev => new Set(prev).add(tempId));

    // Run validation rules on the new asset (async, don't block UI)
    // IMPORTANT: validationTaxRegion is taken from the tab data (component prop) for validation
    // This validationTaxRegion will OVERRIDE the building's tax_region field during validation
    // Prepare cached data for validation (all data is already in memory)
    const cachedData = {
      assetTypes: assetTypes || [],
      building: building
    };

    AssetValidationHandler.validateSingleAsset(
      newAsset,
      {
        taxRegion: validationTaxRegion, // Use validationTaxRegion from the current tab - this overrides building tax_region
        cachedData: cachedData // Pass cached data to avoid database queries
      }
    ).then(validationResult => {
      // Add discount validation errors
      const discountErrors = validateDiscountDates(newAsset);
      const allErrors = [...(validationResult.errors || []), ...discountErrors];
      const actualValid = validationResult.valid && allErrors.length === 0;

      if (!actualValid && allErrors.length > 0) {
        // Store validation errors for the new asset
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.set(tempId, allErrors.join('\n'));
          return newMap;
        });
        
        // Refresh grid to show validation errors
        if (gridRef.current?.api) {
          gridRef.current.api.refreshCells({ force: false });
        }
      }
    }).catch(err => {
      console.error('[AssetsList] Error validating new asset:', err);
      // Don't block adding the asset if validation fails
    });

    setTimeout(() => {
      if (gridRef.current) {
        const rowIndex = 0;
        gridRef.current.api.setFocusedCell(rowIndex, 'asset_id');
        gridRef.current.api.startEditingCell({ rowIndex, colKey: 'asset_id' });
      }
    }, 100);
  };

  const toggleDelete = useCallback((assetId: string) => {
    setDeletedAssets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
    
    // Refresh the grid to update row styling
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: false });
    }
  }, []);

  const sourceTypeFields = [
    'main_asset_type', 'asset_size',
    'sub_asset_type_1', 'sub_asset_size_1',
    'sub_asset_type_2', 'sub_asset_size_2',
    'sub_asset_type_3', 'sub_asset_size_3',
    'sub_asset_type_4', 'sub_asset_size_4',
    'sub_asset_type_5', 'sub_asset_size_5',
    'sub_asset_type_6', 'sub_asset_size_6',
  ] as const;

  const applySourceValues = useCallback((targetAssetId: string) => {
    if (!sourceAssetId) return;
    const sourceAsset = assets.find(a => String(a.asset_id) === sourceAssetId);
    if (!sourceAsset) return;

    const changes: Partial<Asset> = {};
    for (const field of sourceTypeFields) {
      (changes as any)[field] = (sourceAsset as any)[field] ?? (field.includes('size') ? 0 : '');
    }

    setAssets(prev => prev.map(a => {
      if (String(a.asset_id) !== targetAssetId) return a;
      return { ...a, ...changes };
    }));

    setDirtyAssets(prev => {
      const next = new Map(prev);
      const existing = next.get(targetAssetId) || {};
      next.set(targetAssetId, { ...existing, ...changes });
      return next;
    });

    setIsValidatedForSave(false);
    setValidationErrors(new Map());

    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }, [sourceAssetId, assets]);

  const handleCancelAll = () => {
    // Restore original assets completely (deep copy)
    // This includes restoring deleted assets and removing new assets
    const restored = JSON.parse(JSON.stringify(originalAssets));
    setAssets(restored);
    
    // Clear all change tracking
    setDirtyAssets(new Map());
    setDeletedAssets(new Set());
    setNewAssets(new Set());
    setValidationErrors(new Map());
    setSourceAssetId(null);
    setToast({ message: 'השינויים בוטלו', type: 'info' });
    setTimeout(() => setToast(null), 3000);

    // Refresh the grid to show restored values
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: false });
      }
    }, 0);
  };

  // Distribute shared area to all residential assets
  const handleDistributeSharedArea = useCallback(async () => {
    // Allow distribution if flag is set, even if current area is 0 (to clear previous distribution)
    if (!building || building.residence_shared_area == null) {
      setToast({ message: 'אין שטח משותף מגורים במבנה', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // If area is 0 but flag is set, allow distribution to clear previous distribution
    if (building.residence_shared_area <= 0 && building.need_residence_distribution !== true) {
      setToast({ message: 'אין שטח משותף מגורים במבנה או השטח הוא 0', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (!assetTypes || assetTypes.length === 0) {
      setToast({ message: 'לא ניתן לטעון את סוגי הנכסים', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Check if assets array is empty or not loaded BEFORE setting loading state
    if (!assets || assets.length === 0) {
      setToast({ message: 'אין נכסים במבנה', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      // Refresh asset types to ensure we have latest data (in case cache is stale)
      let currentAssetTypes = assetTypes;
      try {
        const refreshedAssetTypes = await api.assetTypes.getAll();
        if (refreshedAssetTypes && refreshedAssetTypes.length > 0) {
          currentAssetTypes = refreshedAssetTypes;
          setAssetTypes(refreshedAssetTypes);
        }
      } catch (refreshError) {
        console.warn('[DistributeResidence] Failed to refresh asset types, using existing:', refreshError);
      }

      // Create asset type map for quick lookup - use multiple keys for flexibility
      const assetTypeMap = new Map<string, AssetType>();
      currentAssetTypes.forEach(at => {
        const nameKey = String(at.name).trim();
        assetTypeMap.set(nameKey, at);
        // Also add numeric version if name is numeric
        const nameAsNum = parseInt(nameKey, 10);
        if (!isNaN(nameAsNum)) {
          assetTypeMap.set(String(nameAsNum), at);
        }
      });

      // Deep check: Log all asset types with business_residence = 'מגורים'
      const residentialAssetTypes = currentAssetTypes.filter(at => {
        const br = at.business_residence ? String(at.business_residence).trim() : '';
        return br === 'מגורים';
      });
      
      // Check for null/undefined business_residence values
      const assetTypesWithNullBusinessResidence = currentAssetTypes.filter(at => 
        at.business_residence == null || at.business_residence === ''
      );
      

      // Filter assets: only accountable assets
      let deletedCount = 0;
      let notAccountableForDistributionCount = 0;
      let noMainTypeCount = 0;
      let assetTypeNotFoundCount = 0;
      let residentialFoundCount = 0;
      
      const residentialAssets = assets.filter((asset, index) => {
        const debugInfo: any = {
          assetId: asset.asset_id,
          index,
          mainAssetType: asset.main_asset_type
        };
        
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          deletedCount++;
          debugInfo.reason = 'deleted';
          return false;
        }
        
        // Include only assets that have at least one accountable type (main or subtype) for distribution
        if (!hasAtLeastOneAccountableTypeForDistribution(asset)) {
          notAccountableForDistributionCount++;
          debugInfo.reason = 'not_accountable_for_distribution';
          return false;
        }
        
        // Check if asset is residential type (not business)
        if (!asset.main_asset_type) {
          noMainTypeCount++;
          debugInfo.reason = 'no_main_type';
          return false;
        }
        
        // Try multiple lookup strategies to handle type mismatches
        const mainTypeStr = String(asset.main_asset_type).trim();
        let assetType = assetTypeMap.get(mainTypeStr);
        debugInfo.mainTypeStr = mainTypeStr;
        debugInfo.foundInMap = !!assetType;
        
        // If not found, try numeric lookup
        if (!assetType) {
          const mainTypeNum = parseInt(mainTypeStr, 10);
          if (!isNaN(mainTypeNum)) {
            assetType = assetTypeMap.get(String(mainTypeNum));
            debugInfo.foundNumeric = !!assetType;
          }
        }
        
        // If still not found, try finding by name directly
        if (!assetType) {
          assetType = currentAssetTypes.find(at => {
            const atNameStr = String(at.name).trim();
            return atNameStr === mainTypeStr;
          });
          debugInfo.foundInArray = !!assetType;
        }
        
        if (!assetType) {
          assetTypeNotFoundCount++;
          debugInfo.reason = 'asset_type_not_found';
          debugInfo.availableTypes = Array.from(assetTypeMap.keys()).slice(0, 10);
          console.warn('[DistributeResidence] Asset type not found:', debugInfo);
          return false;
        }
        
        // Note: non_accountable_for_distribution check is already done earlier via isAssetNotAccountableForDistribution
        // This redundant check is removed since the helper function handles it
        
        debugInfo.assetTypeName = assetType.name;
        debugInfo.assetTypeId = assetType.id;
        debugInfo.assetTypeKeys = Object.keys(assetType);
        debugInfo.assetTypeHasBusinessResidence = 'business_residence' in assetType;
        debugInfo.assetTypeBusinessResidenceValue = assetType.business_residence;
        debugInfo.assetTypeBusinessResidenceType = typeof assetType.business_residence;
        
        // Skip business_residence check - accept all assets that passed previous filters
        
        residentialFoundCount++;
        if (residentialFoundCount <= 3) {
        }
        return true;
      });


      if (residentialAssets.length === 0) {
        // Provide detailed error message
        const reasons: string[] = [];
        if (deletedCount > 0) reasons.push(`${deletedCount} נכסים שנמחקו`);
        if (notAccountableForDistributionCount > 0) reasons.push(`${notAccountableForDistributionCount} נכסים לא נספרים בפיזור`);
        if (noMainTypeCount > 0) reasons.push(`${noMainTypeCount} נכסים ללא סוג נכס ראשי`);
        if (assetTypeNotFoundCount > 0) reasons.push(`${assetTypeNotFoundCount} נכסים עם סוג נכס שלא נמצא`);
        
        const totalFiltered = deletedCount + notAccountableForDistributionCount + noMainTypeCount + assetTypeNotFoundCount;
        const totalAssets = assets.length;
        
        let errorMsg = 'אין נכסי מגורים במבנה לפזר בהם שטח משותף';
        if (reasons.length > 0) {
          errorMsg += `. סיבות: ${reasons.join(', ')}`;
        } else if (totalAssets > 0) {
          errorMsg += `. נמצאו ${totalAssets} נכסים במבנה, אך אף אחד מהם לא מסוג מגורים`;
        }
        if (totalAssets === 0) {
          errorMsg = 'אין נכסים במבנה';
        } else if (totalFiltered === totalAssets && totalAssets > 0) {
          errorMsg += `. כל הנכסים במבנה נפסלו (סה"כ ${totalAssets} נכסים)`;
        }
        
        console.error('[DistributeResidence] Error:', errorMsg, {
          totalAssets,
          totalFiltered,
          reasons
        });

        setToast({ message: errorMsg, type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        return;
      }

      // Calculate area per asset (simple division for residence distribution)
      const areaPerAsset = building.residence_shared_area! / residentialAssets.length;
      const isClearing = areaPerAsset === 0;
      
      // Also clear business_distribution_area for non-accountable assets
      // (assets that don't have at least one accountable type for distribution)
      const nonAccountableAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          return false;
        }
        // Include assets that don't have at least one accountable type
        return !hasAtLeastOneAccountableTypeForDistribution(asset);
      });

      // Track changes
      const updatedDirtyAssets = new Map(dirtyAssets);
      const updatedAssets = [...assets];
      let updatedCount = 0;

      // First, clear business_distribution_area for non-accountable assets
      for (const asset of nonAccountableAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        const currentAreaFromDistribution = existingChanges.business_distribution_area !== undefined
          ? existingChanges.business_distribution_area
          : (currentAsset?.business_distribution_area || 0);
        
        // Only clear if it's not already 0
        if (currentAreaFromDistribution > 0) {
          const changes: Partial<Asset> = { ...existingChanges };
          changes.business_distribution_area = 0;
          updatedDirtyAssets.set(assetId, changes);
          
          // Update local assets array for immediate UI update
          const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
          if (assetIndex !== -1) {
            updatedAssets[assetIndex] = {
              ...updatedAssets[assetIndex],
              ...changes
            } as Asset;
          }
        }
      }

      // Find a single shared area asset type to use for all distributions (remove duplicates)
      // Collect all unique tax regions from residential assets
      const uniqueTaxRegions = new Set<string>();
      for (const asset of residentialAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        if (!currentAsset) continue;
        
        const currentTaxRegion = existingChanges.tax_region !== undefined 
          ? existingChanges.tax_region 
          : currentAsset.tax_region;
        if (currentTaxRegion != null) {
          uniqueTaxRegions.add(String(currentTaxRegion));
        }
      }

      // Find the first matching shared area asset type (use same one for all)
      // Prefer the tax region from the current tab, otherwise use the first available
      let sharedAreaAssetType = null;
      if (taxRegion) {
        // Try to find one matching the current tab's tax region first
        sharedAreaAssetType = currentAssetTypes.find(at => 
          at.tax_region === taxRegion && 
          at.use_shared_area === true
        );
      }
      // If not found, try any tax region from the assets
      if (!sharedAreaAssetType && uniqueTaxRegions.size > 0) {
        for (const tr of uniqueTaxRegions) {
          sharedAreaAssetType = currentAssetTypes.find(at => 
            at.tax_region === tr && 
            at.use_shared_area === true
          );
          if (sharedAreaAssetType) break;
        }
      }
      // If still not found, find any asset type with use_shared_area = true
      if (!sharedAreaAssetType) {
        sharedAreaAssetType = currentAssetTypes.find(at => at.use_shared_area === true);
      }

      if (!sharedAreaAssetType && !isClearing) {
        const taxRegionList = Array.from(uniqueTaxRegions).join(', ') || taxRegion || 'לא ידוע';
        throw new Error(`לא נמצא סוג נכס עם סימון "שימוש בשטח משותף" עבור אזורי המס: ${taxRegionList}. יש לוודא שקיים סוג נכס עם use_shared_area=true.`);
      }

      // Now distribute to accountable residential assets using the same asset type for all
      for (const asset of residentialAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        if (!currentAsset) continue;

        // Prepare changes object
        const changes: Partial<Asset> = { ...existingChanges };

        // Get current values (use existing changes if available, otherwise use current asset)
        const currentMainType = changes.main_asset_type !== undefined 
          ? changes.main_asset_type 
          : currentAsset.main_asset_type;

        const isMainType199 = String(currentMainType).trim() === '199';

        if (isClearing) {
          // Clearing distribution: delete ALL occurrences of the shared area subtype and move back types
          if (!isMainType199 || !sharedAreaAssetType) {
            // Skip assets that aren't type 199 or don't have the shared area type defined
            continue;
          }

          // Remove ALL occurrences of the shared area asset type subtype
          const sharedAreaTypeName = String(sharedAreaAssetType.name).trim();
          let foundAny = false;
          
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const currentSubType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            
            // Check if this subtype matches the shared area asset type
            if (currentSubType && String(currentSubType).trim() === sharedAreaTypeName) {
              // Delete this shared area subtype (set to null)
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
              foundAny = true;
            }
          }

          if (!foundAny) {
            // No shared area subtype found, skip this asset
            continue;
          }

          // Compact subtypes: shift remaining subtypes to fill holes
          // Collect all remaining non-null subtypes and sizes
          const remainingSubtypes: Array<{ type: string | number; size: number }> = [];
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const subType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            const subSize = changes[subSizeField] !== undefined
              ? changes[subSizeField]
              : currentAsset[subSizeField];

            if (subType && subType !== '' && subType !== null) {
              remainingSubtypes.push({
                type: subType,
                size: subSize ? Number(subSize) : 0
              });
            }
          }

          // Clear all subtype positions
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            (changes as any)[subTypeField] = null;
            (changes as any)[subSizeField] = null;
          }

          // Shift remaining subtypes to fill holes (compact to positions 1, 2, 3, etc.)
          for (let i = 0; i < remainingSubtypes.length; i++) {
            const subTypeField = `sub_asset_type_${i + 1}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i + 1}` as keyof Asset;
            (changes as any)[subTypeField] = remainingSubtypes[i].type;
            (changes as any)[subSizeField] = remainingSubtypes[i].size;
          }

          // Count remaining subtypes (after compaction)
          const remainingSubTypeCount = remainingSubtypes.length;
          const lastSubType = remainingSubtypes.length > 0 ? remainingSubtypes[remainingSubtypes.length - 1].type : null;
          const lastSubSize = remainingSubtypes.length > 0 ? remainingSubtypes[remainingSubtypes.length - 1].size : 0;

          // If only one subtype remains, move it back to main type
          if (remainingSubTypeCount === 1 && lastSubType) {
            changes.main_asset_type = lastSubType;
            changes.asset_size = lastSubSize;
            // Clear all subtypes
            for (let i = 1; i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
            }
          } else {
            // Calculate asset_size as sum of remaining subtypes (already compacted)
            let totalSubSize = 0;
            for (let i = 0; i < remainingSubtypes.length; i++) {
              totalSubSize += remainingSubtypes[i].size;
            }
            changes.asset_size = totalSubSize;
          }
        } else {
          // Adding distribution: add shared area as subtype
          // First, remove any existing shared area subtypes (duplicates) and keep only one
          let existingSharedAreaIndex = -1;
          const sharedAreaTypeName = String(sharedAreaAssetType.name).trim();
          
          // Remove all existing shared area subtypes (duplicates)
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            
            const currentSubType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            
            // Check if this subtype matches the shared area asset type
            if (currentSubType && String(currentSubType).trim() === sharedAreaTypeName) {
              // Remember the first index found (we'll use this position for the new one)
              if (existingSharedAreaIndex === -1) {
                existingSharedAreaIndex = i;
              }
              // Remove all shared area subtypes (we'll add a single one below)
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
            }
          }

          if (!isMainType199) {
            // Move current type and size to subtype 1
            // Get current subtype 1 values (prefer existing changes)
            const currentSubType1 = changes.sub_asset_type_1 !== undefined 
              ? changes.sub_asset_type_1 
              : currentAsset.sub_asset_type_1;
            const currentAssetSize = changes.asset_size !== undefined 
              ? changes.asset_size 
              : currentAsset.asset_size;

            // Only move if subtype 1 is empty
            if (!currentSubType1 || currentSubType1 === '') {
              changes.sub_asset_type_1 = currentMainType;
              changes.sub_asset_size_1 = currentAssetSize || 0;
            }

            // Set main type to 199
            changes.main_asset_type = '199';
          }

          // Determine target position for shared area subtype
          let targetSubTypeIndex = -1;
          let targetSubTypeField: keyof Asset = 'sub_asset_type_1';
          let targetSubSizeField: keyof Asset = 'sub_asset_size_1';

          // If we found an existing shared area subtype position, reuse it (it's now cleared)
          if (existingSharedAreaIndex > 0) {
            targetSubTypeIndex = existingSharedAreaIndex;
            targetSubTypeField = `sub_asset_type_${existingSharedAreaIndex}` as keyof Asset;
            targetSubSizeField = `sub_asset_size_${existingSharedAreaIndex}` as keyof Asset;
          } else {
            // Find first available subtype position (2-6 if converting to 199, 1-6 if already 199)
            targetSubTypeIndex = isMainType199 ? 1 : 2;
            targetSubTypeField = 'sub_asset_type_1';
            targetSubSizeField = 'sub_asset_size_1';

            // Check available positions starting from the appropriate index
            for (let i = (isMainType199 ? 1 : 2); i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              
              const currentSubType = changes[subTypeField] !== undefined
                ? changes[subTypeField]
                : currentAsset[subTypeField];
              
              // If this position is empty, use it
              if (!currentSubType || currentSubType === '' || currentSubType === null) {
                targetSubTypeIndex = i;
                targetSubTypeField = subTypeField;
                targetSubSizeField = subSizeField;
                break;
              }
            }
          }

          // If no available subtype position found, throw error
          if (targetSubTypeIndex > 6 || targetSubTypeIndex < 1) {
            throw new Error(`לא נמצא מקום פנוי לנכס משנה עבור נכס ${assetId}. כל ששת המקומות תפוסים.`);
          }

          // Set the shared area subtype and size (replace all duplicates with single entry)
          (changes as any)[targetSubTypeField] = sharedAreaAssetType.name;
          (changes as any)[targetSubSizeField] = areaPerAsset;

          // Calculate asset_size as sum of all subtypes (required for type 199)
          let totalSubSize = 0;
          for (let i = 1; i <= 6; i++) {
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const subSize = changes[subSizeField] !== undefined
              ? changes[subSizeField]
              : currentAsset[subSizeField];
            if (subSize != null && subSize !== '' && !isNaN(Number(subSize))) {
              totalSubSize += Number(subSize);
            }
          }
          changes.asset_size = totalSubSize;
        }

        updatedDirtyAssets.set(assetId, changes);

        // Update local assets array for immediate UI update
        const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
        if (assetIndex !== -1) {
          updatedAssets[assetIndex] = {
            ...updatedAssets[assetIndex],
            ...changes
          } as Asset;
        }

          updatedCount++;
      }

      // Update state without saving to database
      setAssets(updatedAssets);
      setDirtyAssets(updatedDirtyAssets);
      setIsValidatedForSave(false);

      // Show success message
      const sharedAreaText = building.residence_shared_area! > 0
        ? building.residence_shared_area!.toLocaleString('he-IL')
        : '0 (ניקוי פיזור קודם)';
      setToast({
        message: `חושב פיזור שטח משותף מגורים (${sharedAreaText}) ל-${updatedCount} נכסים. לחץ "שמור הכל" לשמירה.`,
        type: 'success'
      });
      setTimeout(() => setToast(null), 5000);

      // Refresh grid
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: false });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'שגיאה בפיזור שטח משותף', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [building, assets, assetTypes, dirtyAssets, deletedAssets, hasAtLeastOneAccountableTypeForDistribution]);

  const handleDistributeBusinessSharedArea = useCallback(async () => {
    if (!building) return;
    // Allow distribution when: (1) building has business_shared_area set, or (2) need_business_distribution and parking data (so parking-only distribution can run)
    const hasParkingDataAtBuilding = building.shared_parking_area != null && building.shared_parking_area !== '' && building.number_of_parking_units != null && Number(building.number_of_parking_units) > 0;
    const canRunParkingOnly = building.need_business_distribution === true && hasParkingDataAtBuilding;
    if (building.business_shared_area == null && !canRunParkingOnly) {
      setToast({ message: 'אין שטח משותף עסקים במבנה', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    // If area is 0 but flag is set, allow distribution (clear previous or run parking-only)
    if (building.business_shared_area != null && building.business_shared_area <= 0 && building.need_business_distribution !== true && !canRunParkingOnly) {
      setToast({ message: 'אין שטח משותף עסקים במבנה או השטח הוא 0', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (!assetTypes || assetTypes.length === 0) {
      setToast({ message: 'לא ניתן לטעון את סוגי הנכסים', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      // Create asset type map for quick lookup
      const assetTypeMap = new Map<string, AssetType>();
      assetTypes.forEach(at => {
        assetTypeMap.set(at.name, at);
      });

      // Filter assets: only business assets that are accountable
      let deletedCount = 0;
      let notAccountableForDistributionCount = 0;
      let noMainTypeCount = 0;
      let assetTypeNotFoundCount = 0;
      let notBusinessCount = 0;
      
      const businessAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          deletedCount++;
          return false;
        }
        
        // Exclude non-accountable assets for distribution
        if (isAssetNotAccountableForDistribution(asset)) {
          notAccountableForDistributionCount++;
          return false;
        }
        
        // Check if asset is business type
        if (!asset.main_asset_type) {
          noMainTypeCount++;
          return false;
        }
        
        // Try multiple lookup strategies to handle type mismatches
        const mainTypeStr = String(asset.main_asset_type).trim();
        let assetType = assetTypeMap.get(mainTypeStr);
        
        // If not found, try finding by name directly (case-insensitive, handle number/string mismatches)
        if (!assetType) {
          assetType = assetTypes.find(at => {
            const atNameStr = String(at.name).trim();
            return atNameStr === mainTypeStr || 
                   atNameStr === String(asset.main_asset_type) ||
                   String(atNameStr) === String(mainTypeStr);
          });
        }
        
        if (!assetType) {
          assetTypeNotFoundCount++;
          return false;
        }
        
        // Check if asset type is business
        if (!assetType.business_residence || assetType.business_residence.trim() !== 'עסקים') {
          notBusinessCount++;
          // Log details for debugging (only first few to avoid spam)
          if (notBusinessCount <= 5) {
          }
          return false;
        }
        
        // Note: non_accountable_for_distribution check is already done earlier via isAssetNotAccountableForDistribution
        // This redundant check is removed since the helper function handles it
        
        return true;
      });

      // Parking type and data: needed to allow parking-only distribution when there are no business assets
      const parkingAssetType = assetTypes && assetTypes.length > 0
        ? assetTypes.find((at: any) => at.use_for_parking_shared_area === true)
        : null;
      const parkingTypeName = parkingAssetType ? String(parkingAssetType.name).trim() : null;
      const sharedParkingNum = Number(building.shared_parking_area);
      const numParkingUnitsNum = Number(building.number_of_parking_units);
      const hasParkingData = !isNaN(sharedParkingNum) && !isNaN(numParkingUnitsNum) && numParkingUnitsNum > 0;
      const unitParkingArea = hasParkingData ? sharedParkingNum / numParkingUnitsNum : 0;
      // Only assets that have type OR subtype with use_for_parking_shared_area can accept number_of_parking_units and shared_parking_area
      const assetHasParkingTypeOrSubtype = (a: any) => {
        if (!parkingAssetType) return false;
        const lookup = (typeName: string | null | undefined) => {
          if (!typeName || String(typeName).trim() === '') return undefined;
          const s = String(typeName).trim();
          let at = assetTypeMap.get(s);
          if (!at) at = assetTypes.find(at2 => String(at2.name).trim() === s || String(at2.name) === String(typeName));
          return at;
        };
        const mainAt = lookup(a.main_asset_type);
        if (mainAt?.use_for_parking_shared_area === true) return true;
        for (let i = 1; i <= 6; i++) {
          const sub = a[`sub_asset_type_${i}` as keyof typeof a];
          const subAt = lookup(sub);
          if (subAt?.use_for_parking_shared_area === true) return true;
        }
        return false;
      };
      const parkingTypeAssets = parkingAssetType
        ? assets.filter(a => !deletedAssets.has(String(a.asset_id)) && assetHasParkingTypeOrSubtype(a))
        : [];

      if (businessAssets.length === 0) {
        // Allow continuing when we have parking data and at least one parking-type asset (parking-only distribution)
        if (!hasParkingData || !parkingTypeName || parkingTypeAssets.length === 0) {
          const reasons: string[] = [];
          if (deletedCount > 0) reasons.push(`${deletedCount} נכסים שנמחקו`);
          if (notAccountableForDistributionCount > 0) reasons.push(`${notAccountableForDistributionCount} נכסים לא נספרים בפיזור`);
          if (noMainTypeCount > 0) reasons.push(`${noMainTypeCount} נכסים ללא סוג נכס ראשי`);
          if (assetTypeNotFoundCount > 0) reasons.push(`${assetTypeNotFoundCount} נכסים עם סוג נכס שלא נמצא`);
          if (notBusinessCount > 0) reasons.push(`${notBusinessCount} נכסים שאינם מסוג עסקים`);
          const totalFiltered = deletedCount + notAccountableForDistributionCount + noMainTypeCount + assetTypeNotFoundCount + notBusinessCount;
          const totalAssets = assets.length;
          let errorMsg = 'אין נכסי עסקים במבנה לפזר בהם שטח משותף';
          if (reasons.length > 0) errorMsg += `. סיבות: ${reasons.join(', ')}`;
          if (totalAssets === 0) errorMsg = 'אין נכסים במבנה';
          else if (totalFiltered === totalAssets) errorMsg += `. כל הנכסים במבנה נפסלו (סה"כ ${totalAssets} נכסים)`;
          setToast({ message: errorMsg, type: 'error' });
          setTimeout(() => setToast(null), 5000);
          setLoading(false);
          return;
        }
      }

      // Denominator for overload_ratio: sum of (main size if no subtypes) + sum of (first subtype size for assets with subtypes)
      let totalForDistribution = 0;
      for (const asset of businessAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = dirtyAssets.get(assetId) || {};
        const hasSubtypes = !!(asset.sub_asset_type_1 && String(asset.sub_asset_type_1).trim() !== '');
        let contribSize: number;
        if (hasSubtypes) {
          contribSize = existingChanges.sub_asset_size_1 !== undefined ? existingChanges.sub_asset_size_1 : (asset.sub_asset_size_1 ?? 0);
        } else {
          contribSize = existingChanges.asset_size !== undefined ? existingChanges.asset_size : (asset.asset_size ?? 0);
        }
        totalForDistribution += contribSize;
      }

      // If shared area is 0 or null, we're clearing business distribution (parking-only distribution may still run)
      const isClearingDistribution = building.business_shared_area == null || building.business_shared_area <= 0;

      if (totalForDistribution <= 0 && !isClearingDistribution) {
        setToast({ message: 'סכום שטחי הנכסים העסקיים הוא 0 או שלילי', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        setLoading(false);
        return;
      }

      // overload_ratio = (business_shared_area / totalForDistribution) * 100 (stored as percentage for display)
      const overloadRatioPercent = isClearingDistribution || building.business_shared_area! <= 0
        ? 0
        : (totalForDistribution > 0 ? (building.business_shared_area! / totalForDistribution) * 100 : 0);
      // Decimal ratio for distribution: newDistributionArea = overloadRatio * contribSize
      const overloadRatio = overloadRatioPercent / 100;

      // Also clear business_distribution_area for non-accountable assets
      const nonAccountableAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          return false;
        }
        // Include assets with non_accountable_for_distribution === true
        return isAssetNotAccountableForDistribution(asset);
      });

      // Find the shared area asset type for business distribution
      let sharedAreaAssetType = null;
      if (assetTypes && assetTypes.length > 0) {
        // First try to find by use_shared_area and business_residence
        sharedAreaAssetType = assetTypes.find(at => 
          at.use_shared_area === true && 
          at.business_residence === 'עסקים'
        );
      }
      if (!sharedAreaAssetType && assetTypes && assetTypes.length > 0) {
        // Fallback: find any asset type with use_shared_area for business
        sharedAreaAssetType = assetTypes.find(at => at.use_shared_area === true);
      }

      // When clearing business distribution only (no parking data), clear shared_parking_area on assets
      const shouldClearParkingOnly = isClearingDistribution && (!hasParkingData || sharedParkingNum === 0 || building.shared_parking_area == null || building.shared_parking_area === '');

      // Distribution only updates shared_parking_area; it does not change number_of_parking_units on assets.
      // Sum of assets' number_of_parking_units must equal building.number_of_parking_units (user responsibility).
      // Sum of assets' shared_parking_area will be capped to building.shared_parking_area if over.
      const getAssetParkingUnits = (id: string, a: any) => {
        const ex = dirtyAssets.get(id);
        const cur = assets.find(x => String(x.asset_id) === id);
        const fromDirty = ex && 'number_of_parking_units' in ex ? ex.number_of_parking_units : undefined;
        const fromAsset = (cur ?? a)?.number_of_parking_units;
        const raw = fromDirty !== undefined && fromDirty !== null && fromDirty !== ''
          ? Number(fromDirty)
          : (fromAsset !== undefined && fromAsset !== null && fromAsset !== '' ? Number(fromAsset) : 0);
        return Math.max(0, Number.isNaN(raw) ? 0 : raw);
      };

      // Track changes
      const updatedDirtyAssets = new Map(dirtyAssets);
      const updatedAssets = [...assets];
      let updatedCount = 0;
      const parkingTypeAssignments: { assetId: string; assignedArea: number }[] = [];

      // First, clear business_distribution_area for non-accountable assets
      for (const asset of nonAccountableAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        const currentAreaFromDistribution = existingChanges.business_distribution_area !== undefined
          ? existingChanges.business_distribution_area
          : (currentAsset?.business_distribution_area || 0);
        
        // Only clear if it's not already 0
        if (currentAreaFromDistribution > 0) {
          const changes: Partial<Asset> = { ...existingChanges };
          changes.business_distribution_area = 0;
          updatedDirtyAssets.set(assetId, changes);
          
          // Update local assets array for immediate UI update
          const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
          if (assetIndex !== -1) {
            updatedAssets[assetIndex] = {
              ...updatedAssets[assetIndex],
              ...changes
            } as Asset;
          }
        }
      }

      // Now distribute to accountable business assets
      for (const asset of businessAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);

        // Prepare changes object
        const changes: Partial<Asset> = { ...existingChanges };

        // Contributing size: main size if no subtypes, else first subtype size (same as denominator)
        const hasSubtypes = !!(currentAsset?.sub_asset_type_1 && String(currentAsset.sub_asset_type_1).trim() !== '');
        const contribSize = hasSubtypes
          ? (existingChanges.sub_asset_size_1 !== undefined ? existingChanges.sub_asset_size_1 : (currentAsset?.sub_asset_size_1 ?? 0))
          : (existingChanges.asset_size !== undefined ? existingChanges.asset_size : (currentAsset?.asset_size ?? 0));

        // Calculate new distribution area: proportional to contrib size
        const newDistributionArea = overloadRatio * contribSize;

        // IMPORTANT: Only update business_distribution_area field
        // Do NOT update asset_size, sub_asset_size_1, or any other sub-asset sizes
        // For clearing distribution (overloadRatio = 0), set to 0; otherwise set to new value
        changes.business_distribution_area = newDistributionArea;

        // Only assets with type or subtype use_for_parking_shared_area get shared_parking_area; distribution does not change number_of_parking_units.
        // Each eligible asset: shared_parking_area = unitParkingArea × (asset's existing number_of_parking_units).
        const mergedForParking = { ...currentAsset, ...existingChanges } as any;
        const isParkingTypeAsset = assetHasParkingTypeOrSubtype(mergedForParking);
        if (shouldClearParkingOnly) {
          changes.shared_parking_area = null;
        } else if (!hasParkingData || sharedParkingNum === 0 || building.shared_parking_area == null || building.shared_parking_area === '') {
          changes.shared_parking_area = 0;
        } else if (isParkingTypeAsset) {
          const nUnits = getAssetParkingUnits(assetId, mergedForParking);
          const assigned = unitParkingArea * nUnits;
          changes.shared_parking_area = assigned;
          parkingTypeAssignments.push({ assetId, assignedArea: assigned });
        } else {
          changes.shared_parking_area = 0;
        }

        // If clearing distribution and shared area asset type exists, remove it from sub_asset_types
        if (isClearingDistribution && sharedAreaAssetType) {
          const sharedAreaTypeName = String(sharedAreaAssetType.name).trim();
          let foundAny = false;
          
          // Remove all occurrences of the shared area asset type from sub_asset_type fields
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const currentSubType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset?.[subTypeField];
            
            // Check if this subtype matches the shared area asset type
            if (currentSubType && String(currentSubType).trim() === sharedAreaTypeName) {
              // Delete this shared area subtype (set to null)
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
              foundAny = true;
            }
          }

          // If we found and removed shared area subtypes, compact the remaining subtypes
          if (foundAny) {
            // Collect all remaining non-null subtypes and sizes
            const remainingSubtypes: Array<{ type: string | number; size: number }> = [];
            for (let i = 1; i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              const subType = changes[subTypeField] !== undefined
                ? changes[subTypeField]
                : (currentAsset?.[subTypeField] || null);
              const subSize = changes[subSizeField] !== undefined
                ? changes[subSizeField]
                : (currentAsset?.[subSizeField] || 0);

              if (subType && subType !== '' && subType !== null) {
                remainingSubtypes.push({
                  type: subType,
                  size: subSize ? Number(subSize) : 0
                });
              }
            }

            // Clear all subtype positions
            for (let i = 1; i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
            }

            // Shift remaining subtypes to fill holes (compact to positions 1, 2, 3, etc.)
            for (let i = 0; i < remainingSubtypes.length; i++) {
              const subTypeField = `sub_asset_type_${i + 1}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i + 1}` as keyof Asset;
              (changes as any)[subTypeField] = remainingSubtypes[i].type;
              (changes as any)[subSizeField] = remainingSubtypes[i].size;
            }
          }
        }

        updatedDirtyAssets.set(assetId, changes);

        // Update local assets array for immediate UI update
        const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
        if (assetIndex !== -1) {
          updatedAssets[assetIndex] = {
            ...updatedAssets[assetIndex],
            ...changes
          } as Asset;
        }

        updatedCount++;
      }

      // Parking-type assets that are not business: distribution only updates shared_parking_area (using asset's existing number_of_parking_units)
      const businessAssetIds = new Set(businessAssets.map(a => String(a.asset_id)));
      for (const asset of parkingTypeAssets) {
        if (businessAssetIds.has(String(asset.asset_id))) continue;
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        const merged = { ...currentAsset, ...existingChanges } as any;
        const changes: Partial<Asset> = { ...existingChanges };
        if (shouldClearParkingOnly) {
          changes.shared_parking_area = null;
        } else if (hasParkingData && sharedParkingNum > 0) {
          const nUnits = getAssetParkingUnits(assetId, merged);
          const assigned = unitParkingArea * nUnits;
          changes.shared_parking_area = assigned;
          parkingTypeAssignments.push({ assetId, assignedArea: assigned });
        } else {
          changes.shared_parking_area = 0;
        }
        updatedDirtyAssets.set(assetId, changes);
        const idx = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
        if (idx !== -1) {
          updatedAssets[idx] = { ...updatedAssets[idx], ...changes } as Asset;
        }
        updatedCount++;
      }

      // Assign remainder of shared parking area to the first parking-type asset (rest stays where main type is parking)
      if (hasParkingData && parkingTypeAssignments.length > 0) {
        const totalAssigned = parkingTypeAssignments.reduce((s, p) => s + p.assignedArea, 0);
        const remainderArea = Math.max(0, sharedParkingNum - totalAssigned);
        if (remainderArea > 0) {
          const firstParkingAssetId = parkingTypeAssignments[0].assetId;
          const existingChanges = updatedDirtyAssets.get(firstParkingAssetId) || {};
          const current = updatedAssets.find(a => String(a.asset_id) === firstParkingAssetId);
          const currentArea = (existingChanges as any).shared_parking_area !== undefined
            ? Number((existingChanges as any).shared_parking_area)
            : (Number((current as any)?.shared_parking_area) || 0);
          const newArea = currentArea + remainderArea;
          const changes: Partial<Asset> = { ...existingChanges, shared_parking_area: newArea };
          updatedDirtyAssets.set(firstParkingAssetId, changes);
          const idx = updatedAssets.findIndex(a => String(a.asset_id) === firstParkingAssetId);
          if (idx !== -1) {
            updatedAssets[idx] = { ...updatedAssets[idx], ...changes } as Asset;
          }
        }

        // Cap total at building shared parking: sum(assets) must be <= building.shared_parking_area (validation rule)
        let currentTotal = 0;
        for (const { assetId } of parkingTypeAssignments) {
          const ex = updatedDirtyAssets.get(assetId) || {};
          const cur = updatedAssets.find(a => String(a.asset_id) === assetId);
          currentTotal += (ex as any).shared_parking_area !== undefined
            ? Number((ex as any).shared_parking_area)
            : (Number((cur as any)?.shared_parking_area) || 0);
        }
        if (currentTotal > sharedParkingNum && currentTotal > 0) {
          const scaleFactor = sharedParkingNum / currentTotal;
          for (const { assetId } of parkingTypeAssignments) {
            const existingChanges = updatedDirtyAssets.get(assetId) || {};
            const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
            const currentArea = (existingChanges as any).shared_parking_area !== undefined
              ? Number((existingChanges as any).shared_parking_area)
              : (Number((currentAsset as any)?.shared_parking_area) || 0);
            const newArea = currentArea * scaleFactor;
            const changes: Partial<Asset> = { ...existingChanges, shared_parking_area: newArea };
            updatedDirtyAssets.set(assetId, changes);
            const idx = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
            if (idx !== -1) {
              updatedAssets[idx] = { ...updatedAssets[idx], ...changes } as Asset;
            }
          }
        }
      }

      // Update state without saving to database
      setAssets(updatedAssets);
      setDirtyAssets(updatedDirtyAssets);
      setIsValidatedForSave(false);

      // Update building with computed overload_ratio so it is correct when user clicks "Save all"
      setBuilding(prev => prev ? { ...prev, overload_ratio: overloadRatioPercent } : null);

      // Show success message
      const sharedAreaText = building.business_shared_area! > 0
        ? building.business_shared_area!.toLocaleString('he-IL')
        : '0 (ניקוי פיזור קודם)';
      const overloadRatioText = building.business_shared_area! > 0 && overloadRatioPercent != null
        ? ` יחס העמסה: ${Number(overloadRatioPercent).toFixed(2)}%.`
        : '';
      setToast({
        message: `חושב פיזור שטח משותף עסקים (${sharedAreaText}) ל-${updatedCount} נכסים.${overloadRatioText} לחץ "שמור הכל" לשמירה.`,
        type: 'success'
      });
      setTimeout(() => setToast(null), 5000);

      // Refresh grid so shared_parking_area and number_of_parking_units columns update in UI
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({
          columns: ['shared_parking_area', 'number_of_parking_units', 'business_distribution_area'],
          force: true
        });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'שגיאה בפיזור שטח משותף עסקים', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [building, assets, assetTypes, dirtyAssets, deletedAssets, isAssetNotAccountableForDistribution]);

  // Export assets to Excel
  const handleExportToExcel = useCallback(async () => {
    if (!assets || assets.length === 0) {
      setToast({ message: 'אין נכסים לייצוא', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    try {
      // Get all assets with dirty changes applied
      const assetsToExport = assets.map(asset => {
        const assetId = String(asset.asset_id);
        const dirtyChanges = dirtyAssets.get(assetId) || {};
        return { ...asset, ...dirtyChanges };
      }).filter(asset => !deletedAssets.has(String(asset.asset_id)));

      // Define headers matching the grid columns
      const headers = [
        'מזהה מבנה',
        'מזהה נכס',
        'מזהה משלם',
        'אזור מס',
        'דירת גג',
        'מספר דירה',
        'קומת דירה',
        'מספר מחסן',
        'קומת מחסן',
        'סוג הנחה',
        'תאריך הנחה מ',
        'תאריך הנחה עד',
        'תאריך מדידה',
        'סוג נכס ראשי',
        'גודל נכס ראשי',
        'סוג נכס משנה 1',
        'גודל נכס משנה 1',
        'סוג נכס משנה 2',
        'גודל נכס משנה 2',
        'סוג נכס משנה 3',
        'גודל נכס משנה 3',
        'סוג נכס משנה 4',
        'גודל נכס משנה 4',
        'סוג נכס משנה 5',
        'גודל נכס משנה 5',
        'סוג נכס משנה 6',
        'גודל נכס משנה 6',
        'גודל שטח משותף',  // business_distribution_area
        'שטח חניה משותף',  // shared_parking_area
        'מספר יחידות חניה',  // number_of_parking_units
        'הערה'  // comment
      ];

      // Convert assets to rows
      const rows = assetsToExport.map(asset => [
        asset.building_number || '',
        asset.asset_id || '',
        asset.payer_id || '',
        asset.tax_region || '',
        asset.penthouse || '',
        asset.apartment_number || '',
        asset.apartment_floor || '',
        asset.storage_number || '',
        asset.storage_floor || '',
        asset.discount_type || '',
        formatDateToDDMMYYYY(asset.discount_date_from) || '',
        formatDateToDDMMYYYY(asset.discount_date_to) || '',
        formatDateToDDMMYYYY(asset.measurement_date) || '',
        asset.main_asset_type || '',
        asset.asset_size || '',
        asset.sub_asset_type_1 || '',
        asset.sub_asset_size_1 || '',
        asset.sub_asset_type_2 || '',
        asset.sub_asset_size_2 || '',
        asset.sub_asset_type_3 || '',
        asset.sub_asset_size_3 || '',
        asset.sub_asset_type_4 || '',
        asset.sub_asset_size_4 || '',
        asset.sub_asset_type_5 || '',
        asset.sub_asset_size_5 || '',
        asset.sub_asset_type_6 || '',
        asset.sub_asset_size_6 || '',
        asset.business_distribution_area || '',
        (asset as any).shared_parking_area ?? '',
        (asset as any).number_of_parking_units ?? '',
        asset.comment || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Generate filename with current date and building number
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const filename = `נכסים_מבנה_${buildingNumber}${taxRegion ? `_אזור_${taxRegion}` : ''}_${dateStr}.xlsx`;

      // Use improved export function to reduce antivirus false positives
      exportToExcel({
        filename,
        sheetName: 'נכסים',
        data,
        columnWidths: [
          { wch: 12 }, // מזהה מבנה
          { wch: 12 }, // מזהה נכס
          { wch: 12 }, // מזהה משלם
          { wch: 10 }, // אזור מס
          { wch: 8 },  // דירת גג
          { wch: 8 },  // קומה
          { wch: 12 }, // סוג הנחה
          { wch: 12 }, // תאריך הנחה מ
          { wch: 12 }, // תאריך הנחה עד
          { wch: 12 }, // תאריך מדידה
          { wch: 12 }, // סוג נכס ראשי
          { wch: 12 }, // גודל נכס ראשי
          { wch: 12 }, // סוג נכס משנה 1
          { wch: 12 }, // גודל נכס משנה 1
          { wch: 12 }, // סוג נכס משנה 2
          { wch: 12 }, // גודל נכס משנה 2
          { wch: 12 }, // סוג נכס משנה 3
          { wch: 12 }, // גודל נכס משנה 3
          { wch: 12 }, // סוג נכס משנה 4
          { wch: 12 }, // גודל נכס משנה 4
          { wch: 12 }, // סוג נכס משנה 5
          { wch: 12 }, // גודל נכס משנה 5
          { wch: 12 }, // סוג נכס משנה 6
          { wch: 12 }, // גודל נכס משנה 6
          { wch: 12 }, // גודל שטח משותף
          { wch: 12 }, // שטח חניה משותף
          { wch: 12 }, // מספר יחידות חניה
          { wch: 12 }  // הערה
        ]
      });
      
      setToast({ message: `יוצאו ${rows.length} נכסים בהצלחה`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setToast({ message: 'שגיאה בייצוא לקובץ Excel', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  }, [assets, dirtyAssets, deletedAssets, buildingNumber, taxRegion]);

  // Helper function to get cell style for validation errors and read-only indication
  const getCellStyle = useCallback((params: any) => {
    if (!params || !params.data) return { textAlign: 'right' };

    const assetId = String(params.data?.asset_id);
    if (!assetId || assetId === 'undefined' || assetId === 'null') return { textAlign: 'right' };

    // Safety check: ensure validationErrors and newAssets are defined
    if (!validationErrors || !newAssets) return { textAlign: 'right' };

    const isNewAsset = newAssets.has(assetId);
    const isEditable = isNewAsset || !!taxRegion; // Editable if new asset OR tax region is selected

    // Add visual indication for read-only cells (existing assets when no tax region)
    if (!isEditable) {
      return {
        textAlign: 'right',
        backgroundColor: '#f9fafb', // Light gray background for read-only
        opacity: 0.8, // Slightly faded
        cursor: 'default'
      };
    }

    return { textAlign: 'right' };
  }, [validationErrors, newAssets, taxRegion]);

  async function handleFileUpload(assetId: number, file: File) {
    try {
      setUploadingAssetId(assetId);
      setUploadProgress({ assetId, progress: 0, fileName: file.name });

      // Step 1: Compress file (skip compression for PDF files)
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let compressedFile: File;
      let originalSizeKB: string;
      let compressedSizeKB: string;
      
      if (isPdf) {
        // Skip compression for PDF files
        setUploadProgress({ assetId, progress: 10, fileName: file.name });
        compressedFile = file;
        originalSizeKB = (file.size / 1024).toFixed(2);
        compressedSizeKB = originalSizeKB;
      } else {
        // Compress other file types
        setUploadProgress({ assetId, progress: 10, fileName: file.name });
        compressedFile = await compressFile(file);
        originalSizeKB = (file.size / 1024).toFixed(2);
        compressedSizeKB = (compressedFile.size / 1024).toFixed(2);
      }

      setUploadProgress({ assetId, progress: 30, fileName: file.name });

      // Step 2: Prepare file for upload (use asset_id folder and timestamp to avoid overwriting)
      const fileExt = compressedFile.name.split('.').pop() || file.name.split('.').pop();
      const timestamp = Date.now();
      // Use sanitized filename for storage path (no Hebrew or special chars)
      const sanitizedName = `${timestamp}.${fileExt}`;
      const filePath = `${assetId}/${sanitizedName}`;

      // Step 3: Upload with simulated progress tracking (no upsert - add new file)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (!prev || prev.assetId !== assetId) return prev;
          const newProgress = Math.min(prev.progress + 5, 90);
          return { ...prev, progress: newProgress };
        });
      }, 200);

      setUploadProgress({ assetId, progress: 40, fileName: file.name });

      // Preserve content-type to prevent file corruption (especially important for PDFs)
      const uploadOptions: { contentType?: string; upsert: boolean } = { upsert: false };
      if (compressedFile.type) {
        uploadOptions.contentType = compressedFile.type;
      }

      const { error: uploadError } = await supabase.storage
        .from('structure-drawings')
        .upload(filePath, compressedFile, uploadOptions);

      clearInterval(progressInterval);

      if (uploadError) {
        // Check for bucket not found error
        if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === '404') {
          throw new Error(
            'Storage bucket "structure-drawings" not found. ' +
            'Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "structure-drawings". ' +
            'See CREATE_STORAGE_BUCKETS.md for detailed instructions.'
          );
        }
        throw uploadError;
      }

      setUploadProgress({ assetId, progress: 90, fileName: file.name });

      // Step 4: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('structure-drawings')
        .getPublicUrl(filePath);

      setUploadProgress({ assetId, progress: 95, fileName: file.name });

      // Step 5: Add file to asset_files table (instead of updating structure_drawing_url)
      // For AssetsList, we always add to the latest measurement (undefined = no measurement_date filter, shows all)
      // But we want to associate files with the latest measurement, so we get the asset's measurement_date
      const asset = assets.find(a => a.asset_id === assetId);
      const measurementDate = asset?.measurement_date || null;
      await api.assets.files.add(assetId, publicUrl, file.name, compressedFile.size, compressedFile.type || file.type, measurementDate);

      setUploadProgress({ assetId, progress: 100, fileName: file.name });

      // Show success message
      const sizeReduction = compressedSizeKB !== originalSizeKB 
        ? ` (${originalSizeKB}KB → ${compressedSizeKB}KB)`
        : '';
      setToast({ message: `הקובץ הועלה בהצלחה${sizeReduction}`, type: 'success' });
      setTimeout(() => setToast(null), 5000);
      
      // Update assetsWithFiles to include this asset
      setAssetsWithFiles(prev => new Set(prev).add(assetId));
      
      // Refresh files modal if it's open for this asset
      if (assetFilesModalOpen && selectedAssetIdForFiles === assetId) {
        // Force modal refresh by updating key
        setAssetFilesModalKey(prev => prev + 1);
      }
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'object' && err !== null && 'message' in err
        ? String(err.message)
        : 'נכשל בהעלאת הקובץ';

      setToast({ message: errorMessage, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setUploadProgress(null);
      setUploadingAssetId(null);
    }
  }

  const handleViewDrawing = useCallback((url: string, fileName?: string) => {
    setSelectedDrawingUrl(url);
    setSelectedFileName(fileName || null);
  }, []);

  // Check if tax region is "resident" (מגורים)
  // Find asset types with this tax region and check if they are all "מגורים"
  const isResidentTaxRegion = useMemo(() => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) return false;
    
    // Parse tax region (could be single number or comma-separated)
    const taxRegionNumbers = taxRegion.split(',').map(tr => parseInt(tr.trim())).filter(tr => !isNaN(tr));
    
    if (taxRegionNumbers.length === 0) return false;
    
    // Check if all asset types with these tax regions are "מגורים" (residence)
    const assetTypesForTaxRegions = assetTypes.filter(at => 
      at.tax_region != null && taxRegionNumbers.includes(at.tax_region)
    );
    
    if (assetTypesForTaxRegions.length === 0) return false;
    
    // Check if all asset types are "מגורים" (residence)
    const allAreResidence = assetTypesForTaxRegions.every(at => 
      at.business_residence === 'מגורים'
    );
    
    return allAreResidence;
  }, [taxRegion, assetTypes]);

  // Check if tax region is "multi" (multiple tax regions - when taxRegion is not set or taxRegion itself contains comma)
  const isMultiTaxRegion = useMemo(() => {
    return !taxRegion || (taxRegion && taxRegion.includes(','));
  }, [taxRegion]);

  const detailColumnDefs: ColDef<Asset>[] = useMemo(() => {
    const defs: ColDef<Asset>[] = [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      cellStyle: { textAlign: 'right', backgroundColor: '#fef3c7', fontWeight: '600' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'use_nature',
      headerName: 'מהות שימוש',
      editable: (params: any) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      valueGetter: (params) => {
        const v = params.data?.use_nature;
        if (v != null && v !== '') return v;
        return getMainAssetTypeDescription(params.data?.main_asset_type);
      },
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'asset_size',
      headerName: !isResidentTaxRegion ? 'גודל נכס ללא שטח משותף' : t('mainAssetSize'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'apartment_floor',
      headerName: 'קומת דירה',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'comment',
      headerName: 'הערה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellEditor: 'agLargeTextCellEditor',
      cellEditorParams: {
        maxLength: 1000,
        rows: 5,
        cols: 50
      },
      cellEditorPopup: true,
      cellEditorPopupPosition: 'over',
      cellRenderer: (params: any) => {
        const hasValue = params.value && params.value.trim() !== '';
        const isEditable = isFieldEditable(params, 'comment');
        return (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: hasValue ? 'flex-end' : 'center', 
              gap: '4px', 
              direction: 'rtl', 
              width: '100%', 
              paddingRight: hasValue ? '4px' : '0', 
              cursor: 'default', 
              height: '100%' 
            }}
            onClick={(e) => {
              if (!isEditable) {
                e.stopPropagation();
              }
            }}
          >
            {hasValue && <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value}</span>}
            <MessageSquare size={16} style={{ color: hasValue ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
          </div>
        );
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      tooltipValueGetter: (params) => params.value || ''
    }
    ];
    
    // Process all headers to add icons for long headers (>3 words)
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, assetTypes, getCellStyle, isResidentTaxRegion]);




  // Create stable penthouse checkbox cellRenderer
  const penthouseCellRenderer = useCallback((params: any) => {
    if (!params || !params.data) return null;
    
    const assetId = params.data?.asset_id;
    if (!assetId || assetId === 'undefined' || assetId === 'null') return null;
    
    // Safety check: ensure newAssets and dirtyAssets are defined
    if (!newAssets || !dirtyAssets) return null;
    
    const assetIdStr = String(assetId);
    const isNewAsset = newAssets.has(assetIdStr);
    const dirtyChanges = dirtyAssets.get(assetIdStr);
    const currentValue = dirtyChanges && 'penthouse' in dirtyChanges 
      ? dirtyChanges.penthouse 
      : params.data?.penthouse;
    const isChecked = currentValue === true || currentValue === 'כן';
    
    // Always show checkbox for both new and existing assets
    return (
      <div className="flex items-center justify-center h-full">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            const newValue = e.target.checked ? true : false;
            
            if (isNewAsset) {
              // Track the change in dirtyAssets for new assets
              setDirtyAssets(prev => {
                const next = new Map(prev);
                const existing = next.get(assetIdStr) || {};
                next.set(assetIdStr, { ...existing, penthouse: newValue });
                return next;
              });
            } else {
              // Track the change in dirtyAssets for existing assets
              setDirtyAssets(prev => {
                const next = new Map(prev);
                const existing = next.get(assetIdStr) || {};
                next.set(assetIdStr, { ...existing, penthouse: newValue });
                return next;
              });
            }
            
            // Update grid cell data directly
            params.node.setDataValue('penthouse', newValue);
            
            // Update assets state
            setAssets(prev => prev.map(a => 
              String(a.asset_id) === assetIdStr ? { ...a, penthouse: newValue } : a
            ));
            
            // Refresh only this specific cell
            if (gridRef.current) {
              gridRef.current.api.refreshCells({
                rowNodes: [params.node],
                columns: ['penthouse'],
                force: false
              });
            }
          }}
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
        />
      </div>
    );
  }, [newAssets, dirtyAssets, setDirtyAssets, setAssets, gridRef]);

  // Switch to assets tab if transfer-history or distribution-history is active in residence tabs or multi-tax tabs
  useEffect(() => {
    if ((activeTab === 'transfer-history' && isResidentTaxRegion) || 
        ((activeTab === 'distribution-history' || activeTab === 'transfer-history') && isMultiTaxRegion)) {
      setActiveTab('assets');
    }
  }, [isResidentTaxRegion, activeTab, isMultiTaxRegion]);

  // Fetch distribution and transfer history counts (only for single tax region tabs, not multi-tax)
  useEffect(() => {
    const fetchHistoryCounts = async () => {
      if (!buildingNumber) return;
      
      // Only fetch history counts for single tax region tabs
      if (isMultiTaxRegion) {
        setDistributionHistoryCount(0);
        setTransferHistoryCount(0);
        return;
      }
      
      try {
        // Fetch distribution history count
        const actionType = isResidentTaxRegion ? 'residence_distribution' : 'business_distribution';
        const distributionHistory = await api.distributionAudit.getByBuilding(buildingNumber, actionType);
        setDistributionHistoryCount(distributionHistory.length);
        
        // Fetch transfer history count (only for business)
        if (!isResidentTaxRegion) {
          const transferHistory = await api.distributionAudit.getByBuilding(buildingNumber, 'transfer');
          setTransferHistoryCount(transferHistory.length);
        } else {
          setTransferHistoryCount(0);
        }
      } catch (error) {
        console.error('Error fetching history counts:', error);
        setDistributionHistoryCount(0);
        setTransferHistoryCount(0);
      }
    };
    
    fetchHistoryCounts();
  }, [buildingNumber, isResidentTaxRegion, isMultiTaxRegion]);

  const columnDefs: ColDef<Asset>[] = useMemo(() => {
    const isBusinessAssetRow = (params: any) => {
      if (!params?.data?.main_asset_type || !assetTypes?.length) return false;
      const at = assetTypes.find((t: any) => t.name === params.data.main_asset_type);
      return at?.business_residence === 'עסקים';
    };
    const defs: ColDef<Asset>[] = [
    {
      colId: 'actions',
      headerName: t('actions'),
      editable: false,
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.asset_id);
        // Allow temporary IDs for new assets (e.g., "temp-1234567890")
        if (!assetId || assetId === 'undefined' || assetId === 'null') return null;
        
        // Safety checks for state variables - use empty defaults if undefined
        const safeNewAssets = newAssets || new Set<string>();
        const safeDeletedAssets = deletedAssets || new Set<string>();
        // Prefer _validationError from row data (set when rowData updates); fallback to ref
        const errorFromData = (asset as any)._validationError;
        const hasValidationError = (errorFromData != null && errorFromData !== '') || (validationErrorsRef.current || new Map()).has(assetId);
        const safeSelectedAssets = selectedAssets || new Set<string>();
        
        const isNew = safeNewAssets.has(assetId);
        const isDeleted = safeDeletedAssets.has(assetId);
        
        // Debug logging for validation errors
        if (process.env.NODE_ENV === 'development' && hasValidationError) {
        }
        
        // Show delete button only if a specific tax region is selected (same visibility logic as "Save All" and "Cancel" buttons)
        // Delete button should be visible for all assets (new and existing), same as view asset button
        // Hide delete button in error fixing mode
        const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
        // If building has multiple tax regions, only show delete button when a specific taxRegion is selected
        // If building has only one tax region, show delete button (taxRegion may or may not be set)
        const shouldShowDeleteButton = !isErrorFixingMode && (!hasMultipleTaxRegions || taxRegion);
        
        // Show checkbox in multi-tax-region mode (all assets view) or single tax region tab
        // Checkbox should be hidden for new assets, same as view icon
        // Hide checkbox in error fixing mode
        const shouldShowCheckbox = !isErrorFixingMode && !isNew && (
          (!taxRegion && hasMultipleTaxRegions) || // All assets view when building has multiple tax regions
          !!taxRegion // Specific tax region tab
        );
        const isSelected = safeSelectedAssets.has(assetId);
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {shouldShowCheckbox && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedAssets(prev => {
                    const next = new Set(prev || []);
                    if (e.target.checked) {
                      next.add(assetId);
                    } else {
                      next.delete(assetId);
                    }
                    return next;
                  });
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                title={!taxRegion && hasMultipleTaxRegions ? "בחר לשינוי אזור מס" : "בחר להעברת שטחים"}
              />
            )}
            {!isErrorFixingMode && !isNew && taxRegion && !isMultiTaxRegion && (
              sourceAssetId === assetId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSourceAssetId(null);
                    if (gridRef.current?.api) {
                      gridRef.current.api.refreshCells({ columns: ['actions'], force: true });
                    }
                  }}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors duration-200"
                  title="בטל בחירת מקור"
                >
                  <Copy className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sourceAssetId) {
                      applySourceValues(assetId);
                    } else {
                      setSourceAssetId(assetId);
                      if (gridRef.current?.api) {
                        gridRef.current.api.refreshCells({ columns: ['actions'], force: true });
                      }
                    }
                  }}
                  className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors duration-200 ${
                    sourceAssetId
                      ? 'text-blue-600 hover:bg-blue-100 hover:text-blue-700'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title={sourceAssetId ? 'העתק סוג נכס ותת-סוגים מהמקור' : 'סמן כמקור סוג נכס'}
                >
                  {sourceAssetId ? <MoveLeft className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              )
            )}
            {hasValidationError && (() => {
              // Validation tooltip component
              const ValidationTooltipButton = ({ errorMessage, onErrorClick }: { errorMessage: string, onErrorClick: () => void }) => {
                const [isHovered, setIsHovered] = useState(false);
                const [position, setPosition] = useState({ top: 0, right: 0 });
                const buttonRef = useRef<HTMLButtonElement>(null);

                const handleMouseEnter = () => {
                  if (buttonRef.current) {
                    const rect = buttonRef.current.getBoundingClientRect();
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

                const tooltipContent = isHovered ? (
                  <div
                    className="tooltip-container"
                    style={{
                      top: `${position.top}px`,
                      right: `${position.right + 8}px`,
                      transform: 'translateY(-50%)'
                    }}
                  >
                    <div className="tooltip-content">
                      {errorMessage}
                    </div>
                  </div>
                ) : null;

                return (
                  <>
                    <button
                      ref={buttonRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        onErrorClick();
                      }}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
                    >
                      <AlertCircle className="h-5 w-5" />
                    </button>
                    {tooltipContent && createPortal(tooltipContent, document.body)}
                  </>
                );
              };

              const errorMsg = (typeof errorFromData === 'string' ? errorFromData : null) || (validationErrorsRef.current || new Map()).get(assetId) || 'שגיאת אימות';
              return (
                <ValidationTooltipButton
                  errorMessage={errorMsg}
                  onErrorClick={() => {
                    setToast({ message: errorMsg, type: 'error' });
                    setTimeout(() => setToast(null), 5000);
                  }}
                />
              );
            })()}
            {shouldShowDeleteButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDelete(assetId);
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ${
                  isDeleted
                    ? 'bg-red-200 hover:bg-red-300 text-red-700'
                    : 'hover:bg-red-100 text-red-500 hover:text-red-700'
                }`}
                title={isDeleted ? 'בטל מחיקה' : 'סמן למחיקה'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      }
    },
    {
      headerName: t('structureDrawing') || 'שרטוט מבנה',
      field: 'structure_drawing_url',
      pinned: 'right',
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.asset_id);
        const isNew = newAssets.has(assetId);
        const isUploading = uploadingAssetId === asset.asset_id;
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {!isErrorFixingMode && !isNew && taxRegion && (
              <label
                className="flex items-center justify-center p-1 text-blue-600 hover:text-blue-700 transition-colors hover:scale-110 cursor-pointer"
                title={t('upload') || 'העלה קובץ'}
                onClick={(e) => e.stopPropagation()}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                <input
                  type="file"
                  multiple
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(assetId, el);
                  }}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.dwg,.docx,.doc,.txt,.xlsx"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    for (let i = 0; i < files.length; i++) {
                      await handleFileUpload(asset.asset_id, files[i]);
                    }
                    if (fileInputRefs.current.has(assetId)) {
                      fileInputRefs.current.get(assetId)!.value = '';
                    }
                  }}
                />
              </label>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (assetsWithFiles.has(asset.asset_id)) {
                  setSelectedAssetIdForFiles(asset.asset_id);
                  setAssetFilesModalOpen(true);
                }
              }}
              disabled={!assetsWithFiles.has(asset.asset_id)}
              className={`p-1 transition-colors hover:scale-110 ${
                assetsWithFiles.has(asset.asset_id)
                  ? 'text-green-600 hover:text-green-700 cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed opacity-50'
              }`}
              title={assetsWithFiles.has(asset.asset_id) ? (t('view') || 'צפה בקבצים') : (t('noFiles') || 'אין קבצים')}
            >
              <FileText className="h-5 w-5" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => {
        const baseStyle = getCellStyle(params);
        const asset = params.data as Asset;
        if (asset && !newAssets.has(String(asset.asset_id))) {
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
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return '';
        const isClickable = !newAssets.has(String(asset.asset_id));
        const value = params.value != null ? String(params.value) : '';
        
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
              title={t('viewDetails') || 'לחץ לצפייה בפרטים'}
            >
              {value}
            </span>
          );
        }
        return value;
      },
      onCellClicked: (params: any) => {
        const asset = params.data as Asset;
        if (asset && !newAssets.has(String(asset.asset_id))) {
          const assetId = String(asset.asset_id);
          onSelectAsset(assetId, assetId, buildingNumber, validationTaxRegion);
        }
      }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => isFieldEditable(params, 'measurement_date'),
      cellStyle: (params: any) => {
        if (!params || !params.data) {
          return { textAlign: 'right' };
        }
        
        const assetId = String(params.data?.asset_id);
        if (!assetId || assetId === 'undefined' || assetId === 'null') {
          return { textAlign: 'right' };
        }
        
        // Safety check: ensure newAssets is defined
        if (!newAssets) {
          return { textAlign: 'right' };
        }
        
        const isNewAsset = newAssets.has(assetId);
        
        // For new assets, use the standard cell style (with validation/read-only indication)
        if (isNewAsset) {
          return getCellStyle(params);
        }
        
        // For existing assets, use the special green background style (read-only)
        return { 
          textAlign: 'right', 
          backgroundColor: '#ecfdf5', 
          fontWeight: '700', 
          color: '#065f46',
          opacity: 0.8,
          cursor: 'default'
        };
      },
      headerClass: 'ag-right-aligned-header',
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => isFieldEditable(params, 'payer_id'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
      },
      editable: (params) => isFieldEditable(params, 'tax_region'),
      type: 'numericColumn',
      valueParser: (params) => numericValueParserInt(params, 10),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      cellRenderer: penthouseCellRenderer,
      hide: false // Always show penthouse checkbox for residence assets
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      editable: (params) => isFieldEditable(params, 'apartment_number'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'apartment_floor',
      headerName: 'קומת דירה',
      editable: (params) => isFieldEditable(params, 'apartment_floor'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      editable: (params) => isFieldEditable(params, 'storage_number'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      editable: (params) => isFieldEditable(params, 'storage_floor'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      editable: (params) => isFieldEditable(params, 'discount_type'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      editable: (params) => isFieldEditable(params, 'discount_date_from'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      editable: (params) => isFieldEditable(params, 'discount_date_to'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'comment',
      headerName: 'הערה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellEditor: 'agLargeTextCellEditor',
      cellEditorParams: {
        maxLength: 1000,
        rows: 5,
        cols: 50
      },
      cellEditorPopup: true,
      cellEditorPopupPosition: 'over',
      cellRenderer: (params: any) => {
        const hasValue = params.value && params.value.trim() !== '';
        const isEditable = isFieldEditable(params, 'comment');
        return (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: hasValue ? 'flex-end' : 'center', 
              gap: '4px', 
              direction: 'rtl', 
              width: '100%', 
              paddingRight: hasValue ? '4px' : '0', 
              cursor: 'default', 
              height: '100%' 
            }}
            onClick={(e) => {
              if (!isEditable) {
                e.stopPropagation();
              }
            }}
          >
            {hasValue && <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value}</span>}
            <MessageSquare size={16} style={{ color: hasValue ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
          </div>
        );
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      tooltipValueGetter: (params) => params.value || ''
    },
    {
      field: 'main_asset_type',
      ...processColumnHeader(t('mainAssetType')),
      editable: (params) => isFieldEditable(params, 'main_asset_type'),
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'use_nature',
      headerName: 'מהות שימוש',
      editable: (params) => isFieldEditable(params, 'use_nature'),
      valueGetter: (params) => {
        const v = params.data?.use_nature;
        if (v != null && v !== '') return v;
        return getMainAssetTypeDescription(params.data?.main_asset_type);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'asset_size',
      headerName: !isResidentTaxRegion ? 'גודל נכס ללא שטח משותף' : t('mainAssetSize'),
      editable: (params) => isFieldEditable(params, 'asset_size'),
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParser(params),
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'operator_id',
      headerName: 'מפעיל',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      valueGetter: (params: any) => {
        const value = params.data?.operator_id ?? null;
        return value;
      },
      valueSetter: (params: any) => {
        if (params.data) {
          const newValue = params.newValue;
          const numValue = newValue != null && newValue !== '' ? Number(newValue) : null;
          const finalValue = (numValue != null && !isNaN(numValue) && numValue > 0) ? numValue : null;
          params.data.operator_id = finalValue;
        }
        return true;
      },
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return '';
        const operatorId = params.value != null ? params.value : (asset.operator_id ?? null);
        if (operatorId == null) return '';
        const o = operators.find(x => x.id === operatorId);
        return o ? o.name : String(operatorId);
      },
      cellEditor: OperatorCellEditor,
      cellEditorParams: (params: any) => ({
        operators: operators || [],
      }),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'shared_parking_area',
      headerName: 'שטח חניה משותף',
      valueGetter: (params: any) => {
        const id = params.data?.asset_id != null ? String(params.data.asset_id) : null;
        const dirty = id ? dirtyAssets.get(id) : undefined;
        if (dirty && 'shared_parking_area' in dirty) return (dirty as any).shared_parking_area;
        return params.data?.shared_parking_area;
      },
      editable: (params) => !isResidentTaxRegion && isBusinessAssetRow(params) && isFieldEditable(params, 'shared_parking_area'),
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (isResidentTaxRegion || !isBusinessAssetRow(params)) return '';
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      valueParser: (params) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = Number(newValue);
        return isNaN(numValue) ? null : numValue;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Only business assets have shared parking area
    },
    {
      field: 'number_of_parking_units',
      headerName: 'מספר יחידות חניה',
      valueGetter: (params: any) => {
        const id = params.data?.asset_id != null ? String(params.data.asset_id) : null;
        const dirty = id ? dirtyAssets.get(id) : undefined;
        if (dirty && 'number_of_parking_units' in dirty) return (dirty as any).number_of_parking_units;
        return params.data?.number_of_parking_units;
      },
      editable: (params) => !isResidentTaxRegion && isBusinessAssetRow(params) && isFieldEditable(params, 'number_of_parking_units'),
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (isResidentTaxRegion || !isBusinessAssetRow(params)) return '';
        const val = params.value;
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseInt(String(val), 10);
        return isNaN(num) ? '' : String(num);
      },
      valueParser: (params) => {
        if (!params) return null;
        const newValue = params.newValue;
        if (newValue === null || newValue === undefined || newValue === '') return null;
        const numValue = parseInt(String(newValue), 10);
        return isNaN(numValue) ? null : numValue;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Only business assets have number of parking units
    },
    {
      field: 'business_distribution_area',
      headerName: 'גודל שטח משותף',
      editable: false, // Always readonly - only updated through distribution functions
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Hide for residence assets (business_distribution_area is only for business distribution)
    },
    {
      field: 'business_total_area',
      headerName: 'סה"כ שטח עסקים',
      editable: false, // Always readonly - calculated field
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Hide for residence assets (business_total_area is only for business assets)
    },
    {
      field: 'extra_field',
      headerName: '',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
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
    
    // Process all headers to add icons for long headers (>2 words)
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, onSelectAsset, buildingNumber, assetTypes, newAssets, dirtyAssets, building, taxRegion, selectedAssets, deletedAssets, validationErrors, getCellStyle, isResidentTaxRegion, isMultiTaxRegion, isFieldEditable, penthouseCellRenderer, assetsWithFiles, sourceAssetId, applySourceValues, operators]);

  // Apply field configurations to column definitions (must be after columnDefs is defined)
  const configuredColumnDefs = useFieldConfig(columnDefs, 'assets-list');

  // Check if all visible assets are residential assets (מגורים)
  // Sort assets to put errored rows first; merge dirty changes so edits show with validation errors
  const sortedAssets = useMemo(() => {
    return [...assets].map((asset, idx) => {
      const assetId = String(asset.asset_id);
      const dirty = dirtyAssets.get(assetId);
      const merged = dirty ? { ...asset, ...dirty } : asset;
      return { asset: merged, idx };
    })
      .sort((a, b) => {
        const aId = String(a.asset.asset_id);
        const bId = String(b.asset.asset_id);
        const aHasError = validationErrors.has(aId);
        const bHasError = validationErrors.has(bId);
        if (aHasError !== bHasError) {
          return aHasError ? -1 : 1;
        }
        return a.idx - b.idx;
      })
      .map(({ asset }) => ({
        ...asset,
        _validationError: validationErrors.get(String(asset.asset_id))
      }));
  }, [assets, validationErrors, dirtyAssets]);

  const areAllAssetsResidence = useMemo(() => {
    if (!assets || assets.length === 0 || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Create asset type map for quick lookup
    const assetTypeMap = new Map<string, AssetType>();
    assetTypes.forEach(at => {
      assetTypeMap.set(at.name, at);
    });
    
    // Check if all assets are residential (מגורים)
    const visibleAssets = assets.filter(asset => !deletedAssets.has(String(asset.asset_id)));
    if (visibleAssets.length === 0) return false;
    
    // Check if all assets have business_residence === 'מגורים'
    const allResidence = visibleAssets.every(asset => {
      if (!asset.main_asset_type) return false;
      const assetType = assetTypeMap.get(String(asset.main_asset_type));
      return assetType && assetType.business_residence === 'מגורים';
    });
    
    return allResidence;
  }, [assets, assetTypes, deletedAssets]);

  // Extract available tax regions from building
  const availableTaxRegions = useMemo(() => {
    if (!building?.tax_region) return [];
    const taxRegionStr = String(building.tax_region);
    if (!taxRegionStr.includes(',')) {
      // Single tax region
      const num = parseInt(taxRegionStr.trim(), 10);
      return isNaN(num) ? [] : [num];
    }
    // Multiple tax regions (comma-separated)
    return taxRegionStr.split(',')
      .map(tr => parseInt(tr.trim(), 10))
      .filter(tr => !isNaN(tr))
      .sort((a, b) => a - b);
  }, [building?.tax_region]);

  // Check if tax region is "business" (עסקים) - has at least one business asset type
  const isBusinessTaxRegion = useMemo(() => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) {
      // If asset types aren't loaded yet, we can't determine - default to false
      // The button will show if !isResidentTaxRegion (which will be false when asset types aren't loaded)
      return false;
    }
    
    // Parse tax region (could be single number or comma-separated)
    const taxRegionNumbers = taxRegion.split(',').map(tr => parseInt(tr.trim())).filter(tr => !isNaN(tr));
    
    if (taxRegionNumbers.length === 0) return false;
    
    // Check if there are any business asset types with these tax regions
    const assetTypesForTaxRegions = assetTypes.filter(at => 
      at.tax_region != null && taxRegionNumbers.includes(at.tax_region)
    );
    
    if (assetTypesForTaxRegions.length === 0) return false;
    
    // Check if at least one asset type is "עסקים" (business)
    const hasBusiness = assetTypesForTaxRegions.some(at => 
      at.business_residence === 'עסקים'
    );
    
    return hasBusiness;
  }, [taxRegion, assetTypes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingAssets')}</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {/* Loading overlay modal for save operations */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center" style={{ cursor: 'wait' }}>
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-teal-600 animate-spin" />
            <p className="text-slate-700 font-medium text-lg">שומר נתונים...</p>
            <p className="text-slate-500 text-sm">אנא המתן, הפעולה עשויה לקחת מספר שניות</p>
          </div>
        </div>
      )}
      {/* Loading overlay for export to automation - progress in modal */}
      {exporting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center" style={{ cursor: 'wait' }}>
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
            <Loader2 className="h-12 w-12 text-teal-600 animate-spin" />
            <p className="text-slate-700 font-medium text-lg">שולח נתונים לעירייה</p>
            <p className="text-slate-600 text-sm text-center">{exportProgressMessage || 'מתחיל...'}</p>
          </div>
        </div>
      )}
      {/* Loading overlay modal for file upload */}
      {uploadProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center" style={{ cursor: 'wait' }}>
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[200px]">
            <Loader2 className="h-12 w-12 text-teal-600 animate-spin" />
            <p className="text-slate-700 font-medium text-lg">מעלה קובץ...</p>
            <p className="text-slate-500 text-sm truncate max-w-[280px]" title={uploadProgress.fileName}>{uploadProgress.fileName}</p>
            <div className="w-full max-w-[200px] h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }} />
            </div>
            <p className="text-slate-500 text-xs">{Math.round(uploadProgress.progress)}%</p>
          </div>
        </div>
      )}
      {/* Blinking warning message when distribution is needed */}
      {building && (() => {
        // Check if distribution is needed: flag must be true (needs distribution)
        // With new field names: true = needs distribution, false = already distributed
        // Show alert if flag is raised, regardless of shared area value (even if 0 or null)
        const needsResidenceDistribution = isResidentTaxRegion && 
          building.need_residence_distribution === true;
        
        // Show business distribution alert if:
        // 1. Flag is raised, AND
        // 2. We're not in a residence tax region, AND
        // 3. Either we're in a business tax region tab OR we're not in any specific tax region tab
        const needsBusinessDistribution = building.need_business_distribution === true &&
          !isResidentTaxRegion &&
          (taxRegion ? (!isMultiTaxRegion) : true); // Show if taxRegion is set (and not multi) OR if taxRegion is not set
        
        // Debug logging in development
        if (process.env.NODE_ENV === 'development') {
          if (building.need_residence_distribution === true) {
            console.log('[AssetsList] Residence distribution flag check:', {
              isResidentTaxRegion,
              need_residence_distribution: building.need_residence_distribution,
              needsResidenceDistribution,
              residence_shared_area: building.residence_shared_area,
              building_number: building.building_number
            });
          }
        }
        
        if (!needsResidenceDistribution && !needsBusinessDistribution) {
          return null;
        }
        
        return (
          <div className="fixed bottom-4 left-4 z-50 max-w-md space-y-2">
            {needsResidenceDistribution && (
              <div className="animate-pulse" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div className="bg-amber-500 border-l-4 border-amber-700 rounded-lg p-4 shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-900 animate-bounce" />
                    <p className="text-amber-900 font-bold text-lg">
                      ⚠️ יש צורך לפזר שטח משותף מגורים!
                    </p>
                  </div>
                </div>
              </div>
            )}
            {needsBusinessDistribution && (
              <div className="animate-pulse" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div className="bg-amber-500 border-l-4 border-amber-700 rounded-lg p-4 shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-900 animate-bounce" />
                    <p className="text-amber-900 font-bold text-lg">
                      ⚠️ יש צורך לפזר שטח משותף עסקים!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div className="w-full py-2" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
        <div className="page-header mb-2 rounded-lg px-3 py-2">
          <div className="relative flex items-center gap-2 flex-wrap">
            <div className="page-header-icon shrink-0">
              <BuildingIcon className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {((building?.address ?? building?.building_address) || building?.building_number_in_street != null) && (
                  <span className="page-header-badge page-header-badge-address">
                    <BuildingIcon className="w-4 h-4" />
                    כתובת: {(buildingAddress ?? '-')}{building?.building_number_in_street != null ? ` מס' ${building.building_number_in_street}` : ''}
                  </span>
                )}
                {taxRegion ? (
                  <span className="page-header-badge page-header-badge-area">
                    {getAreaDescriptionForTaxRegion(taxRegion)}
                  </span>
                ) : null}
                <span className="page-header-label">גוש: {building?.gosh || '-'}</span>
                <span className="page-header-label">חלקה: {building?.helka || '-'}</span>
                <span className="page-header-label">סך הכל: {assets.length} נכסים</span>
                <span className="page-header-label font-bold">מזהה מבנה {building?.building_number || '-'}</span>
                {isResidentTaxRegion && building?.residence_shared_area != null && building.residence_shared_area > 0 && (
                  <span className="page-header-label">שטח משותף מגורים: {building.residence_shared_area.toLocaleString('he-IL')}</span>
                )}
                {taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && building?.business_shared_area != null && building.business_shared_area > 0 && (
                  <span className="page-header-label">שטח משותף עסקים: {building.business_shared_area.toLocaleString('he-IL')}</span>
                )}
                {taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && building?.overload_ratio != null && (
                  <span className="page-header-pill">אחוז העמסה: {building.overload_ratio.toFixed(2)}%</span>
                )}
            </div>
            {!taxRegion && (() => {
                const assetTaxRegions = new Set<number>();
                assets.forEach(asset => {
                  if (asset.tax_region != null) {
                    const taxRegionNum = typeof asset.tax_region === 'string' 
                      ? parseInt(asset.tax_region, 10) 
                      : asset.tax_region;
                    if (!isNaN(taxRegionNum)) {
                      assetTaxRegions.add(taxRegionNum);
                    }
                  }
                });
                const sortedRegions = Array.from(assetTaxRegions).sort((a, b) => a - b);
                const regionDescriptions = sortedRegions.map(region => getAreaDescriptionForTaxRegion(region));
                return sortedRegions.length > 0 ? (
                  <span className="page-header-badge page-header-badge-area">{regionDescriptions.join(', ')}</span>
                ) : null;
            })()}
          </div>
        </div>
        <div className="action-bar mb-2">
          {/* All Action Buttons in One Row */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            {/* Hide add button if building has more than one tax region and no specific taxRegion is selected, or in error fixing mode */}
            {!isErrorFixingMode && (() => {
              const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
              // If a specific taxRegion is selected (we're in a tax region tab), show buttons
              // If no taxRegion but building has multiple regions, hide buttons
              if (hasMultipleTaxRegions && !taxRegion) return null;
              
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenNewAsset) {
                      // Use the tax region from the active tab (shown in header)
                      // This should be a single value, but if somehow it contains comma, use only the first part
                      let taxRegionToPass = taxRegion;
                      if (taxRegion && taxRegion.includes(',')) {
                        // Safety: if taxRegion somehow contains comma, extract first value
                        // This shouldn't happen if tabs are created correctly, but add safety check
                        console.warn('[AssetsList] taxRegion contains comma, extracting first value:', taxRegion);
                        taxRegionToPass = taxRegion.split(',')[0].trim();
                      }
                      if (process.env.NODE_ENV === 'development') {
                      }
                      onOpenNewAsset(buildingNumber, taxRegionToPass);
                    } else {
                      addEmptyRow();
                    }
                  }}
                  className="btn btn-action btn-primary"
                >
                  <Plus className="h-5 w-5" />
                  <span>הוסף נכס</span>
                </button>
              );
            })()}
            <button
              type="button"
              onClick={handleBatchValidateBuildingAssets}
              className="btn btn-action btn-primary"
              title={selectedAssets.size > 0 ? `אמת ${selectedAssets.size} נכסים נבחרים` : 'אמת את כל הנכסים'}
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>{selectedAssets.size > 0 ? `אמת נבחרים (${selectedAssets.size})` : 'אמת הכל'}</span>
            </button>
            {!isErrorFixingMode && (
              <button
                type="button"
                onClick={handleExportToExcel}
                disabled={loading || assets.length === 0}
                className="btn btn-action btn-export"
                title="ייצא את כל הנכסים לקובץ Excel"
              >
                <FileSpreadsheet className="h-5 w-5" />
                <span>ייצא ל-Excel</span>
              </button>
            )}
            {/* Export to automation button - follows export condition (measured but not exported) */}
            {!isErrorFixingMode && (
              <button
                type="button"
                onClick={handleExportToAutomation}
                disabled={loading || exporting || exportToAutomationCount === 0}
                className="btn btn-action text-orange-600 hover:bg-black/5 active:bg-black/10 disabled:opacity-50 min-w-[90px] [&_svg]:text-orange-600 [&_span]:text-orange-600"
                title={exportToAutomationCount > 0 ? `שלח ${exportToAutomationCount} נכסים שנמדדו ולא נשלחו לעירייה` : 'אין נכסים לשליחה - כל הנכסים כבר נשלחו לעירייה'}
              >
                {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span>שליחה לעירייה{exportToAutomationCount > 0 ? ` (${exportToAutomationCount})` : ''}</span>
              </button>
            )}
            {/* Statistics button - visible in business and residence tabs (not in multi-tax tabs) */}
            {!isErrorFixingMode && !isMultiTaxRegion && (
              <button
                type="button"
                onClick={() => setShowAssetStatisticsModal(true)}
                disabled={loading || assets.length === 0}
                className="btn btn-action btn-primary"
                title="הצג סטטיסטיקות לפי סוגי נכסים ותתי-סוגים"
              >
                <BarChart3 className="h-5 w-5" />
                <span>סטטיסטיקות</span>
              </button>
            )}
            {/* Change tax region button - only show in "all assets" tab (when taxRegion is not set) and not in error fixing mode */}
            {!isErrorFixingMode && !taxRegion && building && availableTaxRegions.length > 1 && (
              <button
                type="button"
                onClick={() => setChangeTaxRegionModalOpen(true)}
                disabled={loading || selectedAssets.size === 0}
                className="btn btn-action btn-primary"
                title={selectedAssets.size > 0 ? `שנה אזור מס ל-${selectedAssets.size} נכסים נבחרים` : 'בחר נכסים לשינוי אזור מס'}
              >
                <MapPin className="h-5 w-5" />
                <span>שנה אזור מס{selectedAssets.size > 0 ? ` (${selectedAssets.size})` : ''}</span>
              </button>
            )}
            {/* Distribute shared area button - always visible in residence tabs, enabled when flag is on (blinking alert), hidden in error fixing mode */}
            {!isErrorFixingMode && building && isResidentTaxRegion && (building.residence_shared_area != null || building.need_residence_distribution === true) && (
              <button
                type="button"
                onClick={handleDistributeSharedArea}
                disabled={
                  loading || 
                  assets.length === 0 || 
                  building.need_residence_distribution !== true
                  // Note: Allow distribution even if area is 0, as long as flag is true (blinking alert is on)
                }
                className="btn btn-action btn-secondary-ghost"
                title={building.need_residence_distribution === true 
                  ? building.residence_shared_area != null && building.residence_shared_area > 0
                    ? `פזר שטח משותף מגורים (${building.residence_shared_area.toLocaleString('he-IL')}) בין כל נכסי המגורים`
                    : building.residence_shared_area != null && building.residence_shared_area === 0
                    ? 'נקה פיזור קודם של שטח משותף מגורים (שטח משותף = 0)'
                    : 'פזר שטח משותף מגורים בין כל נכסי המגורים'
                  : 'יש לשנות את שטח משותף מגורים כדי לאפשר פיזור'}
              >
                <Download className="h-5 w-5" />
                <span>פזר שטח משותף מגורים</span>
              </button>
            )}
            {/* Distribute business shared area button - always visible in business tabs, enabled when flag is on (blinking alert), hidden in error fixing mode */}
            {!isErrorFixingMode && building && taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && (building.business_shared_area != null || building.need_business_distribution === true) && (
              <button
                type="button"
                onClick={handleDistributeBusinessSharedArea}
                disabled={
                  loading || 
                  assets.length === 0 || 
                  building.need_business_distribution !== true
                  // Note: Allow distribution even if area is 0, as long as flag is true (blinking alert is on)
                }
                className="btn btn-action btn-secondary-ghost"
                title={building.need_business_distribution === true
                  ? building.business_shared_area != null && building.business_shared_area > 0
                    ? `פזר שטח משותף עסקים (${building.business_shared_area.toLocaleString('he-IL')}) בין כל נכסי העסקים`
                    : building.business_shared_area != null && building.business_shared_area === 0
                    ? 'נקה פיזור קודם של שטח משותף עסקים (שטח משותף = 0)'
                    : 'פזר שטח משותף עסקים בין כל נכסי העסקים'
                  : 'יש לשנות את שטח משותף עסקים כדי לאפשר פיזור'}
              >
                <Download className="h-5 w-5" />
                <span>פזר שטח משותף עסקים</span>
              </button>
            )}
            {/* Show save and cancel buttons only if a specific tax region is selected (same visibility logic as delete button) */}
            {(() => {
              const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
              // If building has multiple tax regions, only show buttons when a specific taxRegion is selected
              // If building has only one tax region, show buttons (taxRegion may or may not be set)
              const shouldShowButtons = !hasMultipleTaxRegions || taxRegion;
              
              if (!shouldShowButtons) return null;
              
              // Check if building is private (single_double_family)
              const isPrivateBuilding = building?.single_double_family === 'כן' || building?.single_double_family === 'yes';
              
              // Check if tax region is "multi" (multiple tax regions - when taxRegion is not set or building has multiple)
              const isMultiTaxRegion = !taxRegion || (building?.tax_region && building.tax_region.includes(','));
              
              // Show transfer button only in business tabs (not in residence tabs)
              const shouldShowTransferButton = !isResidentTaxRegion;
              
              // Check if we have 2 or more selected assets for transfer areas button
              const canTransferAreas = selectedAssets.size >= 2 && shouldShowTransferButton;
              
              return (
                <>
                  {!isErrorFixingMode && shouldShowTransferButton && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenTransferAreas && selectedAssets.size >= 2) {
                          const selectedAssetIds = Array.from(selectedAssets);
                          onOpenTransferAreas(selectedAssetIds, buildingNumber, taxRegion);
                          // Clear selection after opening
                          setSelectedAssets(new Set());
                        }
                      }}
                      disabled={!canTransferAreas}
                      className="btn btn-action btn-secondary-ghost min-w-[90px]"
                      title={canTransferAreas ? `העברת שטחים (${selectedAssets.size} נכסים נבחרו)` : 'בחר לפחות 2 נכסים להעברת שטחים'}
                    >
                      <MoveLeft className="h-5 w-5" />
                      <span>העברת שטחים{selectedAssets.size > 0 ? ` (${selectedAssets.size})` : ''}</span>
                    </button>
                  )}
                  {!isReadOnly && (
                    <div className="flex flex-row gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={isSaving || loading || totalChanges === 0}
                        className="btn btn-action btn-primary"
                        title={totalChanges === 0 ? 'אין שינויים לשמירה' : undefined}
                      >
                        {isSaving || loading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Save className="h-5 w-5" />
                        )}
                        <span>{isSaving || loading ? 'שומר...' : 'שמור הכל'}{totalChanges > 0 ? ` (${totalChanges})` : ''}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAll}
                        disabled={loading || totalChanges === 0}
                        className="btn btn-action btn-cancel"
                      >
                        <X className="h-5 w-5" />
                        <span>ביטול</span>
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* Tab Navigation - hidden in error fixing mode */}
          {!isErrorFixingMode && building && (
              <div className="flex items-center gap-1 border-2 border-b-0 border-blue-400 bg-gradient-to-b from-gray-50 to-gray-100 rounded-t-xl shadow-sm mt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('assets')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                    activeTab === 'assets'
                      ? 'text-blue-700 bg-white border-b-2 border-blue-600 shadow-md -mb-0.5'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-white/50'
                  }`}
                >
                  <BuildingIcon className="h-4 w-4" />
                  נכסים
                </button>
                {/* Only show distribution and transfer history tabs for single tax region tabs (not multi-tax) */}
                {!isMultiTaxRegion && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('distribution-history')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                        activeTab === 'distribution-history'
                          ? 'text-teal-700 bg-white border-b-2 border-teal-600 shadow-md -mb-0.5'
                          : 'text-gray-600 hover:text-teal-600 hover:bg-white/50'
                      }`}
                    >
                      <History className="h-4 w-4" />
                      היסטוריית פיזור
                      {distributionHistoryCount > 0 && (
                        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                          {distributionHistoryCount}
                        </span>
                      )}
                    </button>
                    {!isResidentTaxRegion && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('transfer-history')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                          activeTab === 'transfer-history'
                            ? 'text-violet-700 bg-white border-b-2 border-violet-600 shadow-md -mb-0.5'
                            : 'text-gray-600 hover:text-violet-600 hover:bg-white/50'
                        }`}
                      >
                        <Share2 className="h-4 w-4" />
                        היסטוריית העברות
                        {transferHistoryCount > 0 && (
                          <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">
                            {transferHistoryCount}
                          </span>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
          )}
        </div>
        
        {/* Tab Content */}
        {activeTab === 'assets' && (
          <div className="bg-white rounded-b-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-blue-400 w-full">
            <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
              <AgGridReact
            ref={gridRef}
            rowData={sortedAssets}
            columnDefs={configuredColumnDefs}
            getRowStyle={getRowStyle}
            defaultColDef={{
              resizable: false, // Disabled - use field configurations instead
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              headerClass: 'ag-right-aligned-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
              cellStyle: { textAlign: 'right' },
              minWidth: 40
            }}
            gridOptions={{
              suppressColumnVirtualisation: false,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
              rowBuffer: 10,
              debounceVerticalScrollbar: false,
              suppressRowVirtualisation: false,
              suppressCellFocus: false,
              suppressScrollOnNewData: true,
              enableCellTextSelection: false,
              suppressAnimationFrame: false,
              singleClickEdit: false, // Require double-click to edit
            }}
            rowSelection={{
              mode: 'singleRow',
              enableClickSelection: true,
              checkboxes: false,
              hideDisabledCheckboxes: true
            }}
            domLayout="normal"
            getRowId={(params) => String(params.data.asset_id)}
            onCellValueChanged={onCellValueChanged}
            onCellEditingStopped={onCellEditingStopped}
            onCellEditingStarted={onCellEditingStarted}
            onGridReady={async (params) => {
              // Load saved column state first
              await gridPreferences.loadColumnState(params.api);
              // Ensure all columns are visible and grid calculates proper width
              params.api.refreshCells({ force: false });
              // Scroll to left on grid ready using AG Grid API
              setTimeout(() => {
                params.api.ensureColumnVisible('asset_id', 'start');
              }, 100);
            }}
            onFirstDataRendered={async (params) => {
              // Scroll to left after data render using AG Grid API
              setTimeout(() => {
                params.api.ensureColumnVisible('asset_id', 'start');
              }, 100);
            }}
            onColumnResized={(params) => {
              gridPreferences.handleColumnResized();
            }}
            onColumnMoved={(params) => {
              // Prevent actions column from being moved - force it back to pinned right
              try {
                const columnApi = (params as any).columnApi || params.api;
                if (columnApi && columnApi.getColumn) {
                  const actionsColumn = columnApi.getColumn('actions');
                  if (actionsColumn) {
                    const allColumns = columnApi.getAllColumns ? columnApi.getAllColumns() : [];
                    const actionsIndex = allColumns.findIndex((col: any) => col.getColId() === 'actions');
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
                }
              } catch (error) {
                console.warn('Error in onColumnMoved:', error);
              }
              // Save column state after move
              gridPreferences.handleColumnMoved();
            }}
            onSortChanged={() => {}}
            animateRows={false}
            enableRtl={true}
            suppressHorizontalScroll={false}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
          />
            </div>
          </div>
        )}
        
        {/* Distribution and Transfer History tabs - only show for single tax region tabs (not multi-tax) */}
        {!isMultiTaxRegion && (
          <>
            {activeTab === 'distribution-history' && (
              <div className="rounded-b-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border-2 border-blue-400 bg-white overflow-hidden" style={{ height: '60vh', width: '100%' }}>
                <DistributionHistoryModal
                  isOpen={true}
                  onClose={() => setActiveTab('assets')}
                  buildingNumber={buildingNumber}
                  isResident={isResidentTaxRegion}
                  inline={true}
                />
              </div>
            )}
            
            {activeTab === 'transfer-history' && !isResidentTaxRegion && (
              <div className="rounded-b-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border-2 border-blue-400 bg-white overflow-hidden" style={{ height: '60vh', width: '100%' }}>
                <TransferHistoryModal
                  isOpen={true}
                  onClose={() => setActiveTab('assets')}
                  buildingNumber={buildingNumber}
                  inline={true}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ValidationResultModal
        isOpen={showBatchValidationModal}
        onClose={() => setShowBatchValidationModal(false)}
        isLoading={batchValidationLoading}
        progress={batchValidationProgress}
        context="building"
        batchResults={batchValidationResults}
        batchTitle={`אימות נכסי מבנה ${buildingNumber}${taxRegion ? ` - ${getAreaDescriptionForTaxRegion(taxRegion)}` : ''}`}
        buildingNumber={buildingNumber}
        taxRegion={taxRegion}
        onSelectAsset={onSelectAsset}
        onExportInvalid={batchValidationResults && batchValidationResults.errors.some(e => e.errors.length > 0) ? handleExportInvalidAssetsToFile : undefined}
      />

      {/* Change Tax Region Modal */}
      <ChangeTaxRegionModal
        isOpen={changeTaxRegionModalOpen}
        onClose={() => {
          setChangeTaxRegionModalOpen(false);
          setSelectedAssets(new Set()); // Clear selection after closing
        }}
        selectedAssetIds={Array.from(selectedAssets)}
        buildingNumber={buildingNumber}
        onSelectAsset={onSelectAsset}
        onOpenAssetsTab={onOpenAssetsTab}
        availableTaxRegions={availableTaxRegions}
        assetTypes={assetTypes}
        onCloseTabAndOpenMultiTax={onCloseTabAndOpenMultiTax}
        onSuccess={() => {
          // Clear dirty bits for assets that were successfully saved via tax region change
          // Capture the selected asset IDs that were passed to the modal to avoid stale closures
          const savedAssetIds = Array.from(selectedAssets);
          
          if (process.env.NODE_ENV === 'development') {
          }
          
          setDirtyAssets(prev => {
            const next = new Map(prev);
            for (const assetId of savedAssetIds) {
              next.delete(String(assetId));
            }
            if (process.env.NODE_ENV === 'development') {
            }
            return next;
          });
          
          // Also clear validation errors for these assets
          setValidationErrors(prev => {
            const next = new Map(prev);
            for (const assetId of savedAssetIds) {
              next.delete(String(assetId));
            }
            return next;
          });
          
          // Clear selection first before fetchData to avoid issues
          setSelectedAssets(new Set());
          
          // Refresh assets after successful change
          // This will filter assets by current tab's taxRegion, so assets with new tax_region won't appear
          // but their dirty bits are already cleared above
          // Skip building fetch since we already have the building data
          fetchData(false, true);
        }}
      />

      {/* Distribution Result Modal */}
      {distributionModalOpen && distributionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setDistributionModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">תוצאות פיזור שטח משותף</h3>
              <button
                onClick={() => setDistributionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-700 text-lg text-center">{distributionResult}</p>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => setDistributionModalOpen(false)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-semibold"
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* File Viewer Modal */}
      {selectedDrawingUrl && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            fileViewerClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => {
            setFileViewerClosing(true);
            setTimeout(() => {
              setSelectedDrawingUrl(null);
              setSelectedFileName(null);
              setFileViewerClosing(false);
            }, 300);
          }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 ${
              fileViewerClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-slate-800">{t('structureDrawing') || 'שרטוט מבנה'}</h3>
              <button
                onClick={() => {
                  setFileViewerClosing(true);
                  setTimeout(() => {
                    setSelectedDrawingUrl(null);
                    setSelectedFileName(null);
                    setFileViewerClosing(false);
                  }, 300);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
              >
                <X className="h-4 w-4" />
                <span>{t('closeViewer') || 'סגור'}</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FileViewer
                fileUrl={selectedDrawingUrl}
                fileName={selectedFileName || `structure-drawing-${buildingNumber}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Asset Files Modal */}
      {assetFilesModalOpen && selectedAssetIdForFiles && (
        <AssetFilesModal
          key={assetFilesModalKey}
          isOpen={assetFilesModalOpen}
          onClose={() => {
            setAssetFilesModalOpen(false);
            setSelectedAssetIdForFiles(null);
          }}
          assetId={selectedAssetIdForFiles}
          isUploading={uploadingAssetId === selectedAssetIdForFiles}
          onFilesDeleted={(assetId, hasFiles) => {
            if (hasFiles) {
              setAssetsWithFiles(prev => new Set(prev).add(assetId));
            } else {
              setAssetsWithFiles(prev => {
                const next = new Set(prev);
                next.delete(assetId);
                return next;
              });
            }
          }}
        />
      )}

      {/* Asset Statistics Modal */}
      <AssetStatisticsModal
        isOpen={showAssetStatisticsModal}
        onClose={() => setShowAssetStatisticsModal(false)}
        assets={assets}
        assetTypes={assetTypes}
        buildingNumber={buildingNumber}
      />

    </>
  );
}

export const AssetsList = forwardRef<AssetsListRef, AssetsListProps>(AssetsListInner);

AssetsList.displayName = 'AssetsList';
