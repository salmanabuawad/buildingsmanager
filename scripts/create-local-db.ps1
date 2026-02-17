# Create local PostgreSQL database as replicate of Supabase (tables, functions, triggers, data)
# Uses migrations + seed - no Supabase connection required
# Prereq: PostgreSQL running (localhost:5432), user postgres
# Usage: .\scripts\create-local-db.ps1 [-DbName buildings_manager]

param(
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

# Find psql
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
    Write-Host "Error: psql not found." -ForegroundColor Red
    exit 1
}

$rolesSql = Join-Path $root "scripts\supabase-roles-for-local.sql"
$migrationsDir = Join-Path $root "supabase\migrations"
$seedPath = Join-Path $root "db_structure\seed_data.sql"
$env:PGPASSWORD = $pgPassword
Remove-Item env:DATABASE_URL -ErrorAction SilentlyContinue

# Terminate connections
Write-Host "Terminating connections to '$DbName'..." -ForegroundColor Gray
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();" 2>&1 | Out-Null

# Drop and recreate
Write-Host "Dropping database '$DbName' (if exists)..." -ForegroundColor Cyan
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "DROP DATABASE IF EXISTS $DbName;" 2>&1 | Out-Null

Write-Host "Creating database '$DbName'..." -ForegroundColor Cyan
& $psqlPath -h $pgHost -U $pgUser -p $pgPort -d postgres -c "CREATE DATABASE $DbName;" 2>&1
if ($LASTEXITCODE -ne 0) {
    $env:PGPASSWORD = $null
    Write-Host "Failed to create database." -ForegroundColor Red
    exit 1
}

# Create roles
Write-Host "Creating roles..." -ForegroundColor Cyan
if (Test-Path $rolesSql) {
    & $psqlPath -h $pgHost -U $pgUser -p $pgPort -d $DbName -f $rolesSql 2>&1 | Out-Null
}

# Run migrations (continue on error - storage migrations fail on plain PG)
Write-Host "Running migrations (tables, functions, triggers)..." -ForegroundColor Cyan
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name
$skipPattern = "temp_|^import_"
$runCount = 0
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
foreach ($file in $migrationFiles) {
    if ($file.Name -match $skipPattern) { continue }
    $runCount++
    & $psqlPath -h $pgHost -U $pgUser -p $pgPort -d $DbName -v ON_ERROR_STOP=0 -q -f $file.FullName 2>&1 | Out-Null
}
$ErrorActionPreference = $prevErrorAction
Write-Host "  Ran $runCount migrations." -ForegroundColor Gray

# Load seed data
if (Test-Path $seedPath) {
    Write-Host "Loading seed data..." -ForegroundColor Cyan
    $ErrorActionPreference = "SilentlyContinue"
    & $psqlPath -h $pgHost -U $pgUser -p $pgPort -d $DbName -v ON_ERROR_STOP=0 -q -f $seedPath 2>&1 | Out-Null
    $ErrorActionPreference = $prevErrorAction
}

$env:PGPASSWORD = $null

# Update .env
$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch "PGDATABASE=$DbName") {
    $envContent = $envContent -replace "PGDATABASE=.*", "PGDATABASE=$DbName"
    Set-Content $envFile $envContent.TrimEnd() -NoNewline
    Write-Host "Updated backend\.env: PGDATABASE=$DbName" -ForegroundColor Gray
}

Write-Host "Done. Local DB '$DbName' is a replicate of Supabase (migrations + seed) at $pgHost`:$pgPort" -ForegroundColor Green
