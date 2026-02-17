# Recreate Azure resources (Storage, App Service, Static Web App) using EXISTING PostgreSQL.
# Run after remove-all-except-db.ps1. Prerequisites: az, Node.js, npm. Run "az login" first.
# Usage: .\recreate-with-existing-db.ps1 [-ResourceGroup "rg-buildingsmanager"] [-DbServerName "buildingsmanager-db-xxxxxx"]
param(
    [string] $ResourceGroup = "rg-buildingsmanager",
    [string] $DbServerName = "",   # If empty, we discover the single PG server in the RG
    [string] $DbAdmin = "dbadmin",
    [string] $DbName = "assetflow"
)
$ErrorActionPreference = "Stop"

$LOCATION         = "israelcentral"
$SUFFIX           = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$STORAGE_ACCOUNT  = "bldgmgrstor$SUFFIX"
$BACKEND_APP_NAME = "buildingsmanager-api"
$PLAN_NAME        = "buildingsmanager-plan"
$FRONTEND_APP_NAME = "buildingsmanager-app-$SUFFIX"

Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Recreate resources (existing DB)' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host 'Run: az login' -ForegroundColor Red
    exit 1
}

# Resolve DB server name if not provided
if ([string]::IsNullOrWhiteSpace($DbServerName)) {
    $servers = az postgres flexible-server list --resource-group $ResourceGroup --query "[].name" -o tsv 2>$null
    if (-not $servers) {
        Write-Host "No PostgreSQL flexible server found in resource group '$ResourceGroup'." -ForegroundColor Red
        exit 1
    }
    $serverList = @($servers)
    if ($serverList.Count -gt 1) {
        Write-Host "Multiple PostgreSQL servers found. Specify one with -DbServerName" -ForegroundColor Yellow
        $serverList | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    $DbServerName = $serverList[0]
    Write-Host "Using database server: $DbServerName" -ForegroundColor Gray
}

if ($env:DB_PASSWORD) {
    $DB_PASSWORD_TEXT = $env:DB_PASSWORD
} else {
    $DB_PASSWORD_SECURE = Read-Host "Database admin password" -AsSecureString
    $DB_PASSWORD_TEXT   = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($DB_PASSWORD_SECURE))
}

if ($env:SECRET_KEY) {
    $SECRET_KEY = $env:SECRET_KEY
} else {
    $SECRET_KEY_INPUT = Read-Host "JWT secret key (or press Enter to generate)"
    if ([string]::IsNullOrWhiteSpace($SECRET_KEY_INPUT)) {
        $SECRET_KEY = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
        Write-Host 'Generated SECRET_KEY (save it).' -ForegroundColor Yellow
    } else {
        $SECRET_KEY = $SECRET_KEY_INPUT
    }
}

$DATABASE_URL = "postgresql://${DbAdmin}:$([uri]::EscapeDataString($DB_PASSWORD_TEXT))@${DbServerName}.postgres.database.azure.com:5432/${DbName}?sslmode=require"

Write-Host ''
Write-Host 'Step 1: Storage account...' -ForegroundColor Green
$env:AZURE_CORE_ONLY_SHOW_ERRORS = 'true'
az storage account create `
  --name $STORAGE_ACCOUNT `
  --resource-group $ResourceGroup `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2 `
  --min-tls-version TLS1_2 `
  --output none
az storage container create --name assetflow-files --account-name $STORAGE_ACCOUNT --output none
$STORAGE_CONNECTION = az storage account show-connection-string --name $STORAGE_ACCOUNT --resource-group $ResourceGroup --output tsv
$env:AZURE_CORE_ONLY_SHOW_ERRORS = ''

Write-Host 'Step 2: App Service plan and Web App...' -ForegroundColor Green
az appservice plan create `
  --name $PLAN_NAME `
  --resource-group $ResourceGroup `
  --location $LOCATION `
  --sku B1 `
  --is-linux `
  --output none

az webapp create `
  --resource-group $ResourceGroup `
  --plan $PLAN_NAME `
  --name $BACKEND_APP_NAME `
  --runtime 'PYTHON:3.11' `
  --output none

$BACKEND_URL = 'https://' + $BACKEND_APP_NAME + '.azurewebsites.net'

Write-Host 'Step 3: Static Web App...' -ForegroundColor Green
az staticwebapp create `
  --name $FRONTEND_APP_NAME `
  --resource-group $ResourceGroup `
  --location westeurope `
  --output none

$FRONTEND_URL = 'https://' + $FRONTEND_APP_NAME + '.azurestaticapps.net'

Write-Host 'Step 4: Backend app settings...' -ForegroundColor Green
$settings = @(
  ('DATABASE_URL=' + $DATABASE_URL),
  'PGSSLMODE=require',
  ('SECRET_KEY=' + $SECRET_KEY),
  'ALGORITHM=HS256',
  'ACCESS_TOKEN_EXPIRE_MINUTES=30',
  ('AZURE_STORAGE_CONNECTION_STRING=' + $STORAGE_CONNECTION),
  'AZURE_STORAGE_CONTAINER_NAME=assetflow-files',
  ('ALLOWED_ORIGINS=' + $FRONTEND_URL + ',http://localhost:5173'),
  'ENVIRONMENT=production'
)
az webapp config appsettings set --resource-group $ResourceGroup --name $BACKEND_APP_NAME --settings $settings --output none

$startupCmd = 'gunicorn --chdir /home/site/wwwroot app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000'
az webapp config set --resource-group $ResourceGroup --name $BACKEND_APP_NAME --startup-file $startupCmd --output none

Write-Host 'Step 5: Zip and deploy backend...' -ForegroundColor Green
$repoRootForZip = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = Join-Path $repoRootForZip 'backend'
$tempDir = Join-Path $env:TEMP 'bldgmgr-deploy'
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
& robocopy $backendDir $tempDir /E /XD venv __pycache__ .git /XF .env .env.* *.pyc *.pyo /NFL /NDL /NJH /NJS /NC /NS | Out-Null
$zipPath = Join-Path $repoRootForZip 'backend.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

az webapp deploy `
  --resource-group $ResourceGroup `
  --name $BACKEND_APP_NAME `
  --src-path $zipPath `
  --type zip `
  --async false

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host 'Step 6: Build and deploy frontend...' -ForegroundColor Green
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
('VITE_API_URL=' + $BACKEND_URL + '/api') | Out-File -FilePath .env.production -Encoding utf8
npm install --silent 2>$null
npm run build 2>$null

$DEPLOYMENT_TOKEN = az staticwebapp secrets list --name $FRONTEND_APP_NAME --resource-group $ResourceGroup --query 'properties.apiKey' -o tsv
# Run via cmd so PowerShell does not treat CLI stderr (e.g. "Preparing deployment...") as NativeCommandError
$prevErr = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
cmd /c "npx --yes @azure/static-web-apps-cli deploy ./dist --deployment-token $DEPLOYMENT_TOKEN --no-use-keychain"
$ErrorActionPreference = $prevErr
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Recreate finished' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host ('Frontend:  ' + $FRONTEND_URL) -ForegroundColor White
Write-Host ('Backend:   ' + $BACKEND_URL) -ForegroundColor White
Write-Host 'Default login: admin / WaveLync1342#' -ForegroundColor Yellow
Write-Host ''
Write-Host '--- GitHub Actions: update frontend token ---' -ForegroundColor Cyan
Write-Host ('New Static Web App: ' + $FRONTEND_APP_NAME + ' -> Manage deployment token -> set secret AZURE_STATIC_WEB_APPS_API_TOKEN') -ForegroundColor Gray
Write-Host ''
