/**
 * Supabase Auth: verify JWT from Authorization header.
 * Use this in Netlify functions to require Supabase Auth.
 * Set env: SUPABASE_URL, SUPABASE_ANON_KEY (or use VITE_* from build.environment).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Get Supabase user from Bearer token. Returns { user, error }.
 * @param {string} authHeader - Value of Authorization header (e.g. "Bearer <jwt>")
 */
export async function getUserFromAuthHeader(authHeader) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, error: new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY') };
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
