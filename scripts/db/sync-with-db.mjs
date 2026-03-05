#!/usr/bin/env node
/**
 * Sync with DB: probe live Supabase and report current state.
 * Run before applying migrations. Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * (or SUPABASE_URL / SUPABASE_ANON_KEY) in env or .env.
 *
 * Usage: node scripts/db/sync-with-db.mjs
 * Or:    npm run db:sync  (from project root)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_*) in env or .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function probeTable(table, selectCol = 'id') {
  const { data, error } = await supabase.from(table).select(selectCol).limit(1);
  if (error) {
    if (error.code === '42P01' || /does not exist|relation .* does not exist/i.test(error.message))
      return { exists: false, error: error.message };
    return { exists: 'unknown', error: error.message };
  }
  return { exists: true, rowCount: data?.length ?? 0 };
}

async function main() {
  console.log('Syncing with live DB at', url.replace(/\/$/, ''));
  console.log('');

  const checks = [
    { name: 'users (user_id)', table: 'users', col: 'user_id' },
    { name: 'assets', table: 'assets', col: 'asset_id' },
    { name: 'operators', table: 'operators', col: 'operator_id' },
  ];

  for (const { name, table, col } of checks) {
    const r = await probeTable(table, col);
    if (r.exists === true)
      console.log(`  [OK]   ${name}: table exists`);
    else if (r.exists === false)
      console.log(`  [--]   ${name}: table does not exist (migration may be needed)`);
    else
      console.log(`  [?]    ${name}: ${r.error}`);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Run full sync queries in SQL Editor: scripts/db/sync_with_db_queries.sql');
  console.log('  2. Apply only migrations that are not yet reflected in the live DB.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
