import { createClient } from '@supabase/supabase-js';

// Support both import.meta.env (Vite) and process.env (Node.js/test environments)
// In test environments, process.env is used as fallback
const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || process.env.VITE_SUPABASE_ANON_KEY;

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
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}
