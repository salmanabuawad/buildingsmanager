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
  totalSharedParkingArea: number;
  count: number;
}

interface ExcludedTypeRow {
  name: string;
  description: string;
  count: number;
}

export function AssetStatisticsModal({ isOpen, onClose, assets, assetTypes, buildingNumber }: AssetStatisticsModalProps) {
  // Calculate statistics from assets - only show types that exist in the assets list
  // Combine main and sub asset types into a single entry per type code
  const { statistics, excludedTypes, noMainTypeCount } = useMemo(() => {
    const statsMap = new Map<string, StatisticsRow>();
    const excludedTypeCounts = new Map<string, number>();
    const NO_MAIN_TYPE_KEY = '__no_main_type__';

    // Helper function to get asset type description
    const getTypeDescription = (typeName: string | undefined | null): string => {
      if (!typeName) return '';
      const assetType = assetTypes.find(at => at.name === String(typeName).trim());
      return assetType?.description || typeName;
    };

    const isNotAccountableForStatistics = (typeName: string | undefined | null): boolean => {
      if (!typeName) return false;
      const typeKey = String(typeName).trim();
      const at = assetTypes.find(a => String(a.name).trim() === typeKey);
      return at?.not_accountable_for_statistics === true;
    };
    
    // Process assets to collect statistics - only types that appear in assets
    // Combine main and sub asset types into single entries
    assets.forEach(asset => {
      // Process main asset types
      if (asset.main_asset_type && asset.main_asset_type.trim()) {
        const typeKey = asset.main_asset_type.trim();
        if (isNotAccountableForStatistics(typeKey)) {
          excludedTypeCounts.set(typeKey, (excludedTypeCounts.get(typeKey) || 0) + 1);
        } else {
          const existing = statsMap.get(typeKey);
          const area = asset.asset_size || 0;
          const sharedParking = Number((asset as any).shared_parking_area) || 0;
          if (existing) {
            existing.totalArea += area;
            existing.totalSharedParkingArea += sharedParking;
            existing.count += 1;
          } else {
            statsMap.set(typeKey, {
              type: asset.main_asset_type,
              typeDescription: getTypeDescription(asset.main_asset_type),
              totalArea: area,
              totalSharedParkingArea: sharedParking,
              count: 1
            });
          }
        }
      } else {
        // Asset without main asset type
        const existing = statsMap.get(NO_MAIN_TYPE_KEY);
        const area = asset.asset_size || 0;
        const sharedParking = Number((asset as any).shared_parking_area) || 0;
        if (existing) {
          existing.totalArea += area;
          existing.totalSharedParkingArea += sharedParking;
          existing.count += 1;
        } else {
          statsMap.set(NO_MAIN_TYPE_KEY, {
            type: '—',
            typeDescription: 'ללא סוג נכס ראשי',
            totalArea: area,
            totalSharedParkingArea: sharedParking,
            count: 1
          });
        }
      }

      // Process sub asset types (1-6) - do not add shared_parking_area here (per-asset, counted in main type only) - combine with main types if same type code
      for (let i = 1; i <= 6; i++) {
        const subTypeField = `sub_asset_type_${i}` as keyof Asset;
        const subSizeField = `sub_asset_size_${i}` as keyof Asset;
        
        const subType = asset[subTypeField] as string | undefined;
        const subSize = asset[subSizeField] as number | undefined;
        
        if (subType && subType.trim() && (subSize != null && subSize > 0)) {
          const typeKey = subType.trim();
          if (isNotAccountableForStatistics(typeKey)) {
            excludedTypeCounts.set(typeKey, (excludedTypeCounts.get(typeKey) || 0) + 1);
            continue;
          }
          const existing = statsMap.get(typeKey);
          const area = subSize || 0;
          
          if (existing) {
            existing.totalArea += area;
            existing.count += 1;
          } else {
            // Add new type entry (no shared parking for sub-only entry)
            statsMap.set(typeKey, {
              type: subType,
              typeDescription: getTypeDescription(subType),
              totalArea: area,
              totalSharedParkingArea: 0,
              count: 1
            });
          }
        }
      }
    });

    // Convert map to array: "no main type" row last, rest sorted by type name
    const noMainRow = statsMap.get(NO_MAIN_TYPE_KEY);
    statsMap.delete(NO_MAIN_TYPE_KEY);
    const restArray = Array.from(statsMap.values()).sort((a, b) => {
      const aNum = parseInt(a.type, 10);
      const bNum = parseInt(b.type, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.type.localeCompare(b.type);
    });
    const statsArray = noMainRow ? [...restArray, noMainRow] : restArray;

    const excludedTypesList: ExcludedTypeRow[] = Array.from(excludedTypeCounts.entries())
      .map(([typeKey, count]) => {
        const at = assetTypes.find(a => String(a.name).trim() === typeKey);
        return {
          name: typeKey,
          description: at?.description || '',
          count
        };
      })
      .sort((a, b) => {
        const aNum = parseInt(a.name, 10);
        const bNum = parseInt(b.name, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });

    const noMainTypeCount = noMainRow?.count ?? 0;
    return { statistics: statsArray, excludedTypes: excludedTypesList, noMainTypeCount };
  }, [assets, assetTypes]);

  // Calculate total area (used for percentage)
  const totalArea = useMemo(() => {
    return statistics.reduce((sum, stat) => sum + stat.totalArea, 0);
  }, [statistics]);

  // Reversed field order (compared to the original)
  const columnDefs: ColDef<StatisticsRow>[] = [
    {
      field: 'totalArea',
      headerName: 'סכום שטח',
      width: 150,
      cellStyle: { textAlign: 'right', fontWeight: '600' },
      valueFormatter: (params) => {
        return params.value ? params.value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
      }
    },
    {
      headerName: 'אחוז מהשטח הכולל',
      width: 130,
      cellStyle: { textAlign: 'right' },
      valueGetter: (params) => {
        if (!params.data || totalArea <= 0) return 0;
        return (params.data.totalArea / totalArea) * 100;
      },
      valueFormatter: (params) => {
        if (params.value == null || totalArea <= 0) return '0.00%';
        return Number(params.value).toFixed(2) + '%';
      }
    },
    {
      field: 'totalSharedParkingArea',
      headerName: 'שטח משותף לחניות',
      width: 150,
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => {
        return params.value != null && params.value !== 0
          ? Number(params.value).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '0.00';
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
      field: 'type',
      headerName: 'סוג נכס',
      width: 120,
      cellStyle: { textAlign: 'right', fontWeight: '600' },
      valueFormatter: (params) => {
        return params.value || '';
      }
    }
  ];

  // Handle Excel export
  const handleExportToExcel = () => {
    try {
      // Prepare data for Excel export
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      
      const totalSharedParking = statistics.reduce((sum, stat) => sum + (stat.totalSharedParkingArea || 0), 0);

      // Create header row (match grid column order)
      const headerRow = ['סכום שטח', 'אחוז מהשטח הכולל', 'שטח משותף לחניות', 'כמות', 'תיאור', 'סוג נכס'];
      
      // Create data rows
      const dataRows = statistics.map(stat => {
        const pct = totalArea > 0 ? ((stat.totalArea / totalArea) * 100).toFixed(2) + '%' : '0.00%';
        return [
          stat.totalArea ? Number(stat.totalArea.toFixed(2)) : 0,
          pct,
          stat.totalSharedParkingArea ? Number(stat.totalSharedParkingArea.toFixed(2)) : 0,
          stat.count || 0,
          stat.typeDescription || '-',
          stat.type || ''
        ];
      });
      
      // Add summary row
      const summaryRow = [
        totalArea ? Number(totalArea.toFixed(2)) : 0,
        '100%',
        totalSharedParking ? Number(totalSharedParking.toFixed(2)) : 0,
        assets.length,
        '',
        'סה"כ'
      ];
      
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
          { wch: 18 }, // סכום שטח
          { wch: 18 }, // אחוז מהשטח הכולל
          { wch: 18 }, // שטח משותף לחניות
          { wch: 12 }, // כמות
          { wch: 30 }, // תיאור
          { wch: 15 }  // סוג נכס
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
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col m-4 transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gradient-to-r from-teal-600 to-blue-600 rounded-t-lg flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-white" />
            <h2 className="text-lg font-bold text-white">סטטיסטיקות נכסים</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
            title="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 min-h-0">
          {/* Summary */}
          <div className="mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-3 text-right">
              <div>
                <p className="text-xs text-gray-600">סה"כ סוגי נכסים</p>
                <p className="text-lg font-bold text-gray-900">{statistics.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">סה"כ נכסים</p>
                <p className="text-lg font-bold text-gray-900">{assets.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">סה"כ שטח</p>
                <p className="text-lg font-bold text-teal-600">
                  {totalArea.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0 overflow-hidden">
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
                animateRows={false}
                rowHeight={32}
                headerHeight={32}
                domLayout="normal"
                stopEditingWhenCellsLoseFocus={true}
              />
            </div>
          </div>

          {/* Excluded types list + assets without main type */}
          {(excludedTypes.length > 0 || noMainTypeCount > 0) && (
            <div className="mt-4 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">לא נכלל בסטיסטיקה</h3>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-40 overflow-auto">
                <ul className="space-y-1 text-sm text-gray-800">
                  {excludedTypes.map((t) => (
                    <li key={t.name} className="flex gap-2 items-center">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-gray-600">{t.description || '-'}</span>
                      <span className="text-gray-500 font-medium">כמות: {t.count}</span>
                    </li>
                  ))}
                  {noMainTypeCount > 0 && (
                    <li className="flex gap-2 items-center">
                      <span className="font-semibold">נכסים ללא סוג ראשי</span>
                      <span className="text-gray-600">—</span>
                      <span className="text-gray-500 font-medium">כמות: {noMainTypeCount}</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
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
