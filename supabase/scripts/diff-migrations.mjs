#!/usr/bin/env node
/**
 * Reads applied migrations from stdin (JSON array from list_migrations),
 * compares with local timestamped migrations, outputs toApply as JSON array of { name, path }.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');
const TIMESTAMPED = /^\d{14}_[a-zA-Z0-9_]+\.sql$/;

const appliedJson = process.argv[2];
if (!appliedJson) {
  console.error('Usage: node diff-migrations.mjs \'[{"version":"...","name":"..."}, ...]\'');
  process.exit(1);
}
let applied;
try {
  applied = JSON.parse(appliedJson);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

const appliedNames = new Set(applied.map((m) => m.name));
const local = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql') && TIMESTAMPED.test(f))
  .sort()
  .map((f) => ({
    name: f.replace(/\.sql$/, ''),
    path: join(MIGRATIONS_DIR, f),
  }));

const toApply = local.filter((m) => {
  const full = m.name;
  const slug = full.replace(/^\d+_/, '');
  return !appliedNames.has(full) && !appliedNames.has(slug);
});

console.log(JSON.stringify(toApply));
process.exit(0);
