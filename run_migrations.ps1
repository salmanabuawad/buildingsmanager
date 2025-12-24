# Script to run all database migrations in order
# Usage: .\run_migrations.ps1 [connection_string]
#
# Examples:
#   .\run_migrations.ps1
#   .\run_migrations.ps1 "postgresql://user:pass@localhost:5432/dbname"
#   .\run_migrations.ps1 "postgresql://postgres:postgres@localhost:5432/postgres"

param(
    [string]$ConnectionString = $env:DATABASE_URL
)

if ([string]::IsNullOrEmpty($ConnectionString)) {
    $ConnectionString = "postgresql://postgres:postgres@localhost:5432/postgres"
}

$ErrorActionPreference = "Stop"

$migrationsDir = "supabase\migrations"

if (-not (Test-Path $migrationsDir)) {
    Write-Host "Error: Migrations directory not found: $migrationsDir" -ForegroundColor Red
    exit 1
}

# Check if psql is available
$psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psqlPath) {
    Write-Host "Error: psql command not found. Please install PostgreSQL client tools." -ForegroundColor Red
    Write-Host "Download from: https://www.postgresql.org/download/" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Running Database Migrations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Connection: $ConnectionString" -ForegroundColor Gray
Write-Host "Migrations directory: $migrationsDir" -ForegroundColor Gray
Write-Host ""

# Get all migration files sorted by name (chronological order)
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

Write-Host "Found $($migrationFiles.Count) migration files" -ForegroundColor Green
Write-Host ""

$successCount = 0
$failCount = 0
$startTime = Get-Date

foreach ($file in $migrationFiles) {
    $fileNumber = [array]::IndexOf($migrationFiles, $file) + 1
    Write-Host "[$fileNumber/$($migrationFiles.Count)] $($file.Name)" -ForegroundColor Yellow -NoNewline
    
    try {
        # Run the migration file using psql
        $output = & $psqlPath $ConnectionString -f $file.FullName 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✓" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host " ✗" -ForegroundColor Red
            Write-Host ""
            Write-Host "Error output:" -ForegroundColor Red
            Write-Host $output -ForegroundColor Red
            $failCount++
            Write-Host ""
            Write-Host "Migration failed. Stopping execution." -ForegroundColor Red
            break
        }
    } catch {
        Write-Host " ✗" -ForegroundColor Red
        Write-Host "Exception: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
        Write-Host ""
        Write-Host "Migration failed. Stopping execution." -ForegroundColor Red
        break
    }
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migration Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed:  $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "Duration: $($duration.TotalSeconds) seconds" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "All migrations completed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some migrations failed. Please review the errors above." -ForegroundColor Red
    exit 1
}

