import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, api } from '../lib/api';
import { Home, Package } from 'lucide-react';
import { MeasurementHistory } from './MeasurementHistory';

interface ApartmentDetailsProps {
  apartmentId: string;
  onDataUpdate?: () => void;
}

export function ApartmentDetails({ apartmentId, onDataUpdate }: ApartmentDetailsProps) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [apartmentId]);

  async function fetchData() {
    try {
      setLoading(true);

      const assetData = await api.assets.getOne(apartmentId);
      if (!assetData) throw new Error('Asset not found');

      setAsset(assetData);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
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
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
      <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-1 sm:mb-2">
          <Home className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
            {t('assetId')}: {asset.asset_id}
          </h1>
        </div>
        {building && (
          <p className="text-sm sm:text-base text-teal-50">
            {t('building')} {building.building_number}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 mb-6">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">{t('basicInfo')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('assetId')}</label>
              <p className="text-base sm:text-lg text-slate-900">{asset.asset_id}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('payerId')}</label>
              <p className="text-base sm:text-lg text-slate-900">{asset.payer_id}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('buildingNumber')}</label>
              <p className="text-base sm:text-lg text-slate-900">{asset.building_number}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('totalSize')}</label>
              <p className="text-xl sm:text-2xl font-bold text-teal-600">{asset.total_size.toLocaleString()}</p>
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
              <p className="text-base sm:text-lg text-slate-900">{asset.main_asset_type || '-'}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('mainAssetSize')}
              </label>
              <p className="text-base sm:text-lg text-slate-900">{asset.main_asset_size.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {subAssets.length > 0 && (
          <div className="border-t border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">
              {t('subAssets')} ({subAssets.length})
            </h2>
            <div className="space-y-3">
              {subAssets.map((subAsset, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 bg-teal-600 text-white rounded-full text-sm font-semibold">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm text-slate-600">{t('type')}</p>
                      <p className="text-base font-semibold text-slate-900">{subAsset.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">{t('size')}</p>
                    <p className="text-base font-semibold text-slate-900">{subAsset.size.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100">
        <div className="p-4 sm:p-6">
          <MeasurementHistory apartmentId={apartmentId} />
        </div>
      </div>
    </div>
  );
}
