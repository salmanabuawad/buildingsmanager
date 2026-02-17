# Complete local test deployment (no Docker)
# Prereq: PostgreSQL running locally with default (postgres/postgres on localhost:5432)
# Usage: .\scripts\run-local.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Copy .env if missing
$backendEnv = Join-Path $root "backend\.env"
$envExample = Join-Path $root "backend\.env.local.example"
if (-not (Test-Path $backendEnv)) {
    Copy-Item $envExample $backendEnv
    Write-Host "Created backend\.env from .env.local.example" -ForegroundColor Yellow
}

# Force local PostgreSQL (override any DATABASE_URL from system env)
Remove-Item env:DATABASE_URL -ErrorAction SilentlyContinue
$env:PGHOST = "localhost"
$env:PGUSER = "postgres"
$env:PGPORT = "5432"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "postgres"

# Create database postgres if needed (user must have created it)
Write-Host "Ensure PostgreSQL has database 'postgres' (default)." -ForegroundColor Cyan

# Init tables (run from backend so .env is found)
Write-Host "Creating tables..." -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
python -c "from app.database import engine, Base; from app import models; Base.metadata.create_all(bind=engine); print('Tables created.')"
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

# Start backend (terminal 1)
Write-Host "`nStarting backend on http://localhost:8000" -ForegroundColor Green
Write-Host "Starting frontend on http://localhost:5173" -ForegroundColor Green
Write-Host "`nRun in two terminals:" -ForegroundColor Yellow
Write-Host "  Terminal 1: cd backend; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Gray
Write-Host "  Terminal 2: `$env:VITE_API_URL='http://localhost:8000'; npm run dev" -ForegroundColor Gray
Write-Host "`nOr start backend now in background..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Start-Sleep -Seconds 2
$env:VITE_API_URL = "http://localhost:8000"
Set-Location $root
npm run dev
