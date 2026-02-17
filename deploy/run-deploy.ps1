# Deploy backend + frontend to Azure (no Docker)
# Usage: from repo root, run: .\deploy\run-deploy.ps1
# Set env: $env:AZURE_WEBAPP_NAME = "buildingsmanager-api"; $env:AZURE_RESOURCE_GROUP = "rg-buildingsmanager"
# Optional: $env:VITE_API_URL = "/api" for same-origin (www.wavelync.com + www.wavelync.com/api)
# Optional: $env:VITE_API_URL = "https://www.wavelync.com/api" for separate frontend
# Optional: $env:DEPLOY_COMBINED = "1" to pack frontend into backend (one host: wavelync.com + wavelync.com/api)
# Optional: $env:AZURE_STATIC_WEB_APPS_API_TOKEN = "..." for separate frontend deploy

$ErrorActionPreference = "Stop"
# Repo root = parent of deploy folder
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$appName = if ($env:AZURE_WEBAPP_NAME) { $env:AZURE_WEBAPP_NAME } else { "buildingsmanager-api" }
$rg = if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-buildingsmanager" }
$deployCombined = ($env:DEPLOY_COMBINED -eq "1" -or $env:DEPLOY_COMBINED -eq "true")
$apiUrl = if ($env:VITE_API_URL) { $env:VITE_API_URL } else { if ($deployCombined) { "/api" } else { "https://$appName.azurewebsites.net/api" } }

if ($deployCombined) {
    Write-Host "=== Build Frontend (same-origin /api) ===" -ForegroundColor Cyan
    $env:VITE_API_URL = "/api"
    npm run build
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $staticDir = Join-Path $root "backend\static"
    if (Test-Path $staticDir) { Remove-Item $staticDir -Recurse -Force }
    New-Item -ItemType Directory -Path $staticDir -Force | Out-Null
    Copy-Item -Path (Join-Path $root "dist\*") -Destination $staticDir -Recurse -Force
    Write-Host "Frontend copied to backend/static" -ForegroundColor Green
}

Write-Host "=== Deploy Backend ===" -ForegroundColor Cyan
$backendZip = Join-Path $root "backend.zip"
if (Test-Path $backendZip) { Remove-Item $backendZip -Force }
$backendPath = Join-Path $root "backend"
Push-Location $backendPath
$items = Get-ChildItem -Exclude venv,__pycache__,.env
Compress-Archive -Path $items -DestinationPath $backendZip -Force
Pop-Location
Write-Host "Created backend.zip" -ForegroundColor Green

Write-Host "Deploying backend to $appName (resource group: $rg)..." -ForegroundColor Cyan
az webapp deploy --name $appName --resource-group $rg --src-path $backendZip --type zip
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend deploy failed. Ensure: az login, app and resource group exist." -ForegroundColor Yellow
    exit 1
}
Write-Host "Backend deployed." -ForegroundColor Green

if (-not $deployCombined) {
    Write-Host "=== Build Frontend ===" -ForegroundColor Cyan
    $env:VITE_API_URL = $apiUrl
    npm run build
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "Frontend built to dist/" -ForegroundColor Green
}

if (-not $deployCombined -and $env:AZURE_STATIC_WEB_APPS_API_TOKEN) {
    Write-Host "=== Deploy Frontend (Static Web App) ===" -ForegroundColor Cyan
    npx -y @azure/static-web-apps-cli deploy ./dist --deployment-token $env:AZURE_STATIC_WEB_APPS_API_TOKEN --env production
    if ($LASTEXITCODE -ne 0) { Write-Host "Frontend deploy failed." -ForegroundColor Yellow }
} else {
    Write-Host "Skipping frontend deploy (set AZURE_STATIC_WEB_APPS_API_TOKEN to deploy)." -ForegroundColor Yellow
}

Write-Host "Done." -ForegroundColor Green
