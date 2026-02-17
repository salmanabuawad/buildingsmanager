// Supabase client – only created when env vars are set.
// When not set (e.g. Azure backend only), a stub is exported so the app loads without Supabase.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function stub(): never {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use the API backend only.');
}

function createStubClient(): any {
  const chain = () => ({ eq: chain, select: chain, single: chain, maybeSingle: chain, then: (fn: (x: { data: null; error: any }) => void) => fn({ data: null, error: { message: 'Supabase not configured' } }) });
  return {
    from: () => ({ select: chain, insert: () => ({ select: chain, then: stub }), update: () => ({ eq: chain, then: stub }), upsert: () => ({ then: stub }), delete: () => ({ eq: chain, then: stub }) }),
    rpc: stub,
    storage: { from: () => ({ upload: stub, getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: stub, download: stub, remove: stub }) },
  };
}

export const supabase: SupabaseClient = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { realtime: { params: { eventsPerSecond: 10 } } })
  : (createStubClient() as SupabaseClient);

export interface Building {
  id: string;
  name: string;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}
