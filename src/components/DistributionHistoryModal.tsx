import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import { DistributionAudit, api, Asset, AssetType } from '../lib/api';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';
import { useTranslation } from 'react-i18next';

interface DistributionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildingNumber: number;
}

export function DistributionHistoryModal({
  isOpen,
  onClose,
  buildingNumber,
}: DistributionHistoryModalProps) {
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

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyData, assetTypesData] = await Promise.all([
        api.distributionAudit.getByBuilding(buildingNumber, 'distribution'),
        api.assetTypes.getAll()
      ]);
      setHistory(historyData);
      setAssetTypes(assetTypesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת היסטוריית פיזור');
      console.error('Error loading distribution history:', err);
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

  const handleBackToList = () => {
    setSelectedRecord(null);
  };

  // Get asset type description
  const getAssetTypeDescription = (typeName: string | undefined): string => {
    if (!typeName) return '';
    const assetType = assetTypes.find(at => at.name === typeName);
    return assetType?.description || typeName;
  };

  // Check if a value changed between before and after
  const isValueChanged = (assetId: number, field: string): boolean => {
    if (!selectedRecord) return false;
    const beforeAsset = selectedRecord.affected_assets_before.find(a => a.asset_id === assetId);
    const afterAsset = selectedRecord.affected_assets_after.find(a => a.asset_id === assetId);
    if (!beforeAsset || !afterAsset) return false;
    
    const beforeValue = (beforeAsset as any)[field];
    const afterValue = (afterAsset as any)[field];
    
    // Handle null/undefined
    if (beforeValue == null && afterValue == null) return false;
    if (beforeValue == null || afterValue == null) return true;
    
    // Compare values (handle numbers and strings)
    return beforeValue !== afterValue;
  };

  // Create row data with before and after rows for each asset
  const rowData = useMemo(() => {
    if (!selectedRecord) return [];
    
    const beforeMap = new Map<number, Asset>();
    selectedRecord.affected_assets_before.forEach(asset => {
      beforeMap.set(asset.asset_id, asset);
    });
    
    const afterMap = new Map<number, Asset>();
    selectedRecord.affected_assets_after.forEach(asset => {
      afterMap.set(asset.asset_id, asset);
    });
    
    // Get all unique asset IDs, sorted
    const allAssetIds = Array.from(new Set([
      ...Array.from(beforeMap.keys()),
      ...Array.from(afterMap.keys())
    ])).sort((a, b) => a - b);
    
    // Create rows: for each asset, create two rows (before and after)
    const rows: any[] = [];
    allAssetIds.forEach(assetId => {
      const beforeAsset = beforeMap.get(assetId);
      const afterAsset = afterMap.get(assetId);
      
      // Before row
      rows.push({
        asset_id: assetId,
        is_before_row: true,
        asset: beforeAsset,
      });
      
      // After row
      rows.push({
        asset_id: assetId,
        is_before_row: false,
        asset: afterAsset,
      });
    });
    
    return rows;
  }, [selectedRecord]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      dir="rtl"
    >
      <div
        className={`bg-white rounded-xl shadow-2xl p-4 sm:p-6 transition-all duration-300 border border-gray-100 ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        } max-w-[95vw] w-full max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-t-lg bg-teal-50 border-b border-teal-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {selectedRecord ? 'פרטי פיזור שטח משותף' : `היסטוריית פיזור שטח משותף - מבנה ${buildingNumber}`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="סגור"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
              <span className="mr-3 text-gray-600">טוען היסטוריה...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : selectedRecord ? (
            // Record Details View
            <div className="space-y-4">
              <button
                onClick={handleBackToList}
                className="mb-4 text-teal-600 hover:text-teal-700 font-medium flex items-center gap-2"
              >
                ← חזרה לרשימה
              </button>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap gap-4 items-baseline">
                  <span className="text-sm font-semibold text-gray-600">תאריך:</span>
                  <span className="text-lg">{formatDateToDDMMYYYY(selectedRecord.created_at)}</span>
                  {selectedRecord.shared_area_size !== null && selectedRecord.shared_area_size !== undefined && (
                    <>
                      <span className="text-sm font-semibold text-gray-600 mr-2">שטח משותף:</span>
                      <span className="text-lg">{selectedRecord.shared_area_size.toLocaleString('he-IL')}</span>
                    </>
                  )}
                  {selectedRecord.overload_ratio !== null && selectedRecord.overload_ratio !== undefined && (
                    <>
                      <span className="text-sm font-semibold text-gray-600 mr-2">אחוז העמסה:</span>
                      <span className="text-lg">{selectedRecord.overload_ratio.toFixed(2)}%</span>
                    </>
                  )}
                </div>
                {selectedRecord.description && (
                  <div>
                    <span className="text-sm font-semibold text-gray-600">תיאור:</span>
                    <p className="text-lg">{selectedRecord.description}</p>
                  </div>
                )}
              </div>

                <div>
                <h3 className="text-lg font-bold mb-3 text-gray-800">
                  נכסים - לפני ואחרי פיזור ({selectedRecord.affected_assets_before.length} נכסים)
                </h3>
                <div className="rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: '600px' }}>
                  <table className="w-full border-collapse" dir="rtl">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('assetId')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">סטטוס</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">גודל שטח משותף</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('mainAssetType')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('mainAssetSize')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType1')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize1')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType2')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize2')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType3')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize3')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType4')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize4')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType5')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize5')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetType6')}</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{t('subAssetSize6')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowData.map((row, idx) => {
                        const asset = row.asset;
                        const isBefore = row.is_before_row;
                        const bgColor = isBefore ? '#fee2e2' : '#dcfce7';
                        const isSecondRow = !isBefore && idx > 0 && rowData[idx - 1].asset_id === row.asset_id;
                        
                        if (isSecondRow) {
                          // Second row (after) - skip asset_id cell because it's spanned from first row
                          return (
                            <tr key={`${row.asset_id}-after`} style={{ backgroundColor: bgColor }}>
                              <td className="border border-gray-300 px-3 py-2 text-right font-semibold">אחרי</td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'area_from_distribution') ? 'font-bold italic' : ''}`}>
                                {asset?.area_from_distribution != null && asset.area_from_distribution !== 0 ? formatNumberToTwoDecimals(asset.area_from_distribution, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'main_asset_type') ? 'font-bold italic' : ''}`}
                                title={asset?.main_asset_type ? getAssetTypeDescription(asset.main_asset_type) : ''}
                              >
                                {asset?.main_asset_type || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'asset_size') ? 'font-bold italic' : ''}`}>
                                {asset?.asset_size != null && asset.asset_size !== 0 ? formatNumberToTwoDecimals(asset.asset_size, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_1') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_1 ? getAssetTypeDescription(asset.sub_asset_type_1) : ''}
                              >
                                {asset?.sub_asset_type_1 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_1') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_1 != null && asset.sub_asset_size_1 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_1, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_2') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_2 ? getAssetTypeDescription(asset.sub_asset_type_2) : ''}
                              >
                                {asset?.sub_asset_type_2 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_2') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_2 != null && asset.sub_asset_size_2 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_2, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_3') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_3 ? getAssetTypeDescription(asset.sub_asset_type_3) : ''}
                              >
                                {asset?.sub_asset_type_3 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_3') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_3 != null && asset.sub_asset_size_3 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_3, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_4') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_4 ? getAssetTypeDescription(asset.sub_asset_type_4) : ''}
                              >
                                {asset?.sub_asset_type_4 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_4') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_4 != null && asset.sub_asset_size_4 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_4, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_5') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_5 ? getAssetTypeDescription(asset.sub_asset_type_5) : ''}
                              >
                                {asset?.sub_asset_type_5 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_5') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_5 != null && asset.sub_asset_size_5 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_5, false) : ''}
                              </td>
                              <td 
                                className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_6') ? 'font-bold italic' : ''}`}
                                title={asset?.sub_asset_type_6 ? getAssetTypeDescription(asset.sub_asset_type_6) : ''}
                              >
                                {asset?.sub_asset_type_6 || ''}
                              </td>
                              <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_6') ? 'font-bold italic' : ''}`}>
                                {asset?.sub_asset_size_6 != null && asset.sub_asset_size_6 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_6, false) : ''}
                              </td>
                            </tr>
                          );
                        }
                        
                        return (
                          <tr key={`${row.asset_id}-before`} style={{ backgroundColor: bgColor }}>
                            <td className="border border-gray-300 px-3 py-2 text-right font-semibold" rowSpan={2} style={{ verticalAlign: 'middle' }}>
                              {row.asset_id}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right font-semibold">לפני</td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'area_from_distribution') ? 'font-bold italic' : ''}`}>
                              {asset?.area_from_distribution != null && asset.area_from_distribution !== 0 ? formatNumberToTwoDecimals(asset.area_from_distribution, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'main_asset_type') ? 'font-bold italic' : ''}`}
                              title={asset?.main_asset_type ? getAssetTypeDescription(asset.main_asset_type) : ''}
                            >
                              {asset?.main_asset_type || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'asset_size') ? 'font-bold italic' : ''}`}>
                              {asset?.asset_size != null && asset.asset_size !== 0 ? formatNumberToTwoDecimals(asset.asset_size, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_1') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_1 ? getAssetTypeDescription(asset.sub_asset_type_1) : ''}
                            >
                              {asset?.sub_asset_type_1 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_1') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_1 != null && asset.sub_asset_size_1 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_1, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_2') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_2 ? getAssetTypeDescription(asset.sub_asset_type_2) : ''}
                            >
                              {asset?.sub_asset_type_2 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_2') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_2 != null && asset.sub_asset_size_2 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_2, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_3') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_3 ? getAssetTypeDescription(asset.sub_asset_type_3) : ''}
                            >
                              {asset?.sub_asset_type_3 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_3') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_3 != null && asset.sub_asset_size_3 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_3, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_4') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_4 ? getAssetTypeDescription(asset.sub_asset_type_4) : ''}
                            >
                              {asset?.sub_asset_type_4 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_4') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_4 != null && asset.sub_asset_size_4 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_4, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_5') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_5 ? getAssetTypeDescription(asset.sub_asset_type_5) : ''}
                            >
                              {asset?.sub_asset_type_5 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_5') ? 'font-bold italic' : ''}`}>
                              {asset?.sub_asset_size_5 != null && asset.sub_asset_size_5 !== 0 ? formatNumberToTwoDecimals(asset.sub_asset_size_5, false) : ''}
                            </td>
                            <td 
                              className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_type_6') ? 'font-bold italic' : ''}`}
                              title={asset?.sub_asset_type_6 ? getAssetTypeDescription(asset.sub_asset_type_6) : ''}
                            >
                              {asset?.sub_asset_type_6 || ''}
                            </td>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isValueChanged(row.asset_id, 'sub_asset_size_6') ? 'font-bold italic' : ''}`}>
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
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">אין היסטוריית פיזור עבור מבנה זה</div>
          ) : (
            // History List View
            <div className="space-y-2">
              {history.map((record) => (
                <div
                  key={record.id}
                  onClick={() => handleRecordClick(record)}
                  className="bg-gray-50 hover:bg-teal-50 border border-gray-200 hover:border-teal-300 rounded-lg p-4 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-teal-600" />
                      <div className="flex flex-wrap gap-4 items-baseline">
                        <span className="text-sm font-semibold text-gray-600">תאריך:</span>
                        <span className="text-lg font-semibold">{formatDateToDDMMYYYY(record.created_at)}</span>
                        {record.shared_area_size !== null && record.shared_area_size !== undefined && (
                          <>
                            <span className="text-sm font-semibold text-gray-600">שטח משותף:</span>
                            <span className="text-lg">{record.shared_area_size.toLocaleString('he-IL')}</span>
                          </>
                        )}
                        {record.overload_ratio !== null && record.overload_ratio !== undefined && (
                          <>
                            <span className="text-sm font-semibold text-gray-600">אחוז העמסה:</span>
                            <span className="text-lg">{record.overload_ratio.toFixed(2)}%</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {record.affected_assets_after.length} נכסים
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


