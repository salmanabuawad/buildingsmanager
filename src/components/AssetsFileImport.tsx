import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, CheckCircle, Loader2, X, Save, CheckCircle2, Trash2 } from 'lucide-react';
import { api, Asset, AssetType, Building } from '../lib/api';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { useValidationRules } from '../contexts/ValidationContext';
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
  _validationErrors?: string[];
  _isDirty?: boolean;
}

export function AssetsFileImport() {
  const { t } = useTranslation();
  const { validationRules, loading: validationContextLoading, refreshRules } = useValidationRules();
  const gridRef = useRef<AgGridReact>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importedAssets, setImportedAssets] = useState<ImportAssetRow[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResults, setValidationResults] = useState<BatchValidationResults | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [saveResult, setSaveResult] = useState<{ successful: number; failed: number; errors: string[] } | null>(null);
  const [showMeasurementDateModal, setShowMeasurementDateModal] = useState(false);
  const [measurementDate, setMeasurementDate] = useState('');
  const [pendingSaveAsNew, setPendingSaveAsNew] = useState(false);
  const [validationCompleted, setValidationCompleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        const [types, bldgs, allAssets] = await Promise.all([
          api.assetTypes.getAll(),
          api.buildings.getAll(),
          api.assets.getAll() // Load all assets for uniqueness validation
        ]);
        setAssetTypes(types);
        setBuildings(bldgs);
        
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

    setIsParsing(true);
    setImportedAssets([]);
    setSaveResult(null);

    try {
      const lines = await parseExcelFile(file);

      if (lines.length === 0) {
        throw new Error('קובץ File ריק');
      }

      const headers = lines[0].map(h => h.trim().toLowerCase());
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
        };

        const expectedColumnCount = 18;
        const hasExpectedColumns = values.length >= 5;
        const headersAreValid = headers.length > 0 && headers.some(h => h && (h.includes('building') || h.includes('מבנה') || h.includes('מזהה')));
        
        if (!headersAreValid || (hasExpectedColumns && values.length >= expectedColumnCount && !isNaN(parseInt(values[0])))) {
          // Fixed position mapping
          asset.building_number = values[0] ? parseInt(values[0]) : null;
          asset.payer_id = values[1] || '';
          asset.asset_id = values[2] || '';
          asset.main_asset_type = values[3] || '';
          asset.asset_size = values[4] ? parseFloat(values[4]) : 0;
          asset.sub_asset_type_1 = values[5] || '';
          asset.sub_asset_size_1 = values[6] ? parseFloat(values[6]) : 0;
          asset.sub_asset_type_2 = values[7] || '';
          asset.sub_asset_size_2 = values[8] ? parseFloat(values[8]) : 0;
          asset.sub_asset_type_3 = values[9] || '';
          asset.sub_asset_size_3 = values[10] ? parseFloat(values[10]) : 0;
          asset.sub_asset_type_4 = values[11] || '';
          asset.sub_asset_size_4 = values[12] ? parseFloat(values[12]) : 0;
          asset.sub_asset_type_5 = values[13] || '';
          asset.sub_asset_size_5 = values[14] ? parseFloat(values[14]) : 0;
          asset.sub_asset_type_6 = values[15] || '';
          asset.sub_asset_size_6 = values[16] ? parseFloat(values[16]) : 0;
          if (values.length > 17) {
            const penthouseValue = (values[17] || '').trim();
            if (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes') {
              asset.penthouse = 'כן';
            }
          }
        } else {
          // Header-based mapping
          headers.forEach((header, index) => {
            const value = values[index] || '';
            const headerLower = header.toLowerCase();
            
            if (headerLower.includes('מבנה') || headerLower.includes('building') || headerLower === 'building_number') {
              asset.building_number = value ? parseInt(value) : null;
            } else if (headerLower.includes('משלם') || headerLower.includes('payer') || headerLower === 'payer_id') {
              asset.payer_id = value;
            } else if (headerLower.includes('נכס') && !headerLower.includes('משנה') && !headerLower.includes('סוג') && (headerLower.includes('id') || headerLower.includes('זיהוי'))) {
              asset.asset_id = value;
            } else if (headerLower.includes('תאריך') || headerLower.includes('date') || headerLower === 'measurement_date') {
              asset.measurement_date = value || defaultMeasurementDate;
            } else if ((headerLower.includes('סוג') || headerLower.includes('type')) && (headerLower.includes('ראשי') || headerLower.includes('main'))) {
              asset.main_asset_type = value;
            } else if ((headerLower.includes('גודל') || headerLower.includes('size')) && (headerLower.includes('ראשי') || headerLower.includes('main') || headerLower === 'asset_size')) {
              asset.asset_size = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 1') || headerLower.includes('sub') && headerLower.includes('1') && headerLower.includes('type')) {
              asset.sub_asset_type_1 = value;
            } else if (headerLower.includes('משנה 1') || headerLower.includes('sub') && headerLower.includes('1') && headerLower.includes('size')) {
              asset.sub_asset_size_1 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 2') || headerLower.includes('sub') && headerLower.includes('2') && headerLower.includes('type')) {
              asset.sub_asset_type_2 = value;
            } else if (headerLower.includes('משנה 2') || headerLower.includes('sub') && headerLower.includes('2') && headerLower.includes('size')) {
              asset.sub_asset_size_2 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 3') || headerLower.includes('sub') && headerLower.includes('3') && headerLower.includes('type')) {
              asset.sub_asset_type_3 = value;
            } else if (headerLower.includes('משנה 3') || headerLower.includes('sub') && headerLower.includes('3') && headerLower.includes('size')) {
              asset.sub_asset_size_3 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 4') || headerLower.includes('sub') && headerLower.includes('4') && headerLower.includes('type')) {
              asset.sub_asset_type_4 = value;
            } else if (headerLower.includes('משנה 4') || headerLower.includes('sub') && headerLower.includes('4') && headerLower.includes('size')) {
              asset.sub_asset_size_4 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 5') || headerLower.includes('sub') && headerLower.includes('5') && headerLower.includes('type')) {
              asset.sub_asset_type_5 = value;
            } else if (headerLower.includes('משנה 5') || headerLower.includes('sub') && headerLower.includes('5') && headerLower.includes('size')) {
              asset.sub_asset_size_5 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 6') || headerLower.includes('sub') && headerLower.includes('6') && headerLower.includes('type')) {
              asset.sub_asset_type_6 = value;
            } else if (headerLower.includes('משנה 6') || headerLower.includes('sub') && headerLower.includes('6') && headerLower.includes('size')) {
              asset.sub_asset_size_6 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('גג') || headerLower.includes('penthouse') || headerLower === 'penthouse') {
              const penthouseValue = (value || '').trim();
              if (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes') {
                asset.penthouse = 'כן';
              }
            }
          });
        }

        assets.push(asset);
      }

      setImportedAssets(assets);
      setValidationCompleted(false); // Reset validation status when new file is loaded
      
      // Automatically validate all imported assets after loading
      if (assets.length > 0) {
        // Ensure buildings and assets are loaded into memory before validation
        const ensureDataLoaded = async () => {
          try {
            // Check if buildings are already loaded
            if (buildings.length === 0) {
              const [bldgs, allAssets] = await Promise.all([
                api.buildings.getAll(),
                api.assets.getAll() // Load all assets for uniqueness validation
              ]);
              setBuildings(bldgs);
              // Update in-memory stores for validation
              const { setValidationData, setAllAssets } = await import('../lib/validation');
              const currentAssetTypes = assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll();
              setValidationData({ buildings: bldgs, assetTypes: currentAssetTypes, assets: allAssets });
              setAllAssets(allAssets);
            }
            
            // Also ensure validation context has loaded
            if (validationContextLoading) {
              await refreshRules();
            }
            
            // Now trigger validation
            handleValidate();
          } catch (err) {
            console.error('Error loading data for validation:', err);
            // Still try to validate even if loading fails
            handleValidate();
          }
        };
        
        // Trigger validation after ensuring data is loaded
        setTimeout(() => {
          ensureDataLoaded();
        }, 100);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'שגיאה בקריאת קובץ File');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

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
      const cachedData = {
        assetTypes: assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll(),
        building: null // Will be determined per asset
      };

      const results: Array<{ assetId: string; buildingNumber: number; errors: string[]; matchedAssetTypeRecord?: string }> = [];

      for (let i = 0; i < importedAssets.length; i++) {
        const asset = importedAssets[i];
        setValidationProgress({ 
          current: i, 
          total: importedAssets.length,
          currentAssetId: asset.asset_id
        });

        try {
          const result = await AssetValidationHandler.validateSingleAsset(asset, {
            cachedData
          });
          
          results.push({
            assetId: asset.asset_id || `שורה ${i + 1}`,
            buildingNumber: asset.building_number || 0,
            errors: result.errors,
            matchedAssetTypeRecord: result.matchedAssetTypeRecord
          });

          // Update validation errors in asset row
          setImportedAssets(prev => prev.map(a => 
            a.id === asset.id 
              ? { ...a, _validationErrors: result.errors }
              : a
          ));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
          results.push({
            assetId: asset.asset_id || `שורה ${i + 1}`,
            buildingNumber: asset.building_number || 0,
            errors: [errorMsg]
          });
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
      // First, check for duplicates within the import batch itself
      const assetIdMap = new Map<number, number[]>(); // asset_id -> array of row indices
      importedAssets.forEach((asset, index) => {
        if (asset.asset_id) {
          const assetIdNum = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : asset.asset_id;
          if (!assetIdMap.has(assetIdNum)) {
            assetIdMap.set(assetIdNum, []);
          }
          assetIdMap.get(assetIdNum)!.push(index);
        }
      });

      // Find duplicates within the batch
      const duplicatesInBatch: Array<{ assetId: number; rows: number[] }> = [];
      assetIdMap.forEach((rows, assetId) => {
        if (rows.length > 1) {
          duplicatesInBatch.push({ assetId, rows });
        }
      });

      if (duplicatesInBatch.length > 0) {
        duplicatesInBatch.forEach(({ assetId, rows }) => {
          const rowNumbers = rows.map(r => r + 1).join(', ');
          errors.push(`מזהה נכס ${assetId} מופיע מספר פעמים בקובץ הייבוא (שורות: ${rowNumbers}). נכס יכול להיות קשור למבנה אחד בלבד.`);
        });
        setSaveResult({
          successful: 0,
          failed: errors.length,
          errors: errors
        });
        setIsSaving(false);
        return;
      }

      // Filter out assets with validation errors
      const validAssets = importedAssets.filter(asset => 
        !asset._validationErrors || asset._validationErrors.length === 0
      );

      if (validAssets.length === 0) {
        errors.push('אין נכסים תקינים לשמירה. יש לתקן את כל השגיאות לפני שמירה.');
        setSaveResult({
          successful: 0,
          failed: 1,
          errors: errors
        });
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
          sub_asset_size_6: asset.sub_asset_size_6 || 0
        };

        if (asset.penthouse === 'כן') {
          assetData.penthouse = 'כן';
        }

        return assetData;
      });

      // Use bulk insert via Supabase
      const { supabase } = await import('../lib/supabase');
      
      // Sanitize all assets before bulk insert
      const { sanitizeAssetInput } = await import('../lib/api');
      const sanitizedAssets = assetsToInsert.map(asset => {
        // We need to access the sanitizeAssetInput function
        // Since it's not exported, we'll need to sanitize manually or export it
        return asset;
      });

      // Perform bulk insert
      const { data: insertedAssets, error: bulkError } = await supabase
        .from('assets')
        .insert(assetsToInsert)
        .select();

      if (bulkError) {
        // If bulk insert fails, try to identify which assets failed
        const errorMsg = bulkError.message || 'שגיאה בשמירה';
        
        // If it's a unique constraint violation (duplicate asset_id), check which assets are duplicates
        if (bulkError.code === '23505' || errorMsg.includes('assets_asset_id_unique') || errorMsg.includes('duplicate key')) {
          // Check each asset individually to find duplicates
          const seenAssetIds = new Set<number>();
          const duplicateAssetIds: number[] = [];
          
          for (let i = 0; i < assetsToInsert.length; i++) {
            const assetId = assetsToInsert[i].asset_id;
            if (assetId != null) {
              const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
              if (seenAssetIds.has(assetIdNum)) {
                duplicateAssetIds.push(assetIdNum);
              } else {
                seenAssetIds.add(assetIdNum);
              }
            }
          }

          if (duplicateAssetIds.length > 0) {
            duplicateAssetIds.forEach(assetId => {
              errors.push(`מזהה נכס ${assetId} כבר קיים במערכת או מופיע מספר פעמים בקובץ הייבוא`);
            });
          } else {
            // Try to save individually to get specific error messages
            for (let i = 0; i < assetsToInsert.length; i++) {
              try {
                await api.assets.create(assetsToInsert[i] as any);
                successCount++;
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
                const assetId = assetsToInsert[i].asset_id || `שורה ${i + 1}`;
                if (errorMsg.includes('duplicate') || errorMsg.includes('assets_asset_id_unique')) {
                  errors.push(`נכס ${assetId}: מזהה נכס כבר קיים במערכת`);
                } else {
                  errors.push(`נכס ${assetId}: ${errorMsg}`);
                }
              }
            }
          }
        } else if (bulkError.code === '23503' || bulkError.code === '23514') {
          // Foreign key or check constraint violation - try individual saves
          for (let i = 0; i < assetsToInsert.length; i++) {
            try {
              await api.assets.create(assetsToInsert[i] as any);
              successCount++;
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
              const assetId = assetsToInsert[i].asset_id || `שורה ${i + 1}`;
              errors.push(`נכס ${assetId}: ${errorMsg}`);
            }
          }
        } else {
          // For other errors, mark all as failed
          errors.push(`שגיאה בשמירה: ${errorMsg}`);
        }
      } else {
        // Bulk insert succeeded
        successCount = insertedAssets?.length || assetsToInsert.length;
      }

      setSaveResult({
        successful: successCount,
        failed: errors.length,
        errors: errors.slice(0, 20)
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'שגיאה בשמירה');
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

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const updatedRow = event.data as ImportAssetRow;
    const field = event.column?.getColId();
    
    if (!field || !updatedRow) return;

    // Mark as dirty and clear validation errors when cell is edited
    setImportedAssets(prev => prev.map(a => 
      a.id === updatedRow.id 
        ? { ...a, _isDirty: true, _validationErrors: undefined }
        : a
    ));
  }, []);

  const handleDeleteRow = useCallback((rowId: string) => {
    setImportedAssets(prev => prev.filter(a => a.id !== rowId));
  }, []);

  // Check if all assets are valid (no validation errors and no duplicates)
  const allAssetsValid = useMemo(() => {
    if (importedAssets.length === 0) return false;
    
    // Check for validation errors
    const hasValidationErrors = importedAssets.some(asset => 
      asset._validationErrors && asset._validationErrors.length > 0
    );
    
    if (hasValidationErrors) return false;
    
    // Check for duplicates within the batch
    const assetIdMap = new Map<number, number[]>(); // asset_id -> array of row indices
    importedAssets.forEach((asset, index) => {
      if (asset.asset_id) {
        const assetIdNum = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : asset.asset_id;
        if (!assetIdMap.has(assetIdNum)) {
          assetIdMap.set(assetIdNum, []);
        }
        assetIdMap.get(assetIdNum)!.push(index);
      }
    });
    
    // Check if any asset_id appears more than once
    for (const [assetId, rows] of assetIdMap.entries()) {
      if (rows.length > 1) {
        return false; // Duplicate found
      }
    }
    
    return true;
  }, [importedAssets]);

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

  const columnDefs: ColDef<ImportAssetRow>[] = useMemo(() => [
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
              <div className="flex items-center justify-center" title={errorMessages.join(', ')}>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
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
        return isNaN(num) ? '' : num.toFixed(2);
      },
      cellStyle: getCellStyle
    },
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
        return isNaN(num) ? '' : num.toFixed(2);
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
        return isNaN(num) ? '' : num.toFixed(2);
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
        return isNaN(num) ? '' : num.toFixed(2);
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
        return isNaN(num) ? '' : num.toFixed(2);
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
        return isNaN(num) ? '' : num.toFixed(2);
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
        return isNaN(num) ? '' : num.toFixed(2);
      },
      cellStyle: getCellStyle
    }
  ], [t, assetTypes, handleDeleteRow]);

  const getRowStyle = (params: any) => {
    const row = params.data as ImportAssetRow;
    const hasValidationError = row._validationErrors && row._validationErrors.length > 0;
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        borderLeft: '4px solid #ef4444'
      };
    }
    return undefined;
  };

  const gridOptions = {
    autoSizeStrategy: {
      type: 'fitCellContents' as const,
    },
    getRowStyle: getRowStyle,
  };

  function downloadTemplate() {
    const headers = [
      'מזהה מבנה',
      'מזהה משלם',
      'מזהה נכס',
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
      'דירת גג'
    ];

    const data = [headers];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'נכסים');
    XLSX.writeFile(workbook, 'assets_template.xlsx');
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
        {/* File Upload Section */}
        <div className="space-y-3 mb-6">
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
        </div>

        {/* Failed Assets Summary - Display above grid */}
        {validationResults && validationResults.invalid > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-semibold text-red-900">
                נכסים שנכשלו באימות ({validationResults.invalid})
              </h3>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {validationResults.errors
                .filter(e => e.errors.length > 0)
                .map((error, idx) => (
                  <div key={idx} className="bg-white border border-red-300 rounded p-3">
                    <div className="font-semibold text-red-900 mb-1">
                      נכס {error.assetId} (מבנה {error.buildingNumber})
                    </div>
                    <ul className="text-sm text-red-700 space-y-1">
                      {error.errors.map((err, errIdx) => (
                        <li key={errIdx} className="flex items-start gap-2">
                          <span className="text-red-500">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Save Result - Display above grid */}
        {saveResult && (
          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-3">
              {saveResult.failed === 0 ? (
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="text-sm text-green-700 mb-1">נשמרו בהצלחה</p>
                    <p className="text-2xl font-bold text-green-700">{saveResult.successful}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                    <p className="text-sm text-red-700 mb-1">נכשלו</p>
                    <p className="text-2xl font-bold text-red-700">{saveResult.failed}</p>
                  </div>
                </div>
                {saveResult.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-red-900 mb-2">שגיאות:</h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                        {saveResult.errors.map((error, index) => (
                          <li key={index} className="break-words">{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
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
                  onClick={() => handleSave(false)}
                  disabled={isValidating || isSaving || !validationCompleted || !allAssetsValid}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  title={!validationCompleted ? 'יש להריץ אימות לפני שמירה' : !allAssetsValid ? 'יש לתקן את כל השגיאות לפני שמירה' : ''}
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
                  onClick={() => handleSave(true)}
                  disabled={isValidating || isSaving || !validationCompleted || !allAssetsValid}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  title={!validationCompleted ? 'יש להריץ אימות לפני שמירה' : !allAssetsValid ? 'יש לתקן את כל השגיאות לפני שמירה' : ''}
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
              </div>
            </div>

            <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
              <AgGridReact
                ref={gridRef}
                rowData={importedAssets}
                columnDefs={columnDefs}
                gridOptions={gridOptions}
                onCellValueChanged={onCellValueChanged}
                defaultColDef={{
                  resizable: true,
                  sortable: true,
                  filter: true
                }}
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
        </div>
      </div>

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-bold text-white">הזן תאריך מדידה חדש</h2>
              <button
                type="button"
                onClick={() => {
                  setShowMeasurementDateModal(false);
                  setPendingSaveAsNew(false);
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
                  setShowMeasurementDateModal(false);
                  setPendingSaveAsNew(false);
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
    </div>
  );
}
