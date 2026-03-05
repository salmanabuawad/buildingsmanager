# Run backend only (FastAPI). Use for Repository-layer / API work.
# Prerequisites: Postgres running, backend/.env with DATABASE_URL.
# Run from repo root: .\scripts\run-backend.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $RepoRoot "backend"

if (-Not (Test-Path (Join-Path $backendDir "app\main.py"))) {
    Write-Host "Backend not found at $backendDir. Run from repo root." -ForegroundColor Red
    exit 1
}

Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Cyan
Write-Host "Docs: http://localhost:8000/docs | API v1: http://localhost:8000/api/v1/health" -ForegroundColor Gray
Set-Location $backendDir
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
