import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetMeasurement, api } from '../lib/api';
import { Plus, Edit2, Trash2, Calendar, Save, X, Upload, FileText, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PDFViewer } from './PDFViewer';

interface MeasurementHistoryProps {
  assetId: string;
}

export function MeasurementHistory({ assetId }: MeasurementHistoryProps) {
  const { t } = useTranslation();
  const [measurements, setMeasurements] = useState<AssetMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewingDrawing, setPreviewingDrawing] = useState<string | null>(null);

  const emptyMeasurement = {
    asset_id: assetId,
    measurement_date: (() => {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    })(),
    asset_area: 0,
    storage_area: 0,
    pergola_area: 0,
    balcony_area: 0,
    garden_area: 0,
    notes: '',
    drawing_file_url: undefined,
  };

  const [newMeasurement, setNewMeasurement] = useState(emptyMeasurement);
  const [editValues, setEditValues] = useState<Partial<AssetMeasurement>>({});

  useEffect(() => {
    fetchMeasurements();
  }, [assetId]);

  async function fetchMeasurements() {
    try {
      setLoading(true);
      const data = await api.measurements.getAll(assetId);
      setMeasurements(data);
    } catch (error) {
      console.error('Error fetching measurements:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMeasurement() {
    try {
      await api.measurements.create(newMeasurement);
      setMessage({ type: 'success', text: t('measurementSaveSuccess') });
      setIsAdding(false);
      setNewMeasurement(emptyMeasurement);
      fetchMeasurements();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: t('measurementSaveError') });
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleUpdateMeasurement(id: string) {
    try {
      await api.measurements.update(id, editValues);
      setMessage({ type: 'success', text: t('measurementSaveSuccess') });
      setEditingId(null);
      setEditValues({});
      fetchMeasurements();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: t('measurementSaveError') });
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleDeleteMeasurement(id: string) {
    if (!confirm(t('deleteMeasurement') + '?')) return;

    try {
      await api.measurements.delete(id);
      setMessage({ type: 'success', text: t('measurementDeleteSuccess') });
      fetchMeasurements();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: t('measurementDeleteError') });
      setTimeout(() => setMessage(null), 3000);
    }
  }

  function startEdit(measurement: AssetMeasurement) {
    setEditingId(measurement.id);
    setEditValues({
      measurement_date: measurement.measurement_date,
      asset_area: measurement.asset_area,
      storage_area: measurement.storage_area,
      pergola_area: measurement.pergola_area,
      balcony_area: measurement.balcony_area,
      garden_area: measurement.garden_area,
      notes: measurement.notes,
      drawing_file_url: measurement.drawing_file_url,
    });
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>, measurementId: string) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadingFor(measurementId);

      const fileExt = file.name.split('.').pop();
      const filePath = `${apartmentId}/measurements/${measurementId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('dwg-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('dwg-files')
        .getPublicUrl(filePath);

      if (measurementId === 'new') {
        setNewMeasurement({ ...newMeasurement, drawing_file_url: publicUrl });
      } else if (editingId === measurementId) {
        setEditValues({ ...editValues, drawing_file_url: publicUrl });
      } else {
        await api.measurements.update(measurementId, { drawing_file_url: publicUrl });
        fetchMeasurements();
      }

      setMessage({ type: 'success', text: t('uploadSuccess') });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: t('uploadError') });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsUploading(false);
      setUploadingFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFileRemove(measurementId: string, fileUrl: string) {
    if (!confirm(t('removeFile') + '?')) return;

    try {
      setIsUploading(true);
      setUploadingFor(measurementId);

      const filePath = fileUrl.split('/dwg-files/')[1];
      if (filePath) {
        await supabase.storage.from('dwg-files').remove([filePath]);
      }

      if (measurementId === 'new') {
        setNewMeasurement({ ...newMeasurement, drawing_file_url: undefined });
      } else if (editingId === measurementId) {
        setEditValues({ ...editValues, drawing_file_url: undefined });
      } else {
        await api.measurements.update(measurementId, { drawing_file_url: null });
        fetchMeasurements();
      }

      setMessage({ type: 'success', text: t('removeSuccess') });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: t('removeError') });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsUploading(false);
      setUploadingFor(null);
    }
  }

  if (loading) {
    return <div className="text-center py-4">{t('loading')}</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900">{t('measurementHistory')}</h2>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          {t('addMeasurement')}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {isAdding && (
        <div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <h3 className="font-semibold text-slate-900 mb-3">{t('addMeasurement')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700 block mb-2">
                {t('dwgFile')}
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFileUpload(e, 'new')}
                className="hidden"
                ref={fileInputRef}
              />
              {!newMeasurement.drawing_file_url ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading && uploadingFor === 'new'}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading && uploadingFor === 'new' ? t('loading') : t('uploadDwgFile')}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading && uploadingFor === 'new'}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {t('changeFile')}
                  </button>
                  <button
                    onClick={() => handleFileRemove('new', newMeasurement.drawing_file_url!)}
                    disabled={isUploading && uploadingFor === 'new'}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('removeFile')}
                  </button>
                </div>
              )}
              {newMeasurement.drawing_file_url && previewingDrawing !== 'new' && (
                <button
                  onClick={() => setPreviewingDrawing('new')}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                >
                  <Eye className="h-4 w-4" />
                  {t('previewDrawing')}
                </button>
              )}
              {newMeasurement.drawing_file_url && previewingDrawing === 'new' && (
                <div className="mt-3">
                  <button
                    onClick={() => setPreviewingDrawing(null)}
                    className="mb-2 flex items-center gap-2 px-3 py-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm"
                  >
                    <X className="h-4 w-4" />
                    {t('closePreview')}
                  </button>
                  <PDFViewer fileUrl={newMeasurement.drawing_file_url} fileName="measurement-drawing.pdf" />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('measurementDate')}
              </label>
              <input
                type="date"
                value={newMeasurement.measurement_date}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, measurement_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('apartmentArea')}
              </label>
              <input
                type="number"
                value={newMeasurement.asset_area}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, asset_area: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('storageArea')}
              </label>
              <input
                type="number"
                value={newMeasurement.storage_area}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, storage_area: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('pergolaArea')}
              </label>
              <input
                type="number"
                value={newMeasurement.pergola_area}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, pergola_area: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('balconyArea')}
              </label>
              <input
                type="number"
                value={newMeasurement.balcony_area}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, balcony_area: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700 block mb-1">
                {t('notes')}
              </label>
              <textarea
                value={newMeasurement.notes}
                onChange={(e) =>
                  setNewMeasurement({ ...newMeasurement, notes: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddMeasurement}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
            >
              <Save className="h-4 w-4" />
              {t('save')}
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewMeasurement(emptyMeasurement);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {measurements.length === 0 ? (
        <div className="text-center py-8 text-slate-500">{t('noMeasurements')}</div>
      ) : (
        <div className="space-y-3">
          {measurements.map((measurement) => (
            <div
              key={measurement.id}
              className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition-colors"
            >
              {editingId === measurement.id ? (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                        {t('dwgFile')}
                      </label>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => handleFileUpload(e, measurement.id)}
                        className="hidden"
                        id={`file-edit-${measurement.id}`}
                      />
                      {!editValues.drawing_file_url ? (
                        <button
                          onClick={() => document.getElementById(`file-edit-${measurement.id}`)?.click()}
                          disabled={isUploading && uploadingFor === measurement.id}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                        >
                          <Upload className="h-4 w-4" />
                          {isUploading && uploadingFor === measurement.id ? t('loading') : t('uploadDwgFile')}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => document.getElementById(`file-edit-${measurement.id}`)?.click()}
                            disabled={isUploading && uploadingFor === measurement.id}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <Upload className="h-4 w-4" />
                            {t('changeFile')}
                          </button>
                          <button
                            onClick={() => handleFileRemove(measurement.id, editValues.drawing_file_url!)}
                            disabled={isUploading && uploadingFor === measurement.id}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('removeFile')}
                          </button>
                        </div>
                      )}
                      {editValues.drawing_file_url && previewingDrawing !== measurement.id && (
                        <button
                          onClick={() => setPreviewingDrawing(measurement.id)}
                          className="mt-3 flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                        >
                          <Eye className="h-4 w-4" />
                          {t('previewDrawing')}
                        </button>
                      )}
                      {editValues.drawing_file_url && previewingDrawing === measurement.id && (
                        <div className="mt-3">
                          <button
                            onClick={() => setPreviewingDrawing(null)}
                            className="mb-2 flex items-center gap-2 px-3 py-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm"
                          >
                            <X className="h-4 w-4" />
                            {t('closePreview')}
                          </button>
                          <PDFViewer fileUrl={editValues.drawing_file_url} fileName="measurement-drawing.pdf" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('measurementDate')}
                      </label>
                      <input
                        type="date"
                        value={editValues.measurement_date || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, measurement_date: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('apartmentArea')}
                      </label>
                      <input
                        type="number"
                        value={editValues.asset_area || 0}
                        onChange={(e) =>
                          setEditValues({ ...editValues, asset_area: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('storageArea')}
                      </label>
                      <input
                        type="number"
                        value={editValues.storage_area || 0}
                        onChange={(e) =>
                          setEditValues({ ...editValues, storage_area: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('pergolaArea')}
                      </label>
                      <input
                        type="number"
                        value={editValues.pergola_area || 0}
                        onChange={(e) =>
                          setEditValues({ ...editValues, pergola_area: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('balconyArea')}
                      </label>
                      <input
                        type="number"
                        value={editValues.balcony_area || 0}
                        onChange={(e) =>
                          setEditValues({ ...editValues, balcony_area: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        {t('notes')}
                      </label>
                      <textarea
                        value={editValues.notes || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, notes: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleUpdateMeasurement(measurement.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
                    >
                      <Save className="h-4 w-4" />
                      {t('save')}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditValues({});
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm"
                    >
                      <X className="h-4 w-4" />
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-teal-600" />
                      <span className="font-semibold text-slate-900">
                        {new Date(measurement.measurement_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(measurement)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMeasurement(measurement.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-slate-600">{t('apartmentArea')}:</span>
                      <span className="font-medium text-slate-900 mr-2">
                        {measurement.asset_area.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">{t('storageArea')}:</span>
                      <span className="font-medium text-slate-900 mr-2">
                        {measurement.storage_area.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">{t('pergolaArea')}:</span>
                      <span className="font-medium text-slate-900 mr-2">
                        {measurement.pergola_area.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">{t('balconyArea')}:</span>
                      <span className="font-medium text-slate-900 mr-2">
                        {measurement.balcony_area.toLocaleString()}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-600">{t('totalArea')}:</span>
                      <span className="font-bold text-teal-600 mr-2 text-base">
                        {measurement.total_area.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {measurement.notes && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <span className="text-sm text-slate-600">{t('notes')}: </span>
                      <span className="text-sm text-slate-900">{measurement.notes}</span>
                    </div>
                  )}
                  {measurement.drawing_file_url ? (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700">{t('dwgFile')}</span>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => handleFileUpload(e, measurement.id)}
                            className="hidden"
                            id={`file-view-${measurement.id}`}
                          />
                          <button
                            onClick={() => setPreviewingDrawing(previewingDrawing === measurement.id ? null : measurement.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-xs"
                          >
                            <Eye className="h-3 w-3" />
                            {previewingDrawing === measurement.id ? t('closePreview') : t('previewDrawing')}
                          </button>
                          <button
                            onClick={() => document.getElementById(`file-view-${measurement.id}`)?.click()}
                            disabled={isUploading && uploadingFor === measurement.id}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs disabled:opacity-50"
                          >
                            <Upload className="h-3 w-3" />
                            {t('changeFile')}
                          </button>
                          <button
                            onClick={() => handleFileRemove(measurement.id, measurement.drawing_file_url!)}
                            disabled={isUploading && uploadingFor === measurement.id}
                            className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            {t('removeFile')}
                          </button>
                        </div>
                      </div>
                      {previewingDrawing === measurement.id && (
                        <PDFViewer fileUrl={measurement.drawing_file_url} fileName={`measurement-${measurement.measurement_date}.pdf`} />
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => handleFileUpload(e, measurement.id)}
                        className="hidden"
                        id={`file-view-${measurement.id}`}
                      />
                      <button
                        onClick={() => document.getElementById(`file-view-${measurement.id}`)?.click()}
                        disabled={isUploading && uploadingFor === measurement.id}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 w-full justify-center"
                      >
                        <Upload className="h-4 w-4" />
                        {isUploading && uploadingFor === measurement.id ? t('loading') : t('uploadDwgFile')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
