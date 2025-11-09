import { supabase } from './supabase';

export interface Building {
  building_number: number;
  tax_region?: string;
  total_units: number;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}

export interface Asset {
  id: string;
  building_number: number;
  apartment_number: string;
  floor?: string;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  garden_area?: number;
  total_apartment_area: number;
  pdf_file_url?: string;
  dwg_file_url?: string;
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

export interface UnitType {
  id: string;
  name: string;
  description: string;
  tax_region?: number;
  created_at: string;
  updated_at: string;
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
    create: async (input: Omit<Building, 'created_at' | 'total_units' | 'apartment_area' | 'storage_area' | 'pergola_area' | 'balcony_area' | 'total_building_area'>): Promise<Building> => {
      const { data, error } = await supabase
        .from('buildings')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (buildingNumber: number, input: Partial<Building>): Promise<Building> => {
      const { data, error } = await supabase
        .from('buildings')
        .update(input)
        .eq('building_number', buildingNumber)
        .select()
        .single();

      if (error) throw error;
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
        .order('apartment_number');

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
      const { data, error } = await supabase
        .from('assets')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
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
  unitTypes: {
    getAll: async (): Promise<UnitType[]> => {
      const { data, error } = await supabase
        .from('unit_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    },
    getOne: async (id: string): Promise<UnitType> => {
      const { data, error } = await supabase
        .from('unit_types')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Unit type not found');
      return data;
    },
    create: async (input: Omit<UnitType, 'id' | 'created_at' | 'updated_at'>): Promise<UnitType> => {
      const { data, error } = await supabase
        .from('unit_types')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    update: async (id: string, input: Partial<UnitType>): Promise<UnitType> => {
      const { data, error } = await supabase
        .from('unit_types')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const { error } = await supabase
        .from('unit_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { message: 'Unit type deleted successfully' };
    },
  },
};
