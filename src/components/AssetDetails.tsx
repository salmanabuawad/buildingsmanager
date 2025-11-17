import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Package, Edit2, Save, X, Loader2 } from 'lucide-react';
import { MeasurementHistory } from './MeasurementHistory';
import { Toast } from './Toast';

interface AssetDetailsProps {
  assetId: string;
  onDataUpdate?: () => void;
}

export function AssetDetails({ assetId, onDataUpdate }: AssetDetailsProps) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAsset, setEditedAsset] = useState<Partial<Asset>>({});

  useEffect(() => {
    fetchData();
  }, [assetId]);

  async function fetchData() {
    try {
      setLoading(true);

      const [assetData, assetTypesData] = await Promise.all([
        api.assets.getOne(assetId),
        api.assetTypes.getAll()
      ]);

      if (!assetData) throw new Error('Asset not found');

      setAsset(assetData);
      setEditedAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (asset) {
      setEditedAsset({ ...asset });
      setIsEditing(true);
    }
  }

  function cancelEdit() {
    if (asset) {
      setEditedAsset({ ...asset });
      setIsEditing(false);
    }
  }

  async function saveEdit() {
    try {
      await api.assets.update(assetId, editedAsset);
      await fetchData();
      setIsEditing(false);
      setToast({ message: t('assetUpdatedSuccessfully'), type: 'success' });
      if (onDataUpdate) {
        onDataUpdate();
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to update asset',
        type: 'error'
      });
    }
  }

  function updateField(field: keyof Asset, value: any) {
    setEditedAsset(prev => ({ ...prev, [field]: value }));
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

  const subAssets = [
    { type: asset.sub_asset_type_1, size: asset.sub_asset_size_1 },
    { type: asset.sub_asset_type_2, size: asset.sub_asset_size_2 },
    { type: asset.sub_asset_type_3, size: asset.sub_asset_size_3 },
    { type: asset.sub_asset_type_4, size: asset.sub_asset_size_4 },
    { type: asset.sub_asset_type_5, size: asset.sub_asset_size_5 },
    { type: asset.sub_asset_type_6, size: asset.sub_asset_size_6 },
  ].filter(sub => sub.type && sub.size > 0);

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
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
      <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1 sm:mb-2">
            <Home className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
                {t('assetId')}: {asset.asset_id}
              </h1>
              {building && (
                <p className="text-sm sm:text-base text-teal-50">
                  {t('building')} {building.building_number}
                </p>
              )}
            </div>
          </div>
          {!isEditing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
            >
              <Edit2 className="h-5 w-5" />
              <span className="hidden sm:inline">{t('edit')}</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Save className="h-5 w-5" />
                <span className="hidden sm:inline">{t('save')}</span>
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm"
              >
                <X className="h-5 w-5" />
                <span className="hidden sm:inline">{t('cancel')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 mb-6">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">{t('basicInfo')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('assetId')}</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedAsset.asset_id || ''}
                  onChange={(e) => updateField('asset_id', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{asset.asset_id}</p>
              )}
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('payerId')}</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editedAsset.payer_id || ''}
                  onChange={(e) => updateField('payer_id', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{asset.payer_id}</p>
              )}
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('buildingNumber')}</label>
              <p className="text-base sm:text-lg text-slate-900">{asset.building_number}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('totalSize')}</label>
              <p className="text-xl sm:text-2xl font-bold text-teal-600">{asset.asset_size.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" />
            {t('mainAsset')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('mainAssetType')}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedAsset.main_asset_type || ''}
                  onChange={(e) => updateField('main_asset_type', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              ) : (
                <div className="group relative inline-block">
                  <p className="text-base sm:text-lg text-slate-900">{asset.main_asset_type || '-'}</p>
                  {asset.main_asset_type && assetTypes.find(at => at.name === asset.main_asset_type)?.description && (
                    <span className="invisible group-hover:visible absolute z-10 p-3 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-sm rounded-lg shadow-xl -top-10 left-0 whitespace-nowrap">
                      {assetTypes.find(at => at.name === asset.main_asset_type)?.description}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('mainAssetSize')}
              </label>
              {isEditing ? (
                <input
                  type="number"
                  value={editedAsset.asset_size || 0}
                  onChange={(e) => updateField('asset_size', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{asset.asset_size.toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">
            {t('subAssets')}
          </h2>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((num) => {
              const typeField = `sub_asset_type_${num}` as keyof Asset;
              const sizeField = `sub_asset_size_${num}` as keyof Asset;
              const typeValue = isEditing ? (editedAsset[typeField] as string) : (asset[typeField] as string);
              const sizeValue = isEditing ? (editedAsset[sizeField] as number) : (asset[sizeField] as number);

              if (!isEditing && (!typeValue || !sizeValue)) return null;

              return (
                <div key={num} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="flex items-center justify-center w-8 h-8 bg-teal-600 text-white rounded-full text-sm font-semibold">
                    {num}
                  </span>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">{t('type')}</p>
                      {isEditing ? (
                        <input
                          type="text"
                          value={typeValue || ''}
                          onChange={(e) => updateField(typeField, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder={t('type')}
                        />
                      ) : (
                        <div className="group relative inline-block">
                          <p className="text-base font-semibold text-slate-900">{typeValue}</p>
                          {typeValue && assetTypes.find(at => at.name === typeValue)?.description && (
                            <span className="invisible group-hover:visible absolute z-10 p-3 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-sm rounded-lg shadow-xl -top-10 left-0 whitespace-nowrap">
                              {assetTypes.find(at => at.name === typeValue)?.description}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">{t('size')}</p>
                      {isEditing ? (
                        <input
                          type="number"
                          value={sizeValue || 0}
                          onChange={(e) => updateField(sizeField, parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder="0"
                        />
                      ) : (
                        <p className="text-base font-semibold text-slate-900">{sizeValue.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100">
        <div className="p-4 sm:p-6">
          <MeasurementHistory assetId={assetId} />
        </div>
      </div>
    </div>
    </>
  );
}
