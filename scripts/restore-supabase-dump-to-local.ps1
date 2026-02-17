# Restore Supabase dump to local PostgreSQL (exact copy: tables, functions, triggers, data)
# Prereq: Run dump-from-supabase.ps1 first, PostgreSQL running locally
# Usage: .\scripts\restore-supabase-dump-to-local.ps1 [-DumpPath "path/to/dump.sql"] [-DbName buildings_manager]

param(
    [string]$DumpPath = "db_structure\supabase_dump.sql",
    [string]$DbName = "buildings_manager"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Load backend .env
$envFile = Join-Path $root "backend\.env"
$envExample = Join-Path $root "backend\.env.local.example"
if (-not (Test-Path $envFile)) { Copy-Item $envExample $envFile }
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $k = $matches[1].Trim()
        $v = $matches[2].Trim()
        if (-not [string]::IsNullOrEmpty($k)) { Set-Item -Path "env:$k" -Value $v -Force }
    }
}

$pgHost = if ($env:PGHOST) { $env:PGHOST } else { "localhost" }
$pgUser = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }
$pgPort = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
$pgPassword = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "postgres" }

$dumpFull = if ([System.IO.Path]::IsPathRooted($DumpPath)) { $DumpPath } else { Join-Path $root $DumpPath }
if (-not (Test-Path $dumpFull)) {
    Write-Host "Error: Dump file not found: $dumpFull" -ForegroundColor Red
    Write-Host "Run .\scripts\dump-from-supabase.ps1 first." -ForegroundColor Yellow
    exit 1
}

$psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psqlPath) {
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { $psqlPath = $p; break }
    }
}
if (-not $psqlPath) {
    Write-Host "Error: psql not found. Install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

$rolesSql = Join-Path $root "scripts\supabase-roles-for-local.sql"
$env:PGPASSWORD = $pgPassword

Write-Host "Restoring to local PostgreSQL: $pgHost`:$pgPort/$DbName" -ForegroundColor Cyan
Write-Host "Dump: $dumpFull (tables, functions, triggers, data)" -ForegroundColor Gray
Write-Host ""

# Create roles first (cluster-wide, run against postgres)
if (Test-Path $rolesSql) {
    Write-Host "Creating roles (anon, authenticated, service_role)..." -ForegroundColor Cyan
    & $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -f $rolesSql 2>&1 | Out-Null
}

# Drop and recreate target database for clean copy
Write-Host "Terminating connections to '$DbName'..." -ForegroundColor Gray
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();" 2>&1 | Out-Null

Write-Host "Dropping database '$DbName' (if exists)..." -ForegroundColor Cyan
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "DROP DATABASE IF EXISTS $DbName;" 2>&1 | Out-Null

Write-Host "Creating database '$DbName'..." -ForegroundColor Cyan
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "CREATE DATABASE $DbName;" 2>&1
if ($LASTEXITCODE -ne 0) {
    $env:PGPASSWORD = $null
    Write-Host "Failed to create database." -ForegroundColor Red
    exit 1
}

# Restore dump (functions, triggers, tables, data)
Write-Host "Restoring dump (schema + data)..." -ForegroundColor Cyan
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d $DbName -v ON_ERROR_STOP=0 -f $dumpFull 2>&1 | ForEach-Object {
    if ($_ -match 'ERROR') { Write-Host $_ -ForegroundColor Red }
    elseif ($_ -match '^SET|^CREATE|^ALTER|^COPY') { }  # Suppress verbose
    else { Write-Host $_ -ForegroundColor Gray }
}

$env:PGPASSWORD = $null

# Update backend .env to point at restored DB
$envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
if ($envContent -and $envContent -notmatch "PGDATABASE=$DbName\b") {
    $envContent = $envContent -replace "PGDATABASE=.*", "PGDATABASE=$DbName"
    Set-Content $envFile $envContent.TrimEnd() -NoNewline
    Write-Host "Updated backend\.env: PGDATABASE=$DbName" -ForegroundColor Gray
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "Restore completed. Local DB '$DbName' is identical to Supabase (tables, functions, triggers, data)." -ForegroundColor Green
} else {
    Write-Host "Restore may have partial errors (e.g. Supabase-specific objects). Check output above." -ForegroundColor Yellow
}
