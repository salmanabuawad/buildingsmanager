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
  townhouses?: string;
  building_address?: number; // Street code from address_list table
  overload_ratio?: number; // אחוז העמסה - Overload ratio percentage
  gosh?: number; // גוש (Block number)
  helka?: number; // חלקה (Parcel number)
  building_number_in_street?: number; // מספר בניין (Building number in street)
  _tempId?: string; // Hidden field to identify new buildings before saving
  _isNew?: boolean; // Hidden field to mark new buildings
}

export interface Asset {
  building_number: number;
  payer_id?: string;
  asset_id: number; // Primary key (was id field previously)
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
  penthouse?: string;
  tax_region?: number; // Tax region code (אזור מס) - matches asset_types.tax_region
  is_latest?: boolean; // Flag from assets_with_history view: true for assets table, false for assets_history
  history_created_at?: string; // Only present for assets_history records
  is_new_measurement?: boolean; // Flag to mark as new measurement - when true, UPDATE will move old record to history
  floor?: number; // קומה (Floor number)
  discount_type?: string; // סוג הנחה (Discount type)
  discount_date_from?: string; // תאריך הנחה מ (Discount date from)
  discount_date_to?: string; // תאריך הנחה עד (Discount date to)
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
  area_description_for_tab?: string; // תיאור אזור לתצוגה בלשונית
  elevator?: string;
  single_double_family?: string;
  penthouse?: string;
  condo?: string;
  townhouses?: string;
  business_private?: string;
  shared_area_usage?: string;
  active?: string;
  not_accountable?: boolean; // לא נספר
  min_size?: number;
  max_size?: number;
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


/**
 * Sanitizes asset data before sending to the server
 */
export function sanitizeAssetInput(input: any): any {
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
    tax_region: input.tax_region != null ? sanitizeInteger(input.tax_region) : undefined,
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
    penthouse: input.penthouse != null ? sanitizeText(input.penthouse) : undefined,
    structure_drawing_url: input.structure_drawing_url != null ? sanitizeText(input.structure_drawing_url) : undefined,
    floor: input.floor != null ? sanitizeInteger(input.floor) : undefined,
    discount_type: input.discount_type != null ? sanitizeText(input.discount_type) : undefined,
    discount_date_from: input.discount_date_from != null ? sanitizeDate(input.discount_date_from) : undefined,
    discount_date_to: input.discount_date_to != null ? sanitizeDate(input.discount_date_to) : undefined,
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
  if ('townhouses' in input) {
    if (input.townhouses === null || input.townhouses === '') {
      sanitized.townhouses = null;
    } else {
      sanitized.townhouses = sanitizeText(input.townhouses);
    }
  }
  // Handle building_address: street code from address_list table
  if ('building_address' in input) {
    if (input.building_address === null || input.building_address === '' || input.building_address === undefined) {
      sanitized.building_address = null;
    } else {
      const code = sanitizeInteger(input.building_address);
      // Only set if it's a valid positive number, otherwise set to null
      if (code && code > 0) {
        sanitized.building_address = code;
      } else {
        sanitized.building_address = null;
      }
    }
  }
  // Handle overload_ratio: numeric field for overload percentage
  if (input.overload_ratio != null) {
    sanitized.overload_ratio = sanitizeNumber(input.overload_ratio);
  }
  // Handle gosh: גוש (Block number)
  if (input.gosh != null && input.gosh !== '') {
    sanitized.gosh = sanitizeInteger(input.gosh);
  } else if ('gosh' in input && (input.gosh === null || input.gosh === '')) {
    sanitized.gosh = null;
  }
  // Handle helka: חלקה (Parcel number)
  if (input.helka != null && input.helka !== '') {
    sanitized.helka = sanitizeInteger(input.helka);
  } else if ('helka' in input && (input.helka === null || input.helka === '')) {
    sanitized.helka = null;
  }
  // Handle building_number_in_street: מספר בניין (Building number in street)
  if (input.building_number_in_street != null && input.building_number_in_street !== '') {
    sanitized.building_number_in_street = sanitizeInteger(input.building_number_in_street);
  } else if ('building_number_in_street' in input && (input.building_number_in_street === null || input.building_number_in_street === '')) {
    sanitized.building_number_in_street = null;
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
    getAvailableTaxRegions: async (buildingNumber: number): Promise<string | null> => {
      // Get all assets for this building
      const assets = await api.assets.getAll(buildingNumber);
      
      if (!assets || assets.length === 0) {
        return null;
      }

      // Get all unique tax regions directly from assets' tax_region field
      const taxRegions = new Set<number>();
      for (const asset of assets) {
        if (asset.tax_region != null) {
          const taxRegionNum = typeof asset.tax_region === 'string' 
            ? parseInt(asset.tax_region, 10) 
            : asset.tax_region;
          if (!isNaN(taxRegionNum)) {
            taxRegions.add(taxRegionNum);
          }
        }
      }

      // Convert to sorted array and join with comma
      if (taxRegions.size === 0) {
        return null;
      }

      const sortedTaxRegions = Array.from(taxRegions).sort((a, b) => a - b);
      return sortedTaxRegions.join(',');
    },
    create: async (input: Omit<Building, 'created_at'>): Promise<Building> => {
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
        throw error;
      }
      return data;
    },
    update: async (buildingNumber: number, input: Partial<Building>): Promise<Building> => {
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
        // Handle foreign key constraint violation for building_address
        if (error.code === '23503' && (error.message?.includes('fk_buildings_building_address') || error.details?.includes('address_list'))) {
          const streetCode = cleanedInput.building_address;
          throw new Error(`סמל רחוב ${streetCode} לא קיים בטבלת הכתובות. יש לבחור כתובת תקינה מהרשימה.`);
        }
        throw error;
      }
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

      if (error) {
        throw error;
      }

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
          // If history table doesn't exist or RLS blocks it, return only master
          if (historyError.code === '42P01' || historyError.code === '42501' || historyError.code === 'PGRST205') {
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

        return allRecords;
      } catch (err: any) {
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
        throw masterError;
      }

      // Fetch detail records from assets_history table
      const { data: historyData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .eq('asset_id', assetId)
        .order('history_created_at', { ascending: false });

      if (historyError) {
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
        // Fallback to separate queries if function doesn't exist
        // PGRST202 = function not found in schema cache
        if (error.code === '42883' || error.code === 'PGRST202' || error.message.includes('function') || error.message.includes('does not exist') || error.message.includes('Could not find the function')) {
          
          // Fallback: Fetch all master records from assets table for the building
          const { data: masterAssets, error: masterError } = await supabase
            .from('assets')
            .select('*')
            .eq('building_number', buildingNumber)
            .order('asset_id');

          if (masterError) {
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
      // Log warning if this is called - it should rarely be needed since getAll should be used
      if (process.env.NODE_ENV === 'development') {
        console.warn('[api.assets.getOne] Individual asset fetch detected. This should be avoided - use getAll() instead. Asset ID:', id, new Error().stack);
      }
      
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('asset_id', id)
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
      const sanitizedInput = sanitizeAssetInput(input);
      
      // Check if an asset with the same asset_id already exists
      if (sanitizedInput.asset_id != null) {
        const { data: existingAsset, error: checkError } = await supabase
          .from('assets')
          .select('*')
          .eq('asset_id', sanitizedInput.asset_id)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw new Error(`שגיאה בבדיקת נכס קיים: ${checkError.message}`);
        }

        // If asset exists, delete it (trigger will copy it to history) and create a new entry
        if (existingAsset) {
          
          // Delete the existing asset from assets table
          // Database trigger will automatically copy it to history before deletion
          const { error: deleteError } = await supabase
            .from('assets')
            .delete()
            .eq('asset_id', sanitizedInput.asset_id);

          if (deleteError) {
            throw new Error(`שגיאה במחיקת נכס קיים: ${deleteError.message}`);
          }


          // Insert new asset with new measurement data
          const { data: newAsset, error: insertError } = await supabase
            .from('assets')
            .insert(sanitizedInput)
            .select()
            .single();

          if (insertError) {
            throw new Error(`שגיאה ביצירת נכס חדש: ${insertError.message}`);
          }

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
          // Foreign key constraint violation
          if (error.message.includes('fk_assets_buildings') || 
              error.message.includes('building_number') ||
              (error.details && error.details.includes('buildings')) ||
              (error.details && error.details.includes('Key is not present in table "buildings"'))) {
            errorMessage = `מבנה ${input.building_number} לא קיים במערכת. יש ליצור את המבנה לפני יצירת נכסים.`;
            // Don't append technical details for user-friendly messages
            throw new Error(errorMessage);
          } else {
            errorMessage = `שגיאת אימות נתונים: ${error.details || error.message}`;
          }
        }

        const details = error.details ? ` (${error.details})` : '';
        const hint = error.hint ? ` - ${error.hint}` : '';

        throw new Error(`${errorMessage}${details}${hint}`);
      }
      return data;
    },
    update: async (id: string, input: Partial<Asset>): Promise<Asset> => {
      // Sanitize the input data first (no need to fetch existing asset - we can update directly)
      const sanitizedInput = sanitizeAssetInput(input);
      
      // Remove fields that shouldn't be updated
      // No id field to delete - asset_id is now the primary key
      delete (sanitizedInput as any).created_at;
      // Only include is_new_measurement if explicitly provided (for "save as new measurement")
      // For regular updates, omit it entirely to avoid errors if column doesn't exist
      // If column exists and is false, omitting it keeps it false (PostgreSQL behavior)
      if (!('is_new_measurement' in input)) {
        delete (sanitizedInput as any).is_new_measurement;
      }
      

      // Perform a regular UPDATE - the trigger will only move to history if is_new_measurement is true
      const { data: updatedAsset, error: updateError } = await supabase
        .from('assets')
        .update(sanitizedInput)
        .eq('asset_id', id)
        .select()
        .single();

      if (updateError) {
        // Handle "not found" error (PGRST116 = 0 rows updated)
        if (updateError.code === 'PGRST116') {
          throw new Error('Asset not found');
        }
        
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
          // Foreign key constraint violation
          if (updateError.message.includes('fk_assets_buildings') || 
              updateError.message.includes('building_number') ||
              (updateError.details && updateError.details.includes('buildings')) ||
              (updateError.details && updateError.details.includes('Key is not present in table "buildings"'))) {
            errorMessage = `מבנה ${input.building_number} לא קיים במערכת. יש ליצור את המבנה לפני עדכון נכסים.`;
            // Don't append technical details for user-friendly messages
            throw new Error(errorMessage);
          } else {
            errorMessage = `שגיאת אימות נתונים: ${updateError.details || updateError.message}`;
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
        throw new Error(fullErrorMessage);
      }

      return updatedAsset;
    },
    delete: async (id: number | string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('asset_id', id);

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
      // Try to get from in-memory cache first (loaded on app startup)
      try {
        const { getAssetTypes } = await import('./validation');
        const inMemoryTypes = getAssetTypes();
        if (inMemoryTypes && inMemoryTypes.length > 0) {
          // Return a copy to avoid mutations
          return [...inMemoryTypes];
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getAll] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if cache is not available
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
      // Try to get from in-memory cache first
      try {
        const { getAssetTypes } = await import('./validation');
        const inMemoryTypes = getAssetTypes();
        const found = inMemoryTypes.find((at: any) => {
          const atId = at.id ?? at.asset_type;
          return atId === id;
        });
        if (found) {
          return found as AssetType;
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getOne] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if not found in cache
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
      // Try to get from in-memory cache first
      try {
        const { getAssetTypesByName } = await import('./validation');
        const inMemoryTypes = getAssetTypesByName(name);
        if (inMemoryTypes && inMemoryTypes.length > 0) {
          // Return a copy to avoid mutations
          return [...inMemoryTypes];
        }
      } catch (err) {
        // If validation module not available, fall back to database
        console.warn('[api.assetTypes.getByName] Could not access in-memory cache, falling back to database');
      }

      // Fallback to database query if not found in cache
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
      
      // Refresh in-memory cache after create
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.create] Failed to refresh cache:', err);
      }
      
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
      
      // Refresh in-memory cache after update
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.update] Failed to refresh cache:', err);
      }
      
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
      
      // Refresh in-memory cache after delete
      try {
        const { refreshAssetTypesCache } = await import('./validation');
        await refreshAssetTypesCache();
      } catch (err) {
        console.warn('[api.assetTypes.delete] Failed to refresh cache:', err);
      }
      
      return { message: 'Asset type deleted successfully' };
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
};
