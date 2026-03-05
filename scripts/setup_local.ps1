# Full local installation: create DB, run migrations, optional post-migration.
# Requires: PostgreSQL installed, psql in PATH.
# Usage:
#   .\scripts\setup_local.ps1
#   .\scripts\setup_local.ps1 -DbName mydb -PgHost localhost -PgUser postgres -PgPassword secret

param(
    [string] $DbName = "buildingsmanager",
    [string] $PgHost = "localhost",
    [int]    $PgPort = 5432,
    [string] $PgUser = "postgres",
    [string] $PgPassword = $env:PGPASSWORD,
    [switch] $SkipPostMigration,
    [switch] $Force  # drop and recreate DB (destructive)
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $RepoRoot) { $RepoRoot = (Get-Location).Path }
$Standalone = Join-Path $RepoRoot "standalone"
$Migrations = Join-Path $RepoRoot "migrations"

# Connection to default DB (to create target DB)
$BaseConn = "postgresql://${PgUser}:${PgPassword}@${PgHost}:${PgPort}/postgres"
$TargetConn = "postgresql://${PgUser}:${PgPassword}@${PgHost}:${PgPort}/$DbName"

if (-not $PgPassword) {
    Write-Host "Set PGPASSWORD or pass -PgPassword."
    exit 1
}

Write-Host "Target database: $DbName on ${PgHost}:$PgPort"
if ($Force) {
    Write-Host "Dropping existing database (if any)..."
    $env:PGPASSWORD = $PgPassword
    psql $BaseConn -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();" 2>$null
    psql $BaseConn -c "DROP DATABASE IF EXISTS ""$DbName"";"
}

Write-Host "Creating database (if not exists)..."
$env:PGPASSWORD = $PgPassword
$check = psql $BaseConn -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$DbName'" 2>$null
if (-not $check -or $check.Trim() -ne "1") {
    psql $BaseConn -c "CREATE DATABASE ""$DbName"";"
    Write-Host "Created database $DbName"
} else {
    Write-Host "Database $DbName already exists."
}

Write-Host "Running 00_extensions_and_roles.sql..."
psql $TargetConn -f (Join-Path $Standalone "00_extensions_and_roles.sql")

Write-Host "Applying migrations..."
& (Join-Path $RepoRoot "standalone\apply_migrations.ps1") -ConnectionString $TargetConn
if ($LASTEXITCODE -ne 0) { exit 1 }

if (-not $SkipPostMigration) {
    Write-Host "Running post_migration_standalone.sql..."
    psql $TargetConn -f (Join-Path $Standalone "post_migration_standalone.sql")
}

Write-Host ""
Write-Host "Done. Set in backend/.env:"
Write-Host "  DATABASE_URL=$TargetConn"
Write-Host ""
Write-Host "Then start backend:  cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Write-Host "And frontend:       npm run dev"
