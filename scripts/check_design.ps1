# Design compliance checks for buildingsmanager
# Run: .\scripts\check_design.ps1
# Exit 0 = pass, non-zero = violations found

$ErrorCount = 0
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
if (-not (Test-Path "$ProjectRoot\backend\app\main.py")) { $ProjectRoot = (Get-Location).Path }
Set-Location $ProjectRoot

Write-Host "=== Design compliance checks ===" -ForegroundColor Cyan

# 1. No db_rpc imports outside base_repo and db_rpc itself
Write-Host "`n[1] Checking db_rpc imports (only base_repo/db_rpc allowed)..." -ForegroundColor Yellow
$violations = Select-String -Path "backend\app\**\*.py" -Pattern "^\s*(from app\.db_rpc|import db_rpc)" | 
    Where-Object { $_.Path -notmatch "base_repo\.py|db_rpc\.py" }
if ($violations) {
    $violations | ForEach-Object { Write-Host "  VIOLATION: $($_.Path):$($_.LineNumber) - $($_.Line.Trim())" -ForegroundColor Red }
    $ErrorCount++
} else { Write-Host "  OK" -ForegroundColor Green }

# 2. No CREATE FUNCTION / TRIGGER in NEW migrations (after 20260251000000 drops)
Write-Host "`n[2] Checking new migrations (no functions/triggers)..." -ForegroundColor Yellow
$newMigrations = Get-ChildItem -Path "migrations\*.sql" -ErrorAction SilentlyContinue | 
    Where-Object { $_.BaseName -match "^\d{14}" -and [long]$_.BaseName.Substring(0,14) -gt 20260251000000 }
$violations = @()
foreach ($f in $newMigrations) {
    $m = Select-String -Path $f.FullName -Pattern "CREATE (FUNCTION|TRIGGER|OR REPLACE FUNCTION)" -ErrorAction SilentlyContinue
    if ($m) { $violations += $m }
}
if ($violations.Count -gt 0) {
    $violations | ForEach-Object { Write-Host "  VIOLATION: $($_.Path):$($_.LineNumber)" -ForegroundColor Red }
    $ErrorCount++
} else { Write-Host "  OK" -ForegroundColor Green }

# 3. Backend imports
Write-Host "`n[3] Verifying backend imports..." -ForegroundColor Yellow
Push-Location backend
$out = & python -c "from app.main import app; print('OK')" 2>&1
Pop-Location
if ($LASTEXITCODE -ne 0 -or $out -notmatch "OK") {
    Write-Host "  FAIL: Backend failed to import" -ForegroundColor Red
    $out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    $ErrorCount++
} else { Write-Host "  OK" -ForegroundColor Green }

# 4. Protected routes have auth (sample check on rest_operations)
Write-Host "`n[4] Checking rest_operations has auth (Depends)..." -ForegroundColor Yellow
$hasDepends = Select-String -Path "backend\app\routers\rest_operations.py" -Pattern "Depends\(get_current_user_users_table\)" -Quiet
if (-not $hasDepends) {
    Write-Host "  WARN: rest_operations may lack auth dependency" -ForegroundColor DarkYellow
} else { Write-Host "  OK" -ForegroundColor Green }

Write-Host "`n=== Done ===" -ForegroundColor Cyan
if ($ErrorCount -gt 0) {
    Write-Host "Errors: $ErrorCount" -ForegroundColor Red
    exit 1
}
exit 0
