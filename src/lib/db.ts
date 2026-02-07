import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Support both import.meta.env (Vite) and process.env (Node.js/test environments)
const USE_LOCAL_DB = (import.meta.env?.VITE_USE_LOCAL_DB || process.env.VITE_USE_LOCAL_DB) === 'true';
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const localDbUrl = import.meta.env?.VITE_LOCAL_DB_URL || process.env.VITE_LOCAL_DB_URL || 'postgresql://postgres:postgres@localhost:5432/buildings_manager';

let dbClient: SupabaseClient;

if (USE_LOCAL_DB) {
  if (!localDbUrl) {
    throw new Error('Missing local database URL. Please set VITE_LOCAL_DB_URL in your .env file.');
  }


  // For local PostgreSQL, we'll use Supabase client with local connection
  // You'll need to run Supabase locally or use PostgREST
  dbClient = createClient(
    localDbUrl.replace('postgresql://', 'http://localhost:3000'),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxOTU3MzQ1MjAwfQ.dc6sj7qYFJeocYEHTHl7H31w6B5Y6YXV5rOqLGQh6Og',
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
} else {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env file.');
  }


  dbClient = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export const supabase = dbClient;

export interface Building {
  id: string;
  name: string;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}
