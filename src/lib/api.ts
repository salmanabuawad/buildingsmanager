import { supabase } from './supabase';
import i18n from '../i18n/i18n';
import { sanitizeText, sanitizeNumber, sanitizeInteger, sanitizeDate } from './sanitize';

export interface Building {
  building_number: number;
  tax_region?: string;
  shared_area?: number;
  shared_business_area?: number;
  elevator?: string;
  area_for_control?: number;
  created_at: string;
  total_building_area?: number;
  single_double_family?: string;
  condo?: string;
  basement?: string;
  townhouses?: string;
  building_address?: number; // Street code from address_list table
  _tempId?: string; // Hidden field to identify new buildings before saving
  _isNew?: boolean; // Hidden field to mark new buildings
}

export interface Asset {
  id: number;
  building_number: number;
  payer_id?: string;
  asset_id: number;
  measurement_date: string;
  main_asset_type?: string;
  asset_size: number;
  sub_asset_type_1?: string;
  sub_asset_size_1: number;
  sub_asset_type_2?: string;
  sub_asset_size_2: number;
  sub_asset_type_3?: string;
  sub_asset_size_3: number;
  sub_asset_type_4?: string;
  sub_asset_size_4: number;
  sub_asset_type_5?: string;
  sub_asset_size_5: number;
  sub_asset_type_6?: string;
  sub_asset_size_6: number;
  structure_drawing_url?: string;
  created_at: string;
  updated_at: string;
  elevator?: string;
  single_double_family?: string;
  condo?: string;
  townhouses?: string;
  basement?: string;
  penthouse?: string;
  is_latest?: boolean; // Flag from assets_with_history view: true for assets table, false for assets_history
  history_created_at?: string; // Only present for assets_history records
  is_new_measurement?: boolean; // Flag to mark as new measurement - when true, UPDATE will move old record to history
}

export interface AssetMeasurement {
  id: string;
  asset_id: string;
  measurement_date: string;
  asset_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  garden_area?: number;
  total_area: number;
  notes?: string;
  drawing_file_url?: string;
  created_at: string;
  created_by?: string;
}

export interface AssetType {
  id: number;
  name: string;
  description?: string;
  tax_region?: number;
  elevator?: string;
  single_double_family?: string;
  penthouse?: string;
  condo?: string;
  townhouses?: string;
  active?: string;
  min_size?: number;
  max_size?: number;
  created_at: string;
  updated_at: string;
}

