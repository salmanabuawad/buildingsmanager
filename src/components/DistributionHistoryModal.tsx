import { useState, useEffect } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import { DistributionAudit, api } from '../lib/api';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';

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
  const [isClosing, setIsClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<DistributionAudit[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DistributionAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const data = await api.distributionAudit.getByBuilding(buildingNumber, 'distribution');
      setHistory(data);
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
        } max-w-5xl w-full max-h-[90vh] flex flex-col`}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-semibold text-gray-600">תאריך:</span>
                    <p className="text-lg">{formatDateToDDMMYYYY(selectedRecord.created_at)}</p>
                  </div>
                  {selectedRecord.shared_area_size !== null && selectedRecord.shared_area_size !== undefined && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">שטח משותף:</span>
                      <p className="text-lg">{selectedRecord.shared_area_size.toLocaleString('he-IL')}</p>
                    </div>
                  )}
                  {selectedRecord.overload_ratio !== null && selectedRecord.overload_ratio !== undefined && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">אחוז העמסה:</span>
                      <p className="text-lg">{selectedRecord.overload_ratio.toFixed(2)}%</p>
                    </div>
                  )}
                  {selectedRecord.description && (
                    <div className="col-span-2">
                      <span className="text-sm font-semibold text-gray-600">תיאור:</span>
                      <p className="text-lg">{selectedRecord.description}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Before Assets */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-800">נכסים לפני פיזור ({selectedRecord.affected_assets_before.length})</h3>
                  <div className="bg-red-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                      {selectedRecord.affected_assets_before.map((asset, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border border-red-200">
                          <div className="text-sm">
                            <span className="font-semibold">נכס:</span> {asset.asset_id}
                            {asset.area_from_distribution !== null && asset.area_from_distribution !== undefined && (
                              <span className="mr-4">
                                <span className="font-semibold">שטח משותף:</span> {asset.area_from_distribution.toLocaleString('he-IL')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* After Assets */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-800">נכסים אחרי פיזור ({selectedRecord.affected_assets_after.length})</h3>
                  <div className="bg-green-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                      {selectedRecord.affected_assets_after.map((asset, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border border-green-200">
                          <div className="text-sm">
                            <span className="font-semibold">נכס:</span> {asset.asset_id}
                            {asset.area_from_distribution !== null && asset.area_from_distribution !== undefined && (
                              <span className="mr-4">
                                <span className="font-semibold">שטח משותף:</span> {asset.area_from_distribution.toLocaleString('he-IL')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
                      <div>
                        <div className="font-semibold text-lg">
                          {formatDateToDDMMYYYY(record.created_at)}
                        </div>
                        {record.shared_area_size !== null && record.shared_area_size !== undefined && (
                          <div className="text-sm text-gray-600">
                            שטח משותף: {record.shared_area_size.toLocaleString('he-IL')}
                          </div>
                        )}
                        {record.overload_ratio !== null && record.overload_ratio !== undefined && (
                          <div className="text-sm text-gray-600">
                            אחוז העמסה: {record.overload_ratio.toFixed(2)}%
                          </div>
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


