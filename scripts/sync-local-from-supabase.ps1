# Sync local DB from Supabase: dump then restore (identical copy)
# Ensures tables, functions, triggers, and all data are copied.
# Prereq: pg_dump, psql, SUPABASE_DB_PASSWORD in env or .env
# Usage: .\scripts\sync-local-from-supabase.ps1

param(
    [string]$DumpPath = "db_structure\supabase_dump.sql",
    [string]$DbName = "buildings_manager"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== Sync local DB from Supabase ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Dump from Supabase
Write-Host "[1/2] Dumping from Supabase (tables, functions, triggers, data)..." -ForegroundColor Cyan
& $PSScriptRoot\dump-from-supabase.ps1 -OutputPath $DumpPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""

# Step 2: Restore to local
Write-Host "[2/2] Restoring to local PostgreSQL..." -ForegroundColor Cyan
& $PSScriptRoot\restore-supabase-dump-to-local.ps1 -DumpPath $DumpPath -DbName $DbName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Local DB '$DbName' is now identical to Supabase." -ForegroundColor Green
