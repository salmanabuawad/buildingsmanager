import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Home, Building as BuildingIcon } from 'lucide-react';
import { api } from '../lib/apiClient';
import { Asset } from '../lib/api';

interface SearchResult extends Asset {
}

interface AssetSearchProps {
  onSelectAsset: (assetDbId: string, assetId: string, buildingNumber: number) => void;
}

export function AssetSearchByRange({ onSelectAsset }: AssetSearchProps) {
  const { t } = useTranslation();
  const [fromNumber, setFromNumber] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!fromNumber || !toNumber) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const { data, error } = await api
        .from('assets')
        .select('*')
        .gte('asset_id', fromNumber)
        .lte('asset_id', toNumber)
        .order('asset_id');

      if (error) throw error;

      setResults(data || []);
    } catch (error) {
      console.error('Error searching assets:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFromNumber('');
    setToNumber('');
    setResults([]);
    setHasSearched(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
      <div className="mb-6 sm:mb-8 page-header rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="page-header-icon shrink-0">
            <Search className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h1 className="page-header-title text-xl sm:text-2xl font-bold">
            {t('assetSearch') || 'Asset Search'}
          </h1>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-theme-card-border p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('fromAssetNumber') || 'From Asset ID'}
              </label>
              <input
                type="text"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="826812801"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-action-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('toAssetNumber') || 'To Asset ID'}
              </label>
              <input
                type="text"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                placeholder="826812899"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-action-accent"
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !fromNumber || !toNumber}
              className="flex items-center gap-2 px-6 py-2 bg-theme-tab-active hover:bg-theme-tab-active-hover active:bg-theme-tab-active-hover text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50  disabled:shadow-none"
            >
              <Search className="h-5 w-5" />
              {loading ? (t('loading') || 'Loading...') : (t('search') || 'Search')}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 rounded-md transition-all duration-200 shadow-sm hover:shadow-md"
            >
              {t('reset') || 'Reset'}
            </button>
          </div>
        </form>
      </div>

      {hasSearched && (
        <div className="bg-white rounded-xl shadow-lg border border-theme-card-border p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {t('searchResults') || 'Search Results'} ({results.length})
          </h2>

          {results.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Home className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">{t('noAssetsFound') || 'No assets found in this range'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('actions') || 'Actions'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('assetId') || 'Asset ID'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('payerId') || 'Payer ID'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('building') || 'Building'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('mainAssetType') || 'Main Type'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('mainAssetSize') || 'Main Size'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('totalSize') || 'Total Size'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((asset) => (
                    <tr
                      key={asset.asset_id}
                      className="border-b border-slate-100 hover:bg-theme-highlight/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onSelectAsset(String(asset.asset_id), String(asset.asset_id), asset.building_number)}
                          className="px-4 py-1.5 bg-gradient-to-r from-theme-tab-active to-theme-action-accent text-white rounded-lg hover:from-theme-tab-active-hover hover:to-theme-action-accent-hover transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
                        >
                          {t('viewDetails') || 'View Details'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onSelectAsset(String(asset.asset_id), String(asset.asset_id), asset.building_number)}
                          className="text-theme-link hover:text-theme-link-hover underline decoration-theme-link hover:decoration-theme-link-hover cursor-pointer transition-colors font-semibold"
                          title="לחץ כדי לפתוח את הנכס"
                        >
                          {asset.asset_id}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {asset.payer_id}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-2">
                          <BuildingIcon className="h-4 w-4 text-theme-tab-active" />
                          {asset.building_number}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {asset.main_asset_type || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {asset.asset_size != null && typeof asset.asset_size === 'number' ? asset.asset_size.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">
                        {asset.total_size != null && typeof asset.total_size === 'number' ? asset.total_size.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
