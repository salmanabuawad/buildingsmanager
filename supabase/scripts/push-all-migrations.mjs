#!/usr/bin/env node
/**
 * Push all migrations to Supabase so the remote DB matches the codebase.
 * Uses Supabase Management API. No CLI or link required.
 *
 * Requires in .env or environment:
 *   SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF or VITE_SUPABASE_URL (to derive project ref)
 *
 * Usage: npm run db:push   or   node supabase/scripts/push-all-migrations.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'mmqnrwjjxewrgwczezzf';
const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

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

// Only timestamped migrations (YYYYMMDDHHMMSS_name.sql); skip e.g. import_asset_types_latest.sql
const TIMESTAMPED = /^\d{14}_[a-zA-Z0-9_]+\.sql$/;

function getLocalMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && TIMESTAMPED.test(f))
    .sort();
  return files.map((f) => ({
    name: f.replace(/\.sql$/, ''),
    path: join(MIGRATIONS_DIR, f),
  }));
}

async function getAppliedMigrations() {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/migrations`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Failed to list migrations:', res.status, text);
    process.exit(1);
  }
  const list = JSON.parse(text);
  return new Set((list || []).map((m) => m.version || m.name));
}

async function applyMigration(name, query) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/migrations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Failed to apply', name, res.status, text);
    throw new Error(`Apply failed: ${name}`);
  }
}

async function main() {
  console.log('Project ref:', ref);
  const local = getLocalMigrations();
  console.log('Local migrations (timestamped):', local.length);

  const applied = await getAppliedMigrations();
  console.log('Already applied on remote:', applied.size);

  const toApply = local.filter((m) => !applied.has(m.name));
  if (toApply.length === 0) {
    console.log('Database already matches code. Nothing to apply.');
    return;
  }

  console.log('Applying', toApply.length, 'migration(s)...');
  for (const { name, path } of toApply) {
    const query = readFileSync(path, 'utf8');
    await applyMigration(name, query);
    console.log('  Applied:', name);
  }
  console.log('Done. Supabase DB now matches current code.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
