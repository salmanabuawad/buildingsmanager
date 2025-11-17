import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export interface Building {
  id: string;
  name: string;
  total_units: number;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}

export interface Apartment {
  id: string;
  building_id: string;
  apartment_number: string;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_area: number;
  dwg_file_url?: string;
  created_at: string;
}
