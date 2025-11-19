import { supabase } from './supabase';
import i18n from '../i18n/i18n';
import { sanitizeText, sanitizeNumber, sanitizeInteger, sanitizeDate } from './sanitize';

export interface Building {
  building_number: number;
  tax_region?: string;
  shared_area?: number;
  has_elevator: boolean;
  created_at: string;
}

export interface SubAsset {
  id: number;
  asset_id: number;
  building_number: number;
  measurement_date: string;
  sub_asset_type: string;
  sub_asset_size: number;
  sequence_order: number;
  created_at: string;
}

export interface Asset {
  id: number;
  building_number: number;
  payer_id?: string;
  asset_id: number;
  measurement_date: string;
  main_asset_type?: string;
  asset_size: number;
  structure_drawing_url?: string;
  created_at: string;
  updated_at: string;
  sub_assets?: SubAsset[];
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
  id: string;
  name: string;
  description: string;
  tax_region?: number;
  shared_area?: boolean;
  has_elevator?: boolean;
  min_asset_size?: number;
  max_asset_size?: number;
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
function sanitizeAssetInput(input: any): any {
  return {
    ...input,
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    payer_id: input.payer_id != null ? sanitizeText(input.payer_id) : undefined,
    asset_id: input.asset_id != null ? sanitizeInteger(input.asset_id) : undefined,
    measurement_date: input.measurement_date != null ? sanitizeDate(input.measurement_date) : undefined,
    main_asset_type: input.main_asset_type != null ? sanitizeText(input.main_asset_type) : undefined,
    asset_size: input.asset_size != null ? sanitizeNumber(input.asset_size) : undefined,
  };
}

function sanitizeSubAssetInput(input: any): any {
  return {
    asset_id: input.asset_id != null ? sanitizeInteger(input.asset_id) : undefined,
    building_number: input.building_number != null ? sanitizeInteger(input.building_number) : undefined,
    measurement_date: input.measurement_date != null ? sanitizeDate(input.measurement_date) : undefined,
    sub_asset_type: input.sub_asset_type != null ? sanitizeText(input.sub_asset_type) : undefined,
    sub_asset_size: input.sub_asset_size != null ? sanitizeNumber(input.sub_asset_size) : undefined,
    sequence_order: input.sequence_order != null ? sanitizeInteger(input.sequence_order) : undefined,
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
      return data || [];
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

      if (error) throw error;
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
        .single();

      if (error) {
        console.error('[API ERROR] Update asset failed:', {
          id,
          input,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

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
      return data || [];
    },
    getOne: async (id: string): Promise<AssetType> => {
      const { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Asset type not found');
      return data;
    },
    getByCode: async (code: string): Promise<AssetType | null> => {
      const { data, error } = await supabase
        .from('asset_types')
        .select('*')
        .eq('name', code)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    formatWithDescription: (code: string | undefined | null, assetTypes: AssetType[]): string => {
      if (!code) return '';
      const assetType = assetTypes.find(at => at.name === code);
      if (assetType && assetType.description) {
        return `${code} - ${assetType.description}`;
      }
      return code;
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
    update: async (id: string, input: Partial<AssetType>): Promise<AssetType> => {
      const { data, error } = await supabase
        .from('asset_types')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('asset_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Asset type deleted successfully' };
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
  subAssets: {
    getByAsset: async (assetId: number, buildingNumber: number, measurementDate: string): Promise<SubAsset[]> => {
      const { data, error } = await supabase
        .from('sub_assets')
        .select('*')
        .eq('asset_id', assetId)
        .eq('building_number', buildingNumber)
        .eq('measurement_date', measurementDate)
        .order('sequence_order');

      if (error) throw error;
      return data || [];
    },
    create: async (input: Omit<SubAsset, 'id' | 'created_at'>): Promise<SubAsset> => {
      const sanitizedInput = sanitizeSubAssetInput(input);
      const { data, error } = await supabase
        .from('sub_assets')
        .insert(sanitizedInput)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: number, input: Partial<SubAsset>): Promise<SubAsset> => {
      const sanitizedInput = sanitizeSubAssetInput(input);
      const { data, error } = await supabase
        .from('sub_assets')
        .update(sanitizedInput)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: number): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('sub_assets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Sub-asset deleted successfully' };
    },
    bulkUpsert: async (assetId: number, buildingNumber: number, measurementDate: string, subAssets: Array<{sub_asset_type: string, sub_asset_size: number, sequence_order: number}>): Promise<void> => {
      await supabase
        .from('sub_assets')
        .delete()
        .eq('asset_id', assetId)
        .eq('building_number', buildingNumber)
        .eq('measurement_date', measurementDate);

      if (subAssets.length > 0) {
        const records = subAssets.map(sa => ({
          asset_id: assetId,
          building_number: buildingNumber,
          measurement_date: measurementDate,
          sub_asset_type: sa.sub_asset_type,
          sub_asset_size: sa.sub_asset_size,
          sequence_order: sa.sequence_order,
        }));

        const { error } = await supabase
          .from('sub_assets')
          .insert(records);

        if (error) throw error;
      }
    },
  },
};
