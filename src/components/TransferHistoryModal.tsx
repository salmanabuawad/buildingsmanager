import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import { DistributionAudit, api, Asset, AssetType } from '../lib/api';
import { formatDateToDDMMYYYY, formatDateTimeToDDMMYYYYHHMM } from '../lib/dateUtils';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';
import { useTranslation } from 'react-i18next';

interface TransferHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildingNumber: number;
  inline?: boolean; // If true, render as inline content without modal wrapper
}

export function TransferHistoryModal({
  isOpen,
  onClose,
  buildingNumber,
  inline = false,
}: TransferHistoryModalProps) {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<DistributionAudit[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DistributionAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setSelectedRecord(null);
      loadHistory();
    }
  }, [isOpen, buildingNumber]);

  // Auto-open single record after history loads
  useEffect(() => {
    if (!loading && history.length === 1 && !selectedRecord) {
      setSelectedRecord(history[0]);
    }
  }, [history, loading, selectedRecord]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetTypesData, historyData] = await Promise.all([
        api.assetTypes.getAll(),
        api.distributionAudit.getByBuilding(buildingNumber, 'transfer')
      ]);
      
      setHistory(historyData);
      setAssetTypes(assetTypesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת היסטוריית העברות');
      console.error('Error loading transfer history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setSelectedRecord(null);
    }, 300);
  };

  const handleRecordClick = (record: DistributionAudit) => {
    setSelectedRecord(record);
  };


  // Get asset type description
  const getAssetTypeDescription = (typeName: string | undefined): string => {
    if (!typeName) return '';
    
    // Try string comparison first (trimmed)
    const typeNameStr = String(typeName).trim();
    let assetType = assetTypes.find(at => {
      const atNameStr = String(at.name || '').trim();
      return atNameStr === typeNameStr;
    });
    
    // If not found, try numeric comparison
    if (!assetType) {
      const typeNameNum = parseInt(typeNameStr, 10);
      if (!isNaN(typeNameNum)) {
        assetType = assetTypes.find(at => {
          const atNameNum = parseInt(String(at.name || '').trim(), 10);
          return !isNaN(atNameNum) && atNameNum === typeNameNum;
        });
      }
    }
    
    return assetType?.description || typeName;
  };

  // Check if a value changed between before and after
  const isValueChanged = (assetId: number, field: string): boolean => {
    if (!selectedRecord) return false;
    const beforeAssets = selectedRecord.before_data?.assets || [];
    const afterAssets = selectedRecord.after_data?.assets || [];
    const beforeAsset = beforeAssets.find((a: Asset) => a.asset_id === assetId);
    const afterAsset = afterAssets.find((a: Asset) => a.asset_id === assetId);
    if (!beforeAsset || !afterAsset) return false;
    
    const beforeValue = (beforeAsset as any)[field];
    const afterValue = (afterAsset as any)[field];
    
    // Handle null/undefined
    if (beforeValue == null && afterValue == null) return false;
    if (beforeValue == null || afterValue == null) return true;
    
    // For numbers, compare numerically to handle precision issues
    if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
      return Math.abs(beforeValue - afterValue) > 0.0001; // Small threshold for floating point comparison
    }
    
    // For strings, trim and compare (handles dates and other string values)
    if (typeof beforeValue === 'string' && typeof afterValue === 'string') {
      return beforeValue.trim() !== afterValue.trim();
    }
    
    // For other types, use strict equality
    return beforeValue !== afterValue;
  };

  // Helper function to compare two values (same logic as isValueChanged)
  const valuesAreDifferent = (beforeValue: any, afterValue: any): boolean => {
    // Handle null/undefined
    if (beforeValue == null && afterValue == null) return false;
    if (beforeValue == null || afterValue == null) return true;
    
    // For numbers, compare numerically to handle precision issues
    if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
      return Math.abs(beforeValue - afterValue) > 0.0001; // Small threshold for floating point comparison
    }
    
    // For strings, trim and compare (handles dates and other string values)
    if (typeof beforeValue === 'string' && typeof afterValue === 'string') {
      return beforeValue.trim() !== afterValue.trim();
    }
    
    // For other types, use strict equality
    return beforeValue !== afterValue;
  };

  // Check if asset has any changes
  const hasAssetChanged = (beforeAsset: Asset | undefined, afterAsset: Asset | undefined): boolean => {
    if (!beforeAsset && !afterAsset) return false;
    if (!beforeAsset || !afterAsset) return true; // One exists but not the other
    
    // Compare relevant fields
    // Note: measurement_date is critical for transfer operations (new measurements)
    const fieldsToCompare = [
      'measurement_date', // Transfer operations create new measurements with different dates
      'main_asset_type', 'asset_size',
      'sub_asset_type_1', 'sub_asset_size_1',
      'sub_asset_type_2', 'sub_asset_size_2',
      'sub_asset_type_3', 'sub_asset_size_3',
      'sub_asset_type_4', 'sub_asset_size_4',
      'sub_asset_type_5', 'sub_asset_size_5',
      'sub_asset_type_6', 'sub_asset_size_6',
      'business_distribution_area' // May change during transfers
    ];
    
    for (const field of fieldsToCompare) {
      const beforeValue = (beforeAsset as any)[field];
      const afterValue = (afterAsset as any)[field];
      
      // Use consistent comparison logic
      if (valuesAreDifferent(beforeValue, afterValue)) {
        return true;
      }
    }
    
    return false;
  };

  // Create row data with before and after rows for each asset
  const rowData = useMemo(() => {
    if (!selectedRecord) return [];
    
    const beforeAssets = selectedRecord.before_data?.assets || [];
    const afterAssets = selectedRecord.after_data?.assets || [];
    
    const beforeMap = new Map<number, Asset>();
    beforeAssets.forEach((asset: Asset) => {
      beforeMap.set(asset.asset_id, asset);
    });
    
    const afterMap = new Map<number, Asset>();
    afterAssets.forEach((asset: Asset) => {
      afterMap.set(asset.asset_id, asset);
    });
    
    // Get all unique asset IDs, sorted
    const allAssetIds = Array.from(new Set([
      ...Array.from(beforeMap.keys()),
      ...Array.from(afterMap.keys())
    ])).sort((a, b) => a - b);
    
    // Check if this is a "current state" record (no before data or description indicates current state)
    const isCurrentState = selectedRecord.description === 'העברה נוכחית' || 
                          selectedRecord.description === 'פיזור נוכחי' ||
                          beforeAssets.length === 0;
    
    // Filter to only include assets that have changed
    // For current state records, show all assets from after state
    // For transfer and other operations, show only assets that actually changed (by field comparison)
    const changedAssetIds = allAssetIds.filter(assetId => {
      if (isCurrentState) {
        // For current state, show all assets that exist in after state
        return afterMap.has(assetId);
      }
      const beforeAsset = beforeMap.get(assetId);
      const afterAsset = afterMap.get(assetId);
      return hasAssetChanged(beforeAsset, afterAsset);
    });
    
    // Create rows: for each changed asset, create two rows (before and after)
    // For current state records, only show "after" row since there's no real "before"
    const rows: any[] = [];
    changedAssetIds.forEach(assetId => {
      const beforeAsset = beforeMap.get(assetId);
      const afterAsset = afterMap.get(assetId);
      
      // For current state records, only show after row
      if (isCurrentState) {
        rows.push({
          asset_id: assetId,
          is_before_row: false,
          asset: afterAsset,
        });
      } else {
        // Before row (only show if before asset exists)
        if (beforeAsset) {
          rows.push({
            asset_id: assetId,
            is_before_row: true,
            asset: beforeAsset,
          });
        }
        
        // After row
        rows.push({
          asset_id: assetId,
          is_before_row: false,
          asset: afterAsset,
        });
      }
    });
    
    return rows;
  }, [selectedRecord]);

  if (!isOpen) return null;

  const content = (
    <div className={`bg-white ${inline ? '' : 'rounded-xl shadow-2xl'} pt-2 sm:pt-3 px-4 sm:px-6 pb-4 sm:pb-6 ${inline ? '' : 'transition-all duration-300 border border-gray-100'} ${inline ? '' : isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${inline ? 'w-full h-full' : 'max-w-[95vw] w-full max-h-[90vh]'} flex flex-col`} dir="rtl">
        {/* Header */}
        {!inline && (
        <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-t-lg bg-violet-50 border-b border-violet-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {selectedRecord ? (() => {
              const formattedDateTime = selectedRecord.created_at ? formatDateTimeToDDMMYYYYHHMM(selectedRecord.created_at) : '';
              return formattedDateTime ? `פרטי העברת שטחים - ${formattedDateTime}` : `פרטי העברת שטחים - ${selectedRecord.created_at ? formatDateToDDMMYYYY(selectedRecord.created_at) : ''}`;
            })() : `היסטוריית העברות - מבנה ${buildingNumber} (${history.length})`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="סגור"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        )}
        

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          {/* Date Tabs - Always Visible when history exists */}
          {history.length > 0 && (
            <div className="flex items-center gap-1 border-b-2 border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100 rounded-t-lg shadow-sm overflow-x-auto mb-4">
              {history.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => handleRecordClick(record)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg flex-shrink-0 ${
                    selectedRecord && selectedRecord.id === record.id
                      ? 'text-violet-700 bg-white border-b-2 border-violet-600 shadow-md -mb-0.5'
                      : 'text-gray-600 hover:text-violet-600 hover:bg-white/50'
                  }`}
                >
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-shrink-0 whitespace-nowrap">{record.created_at ? formatDateTimeToDDMMYYYYHHMM(record.created_at) : ''}</span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <span className="mr-3 text-gray-600">טוען היסטוריה...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">אין היסטוריית העברות עבור מבנה זה</div>
          ) : (
            <div className="space-y-4">
            {/* Record Details View - Show when record is selected */}
            {selectedRecord && (
              <div className="space-y-4">
                <div>
                <div className="rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: '600px' }}>
                  <table className="w-full border-collapse text-sm" dir="rtl">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('assetId')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">סטטוס</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('mainAssetType')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('mainAssetSize')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType1')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize1')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType2')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize2')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType3')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize3')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType4')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize4')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType5')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize5')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetType6')}</th>
                        <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-xs">{t('subAssetSize6')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowData.map((row, idx) => {
                        const asset = row.asset;
                        const isBefore = row.is_before_row;
                        const bgColor = isBefore ? '#fee2e2' : '#dcfce7';
                        // Check if this is an "after" row that follows a "before" row for the same asset
                        const prevRow = idx > 0 ? rowData[idx - 1] : null;
                        const isSecondRow = !isBefore && prevRow && prevRow.asset_id === row.asset_id && prevRow.is_before_row;
                        
                        if (isSecondRow) {
                          // Second row (after) - asset_id cell is spanned from first row, so start with status
                          return (
                            <tr key={`${row.asset_id}-after`} style={{ backgroundColor: bgColor }}>
                              {/* Asset ID cell is spanned from before row, so we don't render it here */}
                              <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">אחרי</td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'main_asset_type') ? 'font-bold italic' : ''}`}
                                title={asset?.main_asset_type ? getAssetTypeDescription(asset.main_asset_type) : ''}
                              >
                                {asset?.main_asset_type || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'asset_size') ? 'font-bold italic' : ''}`}>
                                {asset?.asset_size != null && asset.asset_size !== 0 ? formatNumberToTwoDecimals(asset.asset_size, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_1') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_1 ? getAssetTypeDescription(asset.sub_asset_type_1) : ''}
                              >
                                {asset?.sub_asset_type_1 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_1') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_1 != null && asset.sub_asset_size_1 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_1, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_2') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_2 ? getAssetTypeDescription(asset.sub_asset_type_2) : ''}
                              >
                                {asset?.sub_asset_type_2 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_2') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_2 != null && asset.sub_asset_size_2 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_2, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_3') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_3 ? getAssetTypeDescription(asset.sub_asset_type_3) : ''}
                              >
                                {asset?.sub_asset_type_3 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_3') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_3 != null && asset.sub_asset_size_3 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_3, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_4') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_4 ? getAssetTypeDescription(asset.sub_asset_type_4) : ''}
                              >
                                {asset?.sub_asset_type_4 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_4') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_4 != null && asset.sub_asset_size_4 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_4, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_5') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_5 ? getAssetTypeDescription(asset.sub_asset_type_5) : ''}
                              >
                                {asset?.sub_asset_type_5 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_5') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_5 != null && asset.sub_asset_size_5 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_5, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_6') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_6 ? getAssetTypeDescription(asset.sub_asset_type_6) : ''}
                              >
                                {asset?.sub_asset_type_6 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_6') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_6 != null && asset.sub_asset_size_6 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_6, false) : ''}
                              </td>
                            </tr>
                          );
                        }
                        
                        // If this is an "after" row but there's no "before" row, render it with its own asset_id
                        if (!isBefore && (!prevRow || prevRow.asset_id !== row.asset_id || !prevRow.is_before_row)) {
                          const handleAssetIdClick = (e: any) => {
                            e.stopPropagation();
                            const assetBuildingNumber = asset?.building_number || buildingNumber;
                            window.dispatchEvent(new CustomEvent('openAssetView', {
                              detail: {
                                assetDbId: row.asset_id,
                                assetId: String(row.asset_id),
                                buildingNumber: assetBuildingNumber,
                                taxRegion: undefined
                              }
                            }));
                          };
                          
                          return (
                            <tr key={`${row.asset_id}-after-only`} style={{ backgroundColor: bgColor }}>
                              <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">
                                <button
                                  onClick={handleAssetIdClick}
                                  className="text-app-accent hover:text-app-accent-hover hover:underline cursor-pointer font-semibold"
                                  title="פתח פרטי נכס"
                                >
                                  {row.asset_id}
                                </button>
                              </td>
                              <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">אחרי</td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'main_asset_type') ? 'font-bold italic' : ''}`}
                                title={asset?.main_asset_type ? getAssetTypeDescription(asset.main_asset_type) : ''}
                              >
                                {asset?.main_asset_type || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'asset_size') ? 'font-bold italic' : ''}`}>
                                {asset?.asset_size != null && asset.asset_size !== 0 ? formatNumberToTwoDecimals(asset.asset_size, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_1') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_1 ? getAssetTypeDescription(asset.sub_asset_type_1) : ''}
                              >
                                {asset?.sub_asset_type_1 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_1') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_1 != null && asset.sub_asset_size_1 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_1, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_2') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_2 ? getAssetTypeDescription(asset.sub_asset_type_2) : ''}
                              >
                                {asset?.sub_asset_type_2 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_2') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_2 != null && asset.sub_asset_size_2 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_2, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_3') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_3 ? getAssetTypeDescription(asset.sub_asset_type_3) : ''}
                              >
                                {asset?.sub_asset_type_3 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_3') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_3 != null && asset.sub_asset_size_3 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_3, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_4') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_4 ? getAssetTypeDescription(asset.sub_asset_type_4) : ''}
                              >
                                {asset?.sub_asset_type_4 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_4') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_4 != null && asset.sub_asset_size_4 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_4, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_5') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_5 ? getAssetTypeDescription(asset.sub_asset_type_5) : ''}
                              >
                                {asset?.sub_asset_type_5 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_5') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_5 != null && asset.sub_asset_size_5 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_5, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_6') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_6 ? getAssetTypeDescription(asset.sub_asset_type_6) : ''}
                              >
                                {asset?.sub_asset_type_6 || ''}
                              </td>
                              <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_6') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_6 != null && asset.sub_asset_size_6 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_6, false) : ''}
                              </td>
                            </tr>
                          );
                        }
                        
                        const handleAssetIdClick = (e: any) => {
                          e.stopPropagation();
                          const assetBuildingNumber = asset?.building_number || buildingNumber;
                          window.dispatchEvent(new CustomEvent('openAssetView', {
                            detail: {
                              assetDbId: row.asset_id,
                              assetId: String(row.asset_id),
                              buildingNumber: assetBuildingNumber,
                              taxRegion: undefined
                            }
                          }));
                        };
                        
                        // Check if there's an "after" row following this "before" row
                        const nextRow = idx < rowData.length - 1 ? rowData[idx + 1] : null;
                        const hasAfterRow = nextRow && nextRow.asset_id === row.asset_id && !nextRow.is_before_row;
                        const rowSpanValue = hasAfterRow ? 2 : 1;
                        
                        return (
                          <tr key={`${row.asset_id}-before`} style={{ backgroundColor: bgColor }}>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold" rowSpan={rowSpanValue} style={{ verticalAlign: 'middle' }}>
                              <button
                                onClick={handleAssetIdClick}
                                className="text-app-accent hover:text-app-accent-hover hover:underline cursor-pointer font-semibold"
                                title="פתח פרטי נכס"
                              >
                                {row.asset_id}
                              </button>
                            </td>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">לפני</td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'main_asset_type') ? 'font-bold italic' : ''}`}
                              title={asset?.main_asset_type ? getAssetTypeDescription(asset.main_asset_type) : ''}
                            >
                              {asset?.main_asset_type || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'asset_size') ? 'font-bold italic' : ''}`}>
                              {asset?.asset_size != null && asset.asset_size !== 0 ? formatNumberToTwoDecimals(asset.asset_size, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_1') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_1 ? getAssetTypeDescription(asset.sub_asset_type_1) : ''}
                            >
                              {asset?.sub_asset_type_1 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_1') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_1 != null && asset.sub_asset_size_1 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_1, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_2') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_2 ? getAssetTypeDescription(asset.sub_asset_type_2) : ''}
                            >
                              {asset?.sub_asset_type_2 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_2') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_2 != null && asset.sub_asset_size_2 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_2, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_3') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_3 ? getAssetTypeDescription(asset.sub_asset_type_3) : ''}
                            >
                              {asset?.sub_asset_type_3 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_3') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_3 != null && asset.sub_asset_size_3 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_3, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_4') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_4 ? getAssetTypeDescription(asset.sub_asset_type_4) : ''}
                            >
                              {asset?.sub_asset_type_4 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_4') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_4 != null && asset.sub_asset_size_4 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_4, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_5') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_5 ? getAssetTypeDescription(asset.sub_asset_type_5) : ''}
                            >
                              {asset?.sub_asset_type_5 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_5') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_5 != null && asset.sub_asset_size_5 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_5, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_6') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_6 ? getAssetTypeDescription(asset.sub_asset_type_6) : ''}
                            >
                              {asset?.sub_asset_type_6 || ''}
                            </td>
                            <td className={`border border-gray-300 px-2 py-1.5 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_6') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_6 != null && asset.sub_asset_size_6 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_6, false) : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    );

  if (inline) {
    return content;
  }

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      dir="rtl"
    >
      {content}
    </div>
  );
}

