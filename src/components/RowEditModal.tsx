import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Asset, AssetType } from '../lib/api';
import { useTranslation } from 'react-i18next';

interface RowEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: Asset | null;
  assetTypes: AssetType[];
  onSave: (updatedData: Partial<Asset>) => void;
}

export function RowEditModal({ isOpen, onClose, rowData, assetTypes, onSave }: RowEditModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Asset>>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (rowData) {
      setFormData({ ...rowData });
      setDateError(null);
    }
  }, [rowData]);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  if (!isOpen || !rowData) return null;

  // Helper function to get asset type description for tooltip
  const getAssetTypeTooltip = (typeCode: string | null | undefined): string => {
    if (!typeCode) return '';
    const assetType = assetTypes.find(at => at.name === typeCode);
    return assetType?.description || typeCode;
  };

  // Helper function to validate that date is not greater than current date
  const validateDateNotGreaterThanToday = (dateStr: string): { valid: boolean; error?: string } => {
    if (!dateStr || dateStr === '01/01/1900' || dateStr.trim() === '') {
      return { valid: true };
    }

    const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.trim().match(dateFormatPattern);
    
    if (!match) {
      return { valid: true }; // Format validation is handled elsewhere
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    // Create date object
    const inputDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Set to end of today

    // Check if input date is greater than today
    if (inputDate > today) {
      return {
        valid: false,
        error: 'תאריך מדידה לא יכול להיות גדול מתאריך נוכחי'
      };
    }

    return { valid: true };
  };

  const handleFieldChange = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Validate date when measurement_date changes
    if (field === 'measurement_date') {
      const validation = validateDateNotGreaterThanToday(value);
      if (!validation.valid) {
        setDateError(validation.error || 'תאריך לא תקין');
      } else {
        setDateError(null);
      }
    }
  };

  const handleSave = () => {
    // Validate measurement_date before saving
    if (formData.measurement_date) {
      const dateValidation = validateDateNotGreaterThanToday(formData.measurement_date);
      if (!dateValidation.valid) {
        setDateError(dateValidation.error || 'תאריך לא תקין');
        return;
      }
    }

    // Create a diff object with only changed fields
    const changes: Partial<Asset> = {};
    Object.keys(formData).forEach(key => {
      const fieldKey = key as keyof Asset;
      if (formData[fieldKey] !== rowData[fieldKey]) {
        changes[fieldKey] = formData[fieldKey];
      }
    });
    
    if (Object.keys(changes).length > 0) {
      onSave(changes);
    }
    handleClose();
  };

  const handleCancel = () => {
    // Restore original row data and clear all validation errors
    setFormData({ ...rowData });
    setDateError(null);
    handleClose();
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleCancel}
    >
      <div 
        className={`bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 border border-gray-100 ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900 bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">עריכת נכס</h3>
            {formData.asset_id && (
              <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                {formData.asset_id}
              </span>
            )}
          </div>
          <button
            onClick={handleCancel}
            className="text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {/* Measurement Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('measurementDate')}
              </label>
              <input
                type="text"
                value={formData.measurement_date || ''}
                onChange={(e) => handleFieldChange('measurement_date', e.target.value)}
                placeholder="DD/MM/YYYY"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right ${
                  dateError ? 'border-red-500 bg-red-50' : 'border-slate-300'
                }`}
                maxLength={10}
              />
              {dateError && (
                <p className="mt-1 text-xs text-red-600">{dateError}</p>
              )}
            </div>

            {/* Asset ID */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('assetId')}
              </label>
              <input
                type="text"
                value={formData.asset_id || ''}
                onChange={(e) => handleFieldChange('asset_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>

            {/* Payer ID */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('payerId')}
              </label>
              <input
                type="text"
                value={formData.payer_id || ''}
                onChange={(e) => handleFieldChange('payer_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>

            {/* Tax Region */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                אזור מס
              </label>
              <input
                type="number"
                value={formData.tax_region ?? ''}
                onChange={(e) => handleFieldChange('tax_region', e.target.value === '' ? undefined : parseInt(e.target.value) || undefined)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                placeholder="אזור מס"
              />
            </div>

            {/* Main Asset Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('mainAssetType')}
              </label>
              <input
                type="text"
                value={formData.main_asset_type || ''}
                onChange={(e) => handleFieldChange('main_asset_type', e.target.value)}
                title={getAssetTypeTooltip(formData.main_asset_type)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>

            {/* Asset Size */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('mainAssetSize')}
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.asset_size || 0}
                onChange={(e) => handleFieldChange('asset_size', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>

            {/* Penthouse */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                דירת גג
              </label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  checked={formData.penthouse === 'כן'}
                  onChange={(e) => handleFieldChange('penthouse', e.target.checked ? 'כן' : null)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span className="mr-2 text-sm text-slate-600">כן</span>
              </div>
            </div>

            {/* Floor */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                קומה
              </label>
              <input
                type="number"
                value={formData.floor ?? ''}
                onChange={(e) => handleFieldChange('floor', e.target.value === '' ? undefined : parseInt(e.target.value) || undefined)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                placeholder="קומה"
              />
            </div>

            {/* Discount Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                סוג הנחה
              </label>
              <input
                type="text"
                value={formData.discount_type || ''}
                onChange={(e) => handleFieldChange('discount_type', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                placeholder="סוג הנחה"
              />
            </div>

            {/* Discount Date From */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                תאריך הנחה מ
              </label>
              <input
                type="text"
                value={formData.discount_date_from || ''}
                onChange={(e) => handleFieldChange('discount_date_from', e.target.value || undefined)}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                maxLength={10}
              />
            </div>

            {/* Discount Date To */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                תאריך הנחה עד
              </label>
              <input
                type="text"
                value={formData.discount_date_to || ''}
                onChange={(e) => handleFieldChange('discount_date_to', e.target.value || undefined)}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                maxLength={10}
              />
            </div>

            {/* Comment */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                הערה
              </label>
              <textarea
                value={formData.comment || ''}
                onChange={(e) => handleFieldChange('comment', e.target.value || undefined)}
                placeholder="הערה"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right resize-vertical"
              />
            </div>

            {/* Sub Asset Types and Sizes - 2 sets per row */}
            {[0, 1, 2].map((rowIndex) => {
              const num1 = rowIndex * 2 + 1;
              const num2 = rowIndex * 2 + 2;
              return (
                <div key={rowIndex} className="col-span-3 grid grid-cols-6 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t(`subAssetType${num1}`)}
                    </label>
                    <input
                      type="text"
                      value={formData[`sub_asset_type_${num1}` as keyof Asset] as string || ''}
                      onChange={(e) => handleFieldChange(`sub_asset_type_${num1}` as keyof Asset, e.target.value)}
                      title={getAssetTypeTooltip(formData[`sub_asset_type_${num1}` as keyof Asset] as string)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t(`subAssetSize${num1}`)}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={(formData[`sub_asset_size_${num1}` as keyof Asset] as number) === 0 ? '' : (formData[`sub_asset_size_${num1}` as keyof Asset] as number || '')}
                      onChange={(e) => handleFieldChange(`sub_asset_size_${num1}` as keyof Asset, e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t(`subAssetType${num2}`)}
                    </label>
                    <input
                      type="text"
                      value={formData[`sub_asset_type_${num2}` as keyof Asset] as string || ''}
                      onChange={(e) => handleFieldChange(`sub_asset_type_${num2}` as keyof Asset, e.target.value)}
                      title={getAssetTypeTooltip(formData[`sub_asset_type_${num2}` as keyof Asset] as string)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t(`subAssetSize${num2}`)}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={(formData[`sub_asset_size_${num2}` as keyof Asset] as number) === 0 ? '' : (formData[`sub_asset_size_${num2}` as keyof Asset] as number || '')}
                      onChange={(e) => handleFieldChange(`sub_asset_size_${num2}` as keyof Asset, e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          >
            <X className="h-4 w-4" />
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          >
            <Save className="h-4 w-4" />
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}

