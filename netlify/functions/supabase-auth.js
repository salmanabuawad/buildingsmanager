/**
 * Supabase Auth: verify JWT from Authorization header.
 * Requires env at runtime: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * On Netlify: set in Dashboard → Site settings → Environment variables, or in netlify.toml [build.environment].
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseEnv() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  };
}

/**
 * Get Supabase user from Bearer token. Returns { user, error, authSkipped }.
 * When SUPABASE_URL/KEY are missing, returns authSkipped: true so callers can allow the request (e.g. Bolt hosting).
 */
export async function getUserFromAuthHeader(authHeader) {
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, error: null, authSkipped: true };
  }
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: new Error('Missing or invalid Authorization header') };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { user: null, error: new Error('Missing token') };

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return { user: null, error };
  if (!user) return { user: null, error: new Error('Invalid or expired token') };
  return { user, error: null };
}
