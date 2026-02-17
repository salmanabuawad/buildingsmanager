# Dump full database (tables, functions, triggers, views, sequences, data) from Supabase
# pg_dump includes schema + data by default. Use -SchemaOnly for schema only.
# Uses pg_dump against Supabase Postgres connection.
# Prereq: pg_dump (PostgreSQL client tools), SUPABASE_DB_PASSWORD in env or .env
# Usage: .\scripts\dump-from-supabase.ps1 [-OutputPath "path/to/dump.sql"]

param(
    [string]$OutputPath = "db_structure\supabase_dump.sql",
    [switch]$SchemaOnly,
    [switch]$AllSchemas  # Default: public schema only (safer for local restore)
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Load .env from root or backend if present
$envFiles = @(
    (Join-Path $root ".env"),
    (Join-Path $root "backend\.env")
)
foreach ($f in $envFiles) {
    if (Test-Path $f) {
        Get-Content $f | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $k = $matches[1].Trim()
                $v = $matches[2].Trim()
                if (-not [string]::IsNullOrEmpty($k)) { Set-Item -Path "env:$k" -Value $v -Force }
            }
        }
        break
    }
}

$supabaseUrl = if ($env:VITE_SUPABASE_URL) { $env:VITE_SUPABASE_URL } else { $env:REACT_APP_SUPABASE_URL }
if ([string]::IsNullOrEmpty($supabaseUrl)) {
    Write-Host "Error: VITE_SUPABASE_URL not set. Set it in .env or environment." -ForegroundColor Red
    Write-Host "Example: VITE_SUPABASE_URL=https://mmqnrwjjxewrgwczezzf.supabase.co" -ForegroundColor Yellow
    exit 1
}

# Derive DB host from Supabase URL: https://XXX.supabase.co -> db.XXX.supabase.co
if ($supabaseUrl -match 'https://([^.]+)\.supabase\.co') {
    $projectRef = $matches[1]
    $dbHost = "db.$projectRef.supabase.co"
} else {
    Write-Host "Error: Could not parse project ref from VITE_SUPABASE_URL" -ForegroundColor Red
    exit 1
}

$dbUser = "postgres"
$dbName = "postgres"
$dbPort = 5432
$dbPassword = $env:SUPABASE_DB_PASSWORD
if ([string]::IsNullOrEmpty($dbPassword)) {
    Write-Host "SUPABASE_DB_PASSWORD not set. Enter Supabase database password:" -ForegroundColor Yellow
    $secure = Read-Host -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $dbPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

$pgDumpPath = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDumpPath) {
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { $pgDumpPath = $p; break }
    }
}
if (-not $pgDumpPath) {
    Write-Host "Error: pg_dump not found. Install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

$outFull = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }
$outDir = Split-Path -Parent $outFull
if (-not [string]::IsNullOrEmpty($outDir) -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Write-Host "Dumping from Supabase: $dbHost" -ForegroundColor Cyan
Write-Host "Output: $outFull" -ForegroundColor Gray
if ($SchemaOnly) { Write-Host "Mode: schema only (no data)" -ForegroundColor Gray }
if (-not $AllSchemas) { Write-Host "Schema: public only (use -AllSchemas for full dump)" -ForegroundColor Gray }
Write-Host ""

$env:PGPASSWORD = $dbPassword
$args = @(
    "-h", $dbHost,
    "-U", $dbUser,
    "-d", $dbName,
    "-p", $dbPort,
    "-F", "p",
    "-f", $outFull,
    "--no-owner",
    "--no-privileges"
)
if ($SchemaOnly) { $args += "--schema-only" }
if (-not $AllSchemas) { $args += "--schema=public" }

& $pgDumpPath @args
if ($LASTEXITCODE -ne 0) {
    $env:PGPASSWORD = $null
    Write-Host "pg_dump failed." -ForegroundColor Red
    exit 1
}
$env:PGPASSWORD = $null

Write-Host "Done. Dump saved to $outFull" -ForegroundColor Green
