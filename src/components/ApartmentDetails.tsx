import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apartment, Building, api } from '../lib/api';
import { Edit2, Save, X, Home } from 'lucide-react';
import { MeasurementHistory } from './MeasurementHistory';

interface ApartmentDetailsProps {
  apartmentId: string;
  onDataUpdate?: () => void;
}

export function ApartmentDetails({ apartmentId, onDataUpdate }: ApartmentDetailsProps) {
  const { t } = useTranslation();
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [editValues, setEditValues] = useState({
    apartment_area: 0,
    storage_area: 0,
    pergola_area: 0,
    balcony_area: 0,
  });

  useEffect(() => {
    fetchData();
  }, [apartmentId]);

  async function fetchData() {
    try {
      setLoading(true);

      const apartmentData = await api.apartments.getOne(apartmentId);
      if (!apartmentData) throw new Error('Apartment not found');

      setApartment(apartmentData);
      setEditValues({
        apartment_area: parseFloat(apartmentData.apartment_area.toString()),
        storage_area: parseFloat(apartmentData.storage_area.toString()),
        pergola_area: parseFloat(apartmentData.pergola_area.toString()),
        balcony_area: parseFloat(apartmentData.balcony_area.toString()),
      });

      const buildingData = await api.buildings.getOne(apartmentData.building_id);
      setBuilding(buildingData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartment details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!apartment) return;

    try {
      setIsSaving(true);
      setSaveMessage(null);

      await api.apartments.update(apartmentId, {
        apartment_area: editValues.apartment_area,
        storage_area: editValues.storage_area,
        pergola_area: editValues.pergola_area,
        balcony_area: editValues.balcony_area,
      });

      await fetchData();
      setIsEditing(false);
      setSaveMessage({ type: 'success', text: t('saveSuccess') });
      setTimeout(() => setSaveMessage(null), 3000);

      if (onDataUpdate) {
        onDataUpdate();
      }

    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: `${t('saveError')}: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (!apartment) return;
    setEditValues({
      apartment_area: parseFloat(apartment.apartment_area.toString()),
      storage_area: parseFloat(apartment.storage_area.toString()),
      pergola_area: parseFloat(apartment.pergola_area.toString()),
      balcony_area: parseFloat(apartment.balcony_area.toString()),
    });
    setIsEditing(false);
    setSaveMessage(null);
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

  if (error || !apartment) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{t('error')}: {error || 'Apartment not found'}</p>
        </div>
      </div>
    );
  }

  const totalArea = editValues.apartment_area + editValues.storage_area +
                   editValues.pergola_area + editValues.balcony_area;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
      <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 sm:mb-2">
            <Home className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
              {t('unit')} {apartment.apartment_number}
            </h1>
          </div>
          {building && (
            <p className="text-sm sm:text-base text-teal-50">{building.name}</p>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center justify-center gap-2 px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold flex-1 sm:flex-none"
            >
              <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">{t('edit')}</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-6 py-0.5 bg-white text-red-600 border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm hover:shadow-md disabled:opacity-50 text-sm font-semibold flex-1"
              >
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">{t('cancel')}</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-6 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg hover:scale-105 disabled:opacity-50 text-sm font-semibold flex-1"
              >
                <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">{isSaving ? t('loading') : t('save')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {saveMessage && (
        <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${
          saveMessage.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">{t('basicInfo')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('unitNumber')}</label>
              <p className="text-base sm:text-lg text-slate-900">{apartment.apartment_number}</p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600">{t('buildingName2')}</label>
              <p className="text-base sm:text-lg text-slate-900">{building?.name}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">{t('propertyDetails')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('apartmentArea')}
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editValues.apartment_area}
                  onChange={(e) => setEditValues({ ...editValues, apartment_area: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm sm:text-base"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{apartment.apartment_area.toLocaleString()}</p>
              )}
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('storageArea')}
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editValues.storage_area}
                  onChange={(e) => setEditValues({ ...editValues, storage_area: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm sm:text-base"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{apartment.storage_area.toLocaleString()}</p>
              )}
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('pergolaArea')}
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editValues.pergola_area}
                  onChange={(e) => setEditValues({ ...editValues, pergola_area: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm sm:text-base"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{apartment.pergola_area.toLocaleString()}</p>
              )}
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('balconyArea')}
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editValues.balcony_area}
                  onChange={(e) => setEditValues({ ...editValues, balcony_area: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm sm:text-base"
                />
              ) : (
                <p className="text-base sm:text-lg text-slate-900">{apartment.balcony_area.toLocaleString()}</p>
              )}
            </div>
          </div>

          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200">
            <div>
              <label className="text-xs sm:text-sm font-medium text-slate-600 block mb-1 sm:mb-2">
                {t('totalArea')}
              </label>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">
                {isEditing ? totalArea.toLocaleString() : apartment.total_apartment_area.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-6">
          <MeasurementHistory apartmentId={apartmentId} />
        </div>
      </div>
    </div>
  );
}
