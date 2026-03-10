#!/usr/bin/env node
/**
 * Check DB state using Supabase REST API (anon key). No access token needed.
 * Probes tables and functions that our code depends on.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const root = process.cwd() || resolve(__dirname, '../..');
  for (const f of ['.env', '.env.local']) {
    const envPath = resolve(root, f);
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) {
          const val = m[2].replace(/^["']|["']$/g, '').trim();
          process.env[m[1]] = val;
        }
      }
    }
  }
}
loadEnv();

// DB sync scripts use NEXT_PUBLIC_* for sync-only credentials (separate from app VITE_*)
const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!baseUrl || !key) {
  console.error('For db:check, add to .env: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (or VITE_* / SUPABASE_*)');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function checkTable(name) {
  const res = await fetch(`${baseUrl}/rest/v1/${name}?select=*&limit=0`, { headers });
  const text = await res.text();
  if (!res.ok) {
    const msg = text.toLowerCase();
    if (msg.includes('does not exist') || msg.includes('relation') || res.status === 404) return false;
    return { error: text || res.statusText };
  }
  return true;
}

async function checkRpc(name, args = {}) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    const msg = text.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) return false;
    if (msg.includes('invalid or expired') || msg.includes('valid otp') || msg.includes('user not found') || msg.includes('user_id required')) return true;
    return { error: text || res.statusText };
  }
  return true;
}

async function main() {
  console.log('Checking DB state at', baseUrl, '\n');

  const inspectorOtpTable = await checkTable('inspector_otp_codes');
  console.log('inspector_otp_codes table:', inspectorOtpTable === true ? 'EXISTS' : inspectorOtpTable === false ? 'MISSING' : inspectorOtpTable.error);

  const authLoginByOtp = await checkRpc('auth_login_by_otp');
  console.log('auth_login_by_otp function:', authLoginByOtp === true ? 'EXISTS' : authLoginByOtp === false ? 'MISSING' : authLoginByOtp.error);

  const inspectorCreateOtp = await checkRpc('inspector_create_otp', { p_user_id: 1 });
  console.log('inspector_create_otp function:', inspectorCreateOtp === true ? 'EXISTS' : inspectorCreateOtp === false ? 'MISSING' : inspectorCreateOtp.error);

  const inspectionReportFiles = await checkTable('inspection_report_files');
  console.log('inspection_report_files table:', inspectionReportFiles === true ? 'EXISTS' : 'MISSING');

  console.log('\nIf inspector_otp_codes or auth_login_by_otp are MISSING, run:');
  console.log('  npm run db:push   (requires SUPABASE_ACCESS_TOKEN in .env)');
  console.log('Or apply migration manually: supabase/migrations/20260310000000_inspector_otp_login.sql');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
