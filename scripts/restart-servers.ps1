# Restart backend and frontend (stop ports 8000, 80, 81, 82 then start both).
# Use after backend or api client changes so the running app picks up changes.
# Run from repo root: .\scripts\restart-servers.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

Write-Host "Stopping processes on ports 8000, 80, 81, 82..." -ForegroundColor Yellow
$ports = @(8000, 80, 81, 82)
foreach ($p in $ports) {
  Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2

$backendDir = Join-Path $RepoRoot "backend"
if (-Not (Test-Path (Join-Path $backendDir "app\main.py"))) {
  Write-Host "Backend not found at $backendDir. Run from repo root." -ForegroundColor Red
  exit 1
}

Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
  Set-Location $using:backendDir
  python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}
Write-Host "Backend started (Job Id: $($backendJob.Id)). Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""

Write-Host "Starting Vite frontend (proxy /api -> http://localhost:8000)..." -ForegroundColor Cyan
Set-Location $RepoRoot
npm run dev
