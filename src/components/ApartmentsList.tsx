import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Apartment, Building, supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface ApartmentsListProps {
  buildingId: string;
  onSelectApartment: (apartmentId: string, apartmentNumber: string, buildingId: string) => void;
}

export function ApartmentsList({ buildingId, onSelectApartment }: ApartmentsListProps) {
  const { t } = useTranslation();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<Apartment>>(null);

  useEffect(() => {
    fetchData();
  }, [buildingId]);

  useEffect(() => {
    const channel = supabase
      .channel(`apartments-changes-${buildingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'apartments', filter: `building_id=eq.${buildingId}` },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildingId]);


  async function fetchData() {
    try {
      setLoading(true);

      const [buildingResult, apartmentsResult] = await Promise.all([
        supabase
          .from('buildings')
          .select('*')
          .eq('id', buildingId)
          .maybeSingle(),
        supabase
          .from('apartments')
          .select('*')
          .eq('building_id', buildingId)
          .order('apartment_number')
      ]);

      if (buildingResult.error) throw buildingResult.error;
      if (apartmentsResult.error) throw apartmentsResult.error;

      setBuilding(buildingResult.data);
      setApartments(apartmentsResult.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartments');
    } finally {
      setLoading(false);
    }
  }

  const columnDefs: ColDef<Apartment>[] = useMemo(() => [
    {
      headerName: t('actions'),
      width: 130,
      filter: false,
      sortable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectApartment(params.data.id, params.data.apartment_number, buildingId)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
        );
      }
    },
    {
      field: 'total_area',
      headerName: t('totalArea'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'balcony_area',
      headerName: t('balconyArea'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'pergola_area',
      headerName: t('pergolaArea'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'storage_area',
      headerName: t('storageArea'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'apartment_area',
      headerName: t('apartmentArea'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'apartment_number',
      headerName: t('unit'),
      flex: 1,
      sortable: true,
      filter: true
    }
  ], [buildingId, onSelectApartment, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loadingApartments')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 max-w-md shadow-md">
          <p className="text-red-800 font-medium">{t('error')}: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        {building && (
          <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-1 sm:mb-2">
              <BuildingIcon className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{building.name}</h1>
            </div>
          </div>
        )}

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={apartments}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              sortable: true,
              filter: true,
              minWidth: 100
            }}
            pagination={true}
            paginationPageSize={20}
            domLayout="normal"
            suppressHorizontalScroll={false}
            rowClass="ag-row"
            getRowStyle={(params) => {
              if (params.node.rowIndex % 2 === 0) {
                return { background: '#ffffff' };
              }
              return { background: '#f0f9ff' };
            }}
          />
        </div>
      </div>
    </>
  );
}
