import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { X, BarChart3, FileSpreadsheet } from 'lucide-react';
import { Asset, AssetType } from '../lib/api';
import { exportToExcel } from '../lib/excelExport';

interface AssetStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  assetTypes: AssetType[];
  buildingNumber?: number;
}

interface StatisticsRow {
  type: string;
  typeDescription: string;
  totalArea: number;
  count: number;
}

export function AssetStatisticsModal({ isOpen, onClose, assets, assetTypes, buildingNumber }: AssetStatisticsModalProps) {
  // Calculate statistics from assets - only show types that exist in the assets list
  // Combine main and sub asset types into a single entry per type code
  const statistics = useMemo(() => {
    const statsMap = new Map<string, StatisticsRow>();

    // Helper function to get asset type description
    const getTypeDescription = (typeName: string | undefined | null): string => {
      if (!typeName) return '';
      const assetType = assetTypes.find(at => at.name === String(typeName).trim());
      return assetType?.description || typeName;
    };
    
    // Process assets to collect statistics - only types that appear in assets
    // Combine main and sub asset types into single entries
    assets.forEach(asset => {
      // Process main asset types
      if (asset.main_asset_type) {
        const typeKey = asset.main_asset_type.trim();
        const existing = statsMap.get(typeKey);
        const area = asset.asset_size || 0;
        
        if (existing) {
          existing.totalArea += area;
          existing.count += 1;
        } else {
          // Add new type entry
          statsMap.set(typeKey, {
            type: asset.main_asset_type,
            typeDescription: getTypeDescription(asset.main_asset_type),
            totalArea: area,
            count: 1
          });
        }
      }

      // Process sub asset types (1-6) - combine with main types if same type code
      for (let i = 1; i <= 6; i++) {
        const subTypeField = `sub_asset_type_${i}` as keyof Asset;
        const subSizeField = `sub_asset_size_${i}` as keyof Asset;
        
        const subType = asset[subTypeField] as string | undefined;
        const subSize = asset[subSizeField] as number | undefined;
        
        if (subType && subType.trim() && (subSize != null && subSize > 0)) {
          const typeKey = subType.trim();
          const existing = statsMap.get(typeKey);
          const area = subSize || 0;
          
          if (existing) {
            existing.totalArea += area;
            existing.count += 1;
          } else {
            // Add new type entry
            statsMap.set(typeKey, {
              type: subType,
              typeDescription: getTypeDescription(subType),
              totalArea: area,
              count: 1
            });
          }
        }
      }
    });

    // Convert map to array and sort by type name (numeric if possible, otherwise string)
    const statsArray = Array.from(statsMap.values()).sort((a, b) => {
      const aNum = parseInt(a.type, 10);
      const bNum = parseInt(b.type, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.type.localeCompare(b.type);
    });

    return statsArray;
  }, [assets, assetTypes]);

  const columnDefs: ColDef<StatisticsRow>[] = [
    {
      field: 'type',
      headerName: 'סוג נכס',
      width: 120,
      cellStyle: { textAlign: 'right', fontWeight: '600' },
      valueFormatter: (params) => {
        return params.value || '';
      }
    },
    {
      field: 'typeDescription',
      headerName: 'תיאור',
      flex: 1,
      minWidth: 200,
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => {
        return params.value || '-';
      }
    },
    {
      field: 'count',
      headerName: 'כמות',
      width: 100,
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => {
        return params.value ? params.value.toLocaleString('he-IL') : '0';
      }
    },
    {
      field: 'totalArea',
      headerName: 'סכום שטח',
      width: 150,
      cellStyle: { textAlign: 'right', fontWeight: '600' },
      valueFormatter: (params) => {
        return params.value ? params.value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
      }
    }
  ];

  // Calculate total area
  const totalArea = useMemo(() => {
    return statistics.reduce((sum, stat) => sum + stat.totalArea, 0);
  }, [statistics]);

  // Handle Excel export
  const handleExportToExcel = () => {
    try {
      // Prepare data for Excel export
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      
      // Create header row
      const headerRow = ['סוג נכס', 'תיאור', 'כמות', 'סכום שטח'];
      
      // Create data rows
      const dataRows = statistics.map(stat => [
        stat.type || '',
        stat.typeDescription || '-',
        stat.count || 0,
        stat.totalArea ? Number(stat.totalArea.toFixed(2)) : 0
      ]);
      
      // Add summary row
      const summaryRow = ['סה"כ', '', assets.length, totalArea ? Number(totalArea.toFixed(2)) : 0];
      
      // Combine all rows
      const excelData = [headerRow, ...dataRows, [], summaryRow];
      
      // Generate filename
      const filename = `סטטיסטיקות_נכסים${buildingNumber ? `_מבנה_${buildingNumber}` : ''}_${dateStr.replace(/\//g, '-')}.xlsx`;
      
      // Export to Excel
      exportToExcel({
        filename,
        sheetName: 'סטטיסטיקות',
        data: excelData,
        columnWidths: [
          { wch: 15 }, // סוג נכס
          { wch: 30 }, // תיאור
          { wch: 12 }, // כמות
          { wch: 18 }  // סכום שטח
        ]
      });
    } catch (error) {
      console.error('Error exporting statistics to Excel:', error);
      alert('שגיאה בייצוא לקובץ Excel');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col m-4 transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-teal-600 to-blue-600 rounded-t-lg">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold text-white">סטטיסטיקות נכסים</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            title="סגור"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {/* Summary */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-sm text-gray-600">סה"כ סוגי נכסים</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">סה"כ נכסים</p>
                <p className="text-2xl font-bold text-gray-900">{assets.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">סה"כ שטח</p>
                <p className="text-2xl font-bold text-teal-600">
                  {totalArea.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0" style={{ height: '50vh', minHeight: '400px' }}>
            <div className="ag-theme-alpine rounded-lg border border-gray-200" style={{ height: '100%', width: '100%' }}>
              <AgGridReact
                rowData={statistics}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  sortable: true,
                  filter: true,
                  headerClass: 'ag-right-aligned-header',
                  headerStyle: { textAlign: 'right' },
                  cellStyle: { textAlign: 'right' }
                }}
                localeText={{
                  noRowsToShow: 'אין נתונים להצגה',
                  loadingOoo: 'טוען...',
                  page: 'עמוד',
                  more: 'עוד',
                  to: 'עד',
                  of: 'מתוך',
                  next: 'הבא',
                  last: 'אחרון',
                  first: 'ראשון',
                  previous: 'קודם',
                  loadingError: 'שגיאה בטעינה',
                  noMatches: 'לא נמצאו תוצאות'
                }}
                animateRows={true}
                rowHeight={40}
                headerHeight={40}
                domLayout="normal"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={handleExportToExcel}
            disabled={statistics.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
            title="ייצא סטטיסטיקות לקובץ Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            ייצא ל-Excel
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
