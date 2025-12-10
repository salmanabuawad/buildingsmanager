import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, CheckCircle, Loader2, X, Save, CheckCircle2, Trash2, RotateCcw } from 'lucide-react';
import { api, Asset, AssetType, Building, AddressList } from '../lib/api';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { useValidationRules } from '../contexts/ValidationContext';
import { buildingValidators } from '../lib/validation';
import { Toast } from './Toast';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import * as XLSX from 'xlsx';

interface ImportAssetRow {
  id: string;
  building_number: number | null;
  payer_id: string;
  asset_id: string;
  measurement_date: string;
  main_asset_type: string;
  asset_size: number;
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
  floor?: number;
  discount_type?: string;
  discount_date_from?: string;
  discount_date_to?: string;
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

  // Helper function to check if an asset type is not_accountable
  const isAssetTypeNotAccountable = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name
    const assetType = assetTypes.find(at => at.name === assetTypeName);
    return assetType?.not_accountable === true;
  }, [assetTypes]);

  // Helper function to check if an asset row is not_accountable
  const isAssetRowNotAccountable = useCallback((row: ImportAssetRow): boolean => {
    if (!row || !row.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountable(row.main_asset_type);
  }, [isAssetTypeNotAccountable]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, only main_asset_type is editable
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const row = params.data as ImportAssetRow;
    
    // For non-accountable assets, only main_asset_type is editable
    if (isAssetRowNotAccountable(row)) {
      return fieldName === 'main_asset_type';
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
  const [pendingSaveAsNew, setPendingSaveAsNew] = useState(false);
  const [validationCompleted, setValidationCompleted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skeletonFileInputRef = useRef<HTMLInputElement>(null);
  const [showBuildingCreateModal, setShowBuildingCreateModal] = useState(false);
  const [pendingBuildingNumber, setPendingBuildingNumber] = useState<number | null>(null);
  const [buildingCreateData, setBuildingCreateData] = useState<Partial<Building>>({});
  const [isCreatingBuilding, setIsCreatingBuilding] = useState(false);
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

      // Process headers - exact name matching only
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
        'floor': 'קומה',
        'discount_type': 'סוג הנחה',
        'discount_date_from': 'תאריך הנחה מ',
        'discount_date_to': 'תאריך הנחה עד'
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

      // Require headers - must have header row with field names
      // Check if we have valid headers (at least some key headers found)
      const hasRequiredHeaders = headerMap['building_number'] !== undefined && 
                                 headerMap['asset_id'] !== undefined;
      
      if (!hasRequiredHeaders || Object.keys(headerMap).length === 0) {
        throw new Error('קובץ חייב לכלול שורת כותרות עם שמות שדות. נדרש לפחות: מזהה מבנה ומזהה נכס');
      }

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
          floor: undefined,
          discount_type: undefined,
          discount_date_from: undefined,
          discount_date_to: undefined,
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
          if (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes') {
            asset.penthouse = 'כן';
          }
        }
        if (headerMap['floor'] !== undefined) {
          const value = values[headerMap['floor']] || '';
          asset.floor = value ? (isNaN(parseInt(value)) ? undefined : parseInt(value)) : undefined;
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

        assets.push(asset);
      }

      // Create deep copy for original state
      const assetsCopy = JSON.parse(JSON.stringify(assets));
      setImportedAssets(assets);
      setOriginalImportedAssets(assetsCopy); // Save original state for rollback
      setValidationCompleted(false); // Reset validation status when new file is loaded
    } catch (error) {
      alert(error instanceof Error ? error.message : 'שגיאה בקריאת קובץ File');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      alert(`שגיאה ביצירת מבנה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`);
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
                assetErrors.push('מספר מבנה חייב להיות מספר תקין');
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
              if (asset.asset_id && asset.asset_id.trim() !== '') {
                try {
                  const { getAllAssets, setAllAssets } = await import('../lib/validation');
                  // Ensure we have all assets loaded for uniqueness check
                  let allAssets = getAllAssets();
                  if (allAssets.length === 0) {
                    // If assets not loaded, load them now
                    const { api } = await import('../lib/api');
                    const loadedAssets = await api.assets.getAll();
                    setAllAssets(loadedAssets);
                    allAssets = loadedAssets;
                  }
                  // Check if asset_id already exists in database (any building)
                  const assetIdNum = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : asset.asset_id;
                  if (!isNaN(assetIdNum)) {
                    const existingAsset = allAssets.find((a: any) => {
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
      alert(error instanceof Error ? error.message : 'שגיאה באימות');
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
        throw new Error('קובץ ריק');
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
        throw new Error('קובץ חייב לכלול עמודות: מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם');
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
            errors.push(`שורה ${i + 1}: מספר מבנה חסר או לא תקין`);
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
        errors.push('לא נמצאו נכסים תקינים בקובץ. כל הנכסים חייבים לכלול: מספר מבנה, מזהה נכס, אזור מס ומזהה משלם.');
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
      alert('יש להריץ אימות לפני שמירה');
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

      const { supabase } = await import('../lib/supabase');

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
        floor: null,
        discount_type: null,
        discount_date_from: null,
        discount_date_to: null
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
          console.log(`[Skeleton Import] Filtered out ${duplicateIndices.length} duplicate assets, inserting ${assetsToInsertFiltered.length} unique assets`);
        }
      }
      
      // Final check: log sanitized assets for debugging
      console.log('[Skeleton Import] Inserting assets:', {
        total: sanitizedAssets.length,
        filtered: assetsToInsertFiltered.length,
        duplicates: sanitizedDuplicateAssetIds.size,
        assetIds: assetsToInsertFiltered.map(a => a.asset_id),
        uniqueAssetIds: [...seenAssetIds]
      });
      
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
      
      console.log('[Skeleton Import] Final insert check:', {
        before: finalAssetsToInsert.length,
        after: finalUniqueAssets.length,
        removed: finalAssetsToInsert.length - finalUniqueAssets.length
      });
      
      // Bulk insert skeleton assets - only unique ones
      const { data: insertedAssets, error: insertError } = await supabase
        .from('assets')
        .insert(finalUniqueAssets)
        .select();

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        // Check if it's a conflict (409) or duplicate key error
        if (insertError.code === '409' || insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique') || insertError.message?.includes('assets_asset_id_unique')) {
          // Get all asset_ids from the batch and check which ones exist in the database
          const assetIdsToCheck = validatedSkeletonAssets.map((a: ImportAssetRow) => a.asset_id).filter((id: any) => id != null);
          
          if (assetIdsToCheck.length > 0) {
            try {
              // Get existing assets with their building numbers
              const { data: existingAssets, error: checkError } = await supabase
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
                  errors.push(`שגיאה: מזהה נכס כפול בקובץ הייבוא. אנא בדוק שהנכסים לא מופיעים מספר פעמים בקובץ. פרטים: ${insertError.message}`);
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
        errors.push('אין נכסים תקינים לשמירה. כל הנכסים חייבים לכלול מספר מבנה ומזהה נכס תקינים וללא כפילויות.');
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

      // Prepare all valid assets for bulk insert
      const assetsToInsert: Partial<Asset>[] = validAssets.map(asset => {
        const assetData: Partial<Asset> = {
          building_number: asset.building_number!,
          payer_id: asset.payer_id || null,
          asset_id: asset.asset_id,
          measurement_date: saveAsNew && newMeasurementDate ? newMeasurementDate : asset.measurement_date,
          main_asset_type: asset.main_asset_type || null,
          asset_size: asset.asset_size || 0,
          tax_region: asset.tax_region || null,
          sub_asset_type_1: asset.sub_asset_type_1 || null,
          sub_asset_size_1: asset.sub_asset_size_1 || 0,
          sub_asset_type_2: asset.sub_asset_type_2 || null,
          sub_asset_size_2: asset.sub_asset_size_2 || 0,
          sub_asset_type_3: asset.sub_asset_type_3 || null,
          sub_asset_size_3: asset.sub_asset_size_3 || 0,
          sub_asset_type_4: asset.sub_asset_type_4 || null,
          sub_asset_size_4: asset.sub_asset_size_4 || 0,
          sub_asset_type_5: asset.sub_asset_type_5 || null,
          sub_asset_size_5: asset.sub_asset_size_5 || 0,
          sub_asset_type_6: asset.sub_asset_type_6 || null,
          sub_asset_size_6: asset.sub_asset_size_6 || 0,
          floor: asset.floor || null,
          discount_type: asset.discount_type || null,
          discount_date_from: asset.discount_date_from || null,
          discount_date_to: asset.discount_date_to || null
        };

        if (asset.penthouse === 'כן') {
          assetData.penthouse = 'כן';
        }

        return assetData;
      });

      // Use bulk insert via Supabase
      const { supabase } = await import('../lib/supabase');
      
      // Check which assets already exist and their building numbers (for both save and save as new)
      const assetIds = assetsToInsert.map(a => a.asset_id).filter(id => id != null);
      
      if (assetIds.length > 0) {
        // Check which assets already exist with their building numbers (bulk query)
        const { data: existingAssets, error: checkError } = await supabase
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
            const { error: deleteError } = await supabase
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
      const { data: insertedAssets, error: bulkError } = await supabase
        .from('assets')
        .insert(sanitizedAssets)
        .select();
      insertedAssetsResult = insertedAssets;

      if (bulkError) {
        // If bulk insert fails, try to identify which assets failed
        const errorMsg = bulkError.message || 'שגיאה בשמירה';
        
        // If it's a unique constraint violation (duplicate asset_id), check which assets are duplicates
        if (bulkError.code === '23505' || errorMsg.includes('assets_asset_id_unique') || errorMsg.includes('duplicate key')) {
          // Get all asset_ids from the batch and check which ones exist in the database (bulk query)
          const assetIdsToCheck = assetsToInsert.map(a => a.asset_id).filter(id => id != null);
          
          if (assetIdsToCheck.length > 0) {
            // Get existing assets with their building numbers
            const { data: existingAssets, error: checkError } = await supabase
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
                  const { error: deleteError } = await supabase
                    .from('assets')
                    .delete()
                    .in('asset_id', assetIdsToUpdate);
                  
                  if (deleteError) {
                    errors.push(`שגיאה בעדכון נכסים קיימים: ${deleteError.message}`);
                  }
                }
                
                // Insert all assets (both new and updated)
                const { data: newInserted, error: newError } = await supabase
                  .from('assets')
                  .insert(assetsToInsertFiltered)
                  .select();
                
                if (!newError && newInserted) {
                  successCount = newInserted.length;
                  // Store newInserted as insertedAssetsResult for removal tracking
                  insertedAssetsResult = newInserted;
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
            const { data: existingBuildings, error: buildingCheckError } = await supabase
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
      alert('יש להזין תאריך מדידה');
      return;
    }

    // Validate date format (DD/MM/YYYY)
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(measurementDate)) {
      alert('תאריך מדידה חייב להיות בפורמט DD/MM/YYYY');
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
                      alert(errorMessages.join('\n'));
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
      ];
    }

    // For regular mode, show all columns
    return [
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

        return (
          <div className="flex items-center gap-2 w-full px-2">
            {hasError && errorMessages.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Show error messages in a tooltip/alert format
                  alert(errorMessages.join('\n'));
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
      editable: true,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'כן';
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                params.setValue(newValue);
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        );
      },
      valueGetter: (params: any) => params.data?.penthouse === 'כן' ? 'כן' : null,
      valueSetter: (params: any) => {
        params.data.penthouse = params.newValue;
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
      field: 'floor',
      headerName: 'קומה',
      editable: true,
      type: 'numericColumn',
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
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
    }
  ];
  }, [t, assetTypes, handleDeleteRow, mode]);

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

  function downloadTemplate() {
    const headers = [
      'מזהה מבנה',
      'מזהה משלם',
      'מזהה נכס',
      'סוג נכס ראשי',
      'גודל נכס ראשי',
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
      'קומה',
      'סוג הנחה',
      'תאריך הנחה מ',
      'תאריך הנחה עד'
    ];

    const data = [headers];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'נכסים');
    XLSX.writeFile(workbook, 'assets_template.xlsx');
  }

  function downloadSkeletonTemplate() {
    const headers = [
      'מזהה מבנה',
      'מזהה נכס',
      'אזור מס',
      'מזהה משלם'
    ];

    const data = [headers];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'נכסים');
    XLSX.writeFile(workbook, 'assets_skeleton_template.xlsx');
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
            <Upload className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-indigo-900">ייבוא רגיל - כל השדות</h3>
          </div>
          <div className="space-y-3">
            <div className="flex gap-3">
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
                      alert('יש לבחור קובץ Excel בלבד (.xlsx או .xls)');
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                onClick={downloadTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                <span>הורד תבנית</span>
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
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-4 w-4 text-orange-600" />
            <h3 className="text-base font-semibold text-orange-900">ייבוא שלד - מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם</h3>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
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
                      alert('יש לבחור קובץ Excel בלבד (.xlsx או .xls)');
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium font-semibold"
              >
                {isParsing || isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>מייבא שלד...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    <span>ייבא שלד מקובץ</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={downloadSkeletonTemplate}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                title="הורד תבנית שלד - מזהה מבנה, מזהה נכס, אזור מס, מזהה משלם (כל השדות חובה)"
              >
                <Download className="h-3.5 w-3.5" />
                <span>הורד תבנית שלד</span>
              </button>
            </div>
            <p className="text-xs text-orange-700 leading-tight">
              ייבוא ישיר של נכסים. הקובץ חייב לכלול עמודות: מזהה מבנה, מזהה נכס, אזור מס ומזהה משלם (כל השדות חובה)
            </p>
          </div>
        </div>
        )}

        {/* Imported Assets Grid */}
        {importedAssets.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                נכסים מיובאים ({importedAssets.length})
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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

            <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%', minWidth: '100%' }}>
              <AgGridReact
                ref={gridRef}
                rowData={importedAssets}
                columnDefs={columnDefs}
                getRowStyle={getRowStyle}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  headerClass: 'ag-right-aligned-header',
                  minWidth: 100
                }}
                gridOptions={{
                  suppressColumnVirtualisation: true,
                  alwaysShowHorizontalScroll: true,
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
                animateRows={true}
                enableRtl={true}
                suppressHorizontalScroll={false}
              />
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
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConfirmMeasurementDate}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
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
                      מספר מבנה *
                    </label>
                    <input
                      type="number"
                      value={pendingBuildingNumber || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
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
                      value={buildingCreateData.shared_area || ''}
                      onChange={async (e) => {
                        const newData = { ...buildingCreateData, shared_area: e.target.value ? parseFloat(e.target.value) : undefined };
                        setBuildingCreateData(newData);
                        await validateBuildingData(newData);
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        buildingValidationErrors.shared_area 
                          ? 'border-red-500' 
                          : 'border-gray-300'
                      }`}
                      disabled={isCreatingBuilding}
                    />
                    {buildingValidationErrors.shared_area && (
                      <p className="mt-1 text-sm text-red-600">{buildingValidationErrors.shared_area}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      שטח משותף עסקים
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.shared_business_area || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, shared_business_area: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

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
                      שטח בניין כולל
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.total_building_area || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, total_building_area: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      אחוז העמסה
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buildingCreateData.overload_ratio || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, overload_ratio: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
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
                        const filteredAddresses = addressSearchValue.trim()
                          ? addressList.filter(a => 
                              String(a.street_code).includes(addressSearchValue) ||
                              a.street_description?.toLowerCase().includes(addressSearchValue.toLowerCase()) ||
                              `${a.street_code} - ${a.street_description}`.toLowerCase().includes(addressSearchValue.toLowerCase())
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
                      const filteredAddresses = addressSearchValue.trim()
                        ? addressList.filter(a => 
                            String(a.street_code).includes(addressSearchValue) ||
                            a.street_description?.toLowerCase().includes(addressSearchValue.toLowerCase()) ||
                            `${a.street_code} - ${a.street_description}`.toLowerCase().includes(addressSearchValue.toLowerCase())
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
                              key={address.street_code}
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

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      מעלית
                    </label>
                    <select
                      value={buildingCreateData.elevator || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, elevator: e.target.value || undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    >
                      <option value="">-- בחר --</option>
                      <option value="כן">כן</option>
                      <option value="לא">לא</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      בית פרטי חד/דו משפחתי
                    </label>
                    <select
                      value={buildingCreateData.single_double_family || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, single_double_family: e.target.value || undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    >
                      <option value="">-- בחר --</option>
                      <option value="כן">כן</option>
                      <option value="לא">לא</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      בית משותף
                    </label>
                    <select
                      value={buildingCreateData.condo || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, condo: e.target.value || undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    >
                      <option value="">-- בחר --</option>
                      <option value="כן">כן</option>
                      <option value="לא">לא</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      טוריים
                    </label>
                    <select
                      value={buildingCreateData.townhouses || ''}
                      onChange={(e) => setBuildingCreateData(prev => ({ ...prev, townhouses: e.target.value || undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreatingBuilding}
                    >
                      <option value="">-- בחר --</option>
                      <option value="כן">כן</option>
                      <option value="לא">לא</option>
                    </select>
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
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
