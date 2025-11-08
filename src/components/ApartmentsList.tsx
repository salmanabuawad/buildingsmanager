import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Apartment, Building, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Upload } from 'lucide-react';
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
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const gridRef = useRef<AgGridReact<Apartment>>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [buildingId]);



  async function fetchData() {
    try {
      setLoading(true);

      const [buildingData, apartmentsData] = await Promise.all([
        api.buildings.getOne(buildingId),
        api.apartments.getAll(buildingId)
      ]);

      setBuilding(buildingData);
      setApartments(apartmentsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartments');
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleCSVImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(s => s.trim());

        if (parts.length < 6) {
          errors.push(`Line ${i + 1}: Missing required fields (need at least 6: apartment_number,floor,apartment_area,storage_area,pergola_area,balcony_area)`);
          errorCount++;
          continue;
        }

        const [apartment_number, floorStr, apartment_area_str, storage_area_str, pergola_area_str, balcony_area_str, garden_area_str = '0'] = parts;

        if (!apartment_number) {
          errors.push(`Line ${i + 1}: Missing apartment number`);
          errorCount++;
          continue;
        }

        const floor = parseInt(floorStr);
        const apartment_area = parseFloat(apartment_area_str);
        const storage_area = parseFloat(storage_area_str);
        const pergola_area = parseFloat(pergola_area_str);
        const balcony_area = parseFloat(balcony_area_str);
        const garden_area = parseFloat(garden_area_str);

        if (isNaN(floor) || isNaN(apartment_area) || isNaN(storage_area) || isNaN(pergola_area) || isNaN(balcony_area)) {
          errors.push(`Line ${i + 1}: Invalid number format`);
          errorCount++;
          continue;
        }

        const total_apartment_area = apartment_area + storage_area + pergola_area + balcony_area + garden_area;

        try {
          await api.apartments.create({
            building_id: buildingId,
            apartment_number,
            floor,
            apartment_area,
            storage_area,
            pergola_area,
            balcony_area,
            garden_area: garden_area || undefined,
            total_apartment_area
          });
          successCount++;
        } catch (error) {
          errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchData();

      if (errors.length > 0) {
        showMessage('error', `Imported ${successCount} apartments. ${errorCount} errors: ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '...' : ''}`);
      } else {
        showMessage('success', `Successfully imported ${successCount} apartments`);
      }
    } catch (error) {
      showMessage('error', 'Error reading CSV file');
      console.error('Error importing CSV:', error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      field: 'total_apartment_area',
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
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {building && (
          <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BuildingIcon className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" strokeWidth={1.5} />
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{building.name}</h1>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors backdrop-blur-sm disabled:opacity-50"
                >
                  <Upload className="h-5 w-5" />
                  <span className="hidden sm:inline">{isImporting ? t('loading') : 'Import CSV'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
          <p className="font-semibold mb-1">CSV Format:</p>
          <p className="font-mono text-xs">apartment_number,floor,apartment_area,storage_area,pergola_area,balcony_area,garden_area</p>
          <p className="font-mono text-xs">101,1,85.5,12.3,15.0,8.2,0</p>
          <p className="mt-1 text-xs">Required: apartment_number, floor, apartment_area, storage_area, pergola_area, balcony_area. Optional: garden_area</p>
        </div>

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
