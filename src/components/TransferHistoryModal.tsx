import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import { DistributionAudit, api, Asset, AssetType } from '../lib/api';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useTranslation } from 'react-i18next';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface TransferHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildingNumber: number;
}

export function TransferHistoryModal({
  isOpen,
  onClose,
  buildingNumber,
}: TransferHistoryModalProps) {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<DistributionAudit[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DistributionAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setSelectedRecord(null);
      loadHistory();
    }
  }, [isOpen, buildingNumber]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyData, assetTypesData] = await Promise.all([
        api.distributionAudit.getByBuilding(buildingNumber, 'transfer'),
        api.assetTypes.getAll()
      ]);
      setHistory(historyData);
      setAssetTypes(assetTypesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת היסטוריית העברות');
      console.error('Error loading transfer history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setSelectedRecord(null);
    }, 300);
  };

  const handleRecordClick = (record: DistributionAudit) => {
    setSelectedRecord(record);
  };

  const handleBackToList = () => {
    setSelectedRecord(null);
  };

  const columnDefs: ColDef<Asset>[] = useMemo(() => {
    const defs: ColDef<Asset>[] = [
      {
        field: 'asset_id',
        headerName: t('assetId'),
        pinned: 'right',
        sortable: false,
        filter: false,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right', fontWeight: '600' },
        width: 100,
      },
      {
        field: 'payer_id',
        headerName: t('payerId'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        width: 120,
      },
      {
        field: 'main_asset_type',
        headerName: t('mainAssetType'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'asset_size',
        headerName: t('mainAssetSize'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_1',
        headerName: t('subAssetType1'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_1',
        headerName: t('subAssetSize1'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_2',
        headerName: t('subAssetType2'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_2',
        headerName: t('subAssetSize2'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_3',
        headerName: t('subAssetType3'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_3',
        headerName: t('subAssetSize3'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_4',
        headerName: t('subAssetType4'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_4',
        headerName: t('subAssetSize4'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_5',
        headerName: t('subAssetType5'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_5',
        headerName: t('subAssetSize5'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
      {
        field: 'sub_asset_type_6',
        headerName: t('subAssetType6'),
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'right' },
        tooltipValueGetter: (params) => {
          if (!params.value) return '';
          const assetType = assetTypes.find(at => at.name === params.value);
          return assetType?.description || params.value;
        },
        width: 120,
      },
      {
        field: 'sub_asset_size_6',
        headerName: t('subAssetSize6'),
        sortable: false,
        filter: false,
        type: 'numericColumn',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) => formatNumberToTwoDecimals(params.value, false),
        width: 120,
      },
    ];
    return defs;
  }, [assetTypes, t]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      dir="rtl"
    >
      <div
        className={`bg-white rounded-xl shadow-2xl p-4 sm:p-6 transition-all duration-300 border border-gray-100 ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        } max-w-[95vw] w-full max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-t-lg bg-violet-50 border-b border-violet-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {selectedRecord ? 'פרטי העברת שטחים' : `היסטוריית העברות - מבנה ${buildingNumber}`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="סגור"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <span className="mr-3 text-gray-600">טוען היסטוריה...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : selectedRecord ? (
            // Record Details View
            <div className="space-y-4">
              <button
                onClick={handleBackToList}
                className="mb-4 text-violet-600 hover:text-violet-700 font-medium flex items-center gap-2"
              >
                ← חזרה לרשימה
              </button>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-semibold text-gray-600">תאריך:</span>
                    <p className="text-lg">{formatDateToDDMMYYYY(selectedRecord.created_at)}</p>
                  </div>
                  {selectedRecord.shared_area_size !== null && selectedRecord.shared_area_size !== undefined && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">שטח שהועבר:</span>
                      <p className="text-lg">{selectedRecord.shared_area_size.toLocaleString('he-IL')}</p>
                    </div>
                  )}
                  {selectedRecord.description && (
                    <div className="col-span-2">
                      <span className="text-sm font-semibold text-gray-600">תיאור:</span>
                      <p className="text-lg">{selectedRecord.description}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Before Assets */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-800">נכסים לפני העברה ({selectedRecord.affected_assets_before.length})</h3>
                  <div className="bg-red-50 rounded-lg p-2" style={{ height: '500px' }}>
                    <div className="ag-theme-alpine" style={{ height: '100%', width: '100%' }}>
                      <AgGridReact<Asset>
                        rowData={selectedRecord.affected_assets_before}
                        columnDefs={columnDefs}
                        defaultColDef={{
                          resizable: true,
                          sortable: false,
                          filter: false,
                        }}
                        suppressRowClickSelection={true}
                        rowSelection="multiple"
                        domLayout="normal"
                        headerHeight={40}
                        rowHeight={35}
                        suppressCellFocus={true}
                        suppressScrollOnNewData={true}
                        animateRows={false}
                      />
                    </div>
                  </div>
                </div>

                {/* After Assets */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-800">נכסים אחרי העברה ({selectedRecord.affected_assets_after.length})</h3>
                  <div className="bg-green-50 rounded-lg p-2" style={{ height: '500px' }}>
                    <div className="ag-theme-alpine" style={{ height: '100%', width: '100%' }}>
                      <AgGridReact<Asset>
                        rowData={selectedRecord.affected_assets_after}
                        columnDefs={columnDefs}
                        defaultColDef={{
                          resizable: true,
                          sortable: false,
                          filter: false,
                        }}
                        suppressRowClickSelection={true}
                        rowSelection="multiple"
                        domLayout="normal"
                        headerHeight={40}
                        rowHeight={35}
                        suppressCellFocus={true}
                        suppressScrollOnNewData={true}
                        animateRows={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">אין היסטוריית העברות עבור מבנה זה</div>
          ) : (
            // History List View
            <div className="space-y-2">
              {history.map((record) => (
                <div
                  key={record.id}
                  onClick={() => handleRecordClick(record)}
                  className="bg-gray-50 hover:bg-violet-50 border border-gray-200 hover:border-violet-300 rounded-lg p-4 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-violet-600" />
                      <div>
                        <div className="font-semibold text-lg">
                          {formatDateToDDMMYYYY(record.created_at)}
                        </div>
                        {record.shared_area_size !== null && record.shared_area_size !== undefined && (
                          <div className="text-sm text-gray-600">
                            שטח שהועבר: {record.shared_area_size.toLocaleString('he-IL')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {record.affected_assets_after.length} נכסים
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

