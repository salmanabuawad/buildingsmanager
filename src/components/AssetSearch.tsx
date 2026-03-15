import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Home } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Asset } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useFieldConfig } from '../lib/useFieldConfig';
import { processColumnHeader } from '../lib/gridHeaderUtils';

interface SearchResult extends Asset {}

interface AssetSearchProps {
  onSelectAsset: (assetId: number, assetIdStr: string, buildingNumber: number, taxRegion?: string) => void;
}

export function AssetSearch({ onSelectAsset }: AssetSearchProps) {
  const { t } = useTranslation();
  const [fromNumber, setFromNumber] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const gridRef = useRef<AgGridReact<SearchResult>>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!fromNumber || !toNumber) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase
        .rpc('search_assets_by_range', {
          from_id: parseInt(fromNumber),
          to_id: parseInt(toNumber)
        });

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

  const rawColumnDefs: ColDef<SearchResult>[] = useMemo(() => {
    const defs: ColDef<SearchResult>[] = [
      {
        headerName: t('actions') || 'Actions',
        colId: 'actions',
        cellRenderer: (params: { data: SearchResult }) => (
          <button
            onClick={() => onSelectAsset(params.data.asset_id, String(params.data.asset_id), params.data.building_number)}
            className="px-3 py-1 bg-app-header text-white rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg text-sm font-semibold whitespace-nowrap"
          >
            {t('viewDetails') || 'View Details'}
          </button>
        ),
        sortable: false,
        filter: false,
        width: 130,
        pinned: 'right',
      },
      {
        headerName: t('assetId') || 'Asset ID',
        field: 'asset_id',
        cellRenderer: (params: { value: number; data: SearchResult }) => (
          <button
            onClick={() => onSelectAsset(params.value, String(params.value), params.data.building_number)}
            className="text-app-accent hover:text-app-accent-hover underline cursor-pointer transition-colors font-semibold"
            title="לחץ כדי לפתוח את הנכס"
          >
            {params.value}
          </button>
        ),
        width: 140,
      },
      {
        headerName: t('payerId') || 'Payer ID',
        field: 'payer_id',
        width: 140,
      },
      {
        headerName: t('building') || 'Building',
        field: 'building_number',
        width: 120,
      },
      {
        headerName: t('mainAssetType') || 'Main Type',
        field: 'main_asset_type',
        valueFormatter: (params) => params.value || '-',
        flex: 1,
      },
      {
        headerName: t('mainAssetSize') || 'Main Size',
        field: 'asset_size',
        valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : '-',
        width: 120,
      },
    ];
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        return { ...colDef, ...processColumnHeader(colDef.headerName) };
      }
      return colDef;
    });
  }, [t, onSelectAsset]);

  const [columnDefs] = useFieldConfig(rawColumnDefs, 'asset-search');

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-2 sm:px-4 md:px-6 py-1.5 sm:py-2">
      <div className="page-header mb-6 sm:mb-8 rounded-xl p-4 w-full" dir="rtl">
        <div className="relative flex items-center gap-3 flex-wrap w-full">
          <div className="page-header-icon shrink-0">
            <Search className="w-6 h-6" strokeWidth={2} />
          </div>
          <h1 className="page-header-title text-xl sm:text-2xl font-bold">
            {t('assetSearch') || 'חיפוש נכסים'}
          </h1>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('fromAssetNumber') || 'From Asset ID'}
              </label>
              <input
                type="number"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                className="w-full px-4 py-2 border border-app-input-border rounded-lg focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('toAssetNumber') || 'To Asset ID'}
              </label>
              <input
                type="number"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                className="w-full px-4 py-2 border border-app-input-border rounded-lg focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                required
              />
            </div>
          </div>

          <div className="action-bar mt-4 flex gap-2">
            <button
              type="submit"
              disabled={loading || !fromNumber || !toNumber}
              className="btn btn-primary"
            >
              <Search className="h-5 w-5" />
              {loading ? (t('loading') || 'Loading...') : (t('search') || 'Search')}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-cancel"
            >
              {t('reset') || 'Reset'}
            </button>
          </div>
        </form>
      </div>

      {hasSearched && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 flex flex-col flex-1 min-h-0">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {t('searchResults') || 'Search Results'} ({results.length})
          </h2>

          {results.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Home className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">{t('noAssetsFound') || 'No assets found in this range'}</p>
            </div>
          ) : (
            <div className="ag-theme-alpine" style={{ height: '55vh', width: '100%' }}>
              <AgGridReact<SearchResult>
                ref={gridRef}
                rowData={results}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  sortable: true,
                  filter: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  headerClass: 'ag-right-aligned-header',
                  headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' },
                  cellStyle: { textAlign: 'right' },
                  minWidth: 60,
                }}
                gridOptions={{
                  suppressColumnVirtualisation: true,
                  alwaysShowHorizontalScroll: true,
                  suppressMovableColumns: true,
                  suppressScrollOnNewData: true,
                  enableCellTextSelection: false,
                }}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true, checkboxes: false }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
