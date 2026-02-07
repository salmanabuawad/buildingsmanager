# Azure Deployment Script for AssetFlow (PowerShell)
# This script automates the deployment of AssetFlow to Azure

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "AssetFlow Azure Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$RESOURCE_GROUP = "assetflow-rg"
$LOCATION = "israelcentral"
$TIMESTAMP = [int](Get-Date -UFormat %s)
$DB_SERVER_NAME = "assetflow-db-$TIMESTAMP"
$DB_ADMIN = "assetflowadmin"
$DB_NAME = "assetflow"
$STORAGE_ACCOUNT = "assetflowstorage$TIMESTAMP"
$BACKEND_APP_NAME = "assetflow-api-$TIMESTAMP"
$FRONTEND_APP_NAME = "assetflow-frontend-$TIMESTAMP"

# Prompt for password
$DB_PASSWORD = Read-Host "Enter database admin password" -AsSecureString
$DB_PASSWORD_TEXT = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($DB_PASSWORD))

# Prompt for secret key
$SECRET_KEY_INPUT = Read-Host "Enter JWT secret key (or press enter to generate)"
if ([string]::IsNullOrEmpty($SECRET_KEY_INPUT)) {
    $SECRET_KEY = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    Write-Host "Generated secret key: $SECRET_KEY" -ForegroundColor Yellow
} else {
    $SECRET_KEY = $SECRET_KEY_INPUT
}

Write-Host ""
Write-Host "Step 1: Creating Resource Group..." -ForegroundColor Green
az group create --name $RESOURCE_GROUP --location $LOCATION

Write-Host ""
Write-Host "Step 2: Creating PostgreSQL Database..." -ForegroundColor Green
az postgres flexible-server create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --location $LOCATION `
  --admin-user $DB_ADMIN `
  --admin-password "$DB_PASSWORD_TEXT" `
  --sku-name Standard_B2s `
  --tier Burstable `
  --version 14 `
  --storage-size 32 `
  --yes

az postgres flexible-server db create `
  --resource-group $RESOURCE_GROUP `
  --server-name $DB_SERVER_NAME `
  --database-name $DB_NAME

az postgres flexible-server firewall-rule create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0

$DATABASE_URL = "postgresql://$DB_ADMIN:$DB_PASSWORD_TEXT@$DB_SERVER_NAME.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"

Write-Host ""
Write-Host "Step 3: Importing Database Schema..." -ForegroundColor Green
$env:PGPASSWORD = $DB_PASSWORD_TEXT
psql "host=$DB_SERVER_NAME.postgres.database.azure.com port=5432 dbname=$DB_NAME user=$DB_ADMIN sslmode=require" -f azure_postgres_schema.sql

Write-Host ""
Write-Host "Step 4: Creating Storage Account..." -ForegroundColor Green
az storage account create `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2

az storage container create `
  --name assetflow-files `
  --account-name $STORAGE_ACCOUNT `
  --public-access off

$STORAGE_CONNECTION = az storage account show-connection-string `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --output tsv

Write-Host ""
Write-Host "Step 5: Creating and Deploying Backend API..." -ForegroundColor Green
az appservice plan create `
  --name assetflow-backend-plan `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku B1 `
  --is-linux

az webapp create `
  --resource-group $RESOURCE_GROUP `
  --plan assetflow-backend-plan `
  --name $BACKEND_APP_NAME `
  --runtime "PYTHON:3.11"

$BACKEND_URL = "https://$BACKEND_APP_NAME.azurewebsites.net"

Write-Host ""
Write-Host "Step 6: Creating Frontend Static Web App..." -ForegroundColor Green
az staticwebapp create `
  --name $FRONTEND_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --location westeurope

$FRONTEND_URL = "https://$FRONTEND_APP_NAME.azurestaticapps.net"

Write-Host ""
Write-Host "Step 7: Configuring Backend Environment Variables..." -ForegroundColor Green
az webapp config appsettings set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --settings `
    "DATABASE_URL=$DATABASE_URL" `
    "SECRET_KEY=$SECRET_KEY" `
    "ALGORITHM=HS256" `
    "ACCESS_TOKEN_EXPIRE_MINUTES=30" `
    "AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONNECTION" `
    "AZURE_STORAGE_CONTAINER_NAME=assetflow-files" `
    "ALLOWED_ORIGINS=$FRONTEND_URL,http://localhost:5173" `
    "ENVIRONMENT=production"

az webapp config set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --startup-file "startup.sh"

Write-Host ""
Write-Host "Step 8: Deploying Backend Code..." -ForegroundColor Green
Push-Location backend
Compress-Archive -Path * -DestinationPath ../backend.zip -Force
Pop-Location

az webapp deployment source config-zip `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --src backend.zip

Remove-Item backend.zip

Write-Host ""
Write-Host "Step 9: Building and Deploying Frontend..." -ForegroundColor Green
"VITE_API_URL=$BACKEND_URL/api" | Out-File -FilePath .env.production -Encoding utf8
npm install
npm run build

$DEPLOYMENT_TOKEN = az staticwebapp secrets list `
  --name $FRONTEND_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "properties.apiKey" -o tsv

npx @azure/static-web-apps-cli deploy ./dist `
  --deployment-token "$DEPLOYMENT_TOKEN" `
  --no-use-keychain

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resource Group: $RESOURCE_GROUP" -ForegroundColor White
Write-Host "Database Server: $DB_SERVER_NAME.postgres.database.azure.com" -ForegroundColor White
Write-Host "Backend API: $BACKEND_URL" -ForegroundColor White
Write-Host "Frontend: $FRONTEND_URL" -ForegroundColor White
Write-Host ""
Write-Host "Default Login:" -ForegroundColor Yellow
Write-Host "  Username: admin" -ForegroundColor Yellow
Write-Host "  Password: admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT: Change the default admin password after first login!" -ForegroundColor Red
Write-Host ""
Write-Host "Database URL (save this): $DATABASE_URL" -ForegroundColor Cyan
Write-Host "Secret Key (save this): $SECRET_KEY" -ForegroundColor Cyan
Write-Host ""
