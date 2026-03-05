import { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Building, CheckCircle2 } from 'lucide-react';
import { Asset, AssetType, api } from '../lib/api';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { AssetValidationHandler } from '../lib/assetValidationHandler';

interface ChangeTaxRegionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssetIds: string[];
  buildingNumber: number;
  availableTaxRegions: number[]; // Tax regions available for the building
  assetTypes: AssetType[];
  onSuccess: () => void;
  onSelectAsset?: (assetDbId: string | number, assetId: string, buildingNumber: number, taxRegion?: string) => void;
  onOpenAssetsTab?: (buildingNumber: number, taxRegion: string, assetIds?: string[]) => void;
  onCloseTabAndOpenMultiTax?: (buildingNumber: number) => void;
}

export function ChangeTaxRegionModal({
  isOpen,
  onClose,
  selectedAssetIds,
  buildingNumber,
  availableTaxRegions,
  assetTypes,
  onSuccess,
  onSelectAsset,
  onOpenAssetsTab,
  onCloseTabAndOpenMultiTax
}: ChangeTaxRegionModalProps) {
  const [selectedTaxRegion, setSelectedTaxRegion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationCompleted, setValidationCompleted] = useState(false);
  const [validationResults, setValidationResults] = useState<BatchValidationResults | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [assetsToUpdate, setAssetsToUpdate] = useState<Asset[]>([]);
  
  // Get area descriptions for tax regions
  const taxRegionOptions = useMemo(() => {
    return availableTaxRegions.map(tr => {
      const assetType = assetTypes.find(at => at.tax_region === tr && at.area_description_for_tab);
      const description = assetType?.area_description_for_tab || String(tr);
      return {
        value: tr,
        label: `${description} (${tr})`
      };
    });
  }, [availableTaxRegions, assetTypes]);
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedTaxRegion(null);
      setError(null);
      setValidationCompleted(false);
      setValidationResults(null);
      setValidationModalOpen(false);
      setValidationProgress(null);
      setAssetsToUpdate([]);
    }
  }, [isOpen]);

  // Load assets when modal opens
  useEffect(() => {
    if (isOpen && selectedAssetIds.length > 0 && buildingNumber) {
      loadAssets();
    }
  }, [isOpen, selectedAssetIds, buildingNumber]);

  const loadAssets = async () => {
    try {
      const assetsData = await api.assets.getAll(buildingNumber);
      const assets = assetsData.filter(asset => 
        selectedAssetIds.includes(String(asset.asset_id))
      );
      setAssetsToUpdate(assets);
    } catch (err) {
      console.error('Error loading assets:', err);
      setError('שגיאה בטעינת נכסים');
    }
  };

  // Auto-validate when tax region is selected
  useEffect(() => {
    if (selectedTaxRegion && assetsToUpdate.length > 0) {
      setValidationCompleted(false);
      setValidationResults(null);
    }
  }, [selectedTaxRegion, assetsToUpdate.length]);
  
  const handleValidate = async () => {
    if (!selectedTaxRegion) {
      setError('אנא בחר אזור מס');
      return;
    }
    
    if (assetsToUpdate.length === 0) {
      setError('לא נמצאו נכסים לאימות');
      return;
    }
    
    setIsValidating(true);
    setValidationProgress({ current: 0, total: assetsToUpdate.length });
    setValidationResults(null);
    setError(null);
    
    try {
      // Load building for validation
      const building = await api.buildings.getOne(buildingNumber);
      
      // Prepare assets with new tax region for validation
      const assetsWithNewTaxRegion = assetsToUpdate.map(asset => ({
        ...asset,
        tax_region: selectedTaxRegion
      }));
      
      const results: Array<{ assetId: string; assetDbId?: string | number; buildingNumber: number; errors: string[]; matchedAssetTypeRecord?: string }> = [];
      
      for (let i = 0; i < assetsWithNewTaxRegion.length; i++) {
        const asset = assetsWithNewTaxRegion[i];
        setValidationProgress({ 
          current: i, 
          total: assetsWithNewTaxRegion.length,
          currentAssetId: String(asset.asset_id)
        });
        
        try {
          // Validate asset with new tax region
          const validationResult = await AssetValidationHandler.validateSingleAsset(
            asset,
            {
              taxRegion: String(selectedTaxRegion),
              cachedData: {
                assetTypes: assetTypes,
                building: building,
                asset: asset
              }
            }
          );
          
          const errors: string[] = [];
          if (!validationResult.valid) {
            if (validationResult.errors) {
              errors.push(...validationResult.errors);
            }
          }
          
          // asset_id is the primary key, so use it as both assetId and assetDbId
          results.push({
            assetId: String(asset.asset_id),
            assetDbId: String(asset.asset_id), // Convert to string for BatchValidationError type
            buildingNumber: asset.building_number,
            errors: errors,
            matchedAssetTypeRecord: validationResult.matchedAssetTypeRecord
          });
        } catch (err) {
          console.error(`Error validating asset ${asset.asset_id}:`, err);
          results.push({
            assetId: String(asset.asset_id),
            assetDbId: String(asset.asset_id), // Convert to string for BatchValidationError type
            buildingNumber: asset.building_number,
            errors: [err instanceof Error ? err.message : 'שגיאה באימות נכס']
          });
        }
      }
      
      // Build batch validation results
      const validCount = results.filter(r => r.errors.length === 0).length;
      const invalidCount = results.filter(r => r.errors.length > 0).length;
      
      const batchResults: BatchValidationResults = {
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        errors: results.filter(r => r.errors.length > 0).map(r => ({
          assetId: r.assetId,
          assetDbId: r.assetDbId ? String(r.assetDbId) : undefined, // Ensure it's a string
          buildingNumber: r.buildingNumber,
          errors: r.errors,
          matchedAssetTypeRecord: r.matchedAssetTypeRecord
        }))
      };
      
      setValidationResults(batchResults);
      setValidationCompleted(true);
      setValidationModalOpen(true);
      
      // Always open a new tab with all selected assets in the new tax region after validation
      // This allows users to fix errors and see all assets that will be updated
      if (onOpenAssetsTab && selectedTaxRegion) {
        onOpenAssetsTab(buildingNumber, String(selectedTaxRegion), selectedAssetIds);
      }
    } catch (err) {
      console.error('Error validating assets:', err);
      setError(err instanceof Error ? err.message : 'שגיאה באימות נכסים');
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  const handleSave = async () => {
    if (!selectedTaxRegion) {
      setError('אנא בחר אזור מס');
      return;
    }
    
    if (selectedAssetIds.length === 0) {
      setError('לא נבחרו נכסים');
      return;
    }
    
    // Validation must be completed before saving
    if (!validationCompleted) {
      setError('יש להריץ אימות לפני שמירה');
      return;
    }
    
    // Check if there are validation errors - prevent saving if any errors exist
    if (validationResults && validationResults.invalid > 0) {
      setError('לא ניתן לשמור עד שכל השגיאות יתוקנו. אנא תקן את השגיאות ולאחר מכן הרץ אימות מחדש.');
      setValidationModalOpen(true);
      return;
    }
    
    // Double-check: ensure validation was completed and passed
    if (!validationCompleted) {
      setError('יש להריץ אימות לפני שמירה');
      return;
    }
    
    // Triple-check: ensure no errors exist
    if (validationResults && validationResults.errors && validationResults.errors.length > 0) {
      setError('לא ניתן לשמור עד שכל השגיאות יתוקנו. אנא תקן את השגיאות ולאחר מכן הרץ אימות מחדש.');
      setValidationModalOpen(true);
      return;
    }
    
    if (assetsToUpdate.length === 0) {
      setError('לא נמצאו נכסים לעדכון');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Update tax region for each asset
      const assetsToSave = assetsToUpdate.map(asset => ({
        ...asset,
        tax_region: selectedTaxRegion
      }));
      
      // Save all assets
      const result = await api.assets.saveBulkTransactional(
        assetsToSave,
        'manual_update',
        undefined,
        undefined,
        `שינוי אזור מס ל-${selectedTaxRegion} עבור ${assetsToSave.length} נכסים`,
        undefined // isBusinessContext is undefined for tax region changes
      );
      
      if (result.success) {
        onSuccess();
        // Close current tab and open multi-tax tab (all assets tab)
        if (onCloseTabAndOpenMultiTax) {
          onCloseTabAndOpenMultiTax(buildingNumber);
        } else if (onOpenAssetsTab && selectedTaxRegion) {
          // Fallback: if onCloseTabAndOpenMultiTax is not provided, open new tab with new tax region
          onOpenAssetsTab(buildingNumber, String(selectedTaxRegion), selectedAssetIds);
        }
        onClose();
      } else {
        setError(result.error || 'שגיאה בעדכון אזור המס');
      }
    } catch (err) {
      console.error('Error changing tax region:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון אזור המס');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5 text-app-accent" />
            <h2 className="text-xl font-bold text-gray-900">שינוי אזור מס</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              נבחרו {selectedAssetIds.length} נכסים לשינוי אזור המס
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              אזור מס חדש
            </label>
            <select
              value={selectedTaxRegion || ''}
              onChange={(e) => setSelectedTaxRegion(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              disabled={loading}
            >
              <option value="">-- בחר אזור מס --</option>
              {taxRegionOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          {validationCompleted && validationResults && (
            <div className={`border rounded-lg p-3 ${
              validationResults.invalid > 0 
                ? 'bg-yellow-50 border-yellow-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2">
                {validationResults.invalid > 0 ? (
                  <>
                    <X className="h-4 w-4 text-yellow-600" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-800 font-semibold">
                        נמצאו {validationResults.invalid} נכסים עם שגיאות מתוך {validationResults.total}
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        נפתחה כרטיסייה עם כל הנכסים הנבחרים. תקן את השגיאות בכרטיסייה ולאחר מכן חזור לכאן והרץ אימות מחדש.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-green-800">
                      כל הנכסים תקינים ({validationResults.valid}/{validationResults.total}) - ניתן לשמור
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading || isValidating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50  transition-colors"
          >
            <X className="h-4 w-4" />
            ביטול
          </button>
          <button
            onClick={handleValidate}
            disabled={loading || isValidating || !selectedTaxRegion || assetsToUpdate.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-app-accent rounded hover:bg-app-accent-hover disabled:opacity-50  transition-colors"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isValidating ? 'מאמת...' : 'אמת נכסים'}
          </button>
          <button
            onClick={handleSave}
            disabled={loading || isValidating || !selectedTaxRegion || !validationCompleted || (validationResults?.invalid ?? 0) > 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-app-accent rounded hover:bg-app-accent-hover disabled:opacity-50  transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {loading ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
      
      <ValidationResultModal
        isOpen={validationModalOpen}
        onClose={() => setValidationModalOpen(false)}
        isLoading={isValidating}
        progress={validationProgress}
        context="import"
        batchResults={validationResults}
        batchTitle={`תוצאות אימות - שינוי אזור מס ל-${selectedTaxRegion}`}
        buildingNumber={buildingNumber}
        taxRegion={selectedTaxRegion ? String(selectedTaxRegion) : undefined}
        onSelectAsset={onSelectAsset}
      />
    </div>
  );
}

