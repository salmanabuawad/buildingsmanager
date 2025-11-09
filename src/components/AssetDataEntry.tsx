import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, Building } from '../lib/api';
import { Save, X, Plus } from 'lucide-react';

export function AssetDataEntry() {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    building_number: '',
    payer_id: '',
    asset_id: '',
    main_asset_type: '',
    main_asset_size: '',
    sub_asset_type_1: '',
    sub_asset_size_1: '',
    sub_asset_type_2: '',
    sub_asset_size_2: '',
    sub_asset_type_3: '',
    sub_asset_size_3: '',
    sub_asset_type_4: '',
    sub_asset_size_4: '',
    sub_asset_type_5: '',
    sub_asset_size_5: '',
    sub_asset_type_6: '',
    sub_asset_size_6: ''
  });

  useEffect(() => {
    fetchBuildings();
  }, []);

  const fetchBuildings = async () => {
    try {
      const data = await api.buildings.getAll();
      setBuildings(data);
    } catch (err) {
      console.error('Error fetching buildings:', err);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleReset = () => {
    setFormData({
      building_number: '',
      payer_id: '',
      asset_id: '',
      main_asset_type: '',
      main_asset_size: '',
      sub_asset_type_1: '',
      sub_asset_size_1: '',
      sub_asset_type_2: '',
      sub_asset_size_2: '',
      sub_asset_type_3: '',
      sub_asset_size_3: '',
      sub_asset_type_4: '',
      sub_asset_size_4: '',
      sub_asset_type_5: '',
      sub_asset_size_5: '',
      sub_asset_type_6: '',
      sub_asset_size_6: ''
    });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.building_number || !formData.payer_id || !formData.asset_id) {
        throw new Error('Building Number, Payer ID, and Asset ID are required');
      }

      const assetData: Omit<Asset, 'id' | 'created_at'> = {
        building_number: parseInt(formData.building_number),
        payer_id: formData.payer_id,
        asset_id: formData.asset_id,
        main_asset_type: formData.main_asset_type || undefined,
        main_asset_size: parseFloat(formData.main_asset_size) || 0,
        sub_asset_type_1: formData.sub_asset_type_1 || undefined,
        sub_asset_size_1: parseFloat(formData.sub_asset_size_1) || 0,
        sub_asset_type_2: formData.sub_asset_type_2 || undefined,
        sub_asset_size_2: parseFloat(formData.sub_asset_size_2) || 0,
        sub_asset_type_3: formData.sub_asset_type_3 || undefined,
        sub_asset_size_3: parseFloat(formData.sub_asset_size_3) || 0,
        sub_asset_type_4: formData.sub_asset_type_4 || undefined,
        sub_asset_size_4: parseFloat(formData.sub_asset_size_4) || 0,
        sub_asset_type_5: formData.sub_asset_type_5 || undefined,
        sub_asset_size_5: parseFloat(formData.sub_asset_size_5) || 0,
        sub_asset_type_6: formData.sub_asset_type_6 || undefined,
        sub_asset_size_6: parseFloat(formData.sub_asset_size_6) || 0,
        total_size:
          (parseFloat(formData.main_asset_size) || 0) +
          (parseFloat(formData.sub_asset_size_1) || 0) +
          (parseFloat(formData.sub_asset_size_2) || 0) +
          (parseFloat(formData.sub_asset_size_3) || 0) +
          (parseFloat(formData.sub_asset_size_4) || 0) +
          (parseFloat(formData.sub_asset_size_5) || 0) +
          (parseFloat(formData.sub_asset_size_6) || 0)
      };

      await api.assets.create(assetData);
      setSuccess('Asset created successfully!');
      handleReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
    } finally {
      setLoading(false);
    }
  };

  const totalSize =
    (parseFloat(formData.main_asset_size) || 0) +
    (parseFloat(formData.sub_asset_size_1) || 0) +
    (parseFloat(formData.sub_asset_size_2) || 0) +
    (parseFloat(formData.sub_asset_size_3) || 0) +
    (parseFloat(formData.sub_asset_size_4) || 0) +
    (parseFloat(formData.sub_asset_size_5) || 0) +
    (parseFloat(formData.sub_asset_size_6) || 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Plus className="h-8 w-8 text-white" />
          <h1 className="text-3xl font-bold text-white">Asset Data Entry</h1>
        </div>
        <p className="text-teal-50">Add new asset to the database</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border-l-4 border-green-500 rounded-lg p-4">
          <p className="text-green-800 font-medium">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('buildingNumber')} <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.building_number}
              onChange={(e) => handleChange('building_number', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            >
              <option value="">Select Building</option>
              {buildings.map(b => (
                <option key={b.building_number} value={b.building_number}>
                  {b.building_number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('payerId')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.payer_id}
              onChange={(e) => handleChange('payer_id', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('assetId')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.asset_id}
              onChange={(e) => handleChange('asset_id', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{t('mainAsset')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('mainAssetType')}
              </label>
              <input
                type="text"
                value={formData.main_asset_type}
                onChange={(e) => handleChange('main_asset_type', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('mainAssetSize')} (m²)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.main_asset_size}
                onChange={(e) => handleChange('main_asset_size', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{t('subAssets')}</h2>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(num => (
              <div key={num} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t(`subAssetType${num}`)}
                  </label>
                  <input
                    type="text"
                    value={formData[`sub_asset_type_${num}` as keyof typeof formData]}
                    onChange={(e) => handleChange(`sub_asset_type_${num}`, e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t(`subAssetSize${num}`)} (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData[`sub_asset_size_${num}` as keyof typeof formData]}
                    onChange={(e) => handleChange(`sub_asset_size_${num}`, e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-6">
          <div className="flex items-center justify-between bg-gradient-to-r from-teal-50 to-blue-50 p-4 rounded-lg">
            <span className="text-lg font-bold text-slate-800">{t('totalSize')}:</span>
            <span className="text-2xl font-bold text-teal-600">{totalSize.toFixed(2)} m²</span>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <Save className="h-5 w-5" />
            {loading ? 'Saving...' : t('save')}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
            {t('reset')}
          </button>
        </div>
      </form>
    </div>
  );
}
