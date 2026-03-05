# Apply all Supabase migrations to a standalone Postgres database in order.
# Usage: $env:DATABASE_URL = "postgresql://user:pass@host:5432/dbname"; .\apply_migrations.ps1
# Or: .\apply_migrations.ps1 -ConnectionString "postgresql://..."

param(
    [string] $ConnectionString = $env:DATABASE_URL,
    [string] $MigrationsDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "migrations"),
    [switch] $SkipOptional
)

if (-not $ConnectionString) {
    Write-Error "Set DATABASE_URL or pass -ConnectionString."
    exit 1
}

$scriptRoot = Split-Path $PSScriptRoot -Parent
$migrationsPath = Join-Path $scriptRoot "migrations"
if (-not (Test-Path $migrationsPath)) {
    $migrationsPath = $MigrationsDir
}
if (-not (Test-Path $migrationsPath)) {
    Write-Error "Migrations folder not found: $migrationsPath"
    exit 1
}

# Migration files to run in order (timestamp prefix sort). Skip data-only/optional.
$skipNames = @(
    "import_asset_types_latest.sql",  # optional seed data
    "install_fresh_database.sql"      # meta-script (uses \i), not a migration
)
$files = Get-ChildItem -Path $migrationsPath -Filter "*.sql" -File |
    Where-Object { $skipNames -notcontains $_.Name } |
    Sort-Object Name

Write-Host "Found $($files.Count) migration files. Applying in order..."
$failed = @()
foreach ($f in $files) {
    Write-Host "Applying: $($f.Name)"
    $result = & psql $ConnectionString -f $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Migration failed: $($f.Name)"
        $failed += $f.Name
        Write-Host $result
    }
}
if ($failed.Count -gt 0) {
    Write-Warning "Failed migrations: $($failed -join ', ')"
    exit 1
}
Write-Host "All migrations applied."
