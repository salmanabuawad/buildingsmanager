import { supabase } from './supabase';
import i18n from '../i18n/i18n';
import { sanitizeText, sanitizeNumber, sanitizeInteger, sanitizeDate } from './sanitize';

export interface Building {
  building_number: number;
  tax_region?: string;
  shared_area?: number;
  has_elevator: boolean;
  elevator?: string;
  area_for_control?: number;
  created_at: string;
  total_building_area?: number;
  single_double_family?: string;
  condo?: string;
  basement?: string;
  townhouses?: string;
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
  return {
    ...input,
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    payer_id: input.payer_id != null ? sanitizeText(input.payer_id) : undefined,
    asset_id: input.asset_id != null ? sanitizeInteger(input.asset_id) : undefined,
    measurement_date: input.measurement_date != null ? sanitizeDate(input.measurement_date) : undefined,
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
  };
}

/**
 * Sanitizes building data before sending to the server
 */
function sanitizeBuildingInput(input: any): any {
  return {
    ...input,
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    tax_region: input.tax_region != null ? sanitizeText(input.tax_region) : undefined,
    shared_area: input.shared_area != null ? sanitizeNumber(input.shared_area) : undefined,
    elevator: input.elevator != null ? sanitizeText(input.elevator) : undefined,
    single_double_family: input.single_double_family != null ? sanitizeText(input.single_double_family) : undefined,
    condo: input.condo != null ? sanitizeText(input.condo) : undefined,
    basement: input.basement != null ? sanitizeText(input.basement) : undefined,
    townhouses: input.townhouses != null ? sanitizeText(input.townhouses) : undefined,
  };
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
      const { data, error } = await supabase
        .from('buildings')
        .insert(sanitizedInput)
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
      const { data, error } = await supabase
        .from('buildings')
        .update(sanitizedInput)
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
            errorMessage = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר הבניין.';
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
            errorMessage = `בניין ${input.building_number} לא קיים. הבניין ייווצר אוטומטית אם הנתונים תקינים.`;
          }
        }

        const details = error.details ? ` (${error.details})` : '';
        const hint = error.hint ? ` - ${error.hint}` : '';

        throw new Error(`${errorMessage}${details}${hint}`);
      }
      console.log('[API] Asset created successfully:', data);
      return data;
    },
    update: async (id: string, input: Partial<Asset>): Promise<Asset> => {
      console.log('[API] Updating asset:', id, 'with data:', input);
      const sanitizedInput = sanitizeAssetInput(input);
      const { data, error } = await supabase
        .from('assets')
        .update(sanitizedInput)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[API ERROR] Update asset failed:', {
          id,
          input,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        // Handle PGRST116 error (0 rows) as "asset not found"
        if (error.code === 'PGRST116') {
          throw new Error('Asset not found');
        }

        let errorMessage = error.message || 'Failed to update asset';

        if (error.code === '23514') {
          if (error.message.includes('check_sub_asset_type_') && error.message.includes('not_composite')) {
            const match = error.message.match(/check_sub_asset_type_(\d+)_not_composite/);
            const subAssetNum = match ? match[1] : '';
            errorMessage = i18n.t('subAssetTypeCompositeError', { subAssetNum });
          }
        }

        const details = error.details && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` (${error.details})` : '';
        const hint = error.hint && !errorMessage.includes('Sub-Asset Type') && !errorMessage.includes('נכס משנה') ? ` - ${error.hint}` : '';

        throw new Error(`${errorMessage}${details}${hint}`);
      }

      if (!data) {
        // If no data returned, the asset might not exist or the update didn't match any rows
        // Try to fetch the asset to see if it exists
        const { data: existingAsset, error: fetchError } = await supabase
          .from('assets')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        
        if (fetchError) {
          // Handle PGRST116 error (0 rows) as "asset not found"
          if (fetchError.code === 'PGRST116') {
            throw new Error('Asset not found');
          }
          throw new Error(`Failed to verify asset existence: ${fetchError.message}`);
        }
        
        if (!existingAsset) {
          throw new Error('Asset not found - cannot update');
        }
        
        // If asset exists but update returned no data, it might be a permissions issue
        // or the update didn't actually change anything. Fetch the current asset data.
        const { data: currentAsset, error: currentError } = await supabase
          .from('assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        
        if (currentError) {
          if (currentError.code === 'PGRST116') {
            throw new Error('Asset not found');
          }
          throw new Error(`Failed to fetch asset after update: ${currentError.message}`);
        }
        
        if (currentAsset) {
          console.log('[API] Update returned no data, but asset exists. Returning current asset data.');
          return currentAsset;
        }
        
        throw new Error('Failed to update asset - no data returned and asset could not be fetched');
      }

      console.log('[API] Asset updated successfully:', data);
      return data;
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
      // Try id first, then asset_type as fallback
      let { data, error } = await supabase
        .from('asset_types')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      // If id column doesn't exist, try asset_type
      if (error && error.code === '42703') {
        const result = await supabase
          .from('asset_types')
          .update(input)
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
  },
};
