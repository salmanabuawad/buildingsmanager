# Start local stack for development: backend (FastAPI) + frontend (Vite).
# Prerequisites: Postgres running, DB created (.\scripts\setup_local.ps1), backend/.env with DATABASE_URL.
# Run from repo root: .\scripts\start-servers.ps1
# After backend or api client changes: .\scripts\restart-servers.ps1 to restart both.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

Write-Host "Starting local dev stack (backend + frontend)..." -ForegroundColor Cyan
Write-Host ""

# Start backend in background
$backendDir = Join-Path $RepoRoot "backend"
if (-Not (Test-Path (Join-Path $backendDir "app\main.py"))) {
    Write-Host "Backend not found at $backendDir. Run from repo root." -ForegroundColor Red
    exit 1
}

# Use venv Python if available, else system python
$pythonExe = $null
if (Test-Path (Join-Path $backendDir "venv\Scripts\python.exe")) {
    $pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
} else {
    $pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $pythonExe) { $pythonExe = "python" }
}

# Verify uvicorn is available
$uvicornCheck = & $pythonExe -c "import uvicorn; print('ok')" 2>&1
if ($LASTEXITCODE -ne 0 -or $uvicornCheck -ne "ok") {
    Write-Host "Backend dependencies missing. Run: cd backend && pip install -r requirements.txt" -ForegroundColor Red
    Write-Host "  Error: $uvicornCheck" -ForegroundColor Red
    exit 1
}

Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Yellow
$backendLog = Join-Path $RepoRoot "backend.log"
$backendJob = Start-Job -ScriptBlock {
    param($dir, $py, $log)
    Set-Location $dir
    & $py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 *> $log
} -ArgumentList $backendDir, $pythonExe, $backendLog
Write-Host "Backend started (Job Id: $($backendJob.Id)). Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  Logs: type $backendLog" -ForegroundColor Gray
Write-Host ""

# Start frontend (foreground so user sees logs)
Write-Host "Starting Vite frontend (proxy /api -> http://localhost:8000)..." -ForegroundColor Yellow
Set-Location $RepoRoot
npm run dev
