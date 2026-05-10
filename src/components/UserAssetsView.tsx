import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { api, Asset, Building } from '../lib/api';
import { Loader2, Download, Building2, Search, FileText, History, Share2, ArrowLeftRight, X } from 'lucide-react';
import { exportToExcel } from '../lib/excelExport';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { AssetFilesModal } from './AssetFilesModal';
import { DistributionHistoryModal } from './DistributionHistoryModal';
import { TransferHistoryModal } from './TransferHistoryModal';

function fmtArea(v: unknown): string {
  const n = Number(v);
  return n > 0 ? n.toFixed(2) : '';
}

function buildBreakdownTooltip(row: any): string {
  const lines: string[] = [];
  const mainType = row.main_asset_type;
  const mainSize = Number(row.asset_size);
  if (mainType && mainSize > 0) {
    lines.push(`${mainType}: ${mainSize.toFixed(2)} מ"ר`);
  }
  for (let i = 1; i <= 6; i++) {
    const t = row[`sub_asset_type_${i}`];
    const s = Number(row[`sub_asset_size_${i}`]);
    if (t && s > 0) lines.push(`  פרוק ${i} — ${t}: ${s.toFixed(2)} מ"ר`);
  }
  return lines.join('\n');
}

function buildSubtypesDisplay(row: any): string {
  const parts: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const t = row[`sub_asset_type_${i}`];
    const s = Number(row[`sub_asset_size_${i}`]);
    if (t && s > 0) parts.push(`${t} ${s.toFixed(2)}`);
  }
  return parts.join(' | ');
}