export interface AssetTypeField {
  id: string;
  field_name: string;
  is_asset_level: boolean;
  is_building_level: boolean;
  is_asset_type_validation: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddressList {
  street_code: number;
  street_description: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationRule {
  id: string;
  rule_key: string;
  rule_type: string;
  field_name: string;
  entity_type: string;
  value_numeric?: number;
  value_text?: string;
  enabled: boolean;
  error_message?: string;
  description?: string;
  compare_table?: string;
  compare_field?: string;
  join_field?: string;
  comparison_operator?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreference {
  id: string;
  user_id: string;
  preference_key: string;
  preference_value: any;
  created_at: string;
  updated_at: string;
}

/**
 * Sanitizes asset data before sending to the server
 */
function sanitizeAssetInput(input: any): any {
  // Default measurement_date to today if not provided or invalid
  let measurementDate = input.measurement_date != null ? sanitizeDate(input.measurement_date) : '';
  if (!measurementDate || measurementDate === '') {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    measurementDate = `${day}/${month}/${year}`;
  }
  
  const sanitized: any = {
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    payer_id: input.payer_id != null && input.payer_id !== '' ? sanitizeText(input.payer_id) : undefined,
    asset_id: input.asset_id != null ? sanitizeInteger(input.asset_id) : undefined,
    measurement_date: measurementDate, // Always include measurement_date
    main_asset_type: input.main_asset_type != null ? sanitizeText(input.main_asset_type) : undefined,
    asset_size: input.asset_size != null ? sanitizeNumber(input.asset_size) : undefined,
    sub_asset_type_1: input.sub_asset_type_1 != null ? sanitizeText(input.sub_asset_type_1) : undefined,
    sub_asset_size_1: input.sub_asset_size_1 != null ? sanitizeNumber(input.sub_asset_size_1) : undefined,
    sub_asset_type_2: input.sub_asset_type_2 != null ? sanitizeText(input.sub_asset_type_2) : undefined,
    sub_asset_size_2: input.sub_asset_size_2 != null ? sanitizeNumber(input.sub_asset_size_2) : undefined,
    sub_asset_type_3: input.sub_asset_type_3 != null ? sanitizeText(input.sub_asset_type_3) : undefined,
    sub_asset_size_3: input.sub_asset_size_3 != null ? sanitizeNumber(input.sub_asset_size_3) : undefined,
    sub_asset_type_4: input.sub_asset_type_4 != null ? sanitizeText(input.sub_asset_type_4) : undefined,
    sub_asset_size_4: input.sub_asset_size_4 != null ? sanitizeNumber(input.sub_asset_size_4) : undefined,
    sub_asset_type_5: input.sub_asset_type_5 != null ? sanitizeText(input.sub_asset_type_5) : undefined,
    sub_asset_size_5: input.sub_asset_size_5 != null ? sanitizeNumber(input.sub_asset_size_5) : undefined,
    sub_asset_type_6: input.sub_asset_type_6 != null ? sanitizeText(input.sub_asset_type_6) : undefined,
    sub_asset_size_6: input.sub_asset_size_6 != null ? sanitizeNumber(input.sub_asset_size_6) : undefined,
    elevator: input.elevator != null ? sanitizeText(input.elevator) : undefined,
    single_double_family: input.single_double_family != null ? sanitizeText(input.single_double_family) : undefined,
    condo: input.condo != null ? sanitizeText(input.condo) : undefined,
    townhouses: input.townhouses != null ? sanitizeText(input.townhouses) : undefined,
    basement: input.basement != null ? sanitizeText(input.basement) : undefined,
    penthouse: input.penthouse != null ? sanitizeText(input.penthouse) : undefined,
    structure_drawing_url: input.structure_drawing_url != null ? sanitizeText(input.structure_drawing_url) : undefined,
  };
  
  // Remove undefined values to avoid sending them to the database
  // But always keep measurement_date even if it's somehow undefined (shouldn't happen)
  Object.keys(sanitized).forEach(key => {
    if (key !== 'measurement_date' && sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });
  
  // Ensure measurement_date is always present
  if (!sanitized.measurement_date) {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    sanitized.measurement_date = `${day}/${month}/${year}`;
  }
  
  return sanitized;
}

/**
 * Sanitizes building data before sending to the server
 */
function sanitizeBuildingInput(input: any): any {
  const sanitized: any = {};
  
  if (input.building_number != null) {
    sanitized.building_number = sanitizeInteger(input.building_number);
  }
  if (input.tax_region != null && input.tax_region !== '') {
    sanitized.tax_region = sanitizeText(input.tax_region);
  }
  if (input.shared_area != null) {
    sanitized.shared_area = sanitizeNumber(input.shared_area);
  }
  if (input.shared_business_area != null) {
    sanitized.shared_business_area = sanitizeNumber(input.shared_business_area);
  }
  if (input.area_for_control != null) {
    sanitized.area_for_control = sanitizeNumber(input.area_for_control);
  }
  if (input.total_building_area != null) {
    sanitized.total_building_area = sanitizeNumber(input.total_building_area);
  }
  // Handle elevator: if explicitly set to null, include it; otherwise only if it has a value
  if ('elevator' in input) {
    if (input.elevator === null || input.elevator === '') {
      sanitized.elevator = null;
    } else {
      sanitized.elevator = sanitizeText(input.elevator);
    }
  }
  // Handle checkbox fields: if explicitly set to null, include it; otherwise only if it has a value
  if ('single_double_family' in input) {
    if (input.single_double_family === null || input.single_double_family === '') {
      sanitized.single_double_family = null;
    } else {
      sanitized.single_double_family = sanitizeText(input.single_double_family);
    }
  }
  if ('condo' in input) {
    if (input.condo === null || input.condo === '') {
      sanitized.condo = null;
    } else {
      sanitized.condo = sanitizeText(input.condo);
    }
  }
  if ('basement' in input) {
    if (input.basement === null || input.basement === '') {
      sanitized.basement = null;
    } else {
      sanitized.basement = sanitizeText(input.basement);
    }
  }
  if ('townhouses' in input) {
    if (input.townhouses === null || input.townhouses === '') {
      sanitized.townhouses = null;
    } else {
      sanitized.townhouses = sanitizeText(input.townhouses);
    }
  }
  
  return sanitized;
}

export const api = {
  buildings: {
    getAll: async (): Promise<Building[]> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('building_number');

      if (error) throw error;

      const buildings = data || [];

      const buildingsWithStats = await Promise.all(
        buildings.map(async (building) => {
          const { data: stats } = await supabase
            .rpc('get_building_stats', { p_building_number: building.building_number });

          return {
            ...building,
            total_building_area: stats?.[0]?.total_building_area || 0
          };
        })
      );

      return buildingsWithStats;
    },
    getOne: async (buildingNumber: number): Promise<Building> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('building_number', buildingNumber)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Building not found');
      return data;
    },
    create: async (input: Omit<Building, 'created_at'>): Promise<Building> => {
      console.log('[API] Creating building with input:', input);
      const sanitizedInput = sanitizeBuildingInput(input);
      // Remove undefined values to prevent Supabase errors
      const cleanedInput = Object.fromEntries(
        Object.entries(sanitizedInput).filter(([_, v]) => v !== undefined)
      );
      const { data, error } = await supabase
        .from('buildings')
        .insert(cleanedInput)
        .select()
        .single();

      if (error) {
        console.error('[API ERROR] Create building failed:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      console.log('[API] Building created successfully:', data);
      return data;
    },
    update: async (buildingNumber: number, input: Partial<Building>): Promise<Building> => {
      console.log('[API] Updating building:', buildingNumber, 'with data:', input);
      const sanitizedInput = sanitizeBuildingInput(input);
      // Remove undefined values to prevent Supabase errors
      const cleanedInput = Object.fromEntries(
        Object.entries(sanitizedInput).filter(([_, v]) => v !== undefined)
      );
      
      // If no fields to update, return the existing building
      if (Object.keys(cleanedInput).length === 0) {
        return api.buildings.getOne(buildingNumber);
      }
      
      const { data, error } = await supabase
        .from('buildings')
        .update(cleanedInput)
        .eq('building_number', buildingNumber)
        .select()
        .single();

      if (error) {
        console.error('[API ERROR] Update building failed:', {
          buildingNumber,
          input,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      console.log('[API] Building updated successfully:', data);
      return data;
    },
    delete: async (buildingNumber: number): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('buildings')
        .delete()
        .eq('building_number', buildingNumber);

      if (error) throw error;
      return { message: 'Building deleted successfully' };
    },
  },
  assets: {
    getAll: async (buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('asset_id');

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      const sortedData = (data || []).sort((a, b) => {
        if (a.asset_id !== b.asset_id) {
          return a.asset_id - b.asset_id;
        }
        return parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime();
      });

      return sortedData;
    },
    getLatestOnly: async (buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('asset_id');

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      const sortedData = (data || []).sort((a, b) => {
        if (a.asset_id !== b.asset_id) {
          return a.asset_id - b.asset_id;
        }
        return parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime();
      });

      const latestMap = new Map<string, Asset>();
      for (const asset of sortedData) {
        if (!latestMap.has(asset.asset_id)) {
          latestMap.set(asset.asset_id, asset);
        }
      }

      return Array.from(latestMap.values());
    },
    getAllByAssetId: async (assetId: string, buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .eq('asset_id', assetId);

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getHistoryByAssetId: async (assetId: string | number): Promise<Asset[]> => {
      const { data, error } = await supabase
        .from('assets_history')
        .select('*')
        .eq('asset_id', assetId)
        .order('history_created_at', { ascending: false });

      if (error) {
        console.error('[API ERROR] Error fetching assets_history:', error);
        // If table doesn't exist or RLS blocks it, return empty array
        if (error.code === '42P01' || error.code === '42501') {
          return [];
        }
        throw error;
      }

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getAssetWithHistory: async (assetId: string | number, buildingNumber?: number): Promise<Asset[]> => {
      try {
        // First record: fetch from assets table (latest measurement)
        let masterQuery = supabase
          .from('assets')
          .select('*')
          .eq('asset_id', assetId);

        if (buildingNumber) {
          masterQuery = masterQuery.eq('building_number', buildingNumber);
        }

        const { data: masterData, error: masterError } = await masterQuery.maybeSingle();

        if (masterError && masterError.code !== 'PGRST116') {
          console.error('[API ERROR] Error fetching master asset from assets table:', masterError);
          throw masterError;
        }

        // Other records: fetch from assets_history table
        let historyQuery = supabase
          .from('assets_history')
          .select('*')
          .eq('asset_id', assetId);

        if (buildingNumber) {
          historyQuery = historyQuery.eq('building_number', buildingNumber);
        }

        // Sort by history_created_at (database insertion date) descending, then by measurement_date as fallback
        const { data: historyData, error: historyError } = await historyQuery
          .order('history_created_at', { ascending: false, nullsFirst: false })
          .order('measurement_date', { ascending: false });

        if (historyError) {
          console.error('[API ERROR] Error fetching assets_history:', historyError);
          // If history table doesn't exist or RLS blocks it, return only master
          if (historyError.code === '42P01' || historyError.code === '42501' || historyError.code === 'PGRST205') {
            console.warn('[API] assets_history table not accessible, returning only master record');
            return masterData ? [{ ...masterData, is_latest: true }] : [];
          }
          throw historyError;
        }

        // Sort history records by history_created_at (database insertion date) descending
        // If history_created_at is null, use created_at or id as fallback
        const sortedHistory = (historyData || []).map(h => ({ ...h, is_latest: false }))
          .sort((a, b) => {
            // Primary sort: history_created_at (database insertion date)
            const aDate = a.history_created_at || a.created_at || a.id;
            const bDate = b.history_created_at || b.created_at || b.id;
            
            if (aDate && bDate) {
              const aTime = new Date(aDate).getTime();
              const bTime = new Date(bDate).getTime();
              return bTime - aTime; // Descending (newest first)
            }
            
            // Fallback: if one has date and other doesn't, put the one with date first
            if (aDate && !bDate) return -1;
            if (!aDate && bDate) return 1;
            
            // Final fallback: sort by measurement_date
            const parseDate = (dateStr: string) => {
              if (!dateStr) return 0;
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
              }
              return new Date(dateStr).getTime();
            };
            
            return parseDate(b.measurement_date) - parseDate(a.measurement_date);
          });

        // Combine: first record from assets table, then all history records
        const allRecords: Asset[] = [];
        
        if (masterData) {
          // First record: from assets table (marked as latest)
          allRecords.push({ ...masterData, is_latest: true });
        }
        
        // Other records: from assets_history table
        allRecords.push(...sortedHistory);

        console.log('[API] getAssetWithHistory result:', {
          totalCount: allRecords.length,
          masterCount: masterData ? 1 : 0,
          historyCount: sortedHistory.length,
          firstRecordSource: masterData ? 'assets' : 'none',
          otherRecordsSource: 'assets_history'
        });

        return allRecords;
      } catch (err: any) {
        console.error('[API ERROR] Unexpected error in getAssetWithHistory:', err);
        throw err;
      }
    },
    getAssetWithHistoryFallback: async (assetId: string | number, buildingNumber?: number): Promise<Asset[]> => {
      // Fallback method using separate queries (old implementation)
      let masterQuery = supabase
        .from('assets')
        .select('*')
        .eq('asset_id', assetId);

      if (buildingNumber) {
        masterQuery = masterQuery.eq('building_number', buildingNumber);
      }

      const { data: masterData, error: masterError } = await masterQuery.maybeSingle();

      if (masterError && masterError.code !== 'PGRST116') {
        console.error('[API ERROR] Error fetching master asset:', masterError);
        throw masterError;
      }

      // Fetch detail records from assets_history table
      const { data: historyData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .eq('asset_id', assetId)
        .order('history_created_at', { ascending: false });

      if (historyError) {
        console.error('[API ERROR] Error fetching assets_history:', historyError);
        // If table doesn't exist or RLS blocks it, return only master
        if (historyError.code === '42P01' || historyError.code === '42501') {
          return masterData ? [{ ...masterData, is_latest: true }] : [];
        }
        throw historyError;
      }

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Sort history records by measurement_date (newest first)
      const sortedHistory = (historyData || []).map(h => ({ ...h, is_latest: false }))
        .sort((a, b) => parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime());

      // Combine master (with is_latest=true) and history (with is_latest=false)
      const allRecords = masterData 
        ? [{ ...masterData, is_latest: true }, ...sortedHistory]
        : sortedHistory;

      return allRecords;
    },
    getAllAssetsWithHistory: async (buildingNumber: number): Promise<Asset[]> => {
      // Call PostgreSQL function to get both master and details in one database call
      const { data, error } = await supabase.rpc('get_assets_with_history', {
        p_building_number: buildingNumber
      });

      if (error) {
        console.error('[API ERROR] Error calling get_assets_with_history:', error);
        // Fallback to separate queries if function doesn't exist
        // PGRST202 = function not found in schema cache
        if (error.code === '42883' || error.code === 'PGRST202' || error.message.includes('function') || error.message.includes('does not exist') || error.message.includes('Could not find the function')) {
          console.log('[API] Function not found, falling back to separate queries');
          
          // Fallback: Fetch all master records from assets table for the building
          const { data: masterAssets, error: masterError } = await supabase
            .from('assets')
            .select('*')
            .eq('building_number', buildingNumber)
            .order('asset_id');

          if (masterError) {
            console.error('[API ERROR] Error fetching master assets:', masterError);
            throw masterError;
          }

          if (!masterAssets || masterAssets.length === 0) {
            return [];
          }

          // Get all asset_ids to fetch their history
          const assetIds = masterAssets.map(a => a.asset_id);

          // Fetch all history records for these asset_ids in one query
          const { data: allHistoryData, error: historyError } = await supabase
            .from('assets_history')
            .select('*')
            .in('asset_id', assetIds)
            .order('history_created_at', { ascending: false });

          if (historyError) {
            console.error('[API ERROR] Error fetching assets_history:', historyError);
            // If table doesn't exist or RLS blocks it, return only master records
            if (historyError.code === '42P01' || historyError.code === '42501') {
              return masterAssets;
            }
            throw historyError;
          }

          // Group history records by asset_id
          const historyByAssetId = new Map<number, Asset[]>();
          (allHistoryData || []).forEach(record => {
            const assetId = record.asset_id;
            if (!historyByAssetId.has(assetId)) {
              historyByAssetId.set(assetId, []);
            }
            historyByAssetId.get(assetId)!.push(record);
          });

          // Sort history records by measurement_date for each asset
          const parseDate = (dateStr: string) => {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
            return new Date(dateStr);
          };

          // Combine master records with their history
          const result: Asset[] = [];
          masterAssets.forEach(master => {
            // Add master record
            result.push(master);
            
            // Add history records for this asset
            const history = historyByAssetId.get(master.asset_id) || [];
            const sortedHistory = history.sort((a, b) =>
              parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
            );
            result.push(...sortedHistory);
          });

          return result;
        }
        throw error;
      }

      // Parse the JSON response
      const masterAssets: Asset[] = data?.master || [];
      const historyAssets: Asset[] = data?.details || [];

      // Sort history records by measurement_date
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Group history records by asset_id
      const historyByAssetId = new Map<number, Asset[]>();
      historyAssets.forEach(record => {
        const assetId = record.asset_id;
        if (!historyByAssetId.has(assetId)) {
          historyByAssetId.set(assetId, []);
        }
        historyByAssetId.get(assetId)!.push(record);
      });

      // Sort each asset's history by measurement_date
      historyByAssetId.forEach((history, assetId) => {
        historyByAssetId.set(assetId, history.sort((a, b) =>
          parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
        ));
      });

      // Combine master records with their history
      const result: Asset[] = [];
      masterAssets.forEach(master => {
        // Add master record
        result.push(master);
        
        // Add history records for this asset
        const history = historyByAssetId.get(master.asset_id) || [];
        result.push(...history);
      });

      return result;
    },
    // Fallback method if database function doesn't exist
    getAllAssetsWithHistoryFallback: async (buildingNumber: number): Promise<Asset[]> => {
      // Fetch all master records from assets table for the building
      const { data: masterAssets, error: masterError } = await supabase
        .from('assets')
        .select('*')
        .eq('building_number', buildingNumber)
        .order('asset_id');

      if (masterError) {
        console.error('[API ERROR] Error fetching master assets:', masterError);
        throw masterError;
      }

      if (!masterAssets || masterAssets.length === 0) {
        return [];
      }

      // Get all asset_ids to fetch their history
      const assetIds = masterAssets.map(a => a.asset_id);

      // Fetch all history records for these asset_ids in one query
      const { data: allHistoryData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .in('asset_id', assetIds)
        .order('history_created_at', { ascending: false });

      if (historyError) {
        console.error('[API ERROR] Error fetching assets_history:', historyError);
        // If table doesn't exist or RLS blocks it, return only master records
        if (historyError.code === '42P01' || historyError.code === '42501') {
          return masterAssets;
        }
        throw historyError;
      }

      // Group history records by asset_id
      const historyByAssetId = new Map<number, Asset[]>();
      (allHistoryData || []).forEach(record => {
        const assetId = record.asset_id;
        if (!historyByAssetId.has(assetId)) {
          historyByAssetId.set(assetId, []);
        }
        historyByAssetId.get(assetId)!.push(record);
      });

      // Sort history records by measurement_date for each asset
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      // Combine master records with their history
      const result: Asset[] = [];
      masterAssets.forEach(master => {
        // Add master record
        result.push(master);
        
        // Add history records for this asset
        const history = historyByAssetId.get(master.asset_id) || [];
        const sortedHistory = history.sort((a, b) =>
          parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
        );
        result.push(...sortedHistory);
      });

      return result;
    },
    getOne: async (id: string): Promise<Asset> => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        // Handle PGRST116 error (0 rows) as "not found"
        if (error.code === 'PGRST116') {
          throw new Error('Asset not found');
        }
        throw error;
      }
      if (!data) throw new Error('Asset not found');
      return data;
    },
    create: async (input: Omit<Asset, 'id' | 'created_at'>): Promise<Asset> => {
      console.log('[API] Creating asset with input:', input);
      const sanitizedInput = sanitizeAssetInput(input);
      console.log('[API] Sanitized input:', sanitizedInput);
      
      // Check if an asset with the same asset_id already exists
      if (sanitizedInput.asset_id != null) {
        const { data: existingAsset, error: checkError } = await supabase
          .from('assets')
          .select('*')
          .eq('asset_id', sanitizedInput.asset_id)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          console.error('[API ERROR] Error checking for existing asset:', checkError);
          throw new Error(`שגיאה בבדיקת נכס קיים: ${checkError.message}`);
        }

        // If asset exists, delete it (trigger will copy it to history) and create a new entry
        if (existingAsset) {
          console.log('[API] Asset with asset_id exists, deleting (trigger will copy to history) and creating new entry:', existingAsset);
          
          // Delete the existing asset from assets table
          // Database trigger will automatically copy it to history before deletion
          const { error: deleteError } = await supabase
            .from('assets')
            .delete()
            .eq('asset_id', sanitizedInput.asset_id);

          if (deleteError) {
            console.error('[API ERROR] Delete asset failed:', {
              asset_id: sanitizedInput.asset_id,
              message: deleteError.message,
              details: deleteError.details,
              hint: deleteError.hint,
              code: deleteError.code
            });
            throw new Error(`שגיאה במחיקת נכס קיים: ${deleteError.message}`);
          }

          console.log('[API] Existing asset deleted successfully');

          // Insert new asset with new measurement data
          const { data: newAsset, error: insertError } = await supabase
            .from('assets')
            .insert(sanitizedInput)
            .select()
            .single();

          if (insertError) {
            console.error('[API ERROR] Insert new asset failed:', {
              input,
              sanitizedInput,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code
            });
            throw new Error(`שגיאה ביצירת נכס חדש: ${insertError.message}`);
          }

          console.log('[API] New asset created successfully:', newAsset);
          return newAsset;
        }
      }

      // If no existing asset, proceed with normal insert
      const { data, error } = await supabase
        .from('assets')
        .insert(sanitizedInput)
        .select()
        .single();

      if (error) {
        console.error('[API ERROR] Create asset failed:', {
          input,
          sanitizedInput,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        let errorMessage = error.message || 'Failed to create asset';

        // Handle constraint violations
        if (error.code === '23505') {
          if (error.message.includes('assets_pkey') || error.message.includes('primary key')) {
            errorMessage = 'נכס עם זיהוי זה כבר קיים עם תאריך מדידה זה. כל שילוב של מספר נכס ותאריך מדידה חייב להיות ייחודי.';
          } else {
            errorMessage = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר המבנה.';
          }
        } else if (error.code === '23514') {
          if (error.message.includes('check_sub_asset_type_') && error.message.includes('not_composite')) {
            const match = error.message.match(/check_sub_asset_type_(\d+)_not_composite/);
            const subAssetNum = match ? match[1] : '';
            errorMessage = i18n.t('subAssetTypeCompositeError', { subAssetNum });
          } else if (error.message.includes('check_minimum_two_sub_assets')) {
            errorMessage = 'נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה עם ערכים.';
          } else if (error.message.includes('check_numeric_asset_id')) {
            errorMessage = 'זיהוי נכס חייב להיות מספר תקין.';
          } else if (error.message.includes('check_numeric_payer_id')) {
            errorMessage = 'מספר משלם חייב להיות מספר תקין.';
          }
        } else if (error.code === '23503') {
          if (error.message.includes('building_number')) {
            errorMessage = `מבנה ${input.building_number} לא קיים. המבנה ייווצר אוטומטית אם הנתונים תקינים.`;
          }
        }

        const details = error.details ? ` (${error.details})` : '';
        const hint = error.hint ? ` - ${error.hint}` : '';

        throw new Error(`${errorMessage}${details}${hint}`);
      }
      console.log('[API] Asset updated successfully:', updatedAsset);
      return updatedAsset;
    },
    update: async (id: string, input: Partial<Asset>): Promise<Asset> => {
      console.log('[API] Updating asset:', id, 'with data:', input);
      
      // First, get the existing asset
      const { data: existingAsset, error: fetchError } = await supabase
        .from('assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) {
        console.error('[API ERROR] Error fetching existing asset:', fetchError);
        if (fetchError.code === 'PGRST116') {
          throw new Error('Asset not found');
        }
        throw new Error(`שגיאה בטעינת נכס: ${fetchError.message}`);
      }

      if (!existingAsset) {
        throw new Error('Asset not found');
      }

      // Sanitize the input data
      const sanitizedInput = sanitizeAssetInput(input);
      
      // Remove fields that shouldn't be updated
      delete (sanitizedInput as any).id;
      delete (sanitizedInput as any).created_at;
      // Ensure is_new_measurement is not set unless explicitly provided
      // Regular updates should NOT set is_new_measurement flag
      if (!('is_new_measurement' in input)) {
        delete (sanitizedInput as any).is_new_measurement;
      }
      
      console.log('[API] Sanitized input for update:', sanitizedInput);

      // Perform a regular UPDATE - the trigger will only move to history if is_new_measurement is true
      const { data: updatedAsset, error: updateError } = await supabase
        .from('assets')
        .update(sanitizedInput)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('[API ERROR] Update asset failed:', {
          id,
          input,
          sanitizedInput,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        });

        let errorMessage = updateError.message || 'Failed to update asset';

        if (updateError.code === '23514') {
          if (updateError.message.includes('check_sub_asset_type_') && updateError.message.includes('not_composite')) {
            const match = updateError.message.match(/check_sub_asset_type_(\d+)_not_composite/);
            const subAssetNum = match ? match[1] : '';
            errorMessage = i18n.t('subAssetTypeCompositeError', { subAssetNum });
          } else if (updateError.message.includes('check_minimum_two_sub_assets')) {
            errorMessage = 'נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה עם ערכים.';
          } else if (updateError.message.includes('check_numeric_asset_id')) {
            errorMessage = 'זיהוי נכס חייב להיות מספר תקין.';
          } else if (updateError.message.includes('check_numeric_payer_id')) {
            errorMessage = 'מספר משלם חייב להיות מספר תקין.';
          }
        } else if (updateError.code === '23503') {
          if (updateError.message.includes('building_number')) {
            errorMessage = `מבנה ${input.building_number} לא קיים. המבנה ייווצר אוטומטית אם הנתונים תקינים.`;
          }
        } else if (updateError.code === '23505') {
          if (updateError.message.includes('assets_asset_id_unique') || updateError.message.includes('asset_id')) {
            errorMessage = `נכס עם מספר זיהוי ${sanitizedInput.asset_id} כבר קיים במערכת.`;
          }
        }

        const details = updateError.details && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` (${updateError.details})` : '';
        const hint = updateError.hint && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` - ${updateError.hint}` : '';

        // Always include full error information
        const fullErrorMessage = `${errorMessage}${details}${hint}`;
        console.error('[API] Full error details:', { code: updateError.code, message: errorMessage, details, hint, fullErrorMessage });
        throw new Error(fullErrorMessage);
      }

      console.log('[API] Asset updated successfully:', updatedAsset);
      return updatedAsset;
    },
    delete: async (id: number | string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Asset deleted successfully' };
    },
  },
  measurements: {
    getAll: async (assetId: string): Promise<AssetMeasurement[]> => {
      const { data, error } = await supabase
        .from('apartment_measurements')
        .select('*')
        .eq('asset_id', assetId);

      if (error) throw error;

      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };

      return (data || []).sort((a, b) =>
        parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime()
      );
    },
    getOne: async (id: string): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('apartment_measurements')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Measurement not found');
      return data;
    },
    create: async (input: Omit<AssetMeasurement, 'id' | 'created_at' | 'total_area'>): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('apartment_measurements')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<AssetMeasurement>): Promise<AssetMeasurement> => {
      const { data, error } = await supabase
        .from('apartment_measurements')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('apartment_measurements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Measurement deleted successfully' };
    },
  },
  assetTypes: {
    getAll: async (): Promise<AssetType[]> => {
      const { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .order('name');

      if (error) throw error;
      
      // Map asset_type to id if the column was renamed
      const mappedData = (data || []).map((item: any) => {
        if (item.asset_type !== undefined && item.id === undefined) {
          return { ...item, id: item.asset_type };
        }
        return item;
      });
      
      return mappedData;
    },
    getOne: async (id: number): Promise<AssetType> => {
      // Try id first, then asset_type as fallback
      let { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .select('*')
          .eq('asset_type', id)
          .maybeSingle();
        data = result.data;
        error = result.error;
        
        // Map asset_type to id
        if (data && data.asset_type !== undefined) {
          data = { ...data, id: data.asset_type };
        }
      }

      if (error) throw error;
      if (!data) throw new Error('Asset type not found');
      return data;
    },
    getByName: async (name: string): Promise<AssetType[]> => {
      const { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('name', name);

      if (error) throw error;
      
      // Map asset_type to id if the column was renamed
      const mappedData = (data || []).map((item: any) => {
        if (item.asset_type !== undefined && item.id === undefined) {
          return { ...item, id: item.asset_type };
        }
        return item;
      });
      
      return mappedData;
    },
    formatWithDescription: (code: string | number | undefined | null, assetTypes: AssetType[]): string => {
      if (!code) return '';
      const codeStr = String(code);
      const assetType = assetTypes.find(at => at.name === codeStr);
      if (assetType && assetType.description) {
        return `${code} - ${assetType.description}`;
      }
      return String(code);
    },
    create: async (input: Omit<AssetType, 'id' | 'created_at' | 'updated_at'>): Promise<AssetType> => {
      const { data, error } = await supabase
        .from('asset_types')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: number, input: Partial<AssetType>): Promise<AssetType> => {
      // Clean input: convert empty strings to null/undefined for numeric fields
      const cleanedInput: any = { ...input };
      
      // Handle numeric fields: convert empty strings to null
      if ('tax_region' in cleanedInput && cleanedInput.tax_region === '') {
        cleanedInput.tax_region = null;
      } else if ('tax_region' in cleanedInput && typeof cleanedInput.tax_region === 'string') {
        const parsed = parseInt(cleanedInput.tax_region);
        cleanedInput.tax_region = isNaN(parsed) ? null : parsed;
      }
      
      if ('min_size' in cleanedInput && cleanedInput.min_size === '') {
        cleanedInput.min_size = null;
      } else if ('min_size' in cleanedInput && typeof cleanedInput.min_size === 'string') {
        const parsed = parseFloat(cleanedInput.min_size);
        cleanedInput.min_size = isNaN(parsed) ? null : parsed;
      }
      
      if ('max_size' in cleanedInput && cleanedInput.max_size === '') {
        cleanedInput.max_size = null;
      } else if ('max_size' in cleanedInput && typeof cleanedInput.max_size === 'string') {
        const parsed = parseFloat(cleanedInput.max_size);
        cleanedInput.max_size = isNaN(parsed) ? null : parsed;
      }
      
      // Remove undefined values to prevent Supabase errors
      const finalInput = Object.fromEntries(
        Object.entries(cleanedInput).filter(([_, v]) => v !== undefined)
      );
      
      // Try id first, then asset_type as fallback
      let { data, error } = await supabase
        .from('asset_types')
        .update(finalInput)
        .eq('id', id)
        .select()
        .single();

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .update(finalInput)
          .eq('asset_type', id)
          .select()
          .single();
        data = result.data;
        error = result.error;
        
        // Map asset_type to id
        if (data && data.asset_type !== undefined) {
          data = { ...data, id: data.asset_type };
        }
      }

      if (error) throw error;
      return data;
    },
    delete: async (id: number): Promise<{ message: string }> => {
      // Try id first, then asset_type as fallback
      let { error } = await supabase
        .from('asset_types')
        .delete()
        .eq('id', id);

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .delete()
          .eq('asset_type', id);
        error = result.error;
      }

      if (error) throw error;
      return { message: 'Asset type deleted successfully' };
    },
  },
  assetTypeFields: {
    getAll: async (): Promise<AssetTypeField[]> => {
      try {
        const { data, error } = await supabase
          .from('asset_type_fields')
          .select('*')
          .order('field_name');

        if (error) {
          // If table doesn't exist, return empty array instead of throwing
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[API] asset_type_fields table does not exist. Please run the migration.');
            return [];
          }
          throw error;
        }
        return data || [];
      } catch (err: any) {
        // Handle table not found gracefully
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          console.warn('[API] asset_type_fields table does not exist. Please run the migration.');
          return [];
        }
        throw err;
      }
    },
    getOne: async (id: string): Promise<AssetTypeField> => {
      try {
        const { data, error } = await supabase
          .from('asset_type_fields')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('asset_type_fields table does not exist. Please run the migration.');
          }
          throw error;
        }
        if (!data) throw new Error('Asset type field not found');
        return data;
      } catch (err: any) {
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          throw new Error('asset_type_fields table does not exist. Please run the migration.');
        }
        throw err;
      }
    },
    create: async (input: Omit<AssetTypeField, 'id' | 'created_at' | 'updated_at'>): Promise<AssetTypeField> => {
      try {
        const { data, error } = await supabase
          .from('asset_type_fields')
          .insert(input)
          .select()
          .single();

        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('asset_type_fields table does not exist. Please run the migration.');
          }
          throw error;
        }
        return data;
      } catch (err: any) {
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          throw new Error('asset_type_fields table does not exist. Please run the migration.');
        }
        throw err;
      }
    },
    update: async (id: string, input: Partial<AssetTypeField>): Promise<AssetTypeField> => {
      try {
        const { data, error } = await supabase
          .from('asset_type_fields')
          .update(input)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('asset_type_fields table does not exist. Please run the migration.');
          }
          throw error;
        }
        return data;
      } catch (err: any) {
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          throw new Error('asset_type_fields table does not exist. Please run the migration.');
        }
        throw err;
      }
    },
    delete: async (id: string): Promise<{ message: string }> => {
      try {
        const { error } = await supabase
          .from('asset_type_fields')
          .delete()
          .eq('id', id);

        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('asset_type_fields table does not exist. Please run the migration.');
          }
          throw error;
        }
        return { message: 'Asset type field deleted successfully' };
      } catch (err: any) {
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          throw new Error('asset_type_fields table does not exist. Please run the migration.');
        }
        throw err;
      }
    },
  },
  addressList: {
    getAll: async (): Promise<AddressList[]> => {
      const { data, error } = await supabase
        .from('address_list')
        .select('*')
        .order('street_code', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    getOne: async (streetCode: number): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .select('*')
        .eq('street_code', streetCode)
        .single();

      if (error) throw error;
      return data;
    },
    create: async (input: Partial<AddressList>): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (streetCode: number, input: Partial<AddressList>): Promise<AddressList> => {
      const { data, error } = await supabase
        .from('address_list')
        .update(input)
        .eq('street_code', streetCode)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (streetCode: number): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('address_list')
        .delete()
        .eq('street_code', streetCode);

      if (error) throw error;
      return { message: 'Address deleted successfully' };
    },
  },
  validationRules: {
    getAll: async (entityType?: string): Promise<ValidationRule[]> => {
      let query = supabase
        .from('validation_rules')
        .select('*')
        .order('entity_type')
        .order('field_name');

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getEnabled: async (entityType?: string): Promise<ValidationRule[]> => {
      let query = supabase
        .from('validation_rules')
        .select('*')
        .eq('enabled', true)
        .order('entity_type')
        .order('field_name');

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getOne: async (id: string): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Validation rule not found');
      return data;
    },
    getByKey: async (ruleKey: string): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('rule_key', ruleKey)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Validation rule not found');
      return data;
    },
    create: async (input: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'>): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<ValidationRule>): Promise<ValidationRule> => {
      const { data, error } = await supabase
        .from('validation_rules')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('validation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Validation rule deleted successfully' };
    },
  },
  deleteBuilding: async (buildingNumber: number): Promise<{ message: string }> => {
    return api.buildings.delete(buildingNumber);
  },
  deleteAssetsByBuilding: async (buildingNumber: number): Promise<{ message: string }> => {
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('building_number', buildingNumber);

    if (error) throw error;
    return { message: 'Assets deleted successfully' };
  },
  userPreferences: {
    get: async (userId: string, preferenceKey: string): Promise<UserPreference | null> => {
      console.log('[API] Getting user preference:', { userId, preferenceKey });
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', userId)
          .eq('preference_key', preferenceKey)
          .maybeSingle();

        if (error) {
          // If table doesn't exist, return null instead of throwing
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[API] user_preferences table does not exist. Please run the migration.');
            return null;
          }
          console.error('[API] Error getting user preference:', error);
          throw error;
        }
        console.log('[API] User preference retrieved:', data);
        return data;
      } catch (err: any) {
        // Handle table not found gracefully
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          console.warn('[API] user_preferences table does not exist. Please run the migration.');
          return null;
        }
        throw err;
      }
    },
    set: async (userId: string, preferenceKey: string, preferenceValue: any): Promise<UserPreference> => {
      console.log('[API] Saving user preference:', { userId, preferenceKey, preferenceValue });
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .upsert({
            user_id: userId,
            preference_key: preferenceKey,
            preference_value: preferenceValue,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,preference_key'
          })
          .select()
          .single();

        if (error) {
          // If table doesn't exist, log warning instead of throwing
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[API] user_preferences table does not exist. Please run the migration. Preference not saved.');
            throw new Error('user_preferences table does not exist. Please run the migration.');
          }
          console.error('[API] Error saving user preference:', error);
          throw error;
        }
        console.log('[API] User preference saved successfully:', data);
        return data;
      } catch (err: any) {
        // Handle table not found gracefully
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          console.warn('[API] user_preferences table does not exist. Please run the migration.');
          throw new Error('user_preferences table does not exist. Please run the migration.');
        }
        throw err;
      }
    },
    delete: async (userId: string, preferenceKey: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('preference_key', preferenceKey);

      if (error) throw error;
      return { message: 'Preference deleted successfully' };
    },
    deleteAll: async (userId: string): Promise<{ message: string; count: number }> => {
      console.log('[API] Deleting all user preferences for user:', userId);
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .delete()
          .eq('user_id', userId)
          .select();

        if (error) {
          // If table doesn't exist, return success with 0 count
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[API] user_preferences table does not exist.');
            return { message: 'No preferences to delete', count: 0 };
          }
          console.error('[API] Error deleting all user preferences:', error);
          throw error;
        }
        const count = data?.length || 0;
        console.log(`[API] Deleted ${count} user preferences`);
        return { message: `Deleted ${count} preference(s) successfully`, count };
      } catch (err: any) {
        // Handle table not found gracefully
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          console.warn('[API] user_preferences table does not exist.');
          return { message: 'No preferences to delete', count: 0 };
        }
        throw err;
      }
    },
    deleteAllGridPreferences: async (userId: string = 'default'): Promise<{ message: string; count: number }> => {
      console.log('[API] Deleting all grid column state preferences for user:', userId);
      try {
        // Delete all preferences where preference_key ends with '_column_state'
        const { data, error } = await supabase
          .from('user_preferences')
          .delete()
          .eq('user_id', userId)
          .like('preference_key', '%_column_state')
          .select();

        if (error) {
          // If table doesn't exist, return success with 0 count
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[API] user_preferences table does not exist.');
            return { message: 'No grid preferences to delete', count: 0 };
          }
          console.error('[API] Error deleting grid preferences:', error);
          throw error;
        }
        const count = data?.length || 0;
        console.log(`[API] Deleted ${count} grid column state preferences`);
        return { message: `Deleted ${count} grid preference(s) successfully`, count };
      } catch (err: any) {
        // Handle table not found gracefully
        if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
          console.warn('[API] user_preferences table does not exist.');
          return { message: 'No grid preferences to delete', count: 0 };
        }
        throw err;
      }
    },
  },
};
