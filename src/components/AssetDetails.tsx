import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Loader2, Save, X, AlertCircle, Upload, Eye, CheckCircle2, Copy, FileText } from 'lucide-react';
import { Toast } from './Toast';
import { PDFViewer } from './PDFViewer';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams } from 'ag-grid-community';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { supabase } from '../lib/supabase';
import { useGridPreferences } from '../hooks/useGridPreferences';
import { ValidationResultModal, SingleAssetValidationResult, ValidationProgress } from './ValidationResultModal';

interface AssetDetailsProps {
  assetId: number;
  onDataUpdate?: () => void;
}

export function AssetDetails({ assetId, onDataUpdate }: AssetDetailsProps) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [allMeasurements, setAllMeasurements] = useState<Asset[]>([]);
  const [originalMeasurements, setOriginalMeasurements] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<number, Partial<Asset>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<number, Map<string, string>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationResults, setValidationResults] = useState<SingleAssetValidationResult | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [measurementDateModalOpen, setMeasurementDateModalOpen] = useState(false);
  const [newMeasurementDate, setNewMeasurementDate] = useState<string>('');
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const historyGridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'asset_details_column_state');
  const { loadColumnState: loadHistoryColumnState, saveColumnState: saveHistoryColumnState, columnStateLoaded: historyColumnStateLoaded } = useGridPreferences(historyGridRef, 'asset_details_history_column_state');

  // Find the latest measurement (from assets table, is_latest=true)
  const latestMeasurement = useMemo(() => {
    return allMeasurements.find(m => m.is_latest === true) || null;
  }, [allMeasurements]);

  // Pin the first row (latest measurement) at the top
  const pinnedTopRowData = useMemo(() => {
    if (latestMeasurement) {
      return [latestMeasurement];
    }
    return [];
  }, [latestMeasurement]);

  // Get history rows (all except the latest)
  const historyRows = useMemo(() => {
    return allMeasurements.filter(m => m.is_latest !== true);
  }, [allMeasurements]);

  const assetTaxRegion = useMemo(() => {
    if (!asset?.main_asset_type || assetTypes.length === 0) return null;
    const assetType = assetTypes.find(at => String(at.name) === String(asset.main_asset_type));
    return assetType?.tax_region || null;
  }, [asset?.main_asset_type, assetTypes]);

  const getRowStyle = useCallback((params: any) => {
    const assetId = params.data?.id;
    if (!assetId) return undefined;

    const assetErrors = validationErrors.get(assetId);
    const hasErrors = assetErrors && assetErrors.size > 0;

    const asset = params.data as Asset;
    const numericRegex = /^[0-9]+$/;
    const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
    const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);
    const isLatest = asset.is_latest === true;

    const baseStyle: any = {
      opacity: isLatest ? 1 : 0.7,
      fontSize: isLatest ? '1.2em' : undefined,
      fontWeight: isLatest ? '600' : undefined,
      fontStyle: isLatest ? 'normal' : 'italic'
    };

    if (hasErrors || hasInvalidPayerId || hasInvalidAssetId) {
      return {
        ...baseStyle,
        border: '3px solid #ef4444',
        borderRadius: '4px',
        background: '#fee2e2'
      };
    }

    if (!isLatest) {
      baseStyle.background = '#f9fafb';
      baseStyle.borderLeft = '3px solid #d1d5db';
    }

    return baseStyle;
  }, [validationErrors]);

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef, node } = event;
      const field = colDef.field;
      const assetId = data.id;
      
      // Only allow editing for latest records
      if (data.is_latest !== true) {
        console.warn('[AssetDetails] Attempted to edit non-latest record, ignoring change');
        event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
        return;
      }
      
      let newValue = event.newValue;

      // Update the data directly in the node (AG-Grid already does this, but ensure it's set)
      data[field] = newValue;

      // Track the change in dirtyAssets (for saving later)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, [field]: newValue });
        return newMap;
      });

      // Clear validation errors for this asset (will be re-validated)
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });

      // Use the current node data (which AG-Grid has already updated)
      const updatedAsset = data;

      // If measurement_date field is being changed, validate format immediately
      if (field === 'measurement_date') {
        const dateValidation = inputValidators.validateDateFormat(newValue);
        if (!dateValidation.valid) {
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const errorMap = new Map<string, string>();
            errorMap.set(field, dateValidation.error || 'תאריך חייב להיות בפורמט DD/MM/YYYY');
            newMap.set(assetId, errorMap);
            return newMap;
          });
          // Refresh only the specific cell that has the error
          event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
          return;
        }
      }

      const shouldValidateSubAssets = updatedAsset.main_asset_type === '199' || updatedAsset.main_asset_type === '299';
      const validations = [
        inputValidators.validateDateFormat(updatedAsset.measurement_date),
        assetValidators.validateBuildingNumber(updatedAsset.building_number),
        assetValidators.validateAssetId(updatedAsset.asset_id),
        assetValidators.validateAssetIdNotInOtherBuilding(updatedAsset.asset_id, updatedAsset.building_number, typeof assetId === 'number' ? assetId : undefined),
        assetValidators.validatePayerId(updatedAsset.payer_id),
        assetValidators.validateAssetType(updatedAsset.main_asset_type, 'main_asset_type'),
        assetValidators.validateMainAssetTypeComplete(updatedAsset.building_number, updatedAsset.main_asset_type, updatedAsset.asset_size, updatedAsset),
        assetValidators.validateOnlyComplexTypesCanHaveSubAssets(updatedAsset.main_asset_type, [
          updatedAsset.sub_asset_type_1,
          updatedAsset.sub_asset_type_2,
          updatedAsset.sub_asset_type_3,
          updatedAsset.sub_asset_type_4,
          updatedAsset.sub_asset_type_5,
          updatedAsset.sub_asset_type_6
        ]),
        assetValidators.validateComplexTypesMustHaveSubAssets(updatedAsset.main_asset_type, [
          updatedAsset.sub_asset_type_1,
          updatedAsset.sub_asset_type_2,
          updatedAsset.sub_asset_type_3,
          updatedAsset.sub_asset_type_4,
          updatedAsset.sub_asset_type_5,
          updatedAsset.sub_asset_type_6
        ])
      ];

      if (shouldValidateSubAssets) {
        validations.push(
          assetValidators.validateMinimumSubAssets([
            updatedAsset.sub_asset_type_1,
            updatedAsset.sub_asset_type_2,
            updatedAsset.sub_asset_type_3,
            updatedAsset.sub_asset_type_4,
            updatedAsset.sub_asset_type_5,
            updatedAsset.sub_asset_type_6
          ])
        );
      }

      validations.push(
        assetValidators.validateSubAssetSizeMatchesMain(
          updatedAsset.asset_size,
          [
            updatedAsset.sub_asset_type_1,
            updatedAsset.sub_asset_type_2,
            updatedAsset.sub_asset_type_3,
            updatedAsset.sub_asset_type_4,
            updatedAsset.sub_asset_type_5,
            updatedAsset.sub_asset_type_6
          ],
          [
            updatedAsset.sub_asset_size_1,
            updatedAsset.sub_asset_size_2,
            updatedAsset.sub_asset_size_3,
            updatedAsset.sub_asset_size_4,
            updatedAsset.sub_asset_size_5,
            updatedAsset.sub_asset_size_6
          ]
        ),
        assetValidators.validateSubAssetsFor199Or299(
          updatedAsset.building_number,
          updatedAsset.main_asset_type,
          updatedAsset.asset_size,
          [
            updatedAsset.sub_asset_type_1,
            updatedAsset.sub_asset_type_2,
            updatedAsset.sub_asset_type_3,
            updatedAsset.sub_asset_type_4,
            updatedAsset.sub_asset_type_5,
            updatedAsset.sub_asset_type_6
          ],
          [
            updatedAsset.sub_asset_size_1,
            updatedAsset.sub_asset_size_2,
            updatedAsset.sub_asset_size_3,
            updatedAsset.sub_asset_size_4,
            updatedAsset.sub_asset_size_5,
            updatedAsset.sub_asset_size_6
          ]
        )
      );

      if (updatedAsset.sub_asset_type_1) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_1, updatedAsset.sub_asset_size_1, undefined, undefined, updatedAsset));
      }
      if (updatedAsset.sub_asset_type_2) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_2, updatedAsset.sub_asset_size_2, undefined, undefined, updatedAsset));
      }
      if (updatedAsset.sub_asset_type_3) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_3, updatedAsset.sub_asset_size_3, undefined, undefined, updatedAsset));
      }
      if (updatedAsset.sub_asset_type_4) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_4, updatedAsset.sub_asset_size_4, undefined, undefined, updatedAsset));
      }
      if (updatedAsset.sub_asset_type_5) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_5, updatedAsset.sub_asset_size_5, undefined, undefined, updatedAsset));
      }
      if (updatedAsset.sub_asset_type_6) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_6, updatedAsset.sub_asset_size_6, undefined, undefined, updatedAsset));
      }

      const validation = await validateAll(validations);

      if (!validation.valid) {
        const detailedError = validation.error || 'Unknown validation error';
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          const errorMap = new Map<string, string>();
          errorMap.set(field, detailedError);
          newMap.set(assetId, errorMap);
          return newMap;
        });
        // Refresh only the specific cell that has the error
        event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
        return;
      }

      // Don't update allMeasurements state - AG-Grid already updated the node data
      // Only refresh the specific cell that changed to update styling
      event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
    } catch (err) {
      console.error('Validation error:', err);
    }
  }, []);

  const hasChanges = dirtyAssets.size > 0;

  async function handleSaveChanges() {
    if (validationErrors.size > 0) {
      setError('Please fix all validation errors before saving');
      return;
    }

    if (dirtyAssets.size === 0) {
      setToast({ message: 'No changes to save', type: 'info' });
      return;
    }

    setIsSaving(true);
    try {
      for (const [assetId, changes] of dirtyAssets.entries()) {
        // Normal update - the trigger will handle moving to history if measurement_date changes
        // If measurement_date is being changed, validate it first
        if ('measurement_date' in changes) {
          // If date is blank or 01/01/1900, use current date
          if (!changes.measurement_date || changes.measurement_date === '01/01/1900') {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            changes.measurement_date = `${day}/${month}/${year}`;
          }
        }
        
        // Just update - the database trigger will automatically move to history if measurement_date changes
        await api.assets.update(assetId, changes);
      }

      setToast({ message: t('updatedSuccessfully'), type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      setError(null); // Clear any previous errors on success
      
      // Refresh data from server
      // Use asset_id instead of id, since id might have changed if asset was recreated
      if (asset && asset.asset_id) {
        try {
          setLoading(true);
          const assetTypesData = await api.assetTypes.getAll();
          setAssetTypes(assetTypesData || []);
          
          const buildingData = await api.buildings.getOne(asset.building_number);
          setBuilding(buildingData);
          
          // Fetch all records using asset_id (which doesn't change)
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(asset.asset_id, asset.building_number);
            
            console.log('[AssetDetails] Fetched measurements after save:', {
              totalCount: allAssetMeasurements.length,
              latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
              historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
            });
          } catch (historyErr) {
            console.error('[AssetDetails] Error fetching asset history after save:', historyErr);
            // Try to get just the latest asset by asset_id
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              const masterRecord = { ...assetsByAssetId[0], is_latest: true };
              allAssetMeasurements = [masterRecord];
            }
          }
          
          // Update asset state with the latest measurement
          if (allAssetMeasurements.length > 0) {
            const latestMeasurement = allAssetMeasurements.find(m => m.is_latest === true) || allAssetMeasurements[0];
            setAsset(latestMeasurement);
          }
          
          setAllMeasurements(allAssetMeasurements);
          setOriginalMeasurements(allAssetMeasurements);
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data after save';
          console.error('[AssetDetails] Error fetching data after save:', fetchErr);
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        // Fallback to regular fetchData if asset or asset_id is not available
        await fetchData();
      }
      
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save changes';
      console.error('[AssetDetails] Error saving changes:', err);
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
      // Don't clear error automatically - let user see it
    } finally {
      setIsSaving(false);
    }
  }

  const handleOpenSaveAsNewMeasurementModal = useCallback(() => {
    console.log('[AssetDetails] handleOpenSaveAsNewMeasurementModal called', {
      latestMeasurement: !!latestMeasurement,
      hasChanges,
      validationErrorsSize: validationErrors.size
    });
    
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לשמירה', type: 'error' });
      return;
    }

    if (validationErrors.size > 0) {
      setError('Please fix all validation errors before saving');
      setToast({ message: 'תקן שגיאות לפני שמירה', type: 'error' });
      return;
    }

    // Set default date to today
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setNewMeasurementDate(`${day}/${month}/${year}`);
    setMeasurementDateModalOpen(true);
    console.log('[AssetDetails] Modal opened');
  }, [latestMeasurement, hasChanges, validationErrors.size]);

  async function handleSaveAsNewMeasurement() {
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לשמירה', type: 'error' });
      return;
    }

    // Validate date format if provided
    let finalMeasurementDate: string;
    if (newMeasurementDate && newMeasurementDate.trim() !== '') {
      // Validate DD/MM/YYYY format
      const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const match = newMeasurementDate.trim().match(dateFormatPattern);
      
      if (!match) {
        setToast({ message: 'תאריך לא תקין. נא להזין בפורמט DD/MM/YYYY', type: 'error' });
        return;
      }

      const [, day, month, year] = match;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      // Validate date ranges
      if (monthNum < 1 || monthNum > 12) {
        setToast({ message: 'חודש לא תקין (1-12)', type: 'error' });
        return;
      }

      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      if (dayNum < 1 || dayNum > daysInMonth) {
        setToast({ message: `יום לא תקין לחודש ${monthNum} (1-${daysInMonth})`, type: 'error' });
        return;
      }

      if (yearNum < 1900 || yearNum > 2100) {
        setToast({ message: 'שנה לא תקינה (1900-2100)', type: 'error' });
        return;
      }

      finalMeasurementDate = newMeasurementDate.trim();
    } else {
      // Use system date if no date provided
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      finalMeasurementDate = `${day}/${month}/${year}`;
    }

    setMeasurementDateModalOpen(false);
    setIsSaving(true);
    try {
      // Get the current measurement with all changes applied
      const currentAsset = latestMeasurement;
      const changes = dirtyAssets.get(currentAsset.id) || {};
      
      // Merge current asset with changes
      const newAssetData = {
        ...currentAsset,
        ...changes,
      };

      // Set new measurement date
      newAssetData.measurement_date = finalMeasurementDate;

      // Store the old asset ID before updating it
      const oldAssetId = currentAsset.id;

      // Remove id and created_at to create a new record
      delete (newAssetData as any).id;
      delete (newAssetData as any).created_at;
      delete (newAssetData as any).updated_at;
      delete (newAssetData as any).is_latest;
      delete (newAssetData as any).history_created_at;

      // First, update the old record with is_new_measurement flag set to true
      // The database trigger will automatically move it to assets_history
      await api.assets.update(oldAssetId, { is_new_measurement: true });

      // Then create the new measurement in assets table (without the flag)
      delete (newAssetData as any).is_new_measurement;
      await api.assets.create(newAssetData as any);

      setToast({ message: 'נשמרה מדידה חדשה בהצלחה', type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      setError(null);
      
      // Refresh data from server
      if (asset && asset.asset_id) {
        try {
          setLoading(true);
          const assetTypesData = await api.assetTypes.getAll();
          setAssetTypes(assetTypesData || []);
          
          const buildingData = await api.buildings.getOne(asset.building_number);
          setBuilding(buildingData);
          
          // Fetch all records using asset_id
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(asset.asset_id, asset.building_number);
            
            console.log('[AssetDetails] Fetched measurements after save as new:', {
              totalCount: allAssetMeasurements.length,
              latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
              historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
            });
          } catch (historyErr) {
            console.error('[AssetDetails] Error fetching asset history after save as new:', historyErr);
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              const masterRecord = { ...assetsByAssetId[0], is_latest: true };
              allAssetMeasurements = [masterRecord];
            }
          }
          
          // Update asset state with the latest measurement
          if (allAssetMeasurements.length > 0) {
            const latestMeasurement = allAssetMeasurements.find(m => m.is_latest === true) || allAssetMeasurements[0];
            setAsset(latestMeasurement);
          }
          
          setAllMeasurements(allAssetMeasurements);
          setOriginalMeasurements(allAssetMeasurements);
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data after save';
          console.error('[AssetDetails] Error fetching data after save as new:', fetchErr);
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        await fetchData();
      }
      
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save as new measurement';
      console.error('[AssetDetails] Error saving as new measurement:', err);
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setIsSaving(false);
      setNewMeasurementDate('');
    }
  }

  async function handleFileUpload(assetId: number, file: File) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${assetId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('structure-drawings')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('structure-drawings')
        .getPublicUrl(filePath);

      await api.assets.update(assetId, { structure_drawing_url: publicUrl });

      setToast({ message: t('drawingUploadedSuccessfully'), type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : t('failedToUploadDrawing'),
        type: 'error'
      });
    }
  }

  function handleViewDrawing(url: string) {
    setSelectedDrawingUrl(url);
  }

  function handleCancelChanges() {
    // Restore original data using deep copy
    setAllMeasurements(JSON.parse(JSON.stringify(originalMeasurements)));
    setDirtyAssets(new Map());
    setValidationErrors(new Map());
    setError(null);
  }

  async function handleValidateLatestRow() {
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    const latestRow = latestMeasurement;
    if (!latestRow) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    setIsValidating(true);
    setValidationProgress(null);
    setValidationModalOpen(true);
    try {
      // Use unified validation handler
      const result = await AssetValidationHandler.validateSingleAsset(latestRow, {
        onProgress: (progress) => {
          setValidationProgress({
            current: progress.current,
            total: progress.total,
            currentStep: progress.currentStep || 'בודק...'
          });
        }
      });

      // Show validation results in modal
      setValidationResults({
        valid: result.valid,
        errors: result.errors,
        passed: result.passed,
        matchedAssetTypeRecord: result.matchedAssetTypeRecord
      });
      setValidationProgress(null);
    } catch (err) {
      console.error('Validation error:', err);
      setToast({ 
        message: 'שגיאה בביצוע אימות', 
        type: 'error' 
      });
    } finally {
      setIsValidating(false);
    }
  }


  // Helper function to get cell style for dirty fields
  const getCellStyle = (params: any, fieldName: string) => {
    const assetId = params.data?.id;
    if (!assetId) return {};
    
    const isDirty = dirtyAssets.has(assetId) && dirtyAssets.get(assetId)?.hasOwnProperty(fieldName);
    const isLatest = params.data.is_latest === true;
    
    return {
      fontWeight: isDirty ? 'bold' : 'normal',
      backgroundColor: isLatest ? undefined : '#f3f4f6',
      color: isLatest ? undefined : '#6b7280',
      cursor: isLatest ? 'text' : 'default'
    };
  };

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: t('structureDrawing'),
      field: 'structure_drawing_url',
      pinned: 'right', // Pinned to the right side near the sidebar
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressSizeToFit: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = asset.id;
        const hasDrawing = !!asset.structure_drawing_url;
        const isLatest = asset.is_latest === true;

        // Collect validation errors
        const errors: string[] = [];
        if (validationErrors.has(assetId)) {
          const fieldErrors = validationErrors.get(assetId);
          if (fieldErrors && fieldErrors.size > 0) {
            fieldErrors.forEach((errorMsg) => {
              errors.push(errorMsg);
            });
          }
        }

        const numericRegex = /^[0-9]+$/;
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

        if (hasInvalidPayerId) errors.push('Invalid payer ID - must be numeric');
        if (hasInvalidAssetId) errors.push('Invalid asset ID - must be numeric');

        const hasErrors = errors.length > 0;

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {hasErrors && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const errorMsg = errors.join('\n');
                  setToast({ message: errorMsg, type: 'error' });
                }}
                className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
                title={errors.join('\n')}
              >
                <AlertCircle className="h-5 w-5" />
              </button>
            )}
            {isLatest ? (
              <label className="flex items-center justify-center p-1 text-blue-600 hover:text-blue-700 transition-colors hover:scale-110 cursor-pointer" title={t('upload') || 'העלה קובץ'}>
                <Upload className="h-5 w-5" />
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && asset.id) {
                      handleFileUpload(asset.id, file);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center justify-center p-1 text-gray-400 cursor-not-allowed" title="Read-only">
                <Upload className="h-5 w-5" />
              </div>
            )}
            {hasDrawing && asset.structure_drawing_url ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDrawing(asset.structure_drawing_url!);
                }}
                className={`p-1 transition-colors hover:scale-110 ${
                  selectedDrawingUrl === asset.structure_drawing_url
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-green-600 hover:text-green-700'
                }`}
                title={selectedDrawingUrl === asset.structure_drawing_url ? t('viewing') || 'צופה' : t('view') || 'צפה בקובץ'}
              >
                <FileText className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex items-center justify-center p-1 text-gray-400 cursor-not-allowed" title={t('noFile') || 'אין קובץ'}>
                <FileText className="h-5 w-5" />
              </div>
            )}
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'measurement_date'),
      valueFormatter: (params) => {
        if (!params.value || params.value === '01/01/1900') return '';
        // Ensure DD/MM/YYYY format
        const dateStr = String(params.value).trim();
        // If already in DD/MM/YYYY format, return as-is
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          return dateStr;
        }
        // Try to parse other date formats and convert to DD/MM/YYYY
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
          }
        } catch (e) {
          // If parsing fails, return original value
        }
        return dateStr;
      },
      valueGetter: (params) => params.data.measurement_date,
      valueSetter: (params) => {
        let newValue = params.newValue?.trim() || '';
        
        // If empty, set to default
        if (!newValue) {
          params.data.measurement_date = '01/01/1900';
          return true;
        }
        
        // Validate DD/MM/YYYY format first
        const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = newValue.match(dateFormatPattern);
        
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          
          // Validate month range
          if (month < 1 || month > 12) {
            // Invalid month - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate day range based on month
          const daysInMonth = new Date(year, month, 0).getDate();
          if (day < 1 || day > daysInMonth) {
            // Invalid day - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate year range (reasonable range)
          if (year < 1900 || year > 2100) {
            // Invalid year - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Create date object to validate it's a real date
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month - 1 &&
              date.getFullYear() === year) {
            params.data.measurement_date = newValue;
            return true;
          }
        }
        
        // If not in DD/MM/YYYY format, try to parse other formats and convert
        try {
          const date = new Date(newValue);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            params.data.measurement_date = `${day}/${month}/${year}`;
            return true;
          }
        } catch (e) {
          // If parsing fails, keep original value - validation will catch it
        }
        
        // If format doesn't match DD/MM/YYYY, keep the value but validation will show error
        params.data.measurement_date = newValue;
        return true;
      },
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        maxLength: 10,
        useFormatter: true,
      },
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'payer_id'),
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: (params) => params.data.is_latest === true,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'כן';
        const isEditable = params.data.is_latest === true;
        return (
          <div className="flex items-center justify-center h-full">
            {isEditable ? (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  const newValue = e.target.checked ? 'כן' : null;
                  
                  // Only allow editing for latest records
                  if (params.data.is_latest !== true) {
                    return;
                  }
                  
                  // Update the data directly in the node (this doesn't trigger onCellValueChanged)
                  params.data.penthouse = newValue;
                  params.node.setDataValue('penthouse', newValue);
                  
                  // Manually track the change in dirtyAssets
                  const assetId = params.data.id;
                  setDirtyAssets(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(assetId) || {};
                    newMap.set(assetId, { ...existing, penthouse: newValue });
                    return newMap;
                  });
                  
                  // Clear any validation errors for this field
                  setValidationErrors(prev => {
                    const newMap = new Map(prev);
                    const fieldErrors = newMap.get(assetId);
                    if (fieldErrors) {
                      fieldErrors.delete('penthouse');
                      if (fieldErrors.size === 0) {
                        newMap.delete(assetId);
                      }
                    }
                    return newMap;
                  });
                  
                  // Refresh only this specific cell
                  if (params.api && params.node) {
                    params.api.refreshCells({ 
                      rowNodes: [params.node], 
                      columns: ['penthouse'], 
                      force: true 
                    });
                  }
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
            ) : (
              <span className="text-gray-600">{isChecked ? '✓' : ''}</span>
            )}
          </div>
        );
      },
      valueGetter: (params: any) => params.data?.penthouse === 'כן' ? 'כן' : null,
      valueSetter: (params: any) => {
        params.data.penthouse = params.newValue;
        return true;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params, 'penthouse');
        return { ...baseStyle, textAlign: 'center' };
      },
      headerClass: 'text-center'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'main_asset_type'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'asset_size'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_1'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_2'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_3'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_4'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_5'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_6'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
  ], [t, assetTypes, latestMeasurement, validationErrors, selectedDrawingUrl, dirtyAssets]);

  useEffect(() => {
    fetchData();
  }, [assetId]);

  async function fetchData() {
    try {
      setLoading(true);

      // Try to fetch by id first
      let assetData: Asset | null = null;
      try {
        assetData = await api.assets.getOne(String(assetId));
      } catch (err: any) {
        console.error('Error fetching asset by id:', err);
        // If asset not found by id, try to fetch by asset_id from the current asset state
        if (err.message === 'Asset not found' && asset) {
          console.log('Asset not found by id, trying to fetch by asset_id:', asset.asset_id);
          try {
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              // Get the latest one (should be first after sorting)
              assetData = assetsByAssetId[0];
              console.log('Found asset by asset_id:', assetData);
            }
          } catch (assetIdErr) {
            console.error('Error fetching asset by asset_id:', assetIdErr);
          }
        }
        // If still not found, return error
        if (!assetData) {
          setError('הנכס לא נמצא');
          setLoading(false);
          return;
        }
      }

      const assetTypesData = await api.assetTypes.getAll();

      if (!assetData) {
        setError('הנכס לא נמצא');
        setLoading(false);
        return;
      }

      setAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

      // Fetch all records (latest from assets + history from assets_history) using the view
      let allAssetMeasurements: Asset[] = [];
      try {
        allAssetMeasurements = await api.assets.getAssetWithHistory(assetData.asset_id, assetData.building_number);
        
        // Log for debugging
        console.log('[AssetDetails] Fetched measurements:', {
          totalCount: allAssetMeasurements.length,
          latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
          historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
          allIds: allAssetMeasurements.map(m => ({ id: m.id, measurement_date: m.measurement_date, is_latest: m.is_latest }))
        });
      } catch (historyErr) {
        console.error('[AssetDetails] Error fetching asset history:', historyErr);
        // If history fetch fails, at least show the master record
        const masterRecord = { ...assetData, is_latest: true };
        allAssetMeasurements = [masterRecord];
        console.warn('[AssetDetails] Using master record only due to history fetch error');
      }
      
      setAllMeasurements(allAssetMeasurements);
      // Store original data only if dirtyAssets is empty (initial load or after save)
      if (dirtyAssets.size === 0) {
        setOriginalMeasurements(JSON.parse(JSON.stringify(allAssetMeasurements)));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingDetails')}</p>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{t('error')}: {error || 'Asset not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={0}
        />
      )}

      {/* Validation Results Modal */}
      <ValidationResultModal
        isOpen={validationModalOpen}
        onClose={() => {
          setValidationModalOpen(false);
          setValidationResults(null);
        }}
        isLoading={isValidating}
        progress={validationProgress}
        context="single"
        singleResult={validationResults}
        singleAssetTitle={asset ? `אימות נכס ${asset.asset_id}` : undefined}
        assetId={asset?.asset_id}
      />

      {/* Measurement Date Modal */}
      {measurementDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">שמור כמדידה חדשה</h3>
              <button
                onClick={() => {
                  setMeasurementDateModalOpen(false);
                  setNewMeasurementDate('');
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                תאריך מדידה (DD/MM/YYYY)
              </label>
              <input
                type="text"
                value={newMeasurementDate}
                onChange={(e) => {
                  let value = e.target.value;
                  // Allow only digits and slashes
                  value = value.replace(/[^\d/]/g, '');
                  // Auto-format as user types
                  if (value.length > 10) {
                    value = value.slice(0, 10);
                  }
                  // Auto-add slashes
                  if (value.length === 2 && !value.includes('/')) {
                    value = value + '/';
                  } else if (value.length === 5 && value.split('/').length === 2) {
                    value = value + '/';
                  }
                  setNewMeasurementDate(value);
                }}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right"
                maxLength={10}
              />
              <p className="mt-1 text-xs text-slate-500">
                השאר ריק לשימוש בתאריך המערכת
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setMeasurementDateModalOpen(false);
                  setNewMeasurementDate('');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
              <button
                onClick={handleSaveAsNewMeasurement}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                אישור
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-3">
          <Home className="w-8 h-8 text-white bg-white/20 rounded-lg p-1.5" strokeWidth={1.5} />
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs sm:text-sm text-teal-50">
                  {t('building')} {building.building_number}
                </p>
                {assetTaxRegion && (
                  <p className="text-sm text-white font-semibold bg-blue-700 px-3 py-1 rounded">
                    אזור מס: {assetTaxRegion}
                  </p>
                )}
                {building.tax_region && !assetTaxRegion && (
                  <p className="text-sm text-white font-semibold bg-blue-700 px-3 py-1 rounded">
                    אזורי מס: {building.tax_region}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100">
          <div className="p-3">
            {/* Latest Measurement Grid */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-slate-800">מדידה אחרונה</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleValidateLatestRow}
                    disabled={isSaving || isValidating || !latestMeasurement}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    title="אמת את הנכס"
                  >
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span className="text-sm">{isValidating ? 'מאמת...' : 'אמת נכס'}</span>
                  </button>
                  <button
                    onClick={handleOpenSaveAsNewMeasurementModal}
                    disabled={isSaving || isValidating || !latestMeasurement || !hasChanges || validationErrors.size > 0}
                    className="flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    title={validationErrors.size > 0 ? 'תקן שגיאות לפני שמירה' : !hasChanges ? 'אין שינויים לשמירה' : 'שמור כמדידה חדשה'}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="text-sm">שמור כמדידה חדשה</span>
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSaving || !hasChanges || validationErrors.size > 0}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    title={validationErrors.size > 0 ? 'תקן שגיאות לפני שמירה' : 'שמור שינויים'}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="text-sm">{t('save')}</span>
                  </button>
                  <button
                    onClick={handleCancelChanges}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4" />
                    <span className="text-sm">{t('cancel')}</span>
                  </button>
                </div>
              </div>
              <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '120px', width: '100%' }}>
                <AgGridReact<Asset>
                  ref={gridRef}
                  rowData={pinnedTopRowData}
                  columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  sortable: false,
                  headerClass: 'ag-right-aligned-header'
                }}
                getRowId={(params) => {
                  // Use id + measurement_date + is_latest to ensure uniqueness
                  // This prevents duplicates when same record appears in both tables
                  const isLatest = params.data.is_latest ? 'latest' : 'history';
                  const historyCreatedAt = params.data.history_created_at ? `-${params.data.history_created_at}` : '';
                  return `${params.data.id}-${params.data.measurement_date}-${isLatest}${historyCreatedAt}`;
                }}
                getRowStyle={getRowStyle}
                getPinnedRowStyle={(params) => {
                  // Style for pinned top row (first row)
                  return {
                    fontSize: '1.2em',
                    fontWeight: '600',
                    fontStyle: 'normal',
                    backgroundColor: '#f0f9ff'
                  };
                }}
                onGridReady={async (params) => {
                  // Load saved column state first
                  const hasSavedState = await loadColumnState();
                  
                  // If no saved state, apply default sizing
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'structure_drawing_url'); // Exclude structure drawing column from auto-sizing
                      
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 100);
                  }
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
                          .filter(id => id !== 'structure_drawing_url'); // Exclude structure drawing column from auto-sizing
                        
                        if (allColumnIds.length > 0) {
                          params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                        }
                      }, 50);
                    }
                  }
                }}
                onColumnResized={saveColumnState}
                onColumnMoved={(params) => {
                  // Prevent structure drawing column from being moved - force it back to pinned right position
                  try {
                    const columnApi = (params as any).columnApi || params.api;
                    if (columnApi && columnApi.getColumn) {
                      const structureDrawingColumn = columnApi.getColumn('structure_drawing_url');
                      if (structureDrawingColumn) {
                        const allColumns = columnApi.getAllColumns ? columnApi.getAllColumns() : [];
                        const structureDrawingIndex = allColumns.findIndex((col: any) => col.getColId() === 'structure_drawing_url');
                        const lastIndex = allColumns.length - 1;
                        // Check if column is not at the last position (rightmost)
                        if (structureDrawingIndex !== lastIndex) {
                          setTimeout(() => {
                            if (gridRef.current?.api) {
                              const columnState = gridRef.current.api.getColumnState();
                              const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                              const otherCols = columnState.filter((col: any) => col.colId !== 'structure_drawing_url');
                              if (structureDrawingCol) {
                                gridRef.current.api.applyColumnState({
                                  state: [...otherCols, { ...structureDrawingCol, pinned: 'right', lockPosition: true }],
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
                  saveColumnState();
                }}
                onSortChanged={saveColumnState}
                onCellValueChanged={onCellValueChanged}
                enableRtl={true}
                animateRows={true}
                tooltipShowDelay={200}
                tooltipHideDelay={10000}
              />
              </div>
            </div>

            {/* History Records Grid */}
            {historyRows.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">מדידות קודמות ({historyRows.length})</h3>
                <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '30vh', width: '100%' }}>
                  <AgGridReact<Asset>
                    ref={historyGridRef}
                    rowData={historyRows}
                    columnDefs={columnDefs}
                    defaultColDef={{
                      resizable: true,
                      wrapHeaderText: true,
                      autoHeaderHeight: true,
                      wrapText: true,
                      autoHeight: false,
                      sortable: false,
                      headerClass: 'ag-right-aligned-header'
                    }}
                    getRowId={(params) => {
                      const isLatest = params.data.is_latest ? 'latest' : 'history';
                      const historyCreatedAt = params.data.history_created_at ? `-${params.data.history_created_at}` : '';
                      return `${params.data.id}-${params.data.measurement_date}-${isLatest}${historyCreatedAt}`;
                    }}
                    getRowStyle={getRowStyle}
                    onGridReady={async (params) => {
                      const hasSavedState = await loadHistoryColumnState();
                      
                      // Ensure structure drawing column is visible
                      const columnState = params.api.getColumnState();
                      const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                      if (structureDrawingCol && structureDrawingCol.hide) {
                        params.api.setColumnVisible('structure_drawing_url', true);
                      }
                      
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
                    }}
                    onFirstDataRendered={async (params) => {
                      if (!historyColumnStateLoaded) {
                        const hasSavedState = await loadHistoryColumnState();
                        
                        // Ensure actions column is visible
                        const columnState = params.api.getColumnState();
                        const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                        if (actionsCol && actionsCol.hide) {
                          params.api.setColumnVisible('actions', true);
                        }
                        
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
                    }}
                    onColumnResized={saveHistoryColumnState}
                    onColumnMoved={(params) => {
                      // Prevent structure drawing column from being moved - force it back to pinned right position
                      try {
                        const columnApi = (params as any).columnApi || params.api;
                        if (columnApi && columnApi.getColumn) {
                          const structureDrawingColumn = columnApi.getColumn('structure_drawing_url');
                          if (structureDrawingColumn) {
                            const allColumns = columnApi.getAllColumns ? columnApi.getAllColumns() : [];
                            const structureDrawingIndex = allColumns.findIndex((col: any) => col.getColId() === 'structure_drawing_url');
                            const lastIndex = allColumns.length - 1;
                            // Check if column is not at the last position (rightmost)
                            if (structureDrawingIndex !== lastIndex) {
                              setTimeout(() => {
                                if (historyGridRef.current?.api) {
                                  const columnState = historyGridRef.current.api.getColumnState();
                                  const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                                  const otherCols = columnState.filter((col: any) => col.colId !== 'structure_drawing_url');
                                  if (structureDrawingCol) {
                                    historyGridRef.current.api.applyColumnState({
                                      state: [...otherCols, { ...structureDrawingCol, pinned: 'right', lockPosition: true }],
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
                        console.warn('Error in history grid onColumnMoved:', error);
                      }
                      saveHistoryColumnState();
                    }}
                    onSortChanged={saveHistoryColumnState}
                    enableRtl={true}
                    animateRows={true}
                    tooltipShowDelay={200}
                    tooltipHideDelay={10000}
                  />
                </div>
              </div>
            )}

            {/* PDF Viewer Modal */}
            {selectedDrawingUrl && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSelectedDrawingUrl(null)}>
                <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-slate-800">{t('structureDrawing')}</h3>
                    <button
                      onClick={() => setSelectedDrawingUrl(null)}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                    >
                      <X className="h-4 w-4" />
                      <span>{t('closeViewer')}</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <PDFViewer
                      fileUrl={selectedDrawingUrl}
                      fileName={`structure-drawing-${assetId}.pdf`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
