#!/usr/bin/env node
/**
 * Apply a migration via Supabase Management API.
 * Requires: SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 *           and project ref in SUPABASE_PROJECT_REF or from VITE_SUPABASE_URL.
 *
 * Usage: SUPABASE_ACCESS_TOKEN=xxx node scripts/db/apply-migration-via-api.mjs [migration-name]
 * Pass migration name as first arg; script path as second or use default.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'mmqnrwjjxewrgwczezzf';

function loadEnv() {
  const root = resolve(__dirname, '../..');
  const envPath = resolve(root, '.env');
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
loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || (() => {
  const u = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const m = u.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : PROJECT_REF;
})();

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Create one at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const migrationName = process.argv[2];
const migrationFile = process.argv[3] ? resolve(process.cwd(), process.argv[3]) : resolve(__dirname, '../migrations/20260229000000_drop_export_email_queue.sql');
if (!migrationName) {
  console.error('Usage: node apply-migration-via-api.mjs <migration_name> [migration_file.sql]');
  process.exit(1);
}

if (!existsSync(migrationFile)) {
  console.error('Migration file not found:', migrationFile);
  process.exit(1);
}

const query = readFileSync(migrationFile, 'utf8');

async function main() {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/migrations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: migrationName, query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('API error', res.status, text);
    process.exit(1);
  }
  console.log('Migration applied:', migrationName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
