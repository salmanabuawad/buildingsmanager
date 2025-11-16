import { supabase } from './supabase';
import i18n from '../i18n/i18n';

export interface Building {
  building_number: number;
  tax_region?: string;
  total_assets: number;
  total_building_area: number;
  total_area_for_control?: number;
  created_at: string;
}

export interface Asset {
  id: string;
  building_number: number;
  payer_id: string;
  asset_id: string;
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
  total_size: number;
  created_at: string;
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


export const api = {
  buildings: {
    getAll: async (): Promise<Building[]> => {
      const { data, error } = await supabase
        .from('building')
        .select('*')
        .order('building_number');

      if (error) throw error;
      return data || [];
    },
    getOne: async (buildingNumber: number): Promise<Building> => {
      const { data, error } = await supabase
        .from('building')
        .select('*')
        .eq('building_number', buildingNumber)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Building not found');
      return data;
    },
    create: async (input: Omit<Building, 'created_at' | 'total_units' | 'total_building_area'>): Promise<Building> => {
      console.log('[API] Creating building with input:', input);
      const { data, error } = await supabase
        .from('building')
        .insert(input)
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
      const { data, error } = await supabase
        .from('building')
        .update(input)
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
        .from('building')
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
        .order('asset_id')
        .order('measurement_date', { ascending: false });

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getLatestOnly: async (buildingNumber?: number): Promise<Asset[]> => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('asset_id')
        .order('measurement_date', { ascending: false });

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;

      const latestMap = new Map<string, Asset>();
      for (const asset of data || []) {
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
        .eq('asset_id', assetId)
        .order('measurement_date', { ascending: false });

      if (buildingNumber) {
        query = query.eq('building_number', buildingNumber);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('assets')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<Asset>): Promise<Asset> => {
      console.log('[API] Updating asset:', id, 'with data:', input);
      const { data, error } = await supabase
        .from('assets')
        .update(input)
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
    delete: async (id: string): Promise<{ message: string }> => {
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
        .eq('asset_id', assetId)
        .order('measurement_date', { ascending: false });

      if (error) throw error;
      return data || [];
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
};
