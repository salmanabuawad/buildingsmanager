import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Home, Building as BuildingIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Apartment, Building } from '../lib/api';

interface SearchResult extends Apartment {
  building_name: string;
}

interface UnitSearchProps {
  onSelectApartment: (apartmentId: string, apartmentNumber: string, buildingId: string) => void;
}

export function UnitSearch({ onSelectApartment }: UnitSearchProps) {
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
      const { data, error } = await supabase
        .from('apartments')
        .select(`
          *,
          buildings (
            name
          )
        `)
        .gte('apartment_number', fromNumber)
        .lte('apartment_number', toNumber)
        .order('apartment_number');

      if (error) throw error;

      const formattedResults: SearchResult[] = (data || []).map((item: any) => ({
        ...item,
        building_name: item.buildings?.name || 'Unknown Building'
      }));

      setResults(formattedResults);
    } catch (error) {
      console.error('Error searching apartments:', error);
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
      <div className="mb-6 sm:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Search className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
            {t('unitSearch') || 'Unit Search'}
          </h1>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('fromUnitNumber') || 'From Unit Number'}
              </label>
              <input
                type="text"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="101"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('toUnitNumber') || 'To Unit Number'}
              </label>
              <input
                type="text"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                placeholder="999"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !fromNumber || !toNumber}
              className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="h-5 w-5" />
              {loading ? (t('loading') || 'Loading...') : (t('search') || 'Search')}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
            >
              {t('reset') || 'Reset'}
            </button>
          </div>
        </form>
      </div>

      {hasSearched && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {t('searchResults') || 'Search Results'} ({results.length})
          </h2>

          {results.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Home className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">{t('noUnitsFound') || 'No units found in this range'}</p>
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
                      {t('unitNumber') || 'Unit Number'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('building') || 'Building'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('floor') || 'Floor'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('apartmentArea') || 'Apartment Area'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('storageArea') || 'Storage Area'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('pergolaArea') || 'Pergola Area'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('balconyArea') || 'Balcony Area'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('gardenArea') || 'Garden Area'}
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                      {t('totalArea') || 'Total Area'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((unit) => (
                    <tr
                      key={unit.id}
                      className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onSelectApartment(unit.id, unit.apartment_number, unit.building_id)}
                          className="px-4 py-1.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
                        >
                          {t('viewDetails') || 'View Details'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {unit.apartment_number}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-2">
                          <BuildingIcon className="h-4 w-4 text-teal-600" />
                          {unit.building_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.floor || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.apartment_area.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.storage_area.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.pergola_area.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.balcony_area.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {unit.garden_area?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">
                        {unit.total_apartment_area.toFixed(2)}
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
