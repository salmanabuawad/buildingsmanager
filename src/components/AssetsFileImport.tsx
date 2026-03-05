import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, CheckCircle, Loader2, X, Save, CheckCircle2, Trash2, RotateCcw, MessageSquare } from 'lucide-react';
import { api, Asset, AssetType, Building, AddressList } from '../lib/api';
import { buildingsUpdateTotalArea } from '../lib/restClient';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { useValidationRules } from '../contexts/ValidationContext';
import { buildingValidators } from '../lib/validation';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import * as XLSX from 'xlsx';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { useFieldConfig } from '../lib/useFieldConfig';
import { exportToExcel } from '../lib/excelExport';

interface ImportAssetRow {
  id: string;
  building_number: number | null;
  payer_id: string;
  asset_id: string;
  measurement_date: string;
  main_asset_type: string;
  asset_size: number;
  asset_total_area?: number;  // total area (main + shared) from file; used as y for overload split when present
  tax_region?: number;
  sub_asset_type_1: string;
  sub_asset_size_1: number;
  sub_asset_type_2: string;
  sub_asset_size_2: number;
  sub_asset_type_3: string;
  sub_asset_size_3: number;
  sub_asset_type_4: string;
  sub_asset_size_4: number;
  sub_asset_type_5: string;
  sub_asset_size_5: number;
  sub_asset_type_6: string;
  sub_asset_size_6: number;
  penthouse?: string;
  apartment_number?: string;
  apartment_floor?: string;
  storage_number?: string;
  storage_floor?: string;
  discount_type?: string;
  discount_date_from?: string;
  discount_date_to?: string;
  comment?: string;
  shared_parking_area?: number;
  number_of_parking_units?: number;
  _validationErrors?: string[];
  _isDirty?: boolean;
}

interface AssetsFileImportProps {
  mode?: 'regular' | 'skeleton';
}