// Simple asset history modal
function AssetHistoryModal({
  assetId,
  assetLabel,
  onClose,
}: {
  assetId: number;
  assetLabel: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.assets.getHistoryByAssetId(assetId)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [assetId]);

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 120,
      valueFormatter: (p) => formatDateToDDMMYYYY(p.value) || '',
    },
    {
      headerName: 'תיאור שימוש',
      width: 160,
      valueGetter: (p) => {
        const row = p.data as any;
        return row?.use_nature || row?.main_asset_type || '';
      },
    },
    {
      field: 'asset_size',
      headerName: 'שטח נטו',
      width: 110,
      valueFormatter: (p) => fmtArea(p.value),
    },
    {
      headerName: 'פרוקים',
      flex: 1,
      minWidth: 200,
      valueGetter: (p) => p.data ? buildSubtypesDisplay(p.data) : '',
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      width: 100,
    },
    {
      field: 'comment',
      headerName: 'הערה',
      width: 160,
    },
  ], []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-[860px] max-w-[95vw] flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-app-accent" />
            <span className="font-semibold text-app-text">היסטוריה — נכס {assetLabel}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              אין היסטוריה לנכס זה
            </div>
          ) : (
            <div className="ag-theme-alpine h-[400px]" dir="rtl">
              <AgGridReact
                rowData={history}
                columnDefs={columnDefs}
                defaultColDef={{ sortable: true, filter: true, resizable: true }}
                enableRtl
                rowHeight={32}
                headerHeight={36}
                suppressMovableColumns
                suppressCellFocus
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UserAssetsView() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildingLoading, setBuildingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [filesAssetId, setFilesAssetId] = useState<number | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  // Fetch all buildings on mount
  useEffect(() => {
    setBuildingLoading(true);
    api.buildings.getAll()
      .then(setBuildings)
      .catch(() => setBuildings([]))
      .finally(() => setBuildingLoading(false));
  }, []);

  // Fetch assets when building selected
  useEffect(() => {
    if (selectedBuilding == null) { setAssets([]); return; }
    setLoading(true);
    setError(null);
    api.assets.getAll(selectedBuilding)
      .then(setAssets)
      .catch(() => setError('שגיאה בטעינת נכסים'))
      .finally(() => setLoading(false));
  }, [selectedBuilding]);

  // Filtered buildings for dropdown
  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.trim();
    if (!q) return buildings;
    return buildings.filter(b => String(b.building_number).includes(q));
  }, [buildings, buildingSearch]);

  // Action buttons cell renderer
  const actionsCellRenderer = useCallback((params: any) => {
    const asset = params.data as Asset;
    if (!asset) return null;
    return (
      <div className="flex items-center gap-1 h-full">
        <button
          title="קבצים"
          onClick={(e) => { e.stopPropagation(); setFilesAssetId(asset.asset_id); }}
          className="p-1 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-800 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
        <button
          title="היסטוריה"
          onClick={(e) => { e.stopPropagation(); setHistoryAsset(asset); }}
          className="p-1 rounded hover:bg-purple-50 text-purple-600 hover:text-purple-800 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }, []);

  // Column definitions
  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: '',
      width: 60,
      pinned: 'right',
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: actionsCellRenderer,
    },
    {
      field: 'asset_id',
      headerName: 'מזהה נכס',
      width: 110,
      pinned: 'right',
    },
    {
      field: 'payer_id',
      headerName: 'מזהה משלם',
      width: 120,
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 120,
      valueFormatter: (p) => formatDateToDDMMYYYY(p.value) || '',
    },
    {
      headerName: 'תיאור שימוש',
      width: 160,
      valueGetter: (p) => {
        const row = p.data as any;
        return row?.use_nature || row?.main_asset_type || '';
      },
    },
    {
      headerName: 'שטח נטו',
      field: 'asset_size',
      width: 110,
      valueFormatter: (p) => fmtArea(p.value),
      tooltipValueGetter: (p) => p.data ? buildBreakdownTooltip(p.data) : '',
      cellStyle: { cursor: 'help' },
    },
    {
      field: 'business_distribution_area',
      headerName: 'שטח עסקים משותף',
      width: 150,
      valueFormatter: (p) => fmtArea(p.value),
    },
    {
      field: 'shared_parking_area',
      headerName: 'שטח חניה משותף',
      width: 140,
      valueFormatter: (p) => fmtArea(p.value),
    },
    {
      headerName: 'פרוקים',
      flex: 1,
      minWidth: 200,
      valueGetter: (p) => p.data ? buildSubtypesDisplay(p.data) : '',
      tooltipValueGetter: (p) => p.data ? buildBreakdownTooltip(p.data) : '',
      cellStyle: { cursor: 'help' },
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      width: 100,
    },
    {
      field: 'apartment_floor',
      headerName: 'קומה',
      width: 80,
    },
    {
      field: 'comment',
      headerName: 'הערה',
      width: 160,
    },
  ], [actionsCellRenderer]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  // Export to Excel
  const handleExport = useCallback(() => {
    if (assets.length === 0) return;
    const headers = [
      'מזהה נכס', 'מזהה משלם', 'תאריך מדידה', 'תיאור שימוש',
      'שטח נטו', 'שטח עסקים משותף', 'שטח חניה משותף',
      'מספר דירה', 'קומה', 'הערה', 'פרוקים'
    ];
    const rows = assets.map(a => {
      const row = a as any;
      return [
        a.asset_id,
        a.payer_id || '',
        formatDateToDDMMYYYY(a.measurement_date) || '',
        row.use_nature || a.main_asset_type || '',
        a.asset_size || '',
        a.business_distribution_area || '',
        row.shared_parking_area || '',
        a.apartment_number || '',
        a.apartment_floor || '',
        a.comment || '',
        buildSubtypesDisplay(row),
      ];
    });
    exportToExcel({
      filename: `נכסים_מבנה_${selectedBuilding}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.xlsx`,
      sheetName: 'נכסים',
      data: [headers, ...rows],
    });
  }, [assets, selectedBuilding]);

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-panel shrink-0 flex-wrap">
        <Building2 className="h-5 w-5 text-app-accent shrink-0" />
        <span className="font-semibold text-app-text text-sm">בחר מבנה:</span>

        {buildingLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-app-accent" />
        ) : (
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="חפש מבנה..."
                value={buildingSearch}
                onChange={e => setBuildingSearch(e.target.value)}
                className="border rounded pl-2 pr-7 py-1 text-sm w-36 bg-white"
              />
            </div>
            <select
              className="border rounded px-2 py-1 text-sm max-w-[200px] bg-white"
              value={selectedBuilding ?? ''}
              onChange={e => setSelectedBuilding(e.target.value ? Number(e.target.value) : null)}
              size={1}
            >
              <option value="">-- בחר מבנה --</option>
              {filteredBuildings.map(b => (
                <option key={b.building_number} value={b.building_number}>
                  {b.building_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Building-level actions */}
        {selectedBuilding && !loading && (
          <>
            <button
              onClick={() => setDistributionOpen(true)}
              className="btn btn-action flex items-center gap-1 text-sm"
              title="היסטוריית חלוקה"
            >
              <Share2 className="h-4 w-4" />
              <span>חלוקה</span>
            </button>
            <button
              onClick={() => setTransferOpen(true)}
              className="btn btn-action flex items-center gap-1 text-sm"
              title="היסטוריית העברה"
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span>העברה</span>
            </button>
          </>
        )}

        {selectedBuilding && !loading && assets.length > 0 && (
          <button
            onClick={handleExport}
            className="btn btn-action btn-export flex items-center gap-1 text-sm"
          >
            <Download className="h-4 w-4" />
            <span>ייצא ל-Excel</span>
          </button>
        )}

        {loading && <Loader2 className="h-4 w-4 animate-spin text-app-accent" />}

        {selectedBuilding && !loading && (
          <span className="text-sm text-gray-500 mr-2">
            {assets.length} נכסים
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-red-600 text-sm bg-red-50 border-b border-red-200">
          {error}
        </div>
      )}

      {/* Grid */}
      {!selectedBuilding ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          בחר מבנה להצגת הנכסים
        </div>
      ) : (
        <div className="ag-theme-alpine flex-1 min-h-0" dir="rtl">
          <AgGridReact
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            enableRtl
            tooltipShowDelay={300}
            tooltipHideDelay={6000}
            rowHeight={32}
            headerHeight={36}
            suppressMovableColumns
            suppressCellFocus
          />
        </div>
      )}

      {/* Asset Files Modal */}
      {filesAssetId != null && (
        <AssetFilesModal
          isOpen={true}
          onClose={() => setFilesAssetId(null)}
          assetId={filesAssetId}
        />
      )}

      {/* Asset History Modal */}
      {historyAsset != null && (
        <AssetHistoryModal
          assetId={historyAsset.asset_id}
          assetLabel={String(historyAsset.asset_id)}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {/* Distribution History Modal */}
      {distributionOpen && selectedBuilding && (
        <DistributionHistoryModal
          isOpen={true}
          onClose={() => setDistributionOpen(false)}
          buildingNumber={selectedBuilding}
        />
      )}

      {/* Transfer History Modal */}
      {transferOpen && selectedBuilding && (
        <TransferHistoryModal
          isOpen={true}
          onClose={() => setTransferOpen(false)}
          buildingNumber={selectedBuilding}
        />
      )}
    </div>
  );
}
