import { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Building } from 'lucide-react';
import { Asset, AssetType, api } from '../lib/api';

interface ChangeTaxRegionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssetIds: string[];
  buildingNumber: number;
  availableTaxRegions: number[]; // Tax regions available for the building
  assetTypes: AssetType[];
  onSuccess: () => void;
}

export function ChangeTaxRegionModal({
  isOpen,
  onClose,
  selectedAssetIds,
  buildingNumber,
  availableTaxRegions,
  assetTypes,
  onSuccess
}: ChangeTaxRegionModalProps) {
  const [selectedTaxRegion, setSelectedTaxRegion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
    }
  }, [isOpen]);
  
  const handleSave = async () => {
    if (!selectedTaxRegion) {
      setError('אנא בחר אזור מס');
      return;
    }
    
    if (selectedAssetIds.length === 0) {
      setError('לא נבחרו נכסים');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch current assets
      const assetsData = await api.assets.getByBuilding(buildingNumber);
      const assetsToUpdate = assetsData.filter(asset => 
        selectedAssetIds.includes(String(asset.asset_id))
      );
      
      if (assetsToUpdate.length === 0) {
        setError('לא נמצאו נכסים לעדכון');
        setLoading(false);
        return;
      }
      
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
            <Building className="h-5 w-5 text-blue-600" />
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
        </div>
        
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X className="h-4 w-4" />
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !selectedTaxRegion}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    </div>
  );
}

