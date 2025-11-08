import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, Apartment } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Upload, FileCheck, FileX, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface ApartmentWithBuilding extends Apartment {
  building_name: string;
}

export function AdminPDFManager() {
  const { t } = useTranslation();
  const [apartments, setApartments] = useState<ApartmentWithBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const gridRef = useRef<AgGridReact<ApartmentWithBuilding>>(null);

  useEffect(() => {
    fetchApartments();
  }, []);


  async function fetchApartments() {
    try {
      setLoading(true);

      const { data: buildingsData, error: buildingsError } = await supabase
        .from('buildings')
        .select('*')
        .order('name');

      if (buildingsError) throw buildingsError;

      const { data: apartmentsData, error: apartmentsError } = await supabase
        .from('apartments')
        .select('*')
        .order('apartment_number');

      if (apartmentsError) throw apartmentsError;

      const buildingsMap = new Map(buildingsData.map(b => [b.id, b.name]));

      const apartmentsWithBuildings = apartmentsData.map(apt => ({
        ...apt,
        building_name: buildingsMap.get(apt.building_id) || 'Unknown Building'
      }));

      setApartments(apartmentsWithBuildings);
    } catch (err) {
      console.error('Error fetching apartments:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(apartmentId: string, file: File) {
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    try {
      setUploadingIds(prev => new Set(prev).add(apartmentId));

      const apartment = apartments.find(a => a.id === apartmentId);
      if (!apartment) return;

      if (apartment.dwg_file_url) {
        const oldFileName = apartment.dwg_file_url.split('/').pop();
        if (oldFileName) {
          await supabase.storage.from('dwg-files').remove([oldFileName]);
        }
      }

      const fileExt = 'pdf';
      const fileName = `${apartmentId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('dwg-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('dwg-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('apartments')
        .update({ dwg_file_url: publicUrl })
        .eq('id', apartmentId);

      if (updateError) throw updateError;

      await fetchApartments();

    } catch (err) {
      alert(`${t('uploadError')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploadingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(apartmentId);
        return newSet;
      });
    }
  }

  async function handleFileRemove(apartmentId: string, fileUrl: string) {
    if (!confirm('Are you sure you want to remove this file?')) return;

    try {
      setUploadingIds(prev => new Set(prev).add(apartmentId));

      const fileName = fileUrl.split('/').pop();
      if (fileName) {
        await supabase.storage.from('dwg-files').remove([fileName]);
      }

      const { error: updateError } = await supabase
        .from('apartments')
        .update({ dwg_file_url: null })
        .eq('id', apartmentId);

      if (updateError) throw updateError;

      await fetchApartments();

    } catch (err) {
      alert(`${t('removeError')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploadingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(apartmentId);
        return newSet;
      });
    }
  }

  const StatusCellRenderer = (props: ICellRendererParams<ApartmentWithBuilding>) => {
    const hasFile = !!props.data?.dwg_file_url;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        hasFile ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}>
        {hasFile ? <FileCheck className="h-3 w-3" /> : <FileX className="h-3 w-3" />}
        {hasFile ? 'Has PDF' : 'No PDF'}
      </span>
    );
  };

  const ActionsCellRenderer = (props: ICellRendererParams<ApartmentWithBuilding>) => {
    const apartment = props.data;
    if (!apartment) return null;

    const isUploading = uploadingIds.has(apartment.id);

    return (
      <div className="flex gap-2 items-center h-full py-2">
        <input
          ref={(el) => {
            if (el) fileInputRefs.current.set(apartment.id, el);
          }}
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileUpload(apartment.id, file);
              e.target.value = '';
            }
          }}
          disabled={isUploading}
          className="hidden"
        />
        <button
          onClick={() => {
            const input = fileInputRefs.current.get(apartment.id);
            input?.click();
          }}
          disabled={isUploading}
          className="flex items-center gap-1 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors disabled:opacity-50 text-sm"
        >
          <Upload className="h-3 w-3" />
          {apartment.dwg_file_url ? 'Change' : 'Upload'}
        </button>

        {apartment.dwg_file_url && (
          <button
            onClick={() => handleFileRemove(apartment.id, apartment.dwg_file_url!)}
            disabled={isUploading}
            className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const columnDefs: ColDef<ApartmentWithBuilding>[] = useMemo(() => [
    {
      headerName: 'Actions',
      flex: 2,
      cellRenderer: ActionsCellRenderer,
      sortable: false,
      filter: false
    },
    {
      field: 'dwg_file_url',
      headerName: 'Status',
      flex: 1,
      sortable: true,
      filter: true,
      cellRenderer: StatusCellRenderer,
      valueGetter: (params) => params.data?.dwg_file_url ? 'Has PDF' : 'No PDF'
    },
    {
      field: 'apartment_number',
      headerName: 'Unit Number',
      flex: 1,
      sortable: true,
      filter: true
    },
    {
      field: 'building_name',
      headerName: 'Building',
      flex: 2,
      sortable: true,
      filter: true
    }
  ], [uploadingIds]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
  }), []);

  const apartmentsWithPDF = apartments.filter(a => a.dwg_file_url).length;
  const apartmentsWithoutPDF = apartments.length - apartmentsWithPDF;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800 mx-auto"></div>
          <p className="mt-4 text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12" dir="ltr">
      <div className="mb-4 sm:mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-1 sm:mb-2">PDF File Manager</h1>
        <p className="text-sm sm:text-base text-slate-600">Manage DWG PDF files for all apartments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-slate-600">Total Apartments</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{apartments.length}</p>
            </div>
            <FileCheck className="h-8 w-8 sm:h-12 sm:w-12 text-slate-400" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-green-700">With PDF Files</p>
              <p className="text-2xl sm:text-3xl font-bold text-green-900">{apartmentsWithPDF}</p>
            </div>
            <CheckCircle className="h-8 w-8 sm:h-12 sm:w-12 text-green-500" />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-amber-700">Without PDF Files</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-900">{apartmentsWithoutPDF}</p>
            </div>
            <AlertCircle className="h-8 w-8 sm:h-12 sm:w-12 text-amber-500" />
          </div>
        </div>
      </div>

      <div className="ag-theme-alpine" style={{ height: '500px', width: '100%' }}>
        <AgGridReact<ApartmentWithBuilding>
          ref={gridRef}
          rowData={apartments}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}
          paginationPageSize={20}
          domLayout="normal"
          suppressHorizontalScroll={false}
        />
      </div>
    </div>
  );
}
