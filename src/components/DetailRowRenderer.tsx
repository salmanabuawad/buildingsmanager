import React, { useMemo } from 'react';
import { Asset, AuditLog } from '../lib/api';
import { Loader2 } from 'lucide-react';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';

interface DetailRowParams {
  expandedRows: Set<string>;
  auditDataCache: Map<number, {
    auditLog: AuditLog | null;
    loading: boolean;
    error: string | null;
    beforeAssets: Asset[];
    afterAssets: Asset[];
    relatedAssets: Asset[];
  }>;
  assetColumnDefs: any[];
  currentTabAssetId?: number;
  onSelectAsset?: (assetDbId: string | number, assetId: string, buildingNumber: number, taxRegion?: string) => void;
}

export function DetailRowRenderer(params: DetailRowParams) {
  const data = (params as any).data;
  
  if (!data || data._isDetailRow !== true) {
    return null;
  }

  const actionId = data._actionId;
  const auditData = params.auditDataCache.get(actionId);

  if (!auditData) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
          <span className="mr-2 text-slate-700">טוען פרטי ביקורת...</span>
        </div>
      </div>
    );
  }

  if (auditData.loading) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
          <span className="mr-2 text-slate-700">טוען פרטי ביקורת...</span>
        </div>
      </div>
    );
  }

  if (auditData.error) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">שגיאה: {auditData.error}</p>
        </div>
      </div>
    );
  }

  const { auditLog, beforeAssets, afterAssets, relatedAssets } = auditData;

  if (!auditLog) {
    return null;
  }

  // Helper function to check if two values are different
  const valuesAreDifferent = (val1: any, val2: any): boolean => {
    // Handle null/undefined
    if (val1 === null || val1 === undefined) val1 = '';
    if (val2 === null || val2 === undefined) val2 = '';
    
    // Convert to strings for comparison (handles numbers, strings, etc.)
    return String(val1) !== String(val2);
  };

  // Create a map of changed fields for each asset_id (comparing before vs after)
  const changedFieldsMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    
    // Create maps of before and after assets by asset_id
    const beforeMap = new Map<number, Asset>();
    const afterMap = new Map<number, Asset>();
    
    beforeAssets.forEach(asset => {
      if (asset.asset_id != null) {
        beforeMap.set(asset.asset_id, asset);
      }
    });
    
    afterAssets.forEach(asset => {
      if (asset.asset_id != null) {
        afterMap.set(asset.asset_id, asset);
      }
    });
    
    // Compare before and after for each asset_id
    const allAssetIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    
    allAssetIds.forEach(id => {
      const beforeAsset = beforeMap.get(id);
      const afterAsset = afterMap.get(id);
      
      if (beforeAsset && afterAsset) {
        const changedFields = new Set<string>();
        
        // Compare all fields (excluding metadata fields)
        const fieldsToCompare = Object.keys(beforeAsset).filter(key => 
          !key.startsWith('_') && 
          key !== 'created_at' && 
          key !== 'updated_at' && 
          key !== 'history_created_at' &&
          key !== 'id' &&
          key !== 'action_id'
        );
        
        fieldsToCompare.forEach(field => {
          const beforeValue = (beforeAsset as any)[field];
          const afterValue = (afterAsset as any)[field];
          
          if (valuesAreDifferent(beforeValue, afterValue)) {
            changedFields.add(field);
          }
        });
        
        if (changedFields.size > 0) {
          map.set(id, changedFields);
        }
      }
    });
    
    return map;
  }, [beforeAssets, afterAssets]);

  // Combine all assets into one array with source indicators, sorted by asset_id
  const allDetailAssets = useMemo(() => {
    const combined: any[] = [];
    const actionType = auditLog?.action_type || 'manual_update';
    
    // Add before assets
    beforeAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'before',
        _changeSource: actionType,
        _changedFields: changedFieldsMap.get(asset.asset_id || 0) || new Set<string>()
      });
    });
    
    // Add after assets
    afterAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'after',
        _changeSource: actionType,
        _changedFields: changedFieldsMap.get(asset.asset_id || 0) || new Set<string>()
      });
    });
    
    // Add related assets
    relatedAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'related',
        _changeSource: actionType,
        _changedFields: new Set<string>() // Related assets don't have changes to highlight
      });
    });
    
    // Sort by asset_id, then by source (before comes before after)
    combined.sort((a, b) => {
      const idA = a.asset_id || 0;
      const idB = b.asset_id || 0;
      if (idA !== idB) {
        return idA - idB;
      }
      // If same asset_id, sort by source: before comes before after
      const sourceOrder: { [key: string]: number } = { 'before': 1, 'after': 2, 'related': 3 };
      const orderA = sourceOrder[a._source] || 99;
      const orderB = sourceOrder[b._source] || 99;
      return orderA - orderB;
    });
    
    return combined;
  }, [beforeAssets, afterAssets, relatedAssets, auditLog?.action_type, changedFieldsMap]);

  // Get column definitions map for Hebrew names
  const columnDefsMap = useMemo(() => {
    const map = new Map(params.assetColumnDefs.map((col: any) => [col.field, col]));
    return map;
  }, [params.assetColumnDefs]);

  // Define allowed fields: asset_id, asset types, and sizes only
  // Order: reversed - main type + size first, then subtypes (1 to 6), then asset_id
  const allowedFields = useMemo(() => [
    'main_asset_type',
    'asset_size',
    'sub_asset_type_1',
    'sub_asset_size_1',
    'sub_asset_type_2',
    'sub_asset_size_2',
    'sub_asset_type_3',
    'sub_asset_size_3',
    'sub_asset_type_4',
    'sub_asset_size_4',
    'sub_asset_type_5',
    'sub_asset_size_5',
    'sub_asset_type_6',
    'sub_asset_size_6',
    'asset_id'
  ], []);

  // Helper function to get Hebrew header name
  const getHeaderName = (fieldName: string): string => {
    if (fieldName === '_source') return 'מקור';
    const colDef = columnDefsMap.get(fieldName);
    return colDef?.headerName || fieldName;
  };

  // Helper function to format cell value
  const formatCellValue = (value: any, fieldName: string): string => {
    if (fieldName === '_source') {
      if (value === 'before') return 'לפני';
      if (value === 'after') return 'אחרי';
      if (value === 'related') return 'מושפע';
      return value || '';
    }

    // Check if numeric field
    const isNumericField = fieldName.includes('size') || 
      fieldName.includes('area') || 
      fieldName === 'overload_ratio' ||
      fieldName === 'floor';

    if (isNumericField) {
      const formatted = formatNumberToTwoDecimals(value, false);
      return formatted === '0.00' || formatted === '' ? '' : formatted;
    }

    return value != null ? String(value) : '';
  };

  // Helper function to check if field changed
  const isFieldChanged = (fieldName: string, asset: any): boolean => {
    const changedFields = asset._changedFields as Set<string> | undefined;
    return changedFields ? changedFields.has(fieldName) : false;
  };

  // Helper function to render asset_id cell
  const renderAssetIdCell = (asset: any): React.ReactNode => {
    const assetId = asset.asset_id;
    const source = asset._source;
    
    // For "after" rows, check if there's a corresponding "before" row with the same asset_id
    if (source === 'after') {
      const hasBeforeRow = beforeAssets.some(a => a.asset_id === assetId);
      if (hasBeforeRow) {
        return ''; // Empty cell to create visual span effect
      }
    }
    
    // For detail records (from distribution/transfer), make all asset IDs clickable
    const isDetailRecord = asset._isDetailRecord === true;
    const isDifferentFromTab = params.currentTabAssetId && assetId !== params.currentTabAssetId;
    const shouldBeClickable = isDetailRecord || isDifferentFromTab;
    
    if (params.onSelectAsset && assetId && asset?.building_number && shouldBeClickable) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            params.onSelectAsset!(
              assetId,
              String(assetId),
              asset.building_number,
              asset.tax_region ? String(asset.tax_region) : undefined
            );
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors font-semibold"
          title="לחץ כדי לפתוח את הנכס"
        >
          {assetId}
        </button>
      );
    }
    
    return assetId || '';
  };

  // Prepare columns: allowed fields first, then _source and asset_id at the end (right side)
  // Swap asset_id and _source so asset_id comes before _source
  const tableColumns = useMemo(() => {
    const fieldsWithoutAssetId = allowedFields.filter(f => f !== 'asset_id');
    return [...fieldsWithoutAssetId, 'asset_id', '_source'];
  }, [allowedFields]);

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200" style={{ width: '100%' }}>
      {/* Simple HTML Table */}
      {allDetailAssets.length > 0 && (
        <div className="flex flex-col" dir="rtl">
          <div className="rounded-xl shadow-lg border border-blue-100 overflow-x-auto" style={{ maxHeight: '200px', direction: 'rtl' }}>
            <table className="min-w-full divide-y divide-gray-200" style={{ fontSize: '11px' }}>
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {tableColumns.map((fieldName) => (
                    <th
                      key={fieldName}
                      scope="col"
                      className="px-2 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider"
                      style={{ textAlign: 'right', fontWeight: 'normal' }}
                    >
                      {getHeaderName(fieldName)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allDetailAssets.map((asset, rowIndex) => {
                  const source = asset._source;
                  
                  return (
                    <tr key={`${source}-${asset.asset_id}-${asset.measurement_date || ''}-${rowIndex}`}>
                      {tableColumns.map((fieldName) => {
                        const value = fieldName === '_source' ? source : (asset as any)[fieldName];
                        const isChanged = isFieldChanged(fieldName, asset);
                        const shouldHighlight = isChanged && (source === 'before' || source === 'after');
                        
                        return (
                          <td
                            key={fieldName}
                            className="px-2 py-1 whitespace-nowrap text-right"
                            style={{
                              textAlign: 'right',
                              fontWeight: shouldHighlight ? 'bold' : 'normal',
                              fontStyle: shouldHighlight ? 'italic' : 'normal'
                            }}
                          >
                            {fieldName === 'asset_id' ? (
                              renderAssetIdCell(asset)
                            ) : (
                              formatCellValue(value, fieldName)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

