# Optional: build frontend and deploy to Nginx. Application is NOT deployed by default (use npm run dev + backend).
# Stack: Frontend (Vite) + FastAPI + Postgres; Nginx is optional for production-like serving.
# Run from repo root: .\deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host "Optional: build + deploy to Nginx (app is not deployed by default)" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Build frontend
if (-Not (Test-Path "dist")) {
    Write-Host "Building frontend..." -ForegroundColor Yellow
} else {
    Write-Host "Rebuilding frontend..." -ForegroundColor Yellow
}
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Build completed." -ForegroundColor Green
Write-Host ""

Write-Host "Deploy to Nginx:" -ForegroundColor Cyan
Write-Host "  .\nginx\deploy-frontend.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Optional: set custom web root:" -ForegroundColor Gray
Write-Host "  `$env:WEB_ROOT = 'C:\nginx\html\buildingsmanager'; .\nginx\deploy-frontend.ps1" -ForegroundColor Gray
Write-Host ""
$run = Read-Host "Run nginx deploy now? (y/n)"
if ($run -eq "y" -or $run -eq "Y") {
    & (Join-Path $PSScriptRoot "nginx\deploy-frontend.ps1")
}
Write-Host ""
Write-Host "Ensure backend is running: cd backend; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000" -ForegroundColor Gray
Write-Host "Then open http://localhost/ (Nginx) or use npm run dev for dev server." -ForegroundColor Gray
