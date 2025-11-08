import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface BuildingsListProps {
  onSelectBuilding: (buildingId: string, buildingName: string) => void;
}

export function BuildingsList({ onSelectBuilding }: BuildingsListProps) {
  const { t } = useTranslation();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<Building>>(null);

  const fetchBuildings = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      console.log('[BuildingsList] Fetching buildings at', new Date().toISOString());
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('name');

      if (error) throw error;
      console.log('[BuildingsList] Received buildings:', data);
      setBuildings(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buildings');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuildings(true);
  }, [fetchBuildings]);

  useEffect(() => {
    const channel = supabase
      .channel('buildings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buildings' },
        (payload) => {
          console.log('Buildings table changed:', payload);
          fetchBuildings(false);
        }
      )
      .subscribe((status) => {
        console.log('Buildings subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBuildings]);


  const columnDefs: ColDef<Building>[] = useMemo(() => [
    {
      headerName: t('actions'),
      width: 130,
      filter: false,
      sortable: false,
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => onSelectBuilding(params.data.id, params.data.name)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewApartments')}
          </button>
        );
      }
    },
    {
      field: 'total_building_area',
      headerName: t('totalBuildingArea'),
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
      field: 'total_units',
      headerName: t('totalUnits'),
      flex: 1,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value?.toLocaleString()
    },
    {
      field: 'name',
      headerName: t('buildingName'),
      flex: 2,
      sortable: true,
      filter: true
    }
  ], [onSelectBuilding, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loadingBuildings')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 max-w-md shadow-md">
          <p className="text-red-800 font-medium">{t('error')}: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-1 sm:mb-2">
            <img src="/buildings.png" alt="Buildings" className="w-10 h-10 bg-white rounded-lg p-2" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t('propertyListings')}</h1>
          </div>
          <p className="text-sm sm:text-base text-teal-50">{t('browseBuildings')}</p>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={buildings}
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
