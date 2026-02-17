# Full Azure deployment: resource group, PostgreSQL, Storage, App Service, Static Web App,
# backend + frontend deploy, then print GitHub Actions setup.
# Run from repo root. Prerequisites: az, psql, Node.js, npm. Run "az login" first.
$ErrorActionPreference = "Stop"

$RESOURCE_GROUP   = "rg-buildingsmanager"
$LOCATION         = "israelcentral"
$SUFFIX           = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$DB_SERVER_NAME   = "buildingsmanager-db-$SUFFIX"
$DB_ADMIN         = "dbadmin"
$DB_NAME          = "assetflow"
$STORAGE_ACCOUNT  = "bldgmgrstor$SUFFIX"
$BACKEND_APP_NAME = "buildingsmanager-api"
$PLAN_NAME        = "buildingsmanager-plan"
$FRONTEND_APP_NAME = "buildingsmanager-app-$SUFFIX"

Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' BuildingsManager - Full Azure Deployment' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

# Check az login
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host 'Run: az login' -ForegroundColor Red
    exit 1
}
Write-Host ('Azure account: ' + $account.user.name) -ForegroundColor Gray
Write-Host ''

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

Write-Host ''
Write-Host 'Step 1: Resource group...' -ForegroundColor Green
az group create --name $RESOURCE_GROUP --location $LOCATION --output none

Write-Host 'Step 2: PostgreSQL server and database...' -ForegroundColor Green
az postgres flexible-server create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --location $LOCATION `
  --admin-user $DB_ADMIN `
  --admin-password $DB_PASSWORD_TEXT `
  --sku-name Standard_B2s `
  --tier Burstable `
  --version 14 `
  --storage-size 32 `
  --yes `
  --output none

az postgres flexible-server db create `
  --resource-group $RESOURCE_GROUP `
  --server-name $DB_SERVER_NAME `
  --database-name $DB_NAME `
  --output none

az postgres flexible-server firewall-rule create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0 `
  --output none

$DATABASE_URL = "postgresql://${DB_ADMIN}:$([uri]::EscapeDataString($DB_PASSWORD_TEXT))@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

Write-Host 'Step 3: Import schema...' -ForegroundColor Green
$schemaPath = Join-Path $PSScriptRoot '..\azure_postgres_schema.sql'
if (-not (Test-Path $schemaPath)) { $schemaPath = 'azure_postgres_schema.sql' }
if (Get-Command psql -ErrorAction SilentlyContinue) {
    $env:PGPASSWORD = $DB_PASSWORD_TEXT
    & psql "host=$DB_SERVER_NAME.postgres.database.azure.com port=5432 dbname=$DB_NAME user=$DB_ADMIN sslmode=require" -f $schemaPath
} else {
    Write-Host 'psql not found. Run this manually:' -ForegroundColor Yellow
    Write-Host ('  set PGPASSWORD=***; psql host=' + $DB_SERVER_NAME + '.postgres.database.azure.com port=5432 dbname=' + $DB_NAME + ' user=' + $DB_ADMIN + ' sslmode=require -f ' + $schemaPath) -ForegroundColor Gray
}

Write-Host 'Step 4: Storage account...' -ForegroundColor Green
$env:AZURE_CORE_ONLY_SHOW_ERRORS = 'true'
az storage account create `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2 `
  --min-tls-version TLS1_2 `
  --output none
az storage container create --name assetflow-files --account-name $STORAGE_ACCOUNT --output none
$STORAGE_CONNECTION = az storage account show-connection-string --name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --output tsv
$env:AZURE_CORE_ONLY_SHOW_ERRORS = ''

Write-Host 'Step 5: App Service plan and Web App...' -ForegroundColor Green
az appservice plan create `
  --name $PLAN_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku B1 `
  --is-linux `
  --output none

az webapp create `
  --resource-group $RESOURCE_GROUP `
  --plan $PLAN_NAME `
  --name $BACKEND_APP_NAME `
  --runtime 'PYTHON:3.11' `
  --output none

$BACKEND_URL = 'https://' + $BACKEND_APP_NAME + '.azurewebsites.net'

Write-Host 'Step 6: Static Web App...' -ForegroundColor Green
az staticwebapp create `
  --name $FRONTEND_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --location westeurope `
  --output none

$FRONTEND_URL = 'https://' + $FRONTEND_APP_NAME + '.azurestaticapps.net'

Write-Host 'Step 7: Backend app settings...' -ForegroundColor Green
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
az webapp config appsettings set --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME --settings $settings --output none

$startupCmd = 'gunicorn --chdir /home/site/wwwroot app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000'
az webapp config set --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME --startup-file $startupCmd --output none

Write-Host 'Step 8: Zip and deploy backend...' -ForegroundColor Green
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
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --src-path $zipPath `
  --type zip `
  --async false

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host 'Step 9: Build and deploy frontend...' -ForegroundColor Green
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
('VITE_API_URL=' + $BACKEND_URL + '/api') | Out-File -FilePath .env.production -Encoding utf8
npm install --silent 2>$null
npm run build 2>$null

$DEPLOYMENT_TOKEN = az staticwebapp secrets list --name $FRONTEND_APP_NAME --resource-group $RESOURCE_GROUP --query 'properties.apiKey' -o tsv
# Run via cmd so PowerShell does not treat CLI stderr (e.g. "Preparing deployment...") as NativeCommandError
$prevErr = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
cmd /c "npx --yes @azure/static-web-apps-cli deploy ./dist --deployment-token $DEPLOYMENT_TOKEN --no-use-keychain"
$ErrorActionPreference = $prevErr
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Azure deployment finished' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host ('Frontend:  ' + $FRONTEND_URL) -ForegroundColor White
Write-Host ('Backend:   ' + $BACKEND_URL + '  (health: ' + $BACKEND_URL + '/health, docs: ' + $BACKEND_URL + '/docs)') -ForegroundColor White
Write-Host 'Default login: admin / WaveLync1342#' -ForegroundColor Yellow
Write-Host ''
Write-Host '--- GitHub Actions (do this once) ---' -ForegroundColor Cyan
Write-Host ('1. Backend: Azure Portal -> App Service ' + $BACKEND_APP_NAME + ' -> Deployment Center -> Manage publish profile -> Download.')
Write-Host '   GitHub -> Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:'
Write-Host '   Name: AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND   Value: entire file content.'
Write-Host ''
Write-Host ('2. Frontend: Azure Portal -> Static Web App ' + $FRONTEND_APP_NAME + ' -> Manage deployment token -> Copy.')
Write-Host '   GitHub -> New repository secret: Name: AZURE_STATIC_WEB_APPS_API_TOKEN   Value: token.'
Write-Host ''
Write-Host ('3. (Optional) GitHub -> Variables -> New variable: VITE_API_URL = ' + $BACKEND_URL + '/api')
Write-Host ''
Write-Host '4. Create Environment production (Settings -> Environments) or remove environment from .github/workflows/azure-backend.yml'
Write-Host ''
Write-Host 'Then push to main to redeploy via Actions, or run this script again to redeploy from this machine.' -ForegroundColor Gray
