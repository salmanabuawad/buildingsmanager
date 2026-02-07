#!/bin/bash

# Azure Deployment Script for AssetFlow
# This script automates the deployment of AssetFlow to Azure

set -e

echo "=========================================="
echo "AssetFlow Azure Deployment Script"
echo "=========================================="
echo ""

# Configuration
RESOURCE_GROUP="assetflow-israel-rg"
LOCATION="israelcentral"
DB_SERVER_NAME="assetflow-db-$(date +%s)"
DB_ADMIN="assetflowadmin"
DB_NAME="assetflow"
STORAGE_ACCOUNT="assetflowstorage$(date +%s)"
BACKEND_APP_NAME="assetflow-api-$(date +%s)"
FRONTEND_APP_NAME="assetflow-frontend-$(date +%s)"

# Prompt for password
read -sp "Enter database admin password: " DB_PASSWORD
echo ""

# Prompt for secret key
read -sp "Enter JWT secret key (or press enter to generate): " SECRET_KEY
echo ""
if [ -z "$SECRET_KEY" ]; then
    SECRET_KEY=$(openssl rand -hex 32)
    echo "Generated secret key: $SECRET_KEY"
fi

echo ""
echo "Step 1: Creating Resource Group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

echo ""
echo "Step 2: Creating PostgreSQL Database..."
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --location $LOCATION \
  --admin-user $DB_ADMIN \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B2s \
  --tier Burstable \
  --version 14 \
  --storage-size 32 \
  --yes

az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER_NAME \
  --database-name $DB_NAME

az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

DATABASE_URL="postgresql://$DB_ADMIN:$DB_PASSWORD@$DB_SERVER_NAME.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"

echo ""
echo "Step 3: Importing Database Schema..."
PGPASSWORD="$DB_PASSWORD" psql "host=$DB_SERVER_NAME.postgres.database.azure.com port=5432 dbname=$DB_NAME user=$DB_ADMIN sslmode=require" -f azure_postgres_schema.sql

echo ""
echo "Step 4: Creating Storage Account..."
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

az storage container create \
  --name assetflow-files \
  --account-name $STORAGE_ACCOUNT \
  --public-access off

STORAGE_CONNECTION=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --output tsv)

echo ""
echo "Step 5: Creating and Deploying Backend API..."
az appservice plan create \
  --name assetflow-backend-plan \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan assetflow-backend-plan \
  --name $BACKEND_APP_NAME \
  --runtime "PYTHON:3.11"

BACKEND_URL="https://$BACKEND_APP_NAME.azurewebsites.net"

echo ""
echo "Step 6: Creating Frontend Static Web App..."
az staticwebapp create \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --location westeurope

FRONTEND_URL="https://$FRONTEND_APP_NAME.azurestaticapps.net"

echo ""
echo "Step 7: Configuring Backend Environment Variables..."
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --settings \
    DATABASE_URL="$DATABASE_URL" \
    SECRET_KEY="$SECRET_KEY" \
    ALGORITHM="HS256" \
    ACCESS_TOKEN_EXPIRE_MINUTES="30" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONNECTION" \
    AZURE_STORAGE_CONTAINER_NAME="assetflow-files" \
    ALLOWED_ORIGINS="$FRONTEND_URL,http://localhost:5173" \
    ENVIRONMENT="production"

az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --startup-file "startup.sh"

echo ""
echo "Step 8: Deploying Backend Code..."
cd backend
zip -r ../backend.zip . -x "*.pyc" -x "__pycache__/*" -x "*.env"
cd ..

az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --src backend.zip

rm backend.zip

echo ""
echo "Step 9: Building and Deploying Frontend..."
echo "VITE_API_URL=$BACKEND_URL/api" > .env.production
npm install
npm run build

DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.apiKey" -o tsv)

npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$DEPLOYMENT_TOKEN" \
  --no-use-keychain

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Resource Group: $RESOURCE_GROUP"
echo "Database Server: $DB_SERVER_NAME.postgres.database.azure.com"
echo "Backend API: $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo ""
echo "Default Login:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "IMPORTANT: Change the default admin password after first login!"
echo ""
echo "Database URL (save this): $DATABASE_URL"
echo "Secret Key (save this): $SECRET_KEY"
echo ""