export function AssetsFileImport({ mode = 'regular' }: AssetsFileImportProps) {
  const { t } = useTranslation();
  const { validationRules, loading: validationContextLoading, refreshRules } = useValidationRules();
  const gridRef = useRef<AgGridReact>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importedAssets, setImportedAssets] = useState<ImportAssetRow[]>([]);
  const [originalImportedAssets, setOriginalImportedAssets] = useState<ImportAssetRow[]>([]); // Store original state for rollback
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);

  // Display helper: show rows with errors first (stable ordering)
  const displayedImportedAssets = useMemo(() => {
    return importedAssets
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const aHasError = !!(a.row._validationErrors && a.row._validationErrors.length > 0);
        const bHasError = !!(b.row._validationErrors && b.row._validationErrors.length > 0);
        if (aHasError !== bHasError) return aHasError ? -1 : 1;
        return a.idx - b.idx;
      })
      .map(x => x.row);
  }, [importedAssets]);

  // Helper function to check if an asset type is non_accountable_for_total_area
  const isAssetTypeNotAccountable = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name
    const assetType = assetTypes.find(at => at.name === assetTypeName);
    return assetType?.non_accountable_for_total_area === true;
  }, [assetTypes]);

  // Helper function to check if an asset row is not_accountable
  const isAssetRowNotAccountable = useCallback((row: ImportAssetRow): boolean => {
    if (!row || !row.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountable(row.main_asset_type);
  }, [isAssetTypeNotAccountable]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, all fields are readonly (main_asset_type is readonly in all tabs except TransferAreas)
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const row = params.data as ImportAssetRow;
    
    // For non-accountable assets, all fields are readonly (including main_asset_type)
    if (isAssetRowNotAccountable(row)) {
      return false;
    }
    
    return true; // All fields are editable by default in import
  }, [isAssetRowNotAccountable]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResults, setValidationResults] = useState<BatchValidationResults | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [saveResult, setSaveResult] = useState<{ successful: number; failed: number; errors: string[] } | null>(null);
  const [showMeasurementDateModal, setShowMeasurementDateModal] = useState(false);
  const [measurementDateModalClosing, setMeasurementDateModalClosing] = useState(false);
  const [measurementDate, setMeasurementDate] = useState('');
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; message: string; title?: string }>({ isOpen: false, message: '' });
  const [pendingSaveAsNew, setPendingSaveAsNew] = useState(false);
  const [validationCompleted, setValidationCompleted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [importFromAutomation, setImportFromAutomation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skeletonFileInputRef = useRef<HTMLInputElement>(null);
  const [showBuildingCreateModal, setShowBuildingCreateModal] = useState(false);
  const [pendingBuildingNumber, setPendingBuildingNumber] = useState<number | null>(null);
  const [buildingCreateData, setBuildingCreateData] = useState<Partial<Building>>({});
  const [isCreatingBuilding, setIsCreatingBuilding] = useState(false);
  const [showColumnMappingModal, setShowColumnMappingModal] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({});
  const [pendingFileLines, setPendingFileLines] = useState<string[][]>([]);
  const pendingImportCallback = useRef<(() => void) | null>(null);
  const [addressList, setAddressList] = useState<AddressList[]>([]);
  const [addressSearchValue, setAddressSearchValue] = useState('');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressDropdownRef = useRef<HTMLDivElement>(null);
  const [buildingValidationErrors, setBuildingValidationErrors] = useState<Record<string, string>>({});

  // Load asset types and buildings on mount, and ensure validation context data is loaded
  useEffect(() => {
    const loadData = async () => {
      try {
        // Wait for validation context to finish loading if it's still loading
        if (validationContextLoading) {
          // Wait a bit and check again, or refresh
          await new Promise(resolve => setTimeout(resolve, 100));
          if (validationContextLoading) {
            await refreshRules();
          }
        }
        
        const [types, bldgs, allAssets, addresses] = await Promise.all([
          api.assetTypes.getAll(),
          api.buildings.getAll(),
          api.assets.getAll(), // Load all assets for uniqueness validation
          api.addressList.getAll().catch(() => []) // Load address list for dropdown
        ]);
        setAssetTypes(types);
        setBuildings(bldgs);
        setAddressList(addresses || []);
        
        // Ensure buildings and assets are in memory for validation
        const { setValidationData, setAllAssets } = await import('../lib/validation');
        setValidationData({ buildings: bldgs, assetTypes: types, assets: allAssets });
        setAllAssets(allAssets);
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };
    loadData();
  }, [validationContextLoading, refreshRules]);

  async function parseExcelFile(file: File): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
          
          const result = jsonData.map(row => 
            row.map(cell => String(cell || '').trim())
          );
          
          resolve(result);
        } catch (error) {
          reject(new Error('שגיאה בקריאת קובץ Excel: ' + (error instanceof Error ? error.message : 'Unknown error')));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('שגיאה בקריאת הקובץ'));
      };
      
      reader.readAsBinaryString(file);
    });
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear all previous import data to start fresh
    setIsParsing(true);
    setImportedAssets([]);
    setOriginalImportedAssets([]); // Clear original state as well
    setSaveResult(null);
    setValidationResults(null);
    setValidationProgress(null);
    setValidationCompleted(false);
    setShowValidationModal(false);
    setIsValidating(false);
    setIsSaving(false);
    setShowMeasurementDateModal(false);
    setMeasurementDate('');
    setPendingSaveAsNew(false);
    
    // Clear file input to allow re-uploading the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const lines = await parseExcelFile(file);

      if (lines.length === 0) {
        throw new Error('קובץ File ריק');
      }

      // Process headers
      const originalHeaders = lines[0].map(h => (h || '').trim());
      
      // Create header mapping - map header index to field name
      const headerMap: Record<string, number> = {};
      
      // Define exact header names from template - must match exactly (case-insensitive, trimmed)
      const exactHeaders: Record<string, string> = {
        'building_number': 'מזהה מבנה',
        'payer_id': 'מזהה משלם',
        'asset_id': 'מזהה נכס',
        'measurement_date': 'תאריך מדידה',
        'main_asset_type': 'סוג נכס ראשי',
        'asset_size': 'גודל נכס ראשי',
        'asset_total_area': 'סה"כ שטח נכס',
        'tax_region': 'אזור מס',
        'sub_asset_type_1': 'סוג נכס משנה 1',
        'sub_asset_size_1': 'גודל נכס משנה 1',
        'sub_asset_type_2': 'סוג נכס משנה 2',
        'sub_asset_size_2': 'גודל נכס משנה 2',
        'sub_asset_type_3': 'סוג נכס משנה 3',
        'sub_asset_size_3': 'גודל נכס משנה 3',
        'sub_asset_type_4': 'סוג נכס משנה 4',
        'sub_asset_size_4': 'גודל נכס משנה 4',
        'sub_asset_type_5': 'סוג נכס משנה 5',
        'sub_asset_size_5': 'גודל נכס משנה 5',
        'sub_asset_type_6': 'סוג נכס משנה 6',
        'sub_asset_size_6': 'גודל נכס משנה 6',
        'penthouse': 'דירת גג',
        'apartment_number': 'מספר דירה',
        'apartment_floor': 'קומת דירה',
        'storage_number': 'מספר מחסן',
        'storage_floor': 'קומת מחסן',
        'discount_type': 'סוג הנחה',
        'discount_date_from': 'תאריך הנחה מ',
        'discount_date_to': 'תאריך הנחה עד',
        'comment': 'הערה',
        'shared_parking_area': 'שטח חניה משותף',
        'number_of_parking_units': 'מספר יחידות חניה'
      };

      // Match headers by exact name only (case-insensitive, trimmed)
      originalHeaders.forEach((header, index) => {
        if (!header) return;
        const headerTrimmed = header.trim();
        
        // Check for exact match against known headers
        for (const [fieldName, exactHeaderName] of Object.entries(exactHeaders)) {
          if (headerTrimmed.toLowerCase() === exactHeaderName.toLowerCase()) {
            headerMap[fieldName] = index;
            break;
          }
        }
      });

      // Check if we have valid headers (at least some key headers found)
      const hasRequiredHeaders = headerMap['building_number'] !== undefined && 
                                 headerMap['asset_id'] !== undefined;
      
      // If automatic mapping found required headers, use it; otherwise show mapping modal
      if (hasRequiredHeaders && Object.keys(headerMap).length > 0) {
        // Continue with automatic mapping
        await parseFileWithMapping(lines, headerMap);
      } else {
        // Show mapping modal - store headers and lines for mapping
        setFileHeaders(originalHeaders);
        setPendingFileLines(lines);
        // Pre-populate with any automatic matches found
        const initialMapping: Record<number, string> = {};
        Object.entries(headerMap).forEach(([fieldName, columnIndex]) => {
          initialMapping[columnIndex] = fieldName;
        });
        setColumnMapping(initialMapping);
        setIsParsing(false);
        setShowColumnMappingModal(true);
        return;
      }
    } catch (error) {
      setErrorModal({ 
        isOpen: true, 
        message: error instanceof Error ? error.message : 'שגיאה בקריאת קובץ File',
        title: 'שגיאה בקריאת קובץ'
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function parseFileWithMapping(lines: string[][], headerMap: Record<string, number>) {
    try {
      const assets: ImportAssetRow[] = [];

      // Get current date for default measurement_date
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const defaultMeasurementDate = `${day}/${month}/${year}`;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i];
        if (values.length === 0 || values.every(v => !v)) continue;

        const asset: ImportAssetRow = {
          id: `import_${i}_${Date.now()}`,
          building_number: null,
          payer_id: '',
          asset_id: '',
          measurement_date: defaultMeasurementDate,
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
          tax_region: undefined,
          apartment_number: undefined,
          apartment_floor: undefined,
          storage_number: undefined,
          storage_floor: undefined,
          discount_type: undefined,
          discount_date_from: undefined,
          discount_date_to: undefined,
          comment: undefined,
          shared_parking_area: undefined,
          number_of_parking_units: undefined,
        };

        // Use header-based mapping only (no fallback to fixed position)
        if (headerMap['building_number'] !== undefined) {
          const value = values[headerMap['building_number']] || '';
          asset.building_number = value ? parseInt(value) : null;
        }
        if (headerMap['payer_id'] !== undefined) {
          asset.payer_id = values[headerMap['payer_id']] || '';
        }
        if (headerMap['asset_id'] !== undefined) {
          asset.asset_id = values[headerMap['asset_id']] || '';
        }
        if (headerMap['measurement_date'] !== undefined) {
          asset.measurement_date = values[headerMap['measurement_date']] || defaultMeasurementDate;
        }
        if (headerMap['main_asset_type'] !== undefined) {
          asset.main_asset_type = values[headerMap['main_asset_type']] || '';
        }
        if (headerMap['asset_size'] !== undefined) {
          const value = values[headerMap['asset_size']] || '';
          asset.asset_size = value ? parseFloat(value) : 0;
        }
        if (headerMap['asset_total_area'] !== undefined) {
          const value = values[headerMap['asset_total_area']] || '';
          asset.asset_total_area = value ? parseFloat(value) : undefined;
        }
        if (headerMap['tax_region'] !== undefined) {
          const value = values[headerMap['tax_region']] || '';
          asset.tax_region = value ? (isNaN(parseInt(value)) ? undefined : parseInt(value)) : undefined;
        }
        if (headerMap['sub_asset_type_1'] !== undefined) {
          asset.sub_asset_type_1 = values[headerMap['sub_asset_type_1']] || '';
        }
        if (headerMap['sub_asset_size_1'] !== undefined) {
          const value = values[headerMap['sub_asset_size_1']] || '';
          asset.sub_asset_size_1 = value ? parseFloat(value) : 0;
        }
        if (headerMap['sub_asset_type_2'] !== undefined) {
          asset.sub_asset_type_2 = values[headerMap['sub_asset_type_2']] || '';
        }
        if (headerMap['sub_asset_size_2'] !== undefined) {
          const value = values[headerMap['sub_asset_size_2']] || '';
          asset.sub_asset_size_2 = value ? parseFloat(value) : 0;
        }
        if (headerMap['sub_asset_type_3'] !== undefined) {
          asset.sub_asset_type_3 = values[headerMap['sub_asset_type_3']] || '';
        }
        if (headerMap['sub_asset_size_3'] !== undefined) {
          const value = values[headerMap['sub_asset_size_3']] || '';
          asset.sub_asset_size_3 = value ? parseFloat(value) : 0;
        }
        if (headerMap['sub_asset_type_4'] !== undefined) {
          asset.sub_asset_type_4 = values[headerMap['sub_asset_type_4']] || '';
        }
        if (headerMap['sub_asset_size_4'] !== undefined) {
          const value = values[headerMap['sub_asset_size_4']] || '';
          asset.sub_asset_size_4 = value ? parseFloat(value) : 0;
        }
        if (headerMap['sub_asset_type_5'] !== undefined) {
          asset.sub_asset_type_5 = values[headerMap['sub_asset_type_5']] || '';
        }
        if (headerMap['sub_asset_size_5'] !== undefined) {
          const value = values[headerMap['sub_asset_size_5']] || '';
          asset.sub_asset_size_5 = value ? parseFloat(value) : 0;
        }
        if (headerMap['sub_asset_type_6'] !== undefined) {
          asset.sub_asset_type_6 = values[headerMap['sub_asset_type_6']] || '';
        }
        if (headerMap['sub_asset_size_6'] !== undefined) {
          const value = values[headerMap['sub_asset_size_6']] || '';
          asset.sub_asset_size_6 = value ? parseFloat(value) : 0;
        }
        if (headerMap['penthouse'] !== undefined) {
          const penthouseValue = (values[headerMap['penthouse']] || '').trim();
          asset.penthouse = (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes' || penthouseValue === '1' || penthouseValue.toLowerCase() === 'true');
        }
        if (headerMap['apartment_number'] !== undefined) {
          asset.apartment_number = values[headerMap['apartment_number']] || undefined;
        }
        if (headerMap['apartment_floor'] !== undefined) {
          asset.apartment_floor = values[headerMap['apartment_floor']] || undefined;
        }
        if (headerMap['storage_number'] !== undefined) {
          asset.storage_number = values[headerMap['storage_number']] || undefined;
        }
        if (headerMap['storage_floor'] !== undefined) {
          asset.storage_floor = values[headerMap['storage_floor']] || undefined;
        }
        if (headerMap['discount_type'] !== undefined) {
          asset.discount_type = values[headerMap['discount_type']] || undefined;
        }
        if (headerMap['discount_date_from'] !== undefined) {
          asset.discount_date_from = values[headerMap['discount_date_from']] || undefined;
        }
        if (headerMap['discount_date_to'] !== undefined) {
          asset.discount_date_to = values[headerMap['discount_date_to']] || undefined;
        }
        if (headerMap['comment'] !== undefined) {
          asset.comment = values[headerMap['comment']] || undefined;
        }
        if (headerMap['shared_parking_area'] !== undefined) {
          const value = values[headerMap['shared_parking_area']] || '';
          asset.shared_parking_area = value ? (parseFloat(value) || undefined) : undefined;
        }
        if (headerMap['number_of_parking_units'] !== undefined) {
          const value = values[headerMap['number_of_parking_units']] || '';
          asset.number_of_parking_units = value ? (parseInt(value, 10) || undefined) : undefined;
        }

        assets.push(asset);
      }

      // Create deep copy for original state
      const assetsCopy = JSON.parse(JSON.stringify(assets));
      setImportedAssets(assets);
      setOriginalImportedAssets(assetsCopy); // Save original state for rollback
      setValidationCompleted(false); // Reset validation status when new file is loaded
    } catch (error) {
      setErrorModal({ 
        isOpen: true, 
        message: error instanceof Error ? error.message : 'שגיאה בקריאת קובץ File',
        title: 'שגיאה בקריאת קובץ'
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  const handleConfirmMapping = async () => {
    // Validate that required fields are mapped
    const requiredFields = ['building_number', 'asset_id'];
    const mappedFields = Object.values(columnMapping);
    const hasRequiredFields = requiredFields.every(field => mappedFields.includes(field));
    
    if (!hasRequiredFields) {
      setErrorModal({ 
        isOpen: true, 
        message: 'חובה למפות את השדות: מזהה מבנה ומזהה נכס',
        title: 'מיפוי לא שלם'
      });
      return;
    }

    // Convert columnMapping (columnIndex -> fieldName) to headerMap (fieldName -> columnIndex)
    const headerMap: Record<string, number> = {};
    Object.entries(columnMapping).forEach(([columnIndexStr, fieldName]) => {
      const columnIndex = parseInt(columnIndexStr, 10);
      if (!isNaN(columnIndex) && fieldName) {
        headerMap[fieldName] = columnIndex;
      }
    });

    setShowColumnMappingModal(false);
    setIsParsing(true);
    try {
      await parseFileWithMapping(pendingFileLines, headerMap);
    } finally {
      setIsParsing(false);
    }
  }

  const handleCreateBuildingAndContinue = async (buildingNumber: number) => {
    try {
      setIsCreatingBuilding(true);
      
      // Create building with minimal data - only building_number is required
      const buildingData: Partial<Building> = {
        building_number: buildingNumber,
        ...buildingCreateData
      };
      
      // Validate before creating
      const isValid = await validateBuildingData(buildingData);
      if (!isValid) {
        setIsCreatingBuilding(false);
        return; // Don't create if validation fails
      }
      
      const createdBuilding = await api.buildings.create(buildingData);
      
      // Reload buildings list
      const [bldgs, allAssets] = await Promise.all([
        api.buildings.getAll(),
        api.assets.getAll()
      ]);
      setBuildings(bldgs);
      
      // Update in-memory stores for validation
      const { setValidationData, setAllAssets } = await import('../lib/validation');
      setValidationData({ buildings: bldgs, assetTypes: assetTypes || [], assets: allAssets });
      setAllAssets(allAssets);
      
      // Close modal
      setShowBuildingCreateModal(false);
      setPendingBuildingNumber(null);
      setBuildingCreateData({});
      setAddressSearchValue('');
      
      // Continue with the pending import
      if (pendingImportCallback.current) {
        pendingImportCallback.current();
        pendingImportCallback.current = null;
      }
    } catch (error) {
      console.error('Error creating building:', error);
      setErrorModal({ 
        isOpen: true, 
        message: error instanceof Error ? error.message : 'שגיאה לא ידועה',
        title: 'שגיאה ביצירת מבנה'
      });
    } finally {
      setIsCreatingBuilding(false);
    }
  };

  const checkBuildingExists = async (buildingNumber: number): Promise<boolean> => {
    try {
      const building = await api.buildings.getOne(buildingNumber);
      return !!building;
    } catch (error) {
      // If building doesn't exist, getOne will throw an error
      return false;
    }
  };

  const validateBuildingData = async (buildingData: Partial<Building>) => {
    const buildingToValidate = {
      building_number: pendingBuildingNumber || buildingData.building_number,
      ...buildingData
    };
    
    const validation = await buildingValidators.validateAllFields(buildingToValidate);
    setBuildingValidationErrors(validation.errors || {});
    return validation.valid;
  };

  const promptCreateBuilding = async (buildingNumber: number, continueCallback: () => void): Promise<boolean> => {
    // Check if building exists
    const exists = await checkBuildingExists(buildingNumber);
    if (exists) {
      return true; // Building exists, continue
    }
    
    // Building doesn't exist - show modal
    // Collect unique tax_region values from assets that belong to this building
    const taxRegionsForBuilding = new Set<string>();
    importedAssets.forEach(asset => {
      const assetBuildingNum = typeof asset.building_number === 'string' 
        ? parseInt(String(asset.building_number), 10) 
        : asset.building_number;
      if (assetBuildingNum === buildingNumber && asset.tax_region !== undefined && asset.tax_region != null) {
        const taxRegionStr = typeof asset.tax_region === 'string' 
          ? asset.tax_region.trim()
          : String(asset.tax_region);
        if (taxRegionStr && !isNaN(parseInt(taxRegionStr))) {
          taxRegionsForBuilding.add(taxRegionStr);
        }
      }
    });
    
    // Convert to comma-separated string (sorted)
    const taxRegionString = taxRegionsForBuilding.size > 0 
      ? Array.from(taxRegionsForBuilding).sort().join(',')
      : undefined;
    
    setPendingBuildingNumber(buildingNumber);
    setBuildingCreateData({ 
      building_number: buildingNumber,
      tax_region: taxRegionString
    });
    setAddressSearchValue(''); // Reset address search
    pendingImportCallback.current = continueCallback;
    setShowBuildingCreateModal(true);
    return false; // Building creation needed
  };

  const handleValidate = async () => {
    if (importedAssets.length === 0) return;

    setIsValidating(true);
    setValidationProgress({ current: 0, total: importedAssets.length });
    setValidationResults(null);

    try {
      // Ensure buildings and assets are loaded into memory before validation
      if (buildings.length === 0 || validationContextLoading) {
        setValidationProgress({ current: 0, total: importedAssets.length, currentAssetId: 'טוען נתונים...' });
        const [types, bldgs, allAssets] = await Promise.all([
          api.assetTypes.getAll(),
          api.buildings.getAll(),
          api.assets.getAll() // Load all assets for uniqueness validation
        ]);
        setAssetTypes(types);
        setBuildings(bldgs);
        
        // Update in-memory stores for validation
        const { setValidationData, setAllAssets } = await import('../lib/validation');
        setValidationData({ buildings: bldgs, assetTypes: types, assets: allAssets });
        setAllAssets(allAssets);
      }

      // Prepare cached data
      const cachedDataBase = {
        assetTypes: assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll()
      };

      // Pre-fetch all unique buildings for validation
      const buildingNumbers = new Set<number>();
      importedAssets.forEach(asset => {
        if (asset.building_number) {
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          if (!isNaN(buildingNum)) {
            buildingNumbers.add(buildingNum);
          }
        }
      });

      // Check for missing buildings and prompt for creation
      const missingBuildings: number[] = [];
      for (const buildingNum of buildingNumbers) {
        const exists = await checkBuildingExists(buildingNum);
        if (!exists) {
          missingBuildings.push(buildingNum);
        }
      }

      // If there are missing buildings, show modal for the first one
      if (missingBuildings.length > 0) {
        const firstMissingBuilding = missingBuildings[0];
        
        // Collect unique tax_region values from assets that belong to this building
        const taxRegionsForBuilding = new Set<string>();
        importedAssets.forEach(asset => {
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          if (buildingNum === firstMissingBuilding && asset.tax_region !== undefined && asset.tax_region != null) {
            const taxRegionStr = typeof asset.tax_region === 'string' 
              ? asset.tax_region.trim()
              : String(asset.tax_region);
            if (taxRegionStr && !isNaN(parseInt(taxRegionStr))) {
              taxRegionsForBuilding.add(taxRegionStr);
            }
          }
        });
        
        // Convert to comma-separated string (sorted)
        const taxRegionString = taxRegionsForBuilding.size > 0 
          ? Array.from(taxRegionsForBuilding).sort().join(',')
          : undefined;
        
        setPendingBuildingNumber(firstMissingBuilding);
        setBuildingCreateData({ 
          building_number: firstMissingBuilding,
          tax_region: taxRegionString
        });
        
        // Store the continuation function - re-run validation after building is created
        pendingImportCallback.current = () => {
          handleValidate();
        };
        
        setShowBuildingCreateModal(true);
        setIsValidating(false);
        setValidationProgress(null);
        return;
      }

      // Fetch all buildings in parallel (they all exist now)
      const buildingsMap = new Map<number, any>();
      await Promise.all(
        Array.from(buildingNumbers).map(async (buildingNum) => {
          try {
            const building = await api.buildings.getOne(buildingNum);
            buildingsMap.set(buildingNum, building);
          } catch (error) {
            console.warn(`Failed to fetch building ${buildingNum}:`, error);
          }
        })
      );

      // For skeleton mode: Pre-load all assets once before validation loop
      // This prevents multiple API calls inside the loop
      let allAssetsForValidation: any[] = [];
      if (mode === 'skeleton') {
        const { getAllAssets, setAllAssets } = await import('../lib/validation');
        allAssetsForValidation = getAllAssets();
        if (allAssetsForValidation.length === 0) {
          // If assets not loaded, load them now (once, before the loop)
          allAssetsForValidation = await api.assets.getAll();
          setAllAssets(allAssetsForValidation);
        }
      }

      // For skeleton mode, check for duplicates within the batch first
      if (mode === 'skeleton') {
        const assetIdToRows = new Map<string | number, number[]>();
        importedAssets.forEach((asset, index) => {
          if (asset.asset_id) {
            const assetIdKey = typeof asset.asset_id === 'string' ? asset.asset_id : String(asset.asset_id);
            if (!assetIdToRows.has(assetIdKey)) {
              assetIdToRows.set(assetIdKey, []);
            }
            assetIdToRows.get(assetIdKey)!.push(index);
          }
        });

        // Find duplicates within batch and mark them with errors
        assetIdToRows.forEach((rows, assetId) => {
          if (rows.length > 1) {
            const rowNumbers = rows.map(r => r + 1).join(', ');
            const duplicateError = `מזהה נכס ${assetId} מופיע מספר פעמים בקובץ הייבוא (שורות: ${rowNumbers})`;
            rows.forEach(rowIndex => {
              const asset = importedAssets[rowIndex];
              setImportedAssets(prev => prev.map((a, idx) => 
                idx === rowIndex 
                  ? { ...a, _validationErrors: [duplicateError] }
                  : a
              ));
            });
          }
        });
      }

      const results: Array<{ assetId: string; buildingNumber: number; errors: string[]; matchedAssetTypeRecord?: string }> = [];

      for (let i = 0; i < importedAssets.length; i++) {
        const asset = importedAssets[i];
        setValidationProgress({ 
          current: i, 
          total: importedAssets.length,
          currentAssetId: asset.asset_id
        });

        try {
          // Get building for this asset
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          const building = buildingNum && !isNaN(buildingNum) 
            ? buildingsMap.get(buildingNum) 
            : null;

          let allErrors: string[] = [];

          // Check if asset already has duplicate error from batch check
          const existingDuplicateError = asset._validationErrors?.find(err => err.includes('מופיע מספר פעמים בקובץ הייבוא'));

          // For skeleton mode, only validate the 4 required fields: building_number, asset_id, tax_region, payer_id
          if (mode === 'skeleton') {
            const assetErrors: string[] = [];

            // If already has duplicate error, skip other validations
            if (existingDuplicateError) {
              allErrors = [existingDuplicateError];
            } else {
              // Validate building_number
              if (!buildingNum || isNaN(buildingNum)) {
                assetErrors.push('מזהה מבנה חייב להיות מספר תקין');
              }

              // Validate asset_id
              if (!asset.asset_id || asset.asset_id.trim() === '') {
                assetErrors.push('מזהה נכס חובה');
              }

              // Validate tax_region
              const taxRegionNum = typeof asset.tax_region === 'string' 
                ? parseInt(String(asset.tax_region), 10) 
                : asset.tax_region;
              if (!taxRegionNum || isNaN(taxRegionNum)) {
                assetErrors.push('אזור מס חייב להיות מספר תקין');
              }

              // Validate payer_id
              if (!asset.payer_id || asset.payer_id.trim() === '') {
                assetErrors.push('מזהה משלם חובה');
              }

              // Check asset ID uniqueness against database
              // For skeleton mode: check if asset_id exists in database at all (treating as new assets)
              // This check should always run if asset_id is present, regardless of other errors
              // Use pre-loaded allAssetsForValidation to avoid multiple API calls
              if (asset.asset_id && asset.asset_id.trim() !== '') {
                try {
                  // Check if asset_id already exists in database (any building)
                  // Use the pre-loaded allAssetsForValidation array (loaded once before the loop)
                  const assetIdNum = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : asset.asset_id;
                  if (!isNaN(assetIdNum)) {
                    const existingAsset = allAssetsForValidation.find((a: any) => {
                      const aId = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : a.asset_id;
                      return aId === assetIdNum;
                    });
                    if (existingAsset) {
                      const existingBuilding = existingAsset.building_number;
                      assetErrors.push(`מזהה נכס ${asset.asset_id} כבר קיים במערכת במבנה ${existingBuilding}. נכסים בייבוא שלד חייבים להיות חדשים.`);
                    }
                  }
                } catch (error) {
                  // If check fails, log but don't block validation
                  console.error('Error checking asset_id uniqueness:', error);
                }
              }

              allErrors = assetErrors;
            }
          } else {
            // Regular mode - use full validation
            // Include asset and building in cachedData for validation
            const cachedData = {
              ...cachedDataBase,
              asset: asset,
              building: building
            };

            // Use full validation with AssetValidationHandler.validateSingleAsset
            const result = await AssetValidationHandler.validateSingleAsset(asset, {
              cachedData
            });
            
            // Add discount validation errors
            const discountErrors = validateDiscountDates(asset);
            allErrors = [...result.errors, ...discountErrors];
          }
          
          results.push({
            assetId: asset.asset_id || `שורה ${i + 1}`,
            buildingNumber: asset.building_number || 0,
            errors: allErrors,
            matchedAssetTypeRecord: undefined
          });

          // Update validation errors in asset row (use id as row identifier, asset_id for asset identification)
          setImportedAssets(prev => prev.map(a => 
            a.id === asset.id 
              ? { ...a, _validationErrors: allErrors.length > 0 ? allErrors : undefined }
              : a
          ));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
          results.push({
            assetId: asset.asset_id || `שורה ${i + 1}`,
            buildingNumber: asset.building_number || 0,
            errors: [errorMsg]
          });
          // Update validation errors in asset row (use id as row identifier)
          setImportedAssets(prev => prev.map(a => 
            a.id === asset.id 
              ? { ...a, _validationErrors: [errorMsg] }
              : a
          ));
        }
      }

      const validCount = results.filter(e => e.errors.length === 0).length;
      const invalidCount = results.filter(e => e.errors.length > 0).length;
      setValidationResults({
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        errors: results
      });
      setValidationCompleted(true); // Mark validation as completed
      setShowValidationModal(true);
    } catch (error) {
      setErrorModal({ 
        isOpen: true, 
        message: error instanceof Error ? error.message : 'שגיאה באימות',
        title: 'שגיאה באימות'
      });
      setValidationCompleted(false); // Mark validation as not completed on error
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  const handleSkeletonFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear all previous import data to start fresh
    setIsParsing(true);
    setImportedAssets([]);
    setOriginalImportedAssets([]); // Clear original state as well
    setSaveResult(null);
    setValidationResults(null);
    setValidationProgress(null);
    setValidationCompleted(false);
    setShowValidationModal(false);
    setIsValidating(false);
    setIsSaving(false);
    setShowMeasurementDateModal(false);
    setMeasurementDate('');
    setPendingSaveAsNew(false);
    
    // Clear file input to allow re-uploading the same file
    if (skeletonFileInputRef.current) {
      skeletonFileInputRef.current.value = '';
    }

    const errors: string[] = [];
    let skeletonAssets: Array<{ building_number: number | null; asset_id: string; tax_region?: number; payer_id?: string }> = [];

    try {
      const lines = await parseExcelFile(file);

      if (lines.length === 0) {
        setErrorModal({ 
          isOpen: true, 
          message: 'קובץ ריק',
          title: 'שגיאה בפרסור קובץ שלד'
        });
        setIsParsing(false);
        return;
      }

      // Process headers - exact name matching only for skeleton import
      const originalHeaders = lines[0].map(h => (h || '').trim());
      
      // Find building_number and asset_id columns by exact name match
      let buildingNumberIndex = -1;
      let assetIdIndex = -1;
      let taxRegionIndex = -1;
      let payerIdIndex = -1;

      const exactBuildingNumberHeader = 'מזהה מבנה';
      const exactAssetIdHeader = 'מזהה נכס';
      const exactTaxRegionHeader = 'אזור מס';
      const exactPayerIdHeader = 'מזהה משלם';

      originalHeaders.forEach((header, index) => {
        const headerTrimmed = header.trim();
        if (headerTrimmed.toLowerCase() === exactBuildingNumberHeader.toLowerCase()) {
          buildingNumberIndex = index;
        }
        if (headerTrimmed.toLowerCase() === exactAssetIdHeader.toLowerCase()) {
          assetIdIndex = index;
        }
        if (headerTrimmed.toLowerCase() === exactTaxRegionHeader.toLowerCase()) {
          taxRegionIndex = index;
        }
        if (headerTrimmed.toLowerCase() === exactPayerIdHeader.toLowerCase()) {
          payerIdIndex = index;
        }
      });

      if (buildingNumberIndex === -1 || assetIdIndex === -1 || taxRegionIndex === -1 || payerIdIndex === -1) {
        const missingColumns: string[] = [];
        if (buildingNumberIndex === -1) missingColumns.push('מזהה מבנה');
        if (assetIdIndex === -1) missingColumns.push('מזהה נכס');
        if (taxRegionIndex === -1) missingColumns.push('אזור מס');
        if (payerIdIndex === -1) missingColumns.push('מזהה משלם');
        
        setErrorModal({ 
          isOpen: true, 
          message: `קובץ חייב לכלול עמודות: ${missingColumns.join(', ')}`,
          title: 'שגיאה בפרסור קובץ שלד'
        });
        setIsParsing(false);
        return;
      }

      // Parse skeleton assets (building_number, asset_id, tax_region, and payer_id)
      skeletonAssets = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i];
        const buildingNumber = values[buildingNumberIndex] ? parseInt(String(values[buildingNumberIndex]), 10) : null;
        const assetId = values[assetIdIndex] ? String(values[assetIdIndex]).trim() : '';
        const taxRegion = values[taxRegionIndex] ? parseInt(String(values[taxRegionIndex]), 10) : null;
        const payerId = values[payerIdIndex] ? String(values[payerIdIndex]).trim() : '';

        // All fields are required
        if (buildingNumber && !isNaN(buildingNumber) && assetId && taxRegion && !isNaN(taxRegion) && payerId) {
          skeletonAssets.push({
            building_number: buildingNumber,
            asset_id: assetId,
            tax_region: taxRegion,
            payer_id: payerId
          });
        } else {
          // Log row errors for missing required fields
          if (!buildingNumber || isNaN(buildingNumber)) {
            errors.push(`שורה ${i + 1}: מזהה מבנה חסר או לא תקין`);
          }
          if (!assetId || assetId.trim() === '') {
            errors.push(`שורה ${i + 1}: מזהה נכס חסר`);
          }
          if (!taxRegion || isNaN(taxRegion)) {
            errors.push(`שורה ${i + 1}: אזור מס חסר או לא תקין`);
          }
          if (!payerId || payerId.trim() === '') {
            errors.push(`שורה ${i + 1}: מזהה משלם חסר`);
          }
        }
      }

      if (skeletonAssets.length === 0) {
        errors.push('לא נמצאו נכסים תקינים בקובץ. כל הנכסים חייבים לכלול: מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם.');
        setSaveResult({
          successful: 0,
          failed: 1,
          errors: errors
        });
        setIsParsing(false);
        return;
      }

      // Convert skeleton assets to ImportAssetRow format for display in grid
      const importedRows: ImportAssetRow[] = skeletonAssets.map((asset, idx) => ({
        id: `skeleton_${idx}_${Date.now()}`,
        building_number: asset.building_number,
        payer_id: asset.payer_id || '',
        asset_id: asset.asset_id,
        measurement_date: '',
        main_asset_type: '',
        asset_size: 0,
        tax_region: asset.tax_region,
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
        sub_asset_size_6: 0
      }));

      // Create deep copy for original state
      const importedRowsCopy = JSON.parse(JSON.stringify(importedRows));
      // Set imported assets to display in grid
      setImportedAssets(importedRows);
      setOriginalImportedAssets(importedRowsCopy); // Save original state for rollback
      setValidationCompleted(false); // Reset validation status when new file is loaded

      // Show errors if any (but don't block display)
      if (errors.length > 0) {
        setSaveResult({
          successful: 0,
          failed: errors.length,
          errors: errors
        });
      }
    } catch (error) {
      console.error('Error parsing skeleton file:', error);
      const errorMsg = error instanceof Error ? error.message : 'שגיאה בפרסור קובץ שלד';
      setErrorModal({ 
        isOpen: true, 
        message: errorMsg,
        title: 'שגיאה בפרסור קובץ שלד'
      });
      errors.push(errorMsg);
      setSaveResult({
        successful: 0,
        failed: 1,
        errors: errors
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImportSkeleton = async () => {
    if (importedAssets.length === 0) return;

    // Validation must be completed before saving
    if (!validationCompleted) {
      setErrorModal({ 
        isOpen: true, 
        message: 'יש להריץ אימות לפני שמירה',
        title: 'שגיאה'
      });
      return;
    }

    setIsSaving(true);
    const errors: string[] = [];
    let successCount = 0;

    try {
      // Ensure buildings and assets are loaded
      if (buildings.length === 0) {
        const [bldgs, allAssets] = await Promise.all([
          api.buildings.getAll(),
          api.assets.getAll()
        ]);
        setBuildings(bldgs);
        const { setValidationData, setAllAssets } = await import('../lib/validation');
        setValidationData({ buildings: bldgs, assetTypes: assetTypes || [], assets: allAssets });
        setAllAssets(allAssets);
      }

      const { api } = await import('../lib/apiClient');

      // Filter assets that passed validation (no validation errors)
      const validatedSkeletonAssets = importedAssets.filter(asset => {
        // Must have all required fields
        if (!asset.building_number || !asset.asset_id || asset.asset_id === '' || 
            asset.tax_region == null || !asset.payer_id || asset.payer_id === '') {
          return false;
        }
        // Must have no validation errors (validation was already done in handleValidate)
        return !asset._validationErrors || asset._validationErrors.length === 0;
      });

      if (validatedSkeletonAssets.length === 0) {
        errors.push('אין נכסים תקינים לייבא. יש לתקן את כל השגיאות לפני שמירה.');
        setSaveResult({
          successful: 0,
          failed: 1,
          errors: errors
        });
        setIsSaving(false);
        return;
      }

      // Check all buildings and collect missing ones
      const uniqueBuildingNumbers = new Set<number>();
      validatedSkeletonAssets.forEach(asset => {
        const buildingNum = typeof asset.building_number === 'string' 
          ? parseInt(String(asset.building_number), 10) 
          : asset.building_number;
        if (!isNaN(buildingNum)) {
          uniqueBuildingNumbers.add(buildingNum);
        }
      });

      // Check each building and prompt for creation if missing
      const missingBuildings: number[] = [];
      for (const buildingNum of uniqueBuildingNumbers) {
        const exists = await checkBuildingExists(buildingNum);
        if (!exists) {
          missingBuildings.push(buildingNum);
        }
      }

      // If there are missing buildings, show modal for the first one
      if (missingBuildings.length > 0) {
        const firstMissingBuilding = missingBuildings[0];
        
        // Collect unique tax_region values from assets that belong to this building
        const taxRegionsForBuilding = new Set<string>();
        validatedSkeletonAssets.forEach(asset => {
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          if (buildingNum === firstMissingBuilding && asset.tax_region !== undefined && !isNaN(asset.tax_region)) {
            taxRegionsForBuilding.add(String(asset.tax_region));
          }
        });
        
        // Convert to comma-separated string (sorted)
        const taxRegionString = taxRegionsForBuilding.size > 0 
          ? Array.from(taxRegionsForBuilding).sort().join(',')
          : undefined;
        
        setPendingBuildingNumber(firstMissingBuilding);
        setBuildingCreateData({ 
          building_number: firstMissingBuilding,
          tax_region: taxRegionString
        });
        
        // Store the continuation function
        pendingImportCallback.current = () => {
          // Recursively call handleImportSkeleton to continue with remaining buildings
          handleImportSkeleton();
        };
        
        setShowBuildingCreateModal(true);
        setIsSaving(false);
        return;
      }

      // Get current date for measurement_date
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const defaultDate = `${day}/${month}/${year}`;

      // Check for duplicate asset_ids within the batch first
      // Normalize all asset_ids to numbers then strings for consistent comparison
      // This handles cases where asset_id might be "123" vs 123
      const assetIdCounts = new Map<string, number>();
      const duplicateAssetIds = new Set<string>();
      validatedSkeletonAssets.forEach((asset: ImportAssetRow) => {
        if (asset.asset_id != null) {
          // Convert to number first to normalize, then to string for consistent Map key
          const normalizedId = String(Number(asset.asset_id));
          // Check if conversion is valid (not NaN)
          if (!isNaN(Number(asset.asset_id))) {
            const count = assetIdCounts.get(normalizedId) || 0;
            assetIdCounts.set(normalizedId, count + 1);
            if (count + 1 > 1) {
              duplicateAssetIds.add(normalizedId);
            }
          }
        }
      });
      
      if (duplicateAssetIds.size > 0) {
        const duplicateErrors: string[] = [];
        duplicateAssetIds.forEach((assetId) => {
          duplicateErrors.push(`נכס ${assetId}: מזהה נכס מופיע מספר פעמים בקובץ הייבוא`);
        });
        
        // Add errors to assets in the grid
        setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
          if (asset.asset_id != null && duplicateAssetIds.has(asset.asset_id)) {
            const existingErrors = asset._validationErrors || [];
            return {
              ...asset,
              _validationErrors: [...existingErrors, 'מזהה נכס מופיע מספר פעמים בקובץ הייבוא']
            };
          }
          return asset;
        }));
        
        setSaveResult({
          successful: 0,
          failed: validatedSkeletonAssets.length,
          errors: duplicateErrors
        });
        
        const errorMessage = duplicateErrors.length === 1
          ? duplicateErrors[0]
          : `נכשלו ${duplicateErrors.length} נכסים עם מזהה כפול בקובץ: ${duplicateErrors.slice(0, 3).join('; ')}${duplicateErrors.length > 3 ? ` ...ועוד ${duplicateErrors.length - 3} שגיאות` : ''}`;
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 10000);
        
        // Refresh grid
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api.refreshCells({ force: true });
          }, 100);
        }
        
        setIsSaving(false);
        setIsParsing(false);
        return;
      }

      // Prepare skeleton assets for insert (building_number, asset_id, tax_region, and payer_id)
      const assetsToInsert: Partial<Asset>[] = validatedSkeletonAssets.map(asset => ({
        building_number: asset.building_number!,
        payer_id: asset.payer_id!,
        asset_id: asset.asset_id,
        measurement_date: defaultDate,
        main_asset_type: null,
        asset_size: 0,
        tax_region: asset.tax_region!,
        sub_asset_type_1: null,
        sub_asset_size_1: 0,
        sub_asset_type_2: null,
        sub_asset_size_2: 0,
        sub_asset_type_3: null,
        sub_asset_size_3: 0,
        sub_asset_type_4: null,
        sub_asset_size_4: 0,
        sub_asset_type_5: null,
        sub_asset_size_5: 0,
        sub_asset_type_6: null,
        sub_asset_size_6: 0,
        apartment_number: null,
        apartment_floor: null,
        storage_number: null,
        storage_floor: null,
        discount_type: null,
        discount_date_from: null,
        discount_date_to: null,
        comment: null
      }));

      // Sanitize assets before insert (same as regular mode)
      const { sanitizeAssetInput } = await import('../lib/api');
      const sanitizedAssets = assetsToInsert.map(asset => sanitizeAssetInput(asset as any));

      // Check for duplicates again AFTER sanitization and FILTER them out before insert
      // This prevents DB errors for duplicates within the batch
      const sanitizedAssetIdCounts = new Map<string, number>();
      const sanitizedDuplicateAssetIds = new Set<string>();
      const seenAssetIds = new Set<string>();
      const assetsToInsertFiltered: any[] = [];
      const duplicateIndices: number[] = [];
      
      sanitizedAssets.forEach((asset, index) => {
        if (asset.asset_id != null) {
          // Normalize by converting to number first (handles "123" vs 123), then to string
          const normalizedId = String(Number(asset.asset_id));
          // Only process if conversion is valid (not NaN)
          if (!isNaN(Number(asset.asset_id))) {
            if (seenAssetIds.has(normalizedId)) {
              // This is a duplicate - mark it and skip from insert
              sanitizedDuplicateAssetIds.add(normalizedId);
              duplicateIndices.push(index);
            } else {
              // First time seeing this asset_id - add to insert list
              seenAssetIds.add(normalizedId);
              assetsToInsertFiltered.push(asset);
              sanitizedAssetIdCounts.set(normalizedId, 1);
            }
          } else {
            // Invalid asset_id - skip it
            duplicateIndices.push(index);
          }
        } else {
          // No asset_id - skip it
          duplicateIndices.push(index);
        }
      });
      
      // If we found duplicates, report them
      if (sanitizedDuplicateAssetIds.size > 0 || duplicateIndices.length > 0) {
        const duplicateErrors: string[] = [];
        sanitizedDuplicateAssetIds.forEach((assetId) => {
          duplicateErrors.push(`נכס ${assetId}: מזהה נכס מופיע מספר פעמים בקובץ הייבוא`);
        });
        
        if (duplicateErrors.length > 0) {
          // Add errors to assets in the grid
          setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
            if (asset.asset_id != null && !isNaN(Number(asset.asset_id))) {
              const normalizedAssetId = String(Number(asset.asset_id));
              if (sanitizedDuplicateAssetIds.has(normalizedAssetId)) {
                const existingErrors = asset._validationErrors || [];
                return {
                  ...asset,
                  _validationErrors: [...existingErrors, 'מזהה נכס מופיע מספר פעמים בקובץ הייבוא']
                };
              }
            }
            return asset;
          }));
          
          // If ALL assets are duplicates, don't insert any
          if (assetsToInsertFiltered.length === 0) {
            setSaveResult({
              successful: 0,
              failed: validatedSkeletonAssets.length,
              errors: duplicateErrors
            });
            
            const errorMessage = duplicateErrors.length === 1
              ? duplicateErrors[0]
              : `נכשלו ${duplicateErrors.length} נכסים עם מזהה כפול בקובץ: ${duplicateErrors.slice(0, 3).join('; ')}${duplicateErrors.length > 3 ? ` ...ועוד ${duplicateErrors.length - 3} שגיאות` : ''}`;
            setToast({ message: errorMessage, type: 'error' });
            setTimeout(() => setToast(null), 10000);
            
            // Refresh grid
            if (gridRef.current?.api) {
              setTimeout(() => {
                gridRef.current?.api.refreshCells({ force: true });
              }, 100);
            }
            
            setIsSaving(false);
            setIsParsing(false);
            return;
          }
          
          // Some assets are duplicates but we can still insert the unique ones
        }
      }
      
      // Final check: log sanitized assets for debugging
      
      // Use filtered assets for insert (only unique asset_ids)
      // If we filtered duplicates, use the filtered list; otherwise use original (should already be checked)
      const finalAssetsToInsert = assetsToInsertFiltered.length > 0 ? assetsToInsertFiltered : sanitizedAssets;
      
      // One more safety check - ensure no duplicates in final list
      const finalCheck = new Map<string, number>();
      const finalUniqueAssets: any[] = [];
      finalAssetsToInsert.forEach((asset: any) => {
        if (asset.asset_id != null) {
          const normalizedId = String(Number(asset.asset_id));
          if (!isNaN(Number(asset.asset_id)) && !finalCheck.has(normalizedId)) {
            finalCheck.set(normalizedId, 1);
            finalUniqueAssets.push(asset);
          }
        }
      });
      
      
      // Bulk insert skeleton assets - only unique ones
      const { data: insertedAssets, error: insertError } = await api
        .from('assets')
        .insert(finalUniqueAssets)
        .select();

      // Update building total area for all affected buildings after skeleton import
      if (!insertError && insertedAssets && insertedAssets.length > 0) {
        const affectedBuildingNumbers = new Set<number>();
        insertedAssets.forEach((savedAsset: any) => {
          if (savedAsset.building_number != null) {
            const buildingNum = typeof savedAsset.building_number === 'string' 
              ? parseInt(savedAsset.building_number, 10) 
              : savedAsset.building_number;
            if (!isNaN(buildingNum)) {
              affectedBuildingNumbers.add(buildingNum);
            }
          }
        });
        
        // Update total area for each affected building
        for (const buildingNum of affectedBuildingNumbers) {
          try {
            await buildingsUpdateTotalArea(buildingNum);
          } catch (areaError) {
            console.warn(`Failed to update building total area for building ${buildingNum} after skeleton import:`, areaError);
            // Don't fail the operation if area update fails
          }
        }
      }

      if (insertError) {
        console.error('API insert error:', insertError);
        // Check for ON CONFLICT error (constraint mismatch) first
        if (insertError.message?.includes('ON CONFLICT') || insertError.message?.includes('onConflict') || insertError.message?.includes('no unique or exclusion constraint')) {
          errors.push(`שגיאה: בעיה במבנה מסד הנתונים - אילוץ ייחודי לא תואם. אנא פנה למנהל המערכת. פרטים: ${insertError.message}`);
        }
        // Check if it's a conflict (409) or duplicate key error
        else if (insertError.code === '409' || insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique') || insertError.message?.includes('assets_asset_id_unique')) {
          // Get all asset_ids from the batch and check which ones exist in the database
          const assetIdsToCheck = validatedSkeletonAssets.map((a: ImportAssetRow) => a.asset_id).filter((id: any) => id != null);
          
          if (assetIdsToCheck.length > 0) {
            try {
              // Get existing assets with their building numbers
              const { data: existingAssets, error: checkError } = await api
                .from('assets')
                .select('asset_id, building_number')
                .in('asset_id', assetIdsToCheck);
              
              if (!checkError && existingAssets && existingAssets.length > 0) {
                // Create a map of asset_id -> building_number for existing assets
                const existingAssetsMap = new Map<number | string, number>();
                existingAssets.forEach((a: any) => {
                  const assetId = a.asset_id;
                  const buildingNum = typeof a.building_number === 'string' ? parseInt(a.building_number, 10) : a.building_number;
                  if (assetId != null && buildingNum != null) {
                    existingAssetsMap.set(assetId, buildingNum);
                  }
                });
                
                // Find duplicate assets
                const duplicateAssets: Array<{ assetId: string | number; existingBuilding: number; newBuilding: number }> = [];
                
                validatedSkeletonAssets.forEach((asset: ImportAssetRow) => {
                  const assetId = asset.asset_id;
                  if (assetId != null) {
                    const existingBuilding = existingAssetsMap.get(assetId);
                    
                    if (existingBuilding != null) {
                      const buildingNum = typeof asset.building_number === 'string' 
                        ? parseInt(String(asset.building_number), 10) 
                        : asset.building_number;
                      const newBuilding = buildingNum && !isNaN(buildingNum) ? buildingNum : null;
                      
                      if (newBuilding) {
                        duplicateAssets.push({
                          assetId,
                          existingBuilding,
                          newBuilding
                        });
                      }
                    }
                  }
                });
                
                // Report specific duplicate assets
                if (duplicateAssets.length > 0) {
                  duplicateAssets.forEach(({ assetId, existingBuilding, newBuilding }) => {
                    const errorMsg = existingBuilding !== newBuilding
                      ? `מזהה נכס כבר קיים במבנה ${existingBuilding}. לא ניתן ליצור נכס עם אותו מספר במבנה ${newBuilding}.`
                      : `מזהה נכס כבר קיים במבנה ${existingBuilding}. נכס כבר קיים במערכת.`;
                    
                    errors.push(`נכס ${assetId}: ${errorMsg}`);
                    
                    // Also add error to the asset in the grid so it shows with red icon
                    setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
                      const assetIdMatch = typeof asset.asset_id === 'string' 
                        ? String(asset.asset_id) === String(assetId)
                        : asset.asset_id === assetId;
                      
                      if (assetIdMatch) {
                        const existingErrors = asset._validationErrors || [];
                        return {
                          ...asset,
                          _validationErrors: [...existingErrors, errorMsg]
                        };
                      }
                      return asset;
                    }));
                  });
                } else {
                  // Fallback: report all asset_ids being inserted as potentially duplicates
                  const allAssetIds = validatedSkeletonAssets.map((a: ImportAssetRow) => a.asset_id).filter((id: any) => id != null);
                  errors.push(`שגיאה: מזהה נכס כפול. הנכסים הבאים כבר קיימים במערכת: ${allAssetIds.join(', ')}`);
                }
              } else if (checkError) {
                // If check query failed, report the original error
                errors.push(`שגיאה: נכסים קיימים כבר במערכת (duplicate key violation). לא ניתן לזהות אילו נכסים. פרטים: ${insertError.message}`);
              } else {
                // No existing assets found in DB, but we got duplicate error - must be duplicates within the batch
                // Normalize asset_ids for consistent comparison
                const assetIdCounts = new Map<string, number>();
                validatedSkeletonAssets.forEach((asset: ImportAssetRow) => {
                  if (asset.asset_id != null) {
                    const normalizedId = String(asset.asset_id);
                    const count = assetIdCounts.get(normalizedId) || 0;
                    assetIdCounts.set(normalizedId, count + 1);
                  }
                });
                const duplicatesInBatch = Array.from(assetIdCounts.entries()).filter(([_, count]) => count > 1);
                if (duplicatesInBatch.length > 0) {
                  duplicatesInBatch.forEach(([assetId]) => {
                    errors.push(`נכס ${assetId}: מזהה נכס מופיע מספר פעמים בקובץ הייבוא`);
                    
                    // Also add error to the asset in the grid so it shows with red icon
                    setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
                      const normalizedAssetId = asset.asset_id != null ? String(asset.asset_id) : null;
                      if (normalizedAssetId === assetId) {
                        const existingErrors = asset._validationErrors || [];
                        return {
                          ...asset,
                          _validationErrors: [...existingErrors, 'מזהה נכס מופיע מספר פעמים בקובץ הייבוא']
                        };
                      }
                      return asset;
                    }));
                  });
                } else {
                  // This shouldn't happen - if we get duplicate error but no duplicates found, log detailed info
                  console.error('Unexpected duplicate error - no duplicates found in batch and no existing assets in DB', {
                    insertError,
                    assetIds: validatedSkeletonAssets.map(a => a.asset_id)
                  });
                  // Check if error mentions ON CONFLICT - this means constraint mismatch
                  if (insertError.message?.includes('ON CONFLICT') || insertError.message?.includes('onConflict')) {
                    errors.push(`שגיאה: בעיה במבנה מסד הנתונים. אנא פנה למנהל המערכת. פרטים: ${insertError.message}`);
                  } else {
                    errors.push(`שגיאה: מזהה נכס כפול בקובץ הייבוא. אנא בדוק שהנכסים לא מופיעים מספר פעמים בקובץ. פרטים: ${insertError.message}`);
                  }
                }
              }
            } catch (err) {
              console.error('Error checking for duplicate assets:', err);
              errors.push(`שגיאה: נכסים קיימים כבר במערכת. יש לבדוק מזהה נכס כפול. פרטים: ${insertError.message}`);
            }
          } else {
            errors.push(`שגיאה: נכסים קיימים כבר במערכת. יש לבדוק מזהה נכס כפול. פרטים: ${insertError.message}`);
          }
        } else {
          errors.push(`שגיאה בשמירה: ${insertError.message || insertError.code || 'שגיאה לא ידועה'}`);
        }
        const failedCount = validatedSkeletonAssets.length;
        setSaveResult({
          successful: 0,
          failed: failedCount,
          errors: errors
        });
        
        // Show toast with detailed error message
        if (errors.length > 0) {
          const errorMessage = failedCount === 1 && errors.length === 1
            ? `כל הנכסים נכשלו (${failedCount}). שגיאה: ${errors[0]}`
            : `כל הנכסים נכשלו (${failedCount}). שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` ...ועוד ${errors.length - 3} שגיאות` : ''}`;
          setToast({ message: errorMessage, type: 'error' });
          setTimeout(() => setToast(null), 10000); // Auto-close after 10 seconds
        }
        
        // Refresh grid to show validation errors
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api.refreshCells({ force: true });
          }, 100);
        }
      } else {
        successCount = insertedAssets?.length || 0;
        const failedCount = validatedSkeletonAssets.length - successCount;
        
        // Track successfully saved asset IDs (normalize to string for consistent comparison)
        const successfullySavedAssetIds = new Set<string>();
        if (insertedAssets && insertedAssets.length > 0) {
          insertedAssets.forEach((savedAsset: any) => {
            if (savedAsset.asset_id != null) {
              // Normalize asset_id to string for consistent comparison
              const normalizedId = String(savedAsset.asset_id);
              successfullySavedAssetIds.add(normalizedId);
            }
          });
        }
        
        // Remove successfully saved assets from the imported list
        setImportedAssets(prev => prev.filter((asset: ImportAssetRow) => {
          if (!asset.asset_id) return true; // Keep assets without asset_id (shouldn't happen)
          // Normalize asset_id to string for consistent comparison
          const normalizedAssetId = String(asset.asset_id);
          return !successfullySavedAssetIds.has(normalizedAssetId);
        }));
        
        setSaveResult({
          successful: successCount,
          failed: failedCount,
          errors: errors
        });

        // Show toast with detailed message
        let toastMessage = '';
        if (successCount > 0 && failedCount > 0) {
          toastMessage = `נשמרו בהצלחה ${successCount} נכסים. נכשלו ${failedCount} נכסים: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` ...ועוד ${errors.length - 3} שגיאות` : ''}`;
          setToast({ message: toastMessage, type: 'error' });
          setTimeout(() => setToast(null), 10000);
        } else if (failedCount > 0 && errors.length > 0) {
          toastMessage = `כל הנכסים נכשלו (${failedCount}). שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` ...ועוד ${errors.length - 3} שגיאות` : ''}`;
          setToast({ message: toastMessage, type: 'error' });
          setTimeout(() => setToast(null), 10000);
        } else if (successCount > 0) {
          toastMessage = `נשמרו בהצלחה ${successCount} נכסים`;
          setToast({ message: toastMessage, type: 'success' });
          setTimeout(() => setToast(null), 5000);
        }
        
        // Refresh grid to show updated list
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api.refreshCells({ force: true });
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error importing skeleton:', error);
      const errorMsg = error instanceof Error ? error.message : 'שגיאה בלתי צפויה בייבא שלד';
      errors.push(errorMsg);
      const totalAttempted = importedAssets.length;
      setSaveResult({
        successful: successCount,
        failed: totalAttempted > successCount ? totalAttempted - successCount : 1,
        errors: errors
      });
      
      // Show toast for error
      setToast({ message: errorMsg, type: 'error' });
      setTimeout(() => setToast(null), 8000);
    } finally {
      setIsSaving(false);
      setIsParsing(false);
      if (skeletonFileInputRef.current) {
        skeletonFileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async (saveAsNew: boolean = false, newMeasurementDate?: string) => {
    if (importedAssets.length === 0) return;

    // If save as new, show modal to get measurement date
    if (saveAsNew && !newMeasurementDate) {
      // Get current date as default
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const defaultDate = `${day}/${month}/${year}`;
      setMeasurementDate(defaultDate);
      setPendingSaveAsNew(true);
      setShowMeasurementDateModal(true);
      return;
    }

    setIsSaving(true);
    const errors: string[] = [];
    let successCount = 0;

    try {
      // Filter out assets with validation errors (only building existence and asset ID uniqueness errors)
      // Allow partial data - only building_number and asset_id are required
      const validAssets = importedAssets.filter(asset => {
        // Asset must have both building_number and asset_id
        if (!asset.building_number || !asset.asset_id) {
          return false;
        }
        // No validation errors (building existence and asset ID uniqueness checks passed)
        return !asset._validationErrors || asset._validationErrors.length === 0;
      });

      if (validAssets.length === 0) {
        errors.push('אין נכסים תקינים לשמירה. כל הנכסים חייבים לכלול מזהה מבנה ומזהה נכס תקינים וללא כפילויות.');
        setSaveResult({
          successful: 0,
          failed: 1,
          errors: errors
        });
        setToast({ message: errors[0], type: 'error' });
        setTimeout(() => setToast(null), 8000);
        setIsSaving(false);
        return;
      }

      // Check for missing buildings before saving
      const uniqueBuildingNumbers = new Set<number>();
      validAssets.forEach(asset => {
        if (asset.building_number) {
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          if (!isNaN(buildingNum)) {
            uniqueBuildingNumbers.add(buildingNum);
          }
        }
      });

      // Check each building and prompt for creation if missing
      const missingBuildings: number[] = [];
      for (const buildingNum of uniqueBuildingNumbers) {
        const exists = await checkBuildingExists(buildingNum);
        if (!exists) {
          missingBuildings.push(buildingNum);
        }
      }

      // If there are missing buildings, show modal for the first one
      if (missingBuildings.length > 0) {
        const firstMissingBuilding = missingBuildings[0];
        
        // Collect unique tax_region values from assets that belong to this building
        const taxRegionsForBuilding = new Set<string>();
        importedAssets.forEach(asset => {
          const buildingNum = typeof asset.building_number === 'string' 
            ? parseInt(String(asset.building_number), 10) 
            : asset.building_number;
          if (buildingNum === firstMissingBuilding && asset.tax_region !== undefined && asset.tax_region != null) {
            const taxRegionStr = typeof asset.tax_region === 'string' 
              ? asset.tax_region.trim()
              : String(asset.tax_region);
            if (taxRegionStr && !isNaN(parseInt(taxRegionStr))) {
              taxRegionsForBuilding.add(taxRegionStr);
            }
          }
        });
        
        // Convert to comma-separated string (sorted)
        const taxRegionString = taxRegionsForBuilding.size > 0 
          ? Array.from(taxRegionsForBuilding).sort().join(',')
          : undefined;
        
        setPendingBuildingNumber(firstMissingBuilding);
        setBuildingCreateData({ 
          building_number: firstMissingBuilding,
          tax_region: taxRegionString
        });
        
        // Store the continuation function - re-run handleSave after building is created
        pendingImportCallback.current = () => {
          handleSave(saveAsNew, newMeasurementDate);
        };
        
        setShowBuildingCreateModal(true);
        setIsSaving(false);
        return;
      }

      // Fetch asset types if not already loaded (needed to detect business assets)
      const typesForImport = assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll();

      // Fetch each building's overload_ratio for business asset area split on import
      const buildingOverloadRatioMap = new Map<number, number | null>();
      for (const buildingNum of uniqueBuildingNumbers) {
        try {
          const building = await api.buildings.getOne(buildingNum);
          const ratio = building?.overload_ratio;
          buildingOverloadRatioMap.set(buildingNum, ratio != null ? ratio : null);
        } catch {
          buildingOverloadRatioMap.set(buildingNum, null);
        }
      }

      // Prepare all valid assets for bulk insert.
      // On import with distribution: compute scaled sizes and building business_shared_area only; do NOT set asset business_distribution_area.
      const buildingDistributionSumMap = new Map<number, number>();
      let assetsToInsert: Partial<Asset>[] = validAssets.map(asset => {
        const buildingNum = typeof asset.building_number === 'number'
          ? asset.building_number
          : parseInt(String(asset.building_number), 10);
        const overloadRatioPct = !isNaN(buildingNum) ? buildingOverloadRatioMap.get(buildingNum) ?? null : null;
        const assetType = typesForImport.find(at => at.name === (asset.main_asset_type || ''));
        const isBusinessAsset = assetType?.business_residence === 'עסקים';
        // Only apply distribution to assets accountable for distribution (non_accountable_for_distribution !== true)
        const isAccountableForDistribution = assetType ? (assetType.non_accountable_for_distribution !== true) : false;
        // y = area for distribution: with subtypes, main size is NOT used (it equals sum of subtypes); use only accountable subtype 1 size.
        // With no subtypes, use asset_total_area or asset_size (main size). x = h*y/(1+h).
        const hasSubtypes = !!(asset.sub_asset_type_1 && String(asset.sub_asset_type_1).trim() !== '');
        let y: number;
        let isSubtype1Accountable = false;
        if (hasSubtypes) {
          const subType1 = asset.sub_asset_type_1;
          const subSize1 = asset.sub_asset_size_1 ?? 0;
          if (subType1 && String(subType1).trim() !== '' && subSize1 > 0) {
            const subAssetType1 = typesForImport.find(at => at.name === subType1);
            isSubtype1Accountable = !!(subAssetType1 && subAssetType1.non_accountable_for_distribution !== true);
          }
          y = isSubtype1Accountable ? subSize1 : 0;
        } else {
          y = (asset.asset_total_area ?? asset.asset_size) ?? 0;
        }
        const h = overloadRatioPct != null && overloadRatioPct > 0 ? overloadRatioPct / 100 : 0;
        const hasAtLeastOneAccountable = !hasSubtypes ? isAccountableForDistribution : isSubtype1Accountable;
        let assetSize: number;
        let businessDistributionArea: number;
        let subAssetSize1: number;
        let subAssetSize2: number;
        let subAssetSize3: number;
        let subAssetSize4: number;
        let subAssetSize5: number;
        let subAssetSize6: number;
        if (isBusinessAsset && hasAtLeastOneAccountable && h > 0 && y > 0) {
          const x = (h * y) / (1 + h);
          businessDistributionArea = x;
          const scale = (y - x) / y;  // scale factor for subtype 1 only
          if (hasSubtypes) {
            subAssetSize1 = isSubtype1Accountable ? (asset.sub_asset_size_1 ?? 0) * scale : (asset.sub_asset_size_1 ?? 0);
            subAssetSize2 = asset.sub_asset_size_2 ?? 0;
            subAssetSize3 = asset.sub_asset_size_3 ?? 0;
            subAssetSize4 = asset.sub_asset_size_4 ?? 0;
            subAssetSize5 = asset.sub_asset_size_5 ?? 0;
            subAssetSize6 = asset.sub_asset_size_6 ?? 0;
            assetSize = subAssetSize1 + subAssetSize2 + subAssetSize3 + subAssetSize4 + subAssetSize5 + subAssetSize6;  // main = sum of all subtypes
          } else {
            assetSize = (asset.asset_total_area ?? asset.asset_size ?? 0) - x;
            subAssetSize1 = asset.sub_asset_size_1 || 0;
            subAssetSize2 = asset.sub_asset_size_2 || 0;
            subAssetSize3 = asset.sub_asset_size_3 || 0;
            subAssetSize4 = asset.sub_asset_size_4 || 0;
            subAssetSize5 = asset.sub_asset_size_5 || 0;
            subAssetSize6 = asset.sub_asset_size_6 || 0;
          }
        } else {
          businessDistributionArea = 0;
          subAssetSize1 = asset.sub_asset_size_1 || 0;
          subAssetSize2 = asset.sub_asset_size_2 || 0;
          subAssetSize3 = asset.sub_asset_size_3 || 0;
          subAssetSize4 = asset.sub_asset_size_4 || 0;
          subAssetSize5 = asset.sub_asset_size_5 || 0;
          subAssetSize6 = asset.sub_asset_size_6 || 0;
          assetSize = hasSubtypes
            ? subAssetSize1 + subAssetSize2 + subAssetSize3 + subAssetSize4 + subAssetSize5 + subAssetSize6
            : ((asset.asset_total_area ?? asset.asset_size) ?? 0);
        }

        // Accumulate distribution area for building update (do not store on asset)
        if (businessDistributionArea > 0 && !isNaN(buildingNum)) {
          buildingDistributionSumMap.set(buildingNum, (buildingDistributionSumMap.get(buildingNum) || 0) + businessDistributionArea);
        }

        const assetData: Partial<Asset> = {
          building_number: asset.building_number!,
          payer_id: asset.payer_id || null,
          asset_id: asset.asset_id,
          measurement_date: saveAsNew && newMeasurementDate ? newMeasurementDate : asset.measurement_date,
          main_asset_type: asset.main_asset_type || null,
          asset_size: assetSize,
          tax_region: asset.tax_region || null,
          sub_asset_type_1: asset.sub_asset_type_1 || null,
          sub_asset_size_1: subAssetSize1,
          sub_asset_type_2: asset.sub_asset_type_2 || null,
          sub_asset_size_2: subAssetSize2,
          sub_asset_type_3: asset.sub_asset_type_3 || null,
          sub_asset_size_3: subAssetSize3,
          sub_asset_type_4: asset.sub_asset_type_4 || null,
          sub_asset_size_4: subAssetSize4,
          sub_asset_type_5: asset.sub_asset_type_5 || null,
          sub_asset_size_5: subAssetSize5,
          sub_asset_type_6: asset.sub_asset_type_6 || null,
          sub_asset_size_6: subAssetSize6,
          business_distribution_area: 0,  // Do not update asset shared business area on import
          apartment_number: asset.apartment_number || null,
          apartment_floor: asset.apartment_floor || null,
          storage_number: asset.storage_number || null,
          storage_floor: asset.storage_floor || null,
          discount_type: asset.discount_type || null,
          discount_date_from: asset.discount_date_from || null,
          discount_date_to: asset.discount_date_to || null,
          comment: asset.comment || null,
          // If file is from automation, mark as coming from automation.
          // Any later edit in the app will flip this back to false via DB trigger.
          data_from_automation: importFromAutomation ? true : false,
          // When data is from automation, do not mark as needing to send to automation (already there).
          exported_to_automation: importFromAutomation ? true : false
        };

        assetData.penthouse = asset.penthouse === true;

        return assetData;
      });

      // Use bulk insert via API
      const { api } = await import('../lib/apiClient');
      
      // Check which assets already exist and their building numbers (for both save and save as new)
      const assetIds = assetsToInsert.map(a => a.asset_id).filter(id => id != null);
      
      if (assetIds.length > 0) {
        // Check which assets already exist with their building numbers (bulk query)
        const { data: existingAssets, error: checkError } = await api
          .from('assets')
          .select('asset_id, building_number')
          .in('asset_id', assetIds);
        
        if (checkError && checkError.code !== 'PGRST116') {
          errors.push(`שגיאה בבדיקת נכסים קיימים: ${checkError.message}`);
        } else if (existingAssets && existingAssets.length > 0) {
          // Create a map of asset_id -> building_number for existing assets
          const existingAssetsMap = new Map<number, number>();
          existingAssets.forEach(a => {
            const assetId = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : a.asset_id;
            const buildingNum = typeof a.building_number === 'string' ? parseInt(a.building_number, 10) : a.building_number;
            existingAssetsMap.set(assetId, buildingNum);
          });
          
          // Check for assets in different buildings (errors)
          const assetsInDifferentBuildings: Array<{ assetId: number; existingBuilding: number; newBuilding: number }> = [];
          const assetsInSameBuilding: number[] = [];
          
          assetsToInsert.forEach(asset => {
            const assetId = asset.asset_id;
            if (assetId != null) {
              const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
              const existingBuilding = existingAssetsMap.get(assetIdNum);
              
              if (existingBuilding != null) {
                const newBuilding = typeof asset.building_number === 'string' 
                  ? parseInt(asset.building_number, 10) 
                  : asset.building_number;
                
                if (existingBuilding !== newBuilding) {
                  // Asset exists in a different building - error
                  assetsInDifferentBuildings.push({
                    assetId: assetIdNum,
                    existingBuilding,
                    newBuilding
                  });
                } else {
                  // Asset exists in the same building - OK (will be updated)
                  assetsInSameBuilding.push(assetIdNum);
                }
              }
            }
          });
          
          // Report errors for assets in different buildings
          if (assetsInDifferentBuildings.length > 0) {
            assetsInDifferentBuildings.forEach(({ assetId, existingBuilding, newBuilding }) => {
              errors.push(`נכס ${assetId}: מזהה נכס כבר קיים במבנה ${existingBuilding}. לא ניתן ליצור נכס עם אותו מספר במבנה ${newBuilding}.`);
            });
            // Remove assets in different buildings from the insert list
            assetsToInsert = assetsToInsert.filter(asset => {
              const assetId = asset.asset_id;
              if (assetId == null) return true;
              const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
              return !assetsInDifferentBuildings.some(a => a.assetId === assetIdNum);
            });
          }
          
          // For assets in the same building, delete existing ones (triggers will copy to history)
          // This applies to both "save" and "save as new"
          if (assetsInSameBuilding.length > 0) {
            const { error: deleteError } = await api
              .from('assets')
              .delete()
              .in('asset_id', assetsInSameBuilding);
            
            if (deleteError) {
              errors.push(`שגיאה בעדכון נכסים קיימים: ${deleteError.message}`);
            }
          }
        }
      }

      // Check for duplicate asset_ids within the batch before insert
      // Normalize all asset_ids to strings for consistent comparison
      const assetIdCounts = new Map<string, number>();
      const duplicateAssetIds = new Set<string>();
      assetsToInsert.forEach(asset => {
        if (asset.asset_id != null) {
          const normalizedId = String(asset.asset_id);
          const count = assetIdCounts.get(normalizedId) || 0;
          assetIdCounts.set(normalizedId, count + 1);
          if (count + 1 > 1) {
            duplicateAssetIds.add(normalizedId);
          }
        }
      });
      
      if (duplicateAssetIds.size > 0) {
        const duplicateErrors: string[] = [];
        duplicateAssetIds.forEach((assetId) => {
          duplicateErrors.push(`נכס ${assetId}: מזהה נכס מופיע מספר פעמים בקובץ הייבוא`);
        });
        
        // Add errors to assets in the grid
        setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
          if (asset.asset_id != null && duplicateAssetIds.has(asset.asset_id)) {
            const existingErrors = asset._validationErrors || [];
            return {
              ...asset,
              _validationErrors: [...existingErrors, 'מזהה נכס מופיע מספר פעמים בקובץ הייבוא']
            };
          }
          return asset;
        }));
        
        setSaveResult({
          successful: 0,
          failed: assetsToInsert.length,
          errors: [...errors, ...duplicateErrors]
        });
        
        const errorMessage = duplicateErrors.length === 1
          ? duplicateErrors[0]
          : `נכשלו ${duplicateErrors.length} נכסים עם מזהה כפול בקובץ: ${duplicateErrors.slice(0, 3).join('; ')}${duplicateErrors.length > 3 ? ` ...ועוד ${duplicateErrors.length - 3} שגיאות` : ''}`;
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 10000);
        
        // Refresh grid
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api.refreshCells({ force: true });
          }, 100);
        }
        
        setIsSaving(false);
        return;
      }

      // Sanitize all assets before bulk insert using the sanitizeAssetInput function
      const { sanitizeAssetInput } = await import('../lib/api');
      const sanitizedAssets = assetsToInsert.map(asset => sanitizeAssetInput(asset as any));

      // Check for duplicates again AFTER sanitization (in case sanitization changed types)
      const sanitizedAssetIdCounts = new Map<string | number, number>();
      const sanitizedDuplicateAssetIds = new Set<string | number>();
      sanitizedAssets.forEach(asset => {
        if (asset.asset_id != null) {
          // Normalize asset_id to string for consistent comparison
          const normalizedId = String(asset.asset_id);
          const count = sanitizedAssetIdCounts.get(normalizedId) || 0;
          sanitizedAssetIdCounts.set(normalizedId, count + 1);
          if (count + 1 > 1) {
            sanitizedDuplicateAssetIds.add(normalizedId);
          }
        }
      });
      
      if (sanitizedDuplicateAssetIds.size > 0) {
        const duplicateErrors: string[] = [];
        sanitizedDuplicateAssetIds.forEach((assetId) => {
          duplicateErrors.push(`נכס ${assetId}: מזהה נכס מופיע מספר פעמים בקובץ הייבוא`);
        });
        
        // Add errors to assets in the grid
        setImportedAssets(prev => prev.map((asset: ImportAssetRow) => {
          const normalizedAssetId = asset.asset_id != null ? String(asset.asset_id) : null;
          if (normalizedAssetId && sanitizedDuplicateAssetIds.has(normalizedAssetId)) {
            const existingErrors = asset._validationErrors || [];
            return {
              ...asset,
              _validationErrors: [...existingErrors, 'מזהה נכס מופיע מספר פעמים בקובץ הייבוא']
            };
          }
          return asset;
        }));
        
        setSaveResult({
          successful: 0,
          failed: assetsToInsert.length,
          errors: [...errors, ...duplicateErrors]
        });
        
        const errorMessage = duplicateErrors.length === 1
          ? duplicateErrors[0]
          : `נכשלו ${duplicateErrors.length} נכסים עם מזהה כפול בקובץ: ${duplicateErrors.slice(0, 3).join('; ')}${duplicateErrors.length > 3 ? ` ...ועוד ${duplicateErrors.length - 3} שגיאות` : ''}`;
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 10000);
        
        // Refresh grid
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api.refreshCells({ force: true });
          }, 100);
        }
        
        setIsSaving(false);
        return;
      }

      // Perform bulk insert
      let insertedAssetsResult: any[] | null = null;
      const { data: insertedAssets, error: bulkError } = await api
        .from('assets')
        .insert(sanitizedAssets)
        .select();
      insertedAssetsResult = insertedAssets;

      if (bulkError) {
        // If bulk insert fails, try to identify which assets failed
        const errorMsg = bulkError.message || 'שגיאה בשמירה';
        
        // Check for ON CONFLICT error (constraint mismatch)
        if (errorMsg.includes('ON CONFLICT') || errorMsg.includes('onConflict') || errorMsg.includes('no unique or exclusion constraint')) {
          errors.push(`שגיאה: בעיה במבנה מסד הנתונים - אילוץ ייחודי לא תואם. אנא פנה למנהל המערכת. פרטים: ${errorMsg}`);
        }
        // If it's a unique constraint violation (duplicate asset_id), check which assets are duplicates
        else if (bulkError.code === '23505' || errorMsg.includes('assets_asset_id_unique') || errorMsg.includes('duplicate key')) {
          // Get all asset_ids from the batch and check which ones exist in the database (bulk query)
          const assetIdsToCheck = assetsToInsert.map(a => a.asset_id).filter(id => id != null);
          
          if (assetIdsToCheck.length > 0) {
            // Get existing assets with their building numbers
            const { data: existingAssets, error: checkError } = await api
              .from('assets')
              .select('asset_id, building_number')
              .in('asset_id', assetIdsToCheck);
            
            if (!checkError && existingAssets) {
              // Create a map of asset_id -> building_number for existing assets
              const existingAssetsMap = new Map<number, number>();
              existingAssets.forEach(a => {
                const assetId = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : a.asset_id;
                const buildingNum = typeof a.building_number === 'string' ? parseInt(a.building_number, 10) : a.building_number;
                existingAssetsMap.set(assetId, buildingNum);
              });
              
              // Check each asset to see if it exists in a different building
              const assetsInDifferentBuildings: Array<{ assetId: number; existingBuilding: number; newBuilding: number }> = [];
              const assetsInSameBuilding: number[] = [];
              
              sanitizedAssets.forEach(asset => {
                const assetId = asset.asset_id;
                if (assetId != null) {
                  const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
                  const existingBuilding = existingAssetsMap.get(assetIdNum);
                  
                  if (existingBuilding != null) {
                    const newBuilding = typeof asset.building_number === 'string' 
                      ? parseInt(asset.building_number, 10) 
                      : asset.building_number;
                    
                    if (existingBuilding !== newBuilding) {
                      // Asset exists in a different building - error
                      assetsInDifferentBuildings.push({
                        assetId: assetIdNum,
                        existingBuilding,
                        newBuilding
                      });
                    } else {
                      // Asset exists in the same building - OK (update scenario)
                      assetsInSameBuilding.push(assetIdNum);
                    }
                  }
                }
              });
              
              // Report errors for assets in different buildings
              assetsInDifferentBuildings.forEach(({ assetId, existingBuilding, newBuilding }) => {
                errors.push(`נכס ${assetId}: מזהה נכס כבר קיים במבנה ${existingBuilding}. לא ניתן ליצור נכס עם אותו מספר במבנה ${newBuilding}.`);
              });
              
              // Filter out assets that exist in different buildings, but keep assets in same building (updates)
              const assetsToInsertFiltered = sanitizedAssets.filter(a => {
                const assetId = a.asset_id;
                if (assetId == null) return true;
                
                const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
                const existingBuilding = existingAssetsMap.get(assetIdNum);
                
                if (existingBuilding == null) {
                  // New asset - keep it
                  return true;
                }
                
                const newBuilding = typeof a.building_number === 'string' 
                  ? parseInt(a.building_number, 10) 
                  : a.building_number;
                
                // Keep if same building (update), exclude if different building (error)
                return existingBuilding === newBuilding;
              });
              
              if (assetsToInsertFiltered.length > 0) {
                // For assets in the same building, we need to update them instead of insert
                // Delete existing ones first (triggers will copy to history), then insert new ones
                const assetIdsToUpdate = assetsInSameBuilding;
                
                if (assetIdsToUpdate.length > 0) {
                  const { error: deleteError } = await api
                    .from('assets')
                    .delete()
                    .in('asset_id', assetIdsToUpdate);
                  
                  if (deleteError) {
                    errors.push(`שגיאה בעדכון נכסים קיימים: ${deleteError.message}`);
                  }
                }
                
                // Insert all assets (both new and updated)
                const { data: newInserted, error: newError } = await api
                  .from('assets')
                  .insert(assetsToInsertFiltered)
                  .select();
                
                if (!newError && newInserted) {
                  successCount = newInserted.length;
                  // Store newInserted as insertedAssetsResult for removal tracking
                  insertedAssetsResult = newInserted;
                  
                  // Update building total area for all affected buildings
                  const affectedBuildingNumbers = new Set<number>();
                  newInserted.forEach((savedAsset: any) => {
                    if (savedAsset.building_number != null) {
                      const buildingNum = typeof savedAsset.building_number === 'string' 
                        ? parseInt(savedAsset.building_number, 10) 
                        : savedAsset.building_number;
                      if (!isNaN(buildingNum)) {
                        affectedBuildingNumbers.add(buildingNum);
                      }
                    }
                  });
                  
                  // Update total area for each affected building
                  for (const buildingNum of affectedBuildingNumbers) {
                    try {
                      await buildingsUpdateTotalArea(buildingNum);
                    } catch (areaError) {
                      console.warn(`Failed to update building total area for building ${buildingNum} after import:`, areaError);
                      // Don't fail the operation if area update fails
                    }
                  }
                } else if (newError) {
                  errors.push(`שגיאה בשמירת נכסים: ${newError.message}`);
                }
              } else if (assetsInDifferentBuildings.length > 0) {
                // All assets failed due to different buildings
                successCount = 0;
              }
            } else {
              errors.push(`שגיאה בבדיקת נכסים קיימים: ${checkError?.message || 'שגיאה לא ידועה'}`);
            }
          }
        } else if (bulkError.code === '23503') {
          // Foreign key constraint violation - check which buildings don't exist
          const buildingNumbers = [...new Set(assetsToInsert.map(a => a.building_number).filter(b => b != null))];
          
          if (buildingNumbers.length > 0) {
            const { data: existingBuildings, error: buildingCheckError } = await api
              .from('buildings')
              .select('building_number')
              .in('building_number', buildingNumbers);
            
            if (!buildingCheckError && existingBuildings) {
              const existingBuildingNums = new Set(existingBuildings.map(b => b.building_number));
              const missingBuildings = buildingNumbers.filter(b => !existingBuildingNums.has(b));
              
              if (missingBuildings.length > 0) {
                missingBuildings.forEach(buildingNum => {
                  errors.push(`מבנה ${buildingNum} לא קיים במערכת`);
                });
              }
            }
          }
          
          errors.push(`שגיאה בשמירה: ${errorMsg}`);
        } else {
          // For other errors, show the error message
          errors.push(`שגיאה בשמירה: ${errorMsg}`);
        }
      } else {
        // Bulk insert succeeded
        successCount = insertedAssetsResult?.length || assetsToInsert.length;
      }

      // Update building total area for all affected buildings after import
      if (insertedAssetsResult && insertedAssetsResult.length > 0) {
        const affectedBuildingNumbers = new Set<number>();
        insertedAssetsResult.forEach((savedAsset: any) => {
          if (savedAsset.building_number != null) {
            const buildingNum = typeof savedAsset.building_number === 'string' 
              ? parseInt(savedAsset.building_number, 10) 
              : savedAsset.building_number;
            if (!isNaN(buildingNum)) {
              affectedBuildingNumbers.add(buildingNum);
            }
          }
        });
        
        // Update total area for each affected building
        for (const buildingNum of affectedBuildingNumbers) {
          try {
            await buildingsUpdateTotalArea(buildingNum);
          } catch (areaError) {
            console.warn(`Failed to update building total area for building ${buildingNum} after import:`, areaError);
            // Don't fail the operation if area update fails
          }
        }

        // When overload_ratio > 0, set building business_shared_area from computed distribution sum (assets do not store business_distribution_area on import)
        for (const buildingNum of affectedBuildingNumbers) {
          const overloadRatioPct = buildingOverloadRatioMap.get(buildingNum);
          if (overloadRatioPct != null && overloadRatioPct > 0) {
            const sumDistributionArea = buildingDistributionSumMap.get(buildingNum) || 0;
            if (sumDistributionArea > 0) {
              try {
                await api.buildings.update(buildingNum, { business_shared_area: sumDistributionArea });
              } catch (sharedAreaError) {
                console.warn(`Failed to update business_shared_area for building ${buildingNum} after import:`, sharedAreaError);
              }
            }
          }
        }
      }

      const failedCount = errors.length;
      
      // Track successfully saved asset IDs (normalize to string for consistent comparison)
      const successfullySavedAssetIds = new Set<string>();
      if (insertedAssetsResult && insertedAssetsResult.length > 0) {
        insertedAssetsResult.forEach((savedAsset: any) => {
          if (savedAsset.asset_id != null) {
            // Normalize asset_id to string for consistent comparison
            const normalizedId = String(savedAsset.asset_id);
            successfullySavedAssetIds.add(normalizedId);
          }
        });
      }
      
      // Remove successfully saved assets from the imported list
      setImportedAssets(prev => prev.filter((asset: ImportAssetRow) => {
        if (!asset.asset_id) return true; // Keep assets without asset_id
        // Normalize asset_id to string for consistent comparison
        const normalizedAssetId = String(asset.asset_id);
        return !successfullySavedAssetIds.has(normalizedAssetId);
      }));

      // Log audit entry for import file action
      if (successCount > 0) {
        try {
          const assetIds = insertedAssetsResult?.map(a => a.asset_id).filter((id): id is number => typeof id === 'number') || [];
          const buildingNumbers = [...new Set(validAssets.map(a => {
            const bn = typeof a.building_number === 'string' ? parseInt(a.building_number, 10) : a.building_number;
            return !isNaN(bn) ? bn : null;
          }).filter((bn): bn is number => bn !== null))];
          
          if (assetIds.length > 0) {
            await api.auditLog.logBulkAssetAction(
              assetIds,
              'import_file',
              undefined,
              { assets: insertedAssetsResult },
              `Imported ${successCount} assets from file${saveAsNew ? ' as new measurements' : ''}`
            );
          }
          
          // Also log building actions if buildings were created
          for (const buildingNum of buildingNumbers) {
            try {
              const building = await api.buildings.getOne(buildingNum);
              await api.auditLog.logBuildingAction(
                buildingNum,
                'import_file',
                undefined,
                { building, assets: insertedAssetsResult?.filter(a => a.building_number === buildingNum) },
                `Building created/updated during file import`
              );
            } catch (err) {
              // Skip if building doesn't exist or other error
            }
          }
        } catch (auditError) {
          console.warn('Failed to log audit entry for file import:', auditError);
          // Don't block the operation if audit logging fails
        }
      }

      setSaveResult({
        successful: successCount,
        failed: failedCount,
        errors: errors.slice(0, 20)
      });
      
      // Show toast with detailed message
      let toastMessage = '';
      if (successCount > 0 && failedCount > 0) {
        toastMessage = `נשמרו בהצלחה ${successCount} נכסים. נכשלו ${failedCount} נכסים: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` ...ועוד ${errors.length - 3} שגיאות` : ''}`;
        setToast({ message: toastMessage, type: 'error' });
        setTimeout(() => setToast(null), 10000);
      } else if (failedCount > 0 && errors.length > 0) {
        toastMessage = `כל הנכסים נכשלו (${failedCount}). שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` ...ועוד ${errors.length - 3} שגיאות` : ''}`;
        setToast({ message: toastMessage, type: 'error' });
        setTimeout(() => setToast(null), 10000);
      } else if (successCount > 0) {
        toastMessage = `נשמרו בהצלחה ${successCount} נכסים`;
        setToast({ message: toastMessage, type: 'success' });
        setTimeout(() => setToast(null), 5000);
      }
      
      // Refresh grid to show updated list (after successful saves are removed)
      if (gridRef.current?.api) {
        setTimeout(() => {
          gridRef.current?.api.refreshCells({ force: true });
        }, 100);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'שגיאה בשמירה';
      setToast({ message: errorMsg, type: 'error' });
      setTimeout(() => setToast(null), 8000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmMeasurementDate = () => {
    if (!measurementDate || measurementDate.trim() === '') {
      setErrorModal({ 
        isOpen: true, 
        message: 'יש להזין תאריך מדידה',
        title: 'שגיאה'
      });
      return;
    }

    // Validate date format (DD/MM/YYYY)
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(measurementDate)) {
      setErrorModal({ 
        isOpen: true, 
        message: 'תאריך מדידה חייב להיות בפורמט DD/MM/YYYY',
        title: 'שגיאה בפורמט תאריך'
      });
      return;
    }

    setShowMeasurementDateModal(false);
    handleSave(true, measurementDate);
    setPendingSaveAsNew(false);
  };

  // Helper function to validate discount dates
  const validateDiscountDates = useCallback((asset: ImportAssetRow): string[] => {
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

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const updatedRow = event.data as ImportAssetRow;
    const field = event.column?.getColId();
    
    if (!field || !updatedRow) return;

    // Validate discount dates if discount-related field was changed
    const discountFields = ['discount_type', 'discount_date_from', 'discount_date_to'];
    const discountErrors = discountFields.includes(field) ? validateDiscountDates(updatedRow) : [];

    // Mark as dirty and update validation errors
    setImportedAssets(prev => prev.map(a => 
      a.id === updatedRow.id 
        ? { 
            ...a, 
            _isDirty: true, 
            _validationErrors: discountErrors.length > 0 ? discountErrors : undefined 
          }
        : a
    ));
  }, [validateDiscountDates]);

  const handleDeleteRow = useCallback((rowId: string) => {
    setImportedAssets(prev => prev.filter(a => a.id !== rowId));
  }, []);

  const handleCancelChanges = useCallback(() => {
    if (originalImportedAssets.length === 0) return;
    
    // Restore original assets (deep copy) and clear validation state
    const originalCopy = JSON.parse(JSON.stringify(originalImportedAssets)).map((asset: ImportAssetRow) => ({
      ...asset,
      _validationErrors: undefined,
      _isDirty: false
    }));
    
    setImportedAssets(originalCopy);
    
    // Clear validation state
    setValidationCompleted(false);
    setValidationResults(null);
    setValidationProgress(null);
    setSaveResult(null);
    
    // Refresh grid to reflect changes
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
    }, 100);
  }, [originalImportedAssets]);

  // Check if all assets are valid
  // For skeleton mode: building_number, asset_id, tax_region, and payer_id are required, no validation errors
  // For regular mode: building_number and asset_id are required, no validation errors
  const allAssetsValid = useMemo(() => {
    if (importedAssets.length === 0) return false;
    
    // Check that all assets have required fields
    const hasRequiredFields = importedAssets.every(asset => {
      if (mode === 'skeleton') {
        // Skeleton mode requires: building_number, asset_id, tax_region, payer_id
        return asset.building_number != null && 
               asset.asset_id != null && 
               asset.asset_id !== '' &&
               asset.tax_region != null &&
               asset.payer_id != null &&
               asset.payer_id !== '';
      } else {
        // Regular mode requires: building_number and asset_id
        return asset.building_number != null && asset.asset_id != null && asset.asset_id !== '';
      }
    });
    
    if (!hasRequiredFields) return false;
    
    // Check for validation errors (building existence and asset ID uniqueness)
    const hasValidationErrors = importedAssets.some(asset => 
      asset._validationErrors && asset._validationErrors.length > 0
    );
    
    return !hasValidationErrors;
  }, [importedAssets, mode]);

  const getCellStyle = (params: any) => {
    const row = params.data as ImportAssetRow;
    const hasValidationError = row._validationErrors && row._validationErrors.length > 0;
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        textAlign: 'right'
      };
    }
    return { textAlign: 'right' };
  };


  const columnDefs: ColDef<ImportAssetRow>[] = useMemo(() => {
    // For skeleton mode, show only building_number and asset_id
    if (mode === 'skeleton') {
      return [
        {
          field: 'building_number',
          headerName: t('buildingNumber'),
          editable: (params) => {
            const fieldName = params.colDef?.field || '';
            return isFieldEditable(params, fieldName);
          },
          cellStyle: getCellStyle
        },
        {
          field: 'asset_id',
          headerName: t('assetId'),
          editable: (params) => {
            const fieldName = params.colDef?.field || '';
            return isFieldEditable(params, fieldName);
          },
          cellStyle: getCellStyle
        },
        {
          field: 'tax_region',
          headerName: 'אזור מס',
          headerTooltip: 'אזור מס',
          tooltipValueGetter: (params) => {
            if (params.value == null || !assetTypes || assetTypes.length === 0) return params.value != null ? String(params.value) : '';
            const taxRegion = typeof params.value === 'string' ? parseInt(params.value.trim(), 10) : params.value;
            if (isNaN(taxRegion)) return String(params.value);
            const matchingAssetType = assetTypes.find(at => at.tax_region === taxRegion && at.area_description_for_tab);
            return matchingAssetType?.area_description_for_tab || String(params.value);
          },
          editable: (params) => {
            const fieldName = params.colDef?.field || '';
            return isFieldEditable(params, fieldName);
          },
          cellStyle: getCellStyle
        },
        {
          field: 'payer_id',
          headerName: t('payerId'),
          editable: (params) => {
            const fieldName = params.colDef?.field || '';
            return isFieldEditable(params, fieldName);
          },
          cellStyle: getCellStyle
        },
        {
          colId: 'actions',
          field: 'actions',
          headerName: 'פעולות',
          pinned: 'right',
          lockPosition: true,
          lockPinned: true,
          suppressMovable: true,
          suppressHeaderMenuButton: true,
          sortable: false,
          filter: false,
          resizable: false,
          cellRenderer: (params: any) => {
            const row = params.data as ImportAssetRow;
            const hasError = row._validationErrors && row._validationErrors.length > 0;
            const errorMessages = hasError ? row._validationErrors : [];

            return (
              <div className="flex items-center gap-2 w-full px-2">
                {hasError && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Show error messages in a tooltip/alert format
                      setErrorModal({ 
                        isOpen: true, 
                        message: errorMessages.join('\n'),
                        title: 'שגיאות אימות'
                      });
                    }}
                    className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
                    title={errorMessages.join('\n')}
                  >
                    <AlertCircle className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteRow(row.id);
                  }}
                  className="p-1 hover:bg-red-100 rounded transition-colors"
                  title="מחק שורה"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            );
          }
        }
      ].map(colDef => {
        if (colDef.headerName && typeof colDef.headerName === 'string') {
          const processed = processColumnHeader(colDef.headerName);
          return { ...colDef, ...processed };
        }
        return colDef;
      });
    }

    // For regular mode, show all columns
    const defs: ColDef<ImportAssetRow>[] = [
    {
      colId: 'actions',
      field: 'actions',
      headerName: 'פעולות',
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: any) => {
        const row = params.data as ImportAssetRow;
        const hasError = row._validationErrors && row._validationErrors.length > 0;
        const errorMessages = hasError && row._validationErrors ? row._validationErrors : [];

        // Validation tooltip component
        const ValidationTooltipButton = ({ errorMessages, onErrorClick }: { errorMessages: string[], onErrorClick: () => void }) => {
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
                {errorMessages.map((error, index) => (
                  <div key={index} style={{ marginBottom: index < errorMessages.length - 1 ? '8px' : '0' }}>
                    {error}
                  </div>
                ))}
              </div>
            </div>
          ) : null;

          return (
            <>
              <button
                ref={buttonRef}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onErrorClick();
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
              >
                <AlertCircle className="h-4 w-4" />
              </button>
              {tooltipContent && createPortal(tooltipContent, document.body)}
            </>
          );
        };

        return (
          <div className="flex items-center gap-2 w-full px-2">
            {hasError && errorMessages.length > 0 && (
              <ValidationTooltipButton
                errorMessages={errorMessages}
                onErrorClick={() => {
                  setErrorModal({ 
                    isOpen: true, 
                    message: errorMessages.join('\n'),
                    title: 'שגיאות אימות'
                  });
                }}
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteRow(row.id);
              }}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="מחק שורה"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: true,
      cellStyle: getCellStyle
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      cellRenderer: (params: any) => {
        const isChecked = params.value === true;
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? true : false;
                params.setValue(newValue);
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        );
      },
      valueGetter: (params: any) => {
        const value = params.data?.penthouse;
        // Convert to boolean: true if checked, false otherwise
        return value === true;
      },
      valueSetter: (params: any) => {
        // Always set as boolean: true or false
        const newValue = params.newValue;
        params.data.penthouse = newValue === true;
        return true;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params);
        return { ...baseStyle, textAlign: 'center' };
      }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'use_nature',
      headerName: 'מהות שימוש',
      editable: true,
      valueGetter: (params) => {
        const v = params.data?.use_nature;
        if (v != null && v !== '') return v;
        const code = params.data?.main_asset_type;
        if (!code || !assetTypes?.length) return '';
        const at = assetTypes.find(t => String(t.name).trim() === String(code).trim());
        return at?.description ?? '';
      },
      cellStyle: getCellStyle
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'asset_total_area',
      headerName: 'סה"כ שטח נכס',
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    // tax_region column is hidden from UI but will be saved in the database
    // It is automatically populated from tab data when creating assets
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: getCellStyle
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'apartment_floor',
      headerName: 'קומת דירה',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      editable: true,
      cellStyle: getCellStyle
    },
    {
      field: 'shared_parking_area',
      headerName: 'שטח חניה משותף',
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => (params.value != null && params.value !== '' ? String(params.value) : ''),
      cellStyle: getCellStyle
    },
    {
      field: 'number_of_parking_units',
      headerName: 'מספר יחידות חניה',
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => (params.value != null && params.value !== '' ? String(params.value) : ''),
      cellStyle: getCellStyle
    },
    {
      field: 'comment',
      headerName: 'הערה',
      editable: true,
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
      cellStyle: getCellStyle,
      tooltipValueGetter: (params) => params.value || ''
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
  }, [t, assetTypes, handleDeleteRow, mode]);

  // Apply field configurations from database
  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'assets-file-import');

  const getRowStyle = (params: any) => {
    const row = params.data as ImportAssetRow;
    const hasValidationError = row._validationErrors && row._validationErrors.length > 0;
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        borderRadius: '4px'
      };
    }
    return undefined;
  };

  // Grid options are now defined inline in the AgGridReact component

  async function downloadTemplate(format: 'excel' | 'csv' = 'excel') {
    const headers = [
      'מזהה מבנה',
      'מזהה משלם',
      'מזהה נכס',
      'סוג נכס ראשי',
      'גודל נכס ראשי',
      'סה"כ שטח נכס',
      'אזור מס',
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
      'דירת גג',
      'מספר דירה',
      'קומת דירה',
      'מספר מחסן',
      'קומת מחסן',
      'סוג הנחה',
      'תאריך הנחה מ',
      'תאריך הנחה עד',
      'גודל שטח משותף',  // business_distribution_area
      'שטח חניה משותף',  // shared_parking_area
      'מספר יחידות חניה', // number_of_parking_units
      'הערה'              // comment
    ];

    const data = [headers];
    if (format === 'csv') {
      const { exportToCSV } = await import('../lib/csvExport');
      exportToCSV({
        filename: 'assets_template.csv',
        data
      });
    } else {
      exportToExcel({
        filename: 'assets_template.xlsx',
        sheetName: 'נכסים',
        data
      });
    }
  }

  async function downloadSkeletonTemplate(format: 'excel' | 'csv' = 'excel') {
    const headers = [
      'מזהה מבנה',
      'מזהה נכס',
      'אזור מס',
      'מזהה משלם'
    ];

    const data = [headers];
    if (format === 'csv') {
      const { exportToCSV } = await import('../lib/csvExport');
      exportToCSV({
        filename: 'assets_skeleton_template.csv',
        data
      });
    } else {
      exportToExcel({
        filename: 'assets_skeleton_template.xlsx',
        sheetName: 'נכסים',
        data
      });
    }
  }

  return (
    <div className="max-w-[95vw] mx-auto px-4 py-6">
      <div className="mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md p-4">
        <div className="flex items-center gap-2">
          <Upload className="w-6 h-6 text-white bg-white/20 rounded p-1" />
          <div>
            <h1 className="text-xl font-bold text-white">ייבוא נכסים מקובץ Excel</h1>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md border border-indigo-100 p-6">
        {/* Regular Import Section */}
        {mode === 'regular' && (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-5 w-5 text-indigo-600 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-indigo-900">ייבוא רגיל - כל השדות</h3>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Validate file type - must be Excel
                    const fileName = file.name.toLowerCase();
                    const validExtensions = ['.xlsx', '.xls'];
                    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

                    if (!isValidFile) {
                      setErrorModal({
                        isOpen: true,
                        message: 'יש לבחור קובץ Excel בלבד (.xlsx או .xls)',
                        title: 'סוג קובץ לא תקין'
                      });
                      e.target.value = '';
                      return;
                    }

                    handleFileUpload(e);
                  }
                }}
                disabled={isParsing}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>קורא קובץ...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>בחר קובץ לייבוא</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => downloadTemplate('excel')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                <span>הורד תבנית Excel</span>
              </button>

              <button
                type="button"
                onClick={() => downloadTemplate('csv')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                title="הורד תבנית CSV"
              >
                <Download className="h-4 w-4" />
                <span>הורד תבנית CSV</span>
              </button>
            </div>
            <p className="text-xs text-indigo-700">
              ייבוא מלא עם כל השדות. הקובץ חייב לכלול את כל העמודות הנדרשות לפי התבנית.
            </p>
          </div>
        </div>
        )}

        {/* Skeleton Import Section */}
        {mode === 'skeleton' && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-5 w-5 text-orange-600 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-orange-900">ייבוא שלד - מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם</h3>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <input
                ref={skeletonFileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Validate file type - must be Excel
                    const fileName = file.name.toLowerCase();
                    const validExtensions = ['.xlsx', '.xls'];
                    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

                    if (!isValidFile) {
                      setErrorModal({
                        isOpen: true,
                        message: 'יש לבחור קובץ Excel בלבד (.xlsx או .xls)',
                        title: 'סוג קובץ לא תקין'
                      });
                      e.target.value = '';
                      return;
                    }

                    handleSkeletonFileUpload(e);
                  }
                }}
                disabled={isParsing || isSaving}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => skeletonFileInputRef.current?.click()}
                disabled={isParsing || isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {isParsing || isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>מייבא שלד...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>ייבא שלד מקובץ</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => downloadSkeletonTemplate('excel')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                title="הורד תבנית שלד Excel - מזהה מבנה, מזהה נכס, אזור מס, מזהה משלם (כל השדות חובה)"
              >
                <Download className="h-4 w-4" />
                <span>הורד תבנית שלד Excel</span>
              </button>

              <button
                type="button"
                onClick={() => downloadSkeletonTemplate('csv')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                title="הורד תבנית שלד CSV"
              >
                <Download className="h-4 w-4" />
                <span>הורד תבנית שלד CSV</span>
              </button>
            </div>
            <p className="text-xs text-orange-700">
              ייבוא ישיר של נכסים. הקובץ חייב לכלול עמודות: מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם (כל השדות חובה)
            </p>
          </div>
        </div>
        )}

        {/* Imported Assets Grid */}
        {importedAssets.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                נכסים מיובאים ({importedAssets.length})
              </h2>
              {mode === 'regular' && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={importFromAutomation}
                    onChange={(e) => setImportFromAutomation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  הנתונים מאוטומציה
                </label>
              )}
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>מאמת...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>אמת</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelChanges}
                  disabled={isValidating || isSaving || originalImportedAssets.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  title="בטל שינויים והחזר למצב המקורי"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>ביטול</span>
                </button>
                <button
                  type="button"
                  onClick={() => mode === 'skeleton' ? handleImportSkeleton() : handleSave(false)}
                  disabled={
                    isValidating || 
                    isSaving || 
                    importedAssets.length === 0 || 
                    !validationCompleted || 
                    !allAssetsValid
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  title={
                    importedAssets.length === 0 
                      ? 'יש לטעון קובץ לפני שמירה' 
                      : !validationCompleted 
                        ? 'יש להריץ אימות לפני שמירה' 
                        : !allAssetsValid 
                          ? 'יש לתקן את כל השגיאות לפני שמירה' 
                          : ''
                  }
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>שומר...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>שמור</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!importedAssets || importedAssets.length === 0) {
                      setError('אין נכסים לייצוא');
                      setTimeout(() => setError(null), 3000);
                      return;
                    }
                    try {
                      const headers = ['מזהה מבנה', 'מזהה נכס', 'מזהה משלם', 'תאריך מדידה', 'סוג נכס ראשי', 'גודל נכס', 'סה"כ שטח נכס', 'אזור מס'];
                      const rows = displayedImportedAssets.map(asset => [
                        asset.building_number || '',
                        asset.asset_id || '',
                        asset.payer_id || '',
                        asset.measurement_date || '',
                        asset.main_asset_type || '',
                        asset.asset_size || '',
                        asset.asset_total_area ?? '',
                        asset.tax_region || ''
                      ]);
                      const data = [headers, ...rows];
                      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                      const filename = `${mode === 'regular' ? 'ייבוא_מלא' : 'ייבוא_שלד'}_${dateStr}.xlsx`;
                      exportToExcel({
                        filename,
                        sheetName: mode === 'regular' ? 'ייבוא מלא' : 'ייבוא שלד',
                        data,
                        columnWidths: [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }]
                      });
                      setSuccess(`יוצאו ${rows.length} נכסים בהצלחה`);
                      setTimeout(() => setSuccess(null), 3000);
                    } catch (error) {
                      console.error('Error exporting to Excel:', error);
                      setError('שגיאה בייצוא לקובץ Excel');
                      setTimeout(() => setError(null), 3000);
                    }
                  }}
                  disabled={importedAssets.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  title="ייצא ל-Excel"
                >
                  <Download className="h-4 w-4" />
                  <span>ייצא ל-Excel</span>
                </button>
                {mode === 'regular' && (
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={
                    isValidating || 
                    isSaving || 
                    importedAssets.length === 0 || 
                    !validationCompleted || 
                    !allAssetsValid
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  title={
                    importedAssets.length === 0 
                      ? 'יש לטעון קובץ לפני שמירה' 
                      : !validationCompleted 
                        ? 'יש להריץ אימות לפני שמירה' 
                        : !allAssetsValid 
                          ? 'יש לתקן את כל השגיאות לפני שמירה' 
                          : ''
                  }
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>שומר...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>שמור כמדידה חדשה</span>
                    </>
                  )}
                </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border-2 border-blue-400 w-full">
              <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
                <AgGridReact
                ref={gridRef}
                rowData={displayedImportedAssets}
                columnDefs={configuredColumnDefs}
                getRowStyle={getRowStyle}
                defaultColDef={{
                  resizable: true,
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
                  suppressColumnVirtualisation: true,
                  alwaysShowHorizontalScroll: true,
                  suppressMovableColumns: true,
                  suppressColumnMoveAnimation: true,
                }}
                domLayout="normal"
                onCellValueChanged={onCellValueChanged}
                onGridReady={async (params) => {
                  // Ensure all columns are visible and grid calculates proper width
                  params.api.refreshCells({ force: true });
                  // Scroll to left on grid ready
                  setTimeout(() => {
                    const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                    if (gridElement) {
                      gridElement.scrollLeft = 0;
                    }
                  }, 300);
                }}
                onFirstDataRendered={async (params) => {
                  // Scroll to left after data render
                  setTimeout(() => {
                    const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                    if (gridElement) {
                      gridElement.scrollLeft = 0;
                    }
                  }, 200);
                }}
                animateRows={false}
                enableRtl={true}
                suppressHorizontalScroll={false}
                stopEditingWhenCellsLoseFocus={true}
              />
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="border-t border-slate-200 pt-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            פורמט קובץ Excel
          </h2>
          
          {mode === 'skeleton' ? (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-slate-700 mb-3 text-sm font-medium">העמודות הנדרשות בקובץ Excel:</p>
              <div className="mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2 text-sm">שדות חובה (כל השדות):</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs mr-4">
                    <li><strong>מזהה מבנה</strong> (Building number)</li>
                    <li><strong>מזהה נכס</strong> (Asset ID)</li>
                    <li><strong>אזור מס</strong> (Tax region)</li>
                    <li><strong>מזהה משלם</strong> (Payer ID)</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-3">
                <span className="font-medium text-slate-700">ייבוא שלד - כל השדות חובה (מזהה מבנה, מזהה נכס, אזור מס, מזהה משלם)</span>
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-slate-700 mb-3 text-sm font-medium">העמודות הנדרשות בקובץ Excel:</p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2 text-sm">שדות חובה:</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs mr-4">
                    <li><strong>מזהה מבנה</strong> (Building number)</li>
                    <li><strong>מזהה משלם</strong> (Payer ID - אופציונלי)</li>
                    <li><strong>מזהה נכס</strong> (Asset ID)</li>
                    <li><strong>סוג נכס ראשי</strong> (Main asset type)</li>
                    <li><strong>גודל נכס ראשי</strong> (Asset size)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2 text-sm">שדות אופציונליים:</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs mr-4">
                    <li><strong>סוג נכס משנה 1-6</strong> (Sub asset types)</li>
                    <li><strong>גודל נכס משנה 1-6</strong> (Sub asset sizes)</li>
                    <li><strong>דירת גג</strong> (Penthouse)</li>
                    <li><strong>תאריך מדידה</strong> (Measurement date - יוגדר אוטומטית לתאריך הנוכחי אם לא מופיע)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Column Mapping Modal */}
      {showColumnMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  מיפוי עמודות
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowColumnMappingModal(false);
                  setFileHeaders([]);
                  setColumnMapping({});
                  setPendingFileLines([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 mb-4">
                אנא בחר עבור כל עמודה בקובץ את השדה המתאים במערכת. שדות חובה: מזהה מבנה ומזהה נכס
              </p>
              <div className="space-y-2">
                {fileHeaders.map((header, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg">
                    <div className="flex-1 text-right">
                      <span className="font-medium text-gray-700">{header || `עמודה ${index + 1}`}</span>
                    </div>
                    <div className="flex-1">
                      <select
                        value={columnMapping[index] || ''}
                        onChange={(e) => {
                          const newMapping = { ...columnMapping };
                          if (e.target.value) {
                            newMapping[index] = e.target.value;
                          } else {
                            delete newMapping[index];
                          }
                          setColumnMapping(newMapping);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-right"
                      >
                        <option value="">-- לא למפות --</option>
                        <option value="building_number">מזהה מבנה</option>
                        <option value="asset_id">מזהה נכס</option>
                        <option value="payer_id">מזהה משלם</option>
                        <option value="measurement_date">תאריך מדידה</option>
                        <option value="main_asset_type">סוג נכס ראשי</option>
                        <option value="asset_size">גודל נכס ראשי</option>
                        <option value="asset_total_area">סה"כ שטח נכס</option>
                        <option value="tax_region">אזור מס</option>
                        <option value="sub_asset_type_1">סוג נכס משנה 1</option>
                        <option value="sub_asset_size_1">גודל נכס משנה 1</option>
                        <option value="sub_asset_type_2">סוג נכס משנה 2</option>
                        <option value="sub_asset_size_2">גודל נכס משנה 2</option>
                        <option value="sub_asset_type_3">סוג נכס משנה 3</option>
                        <option value="sub_asset_size_3">גודל נכס משנה 3</option>
                        <option value="sub_asset_type_4">סוג נכס משנה 4</option>
                        <option value="sub_asset_size_4">גודל נכס משנה 4</option>
                        <option value="sub_asset_type_5">סוג נכס משנה 5</option>
                        <option value="sub_asset_size_5">גודל נכס משנה 5</option>
                        <option value="sub_asset_type_6">סוג נכס משנה 6</option>
                        <option value="sub_asset_size_6">גודל נכס משנה 6</option>
                        <option value="penthouse">דירת גג</option>
                        <option value="apartment_number">מספר דירה</option>
                        <option value="apartment_floor">קומת דירה</option>
                        <option value="storage_number">מספר מחסן</option>
                        <option value="storage_floor">קומת מחסן</option>
                        <option value="discount_type">סוג הנחה</option>
                        <option value="discount_date_from">תאריך הנחה מ</option>
                        <option value="discount_date_to">תאריך הנחה עד</option>
                        <option value="shared_parking_area">שטח חניה משותף</option>
                        <option value="number_of_parking_units">מספר יחידות חניה</option>
                        <option value="comment">הערה</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowColumnMappingModal(false);
                  setFileHeaders([]);
                  setColumnMapping({});
                  setPendingFileLines([]);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmMapping}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                המשך
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {errorModal.title || 'שגיאה'}
                </h2>
              </div>
              <button
                onClick={() => setErrorModal({ isOpen: false, message: '' })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="text-gray-700 whitespace-pre-wrap break-words">
                {errorModal.message}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t border-gray-200">
              <button
                onClick={() => setErrorModal({ isOpen: false, message: '' })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results Modal */}
      <ValidationResultModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        isLoading={isValidating}
        progress={validationProgress}
        context="import"
        batchResults={validationResults}
        batchTitle="תוצאות אימות ייבוא"
      />

      {/* Measurement Date Modal */}
      {showMeasurementDateModal && (
        <div 
          className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
            measurementDateModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          dir="rtl"
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-md w-full transition-all duration-300 ${
              measurementDateModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-bold text-white">הזן תאריך מדידה חדש</h2>
              <button
                type="button"
                onClick={() => {
                  setMeasurementDateModalClosing(true);
                  setTimeout(() => {
                    setShowMeasurementDateModal(false);
                    setPendingSaveAsNew(false);
                    setMeasurementDateModalClosing(false);
                  }, 300);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  תאריך מדידה (DD/MM/YYYY)
                </label>
                <input
                  type="text"
                  value={measurementDate}
                  onChange={(e) => {
                    // Allow only digits and forward slashes, max 10 chars
                    const value = e.target.value.replace(/[^\d/]/g, '').substring(0, 10);
                    setMeasurementDate(value);
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
                <p className="mt-2 text-xs text-slate-500">
                  התאריך יוחל על כל הנכסים המיובאים
                </p>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMeasurementDateModalClosing(true);
                  setTimeout(() => {
                    setShowMeasurementDateModal(false);
                    setPendingSaveAsNew(false);
                    setMeasurementDateModalClosing(false);
                  }, 300);
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConfirmMeasurementDate}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Building Creation Modal */}
      {showBuildingCreateModal && pendingBuildingNumber && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              // Don't close on click outside - user must create building or cancel
            }
            // Close address dropdown when clicking outside
            if (showAddressDropdown && addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node) && addressInputRef.current && !addressInputRef.current.contains(e.target as Node)) {
              setShowAddressDropdown(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => {
              e.stopPropagation();
              // Close address dropdown when clicking inside modal but outside dropdown
              if (showAddressDropdown && addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node) && addressInputRef.current && !addressInputRef.current.contains(e.target as Node)) {
                setShowAddressDropdown(false);
              }
            }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-slate-800">יצירת מבנה חדש</h3>
              <button
                onClick={() => {
                  setShowBuildingCreateModal(false);
                  setPendingBuildingNumber(null);
                  setBuildingCreateData({});
                  setAddressSearchValue('');
                  pendingImportCallback.current = null;
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
                disabled={isCreatingBuilding}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  מבנה {pendingBuildingNumber} לא קיים במערכת. יש ליצור את המבנה לפני המשך הייבוא.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      מזהה מבנה *
                    </label>
                    <input
                      type="number"
                      value={pendingBuildingNumber || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      אזור מס
                    </label>
                    <input
                      type="text"
                      value={buildingCreateData.tax_region || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                      placeholder={buildingCreateData.tax_region ? '' : 'יועבר מהנכסים המיובאים'}
                    />
                    {buildingValidationErrors.tax_region && (
                      <p className="mt-1 text-sm text-red-600">{buildingValidationErrors.tax_region}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח משותף מגורים
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.residence_shared_area || ''}
                      onChange={async (e) => {
                        const newData = { ...buildingCreateData, residence_shared_area: e.target.value ? parseFloat(e.target.value) : undefined };
                        setBuildingCreateData(newData);
                        await validateBuildingData(newData);
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        buildingValidationErrors.residence_shared_area 
                          ? 'border-red-500' 
                          : 'border-gray-300'
                      }`}
                      disabled={isCreatingBuilding}
                    />
                    {buildingValidationErrors.residence_shared_area && (
                      <p className="mt-1 text-sm text-red-600">{buildingValidationErrors.residence_shared_area}</p>
                    )}
                  </div>

                  {/* שטח משותף עסקים hidden when creating building during asset import */}
                  {false && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח משותף עסקים
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.business_shared_area || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, business_shared_area: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח לבקרה
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.area_for_control || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, area_for_control: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח חניה משותף
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.shared_parking_area ?? ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, shared_parking_area: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      מספר יחידות חניה
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={buildingCreateData.number_of_parking_units ?? ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, number_of_parking_units: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח בניין כולל
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.total_building_area || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                      disabled={true}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      אחוז העמסה (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.overload_ratio || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, overload_ratio: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                      placeholder="לדוגמה: 15.50"
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      כתובת (סמל רחוב)
                    </label>
                    <input
                      ref={addressInputRef}
                      type="text"
                      value={addressSearchValue || (buildingCreateData.building_address ? (() => {
                        const address = addressList.find(a => a.street_code === buildingCreateData.building_address);
                        return address ? `${address.street_code} - ${address.street_description}` : String(buildingCreateData.building_address);
                      })() : '')}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAddressSearchValue(value);
                        setShowAddressDropdown(true);
                        
                        // Try to parse as number and update building_address if valid
                        const parsed = Number(value.trim());
                        if (value.trim() === '') {
                          setBuildingCreateData(prev => ({ ...prev, building_address: undefined }));
                        } else if (!isNaN(parsed) && parsed > 0) {
                          const match = addressList.find(a => Number(a.street_code) === parsed);
                          if (match) {
                            setBuildingCreateData(prev => ({ ...prev, building_address: parsed }));
                          } else {
                            // Allow entering just the street code number
                            setBuildingCreateData(prev => ({ ...prev, building_address: parsed }));
                          }
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
                          setShowAddressDropdown(true);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setShowAddressDropdown(true);
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredAddresses.length === 1) {
                            const address = filteredAddresses[0];
                            setBuildingCreateData(prev => ({ ...prev, building_address: address.street_code }));
                            setAddressSearchValue(`${address.street_code} - ${address.street_description}`);
                            setShowAddressDropdown(false);
                          }
                        } else if (e.key === 'Escape') {
                          setShowAddressDropdown(false);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="חפש כתובת או הקלד סמל רחוב..."
                      disabled={isCreatingBuilding}
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
                        return null;
                      }
                      
                      return (
                        <div
                          ref={addressDropdownRef}
                          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
                        >
                          {filteredAddresses.slice(0, 20).map((address) => (
                            <div
                              key={address.id || `${address.street_code}-${address.street_description}`}
                              onClick={() => {
                                setBuildingCreateData(prev => ({ ...prev, building_address: address.street_code }));
                                setAddressSearchValue(`${address.street_code} - ${address.street_description}`);
                                setShowAddressDropdown(false);
                              }}
                              className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                            >
                              <div style={{ fontWeight: 'bold' }}>{address.street_code}</div>
                              <div style={{ fontSize: '0.85em', color: '#666' }}>{address.street_description}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="elevator"
                      checked={buildingCreateData.elevator === true}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, elevator: e.target.checked ? true : false }))}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      disabled={isCreatingBuilding}
                    />
                    <label htmlFor="elevator" className="text-sm font-medium text-slate-700 cursor-pointer">
                      מעלית
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="single_double_family"
                      checked={buildingCreateData.single_double_family === true}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, single_double_family: e.target.checked ? true : false }))}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      disabled={isCreatingBuilding}
                    />
                    <label htmlFor="single_double_family" className="text-sm font-medium text-slate-700 cursor-pointer">
                      בית פרטי חד/דו משפחתי
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="condo"
                      checked={buildingCreateData.condo === true}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, condo: e.target.checked ? true : false }))}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      disabled={isCreatingBuilding}
                    />
                    <label htmlFor="condo" className="text-sm font-medium text-slate-700 cursor-pointer">
                      בית משותף
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="townhouses"
                      checked={buildingCreateData.townhouses === true}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, townhouses: e.target.checked ? true : false }))}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      disabled={isCreatingBuilding}
                    />
                    <label htmlFor="townhouses" className="text-sm font-medium text-slate-700 cursor-pointer">
                      טוריים
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      גוש
                    </label>
                    <input
                      type="number"
                      value={buildingCreateData.gosh || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, gosh: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      חלקה
                    </label>
                    <input
                      type="number"
                      value={buildingCreateData.helka || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, helka: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      מספר בניין ברחוב
                    </label>
                    <input
                      type="number"
                      value={buildingCreateData.building_number_in_street || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, building_number_in_street: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowBuildingCreateModal(false);
                  setPendingBuildingNumber(null);
                  setBuildingCreateData({});
                  setAddressSearchValue('');
                  pendingImportCallback.current = null;
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isCreatingBuilding}
              >
                ביטול
              </button>
              <button
                onClick={() => pendingBuildingNumber && handleCreateBuildingAndContinue(pendingBuildingNumber)}
                disabled={isCreatingBuilding || !pendingBuildingNumber || Object.keys(buildingValidationErrors).length > 0}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isCreatingBuilding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    יוצר...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    צור והמשך ייבוא
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
