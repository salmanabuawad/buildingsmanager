# Temporary script to run all migrations in order
# Usage: .\run_all_migrations.ps1 [connection_string]
# Example: .\run_all_migrations.ps1 "postgresql://user:pass@localhost:5432/dbname"

param(
    [string]$ConnectionString = "postgresql://postgres:postgres@localhost:5432/postgres"
)

$ErrorActionPreference = "Stop"

$migrationsDir = "supabase\migrations"

if (-not (Test-Path $migrationsDir)) {
    Write-Host "Error: Migrations directory not found: $migrationsDir" -ForegroundColor Red
    exit 1
}

# Get all migration files sorted by name (timestamp)
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

Write-Host "Found $($migrationFiles.Count) migration files to run" -ForegroundColor Cyan
Write-Host "Connection: $ConnectionString" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($file in $migrationFiles) {
    Write-Host "Running: $($file.Name)" -ForegroundColor Yellow
    
    try {
        # Execute using psql
        $result = & psql $ConnectionString -f $file.FullName 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Success" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "  ✗ Failed with exit code $LASTEXITCODE" -ForegroundColor Red
            Write-Host $result
            $failCount++
            Write-Host ""
            Write-Host "Stopping due to migration failure. Fix the error and re-run." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
        Write-Host ""
        Write-Host "Stopping due to migration error. Fix the error and re-run." -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migration Summary:" -ForegroundColor Cyan
Write-Host "  Success: $successCount" -ForegroundColor Green
Write-Host "  Failed:  $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "All migrations completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Some migrations failed. Please review the errors above." -ForegroundColor Red
    exit 1
}
