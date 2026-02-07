# Azure Deployment Guide for AssetFlow

This guide will help you deploy AssetFlow to Azure using:
- **Azure App Service** for FastAPI backend
- **Azure Static Web Apps** for React frontend
- **Azure Database for PostgreSQL** for database
- **Azure Blob Storage** for file storage

## Prerequisites

1. Azure account with active subscription
2. Azure CLI installed: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
3. Node.js 18+ and Python 3.11+
4. Git installed

## Step 1: Set Up Azure PostgreSQL Database

### 1.1 Create PostgreSQL Server

```bash
# Login to Azure
az login

# Create resource group
az group create --name assetflow-rg --location eastus

# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group assetflow-rg \
  --name assetflow-db-server \
  --location eastus \
  --admin-user assetflowadmin \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_B2s \
  --tier Burstable \
  --version 14 \
  --storage-size 32

# Create database
az postgres flexible-server db create \
  --resource-group assetflow-rg \
  --server-name assetflow-db-server \
  --database-name assetflow

# Configure firewall to allow Azure services
az postgres flexible-server firewall-rule create \
  --resource-group assetflow-rg \
  --name assetflow-db-server \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 1.2 Import Database Schema

```bash
# Get connection string
az postgres flexible-server show-connection-string \
  --server-name assetflow-db-server \
  --admin-user assetflowadmin \
  --admin-password "YourSecurePassword123!" \
  --database-name assetflow

# Import schema (use psql or any PostgreSQL client)
psql "host=assetflow-db-server.postgres.database.azure.com port=5432 dbname=assetflow user=assetflowadmin password=YourSecurePassword123! sslmode=require" -f azure_postgres_schema.sql
```

Your DATABASE_URL will be:
```
postgresql://assetflowadmin:YourSecurePassword123!@assetflow-db-server.postgres.database.azure.com:5432/assetflow?sslmode=require
```

## Step 2: Set Up Azure Blob Storage

```bash
# Create storage account
az storage account create \
  --name assetflowstorage \
  --resource-group assetflow-rg \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2

# Create container for files
az storage container create \
  --name assetflow-files \
  --account-name assetflowstorage \
  --public-access off

# Get connection string
az storage account show-connection-string \
  --name assetflowstorage \
  --resource-group assetflow-rg \
  --output tsv
```

Save the connection string for later use.

## Step 3: Deploy FastAPI Backend to Azure App Service

### 3.1 Create App Service

```bash
# Create App Service plan
az appservice plan create \
  --name assetflow-backend-plan \
  --resource-group assetflow-rg \
  --location eastus \
  --sku B1 \
  --is-linux

# Create web app
az webapp create \
  --resource-group assetflow-rg \
  --plan assetflow-backend-plan \
  --name assetflow-api \
  --runtime "PYTHON:3.11"
```

### 3.2 Configure Environment Variables

```bash
# Set environment variables
az webapp config appsettings set \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --settings \
    DATABASE_URL="postgresql://assetflowadmin:YourSecurePassword123!@assetflow-db-server.postgres.database.azure.com:5432/assetflow?sslmode=require" \
    SECRET_KEY="generate-a-secure-random-key-here" \
    ALGORITHM="HS256" \
    ACCESS_TOKEN_EXPIRE_MINUTES="30" \
    AZURE_STORAGE_CONNECTION_STRING="your-storage-connection-string" \
    AZURE_STORAGE_CONTAINER_NAME="assetflow-files" \
    ALLOWED_ORIGINS="https://your-static-web-app.azurestaticapps.net" \
    ENVIRONMENT="production"

# Configure startup command
az webapp config set \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --startup-file "startup.sh"
```

### 3.3 Deploy Backend Code

```bash
cd backend

# Create zip file for deployment
zip -r backend.zip . -x "*.pyc" -x "__pycache__/*"

# Deploy using Azure CLI
az webapp deployment source config-zip \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --src backend.zip
```

Your API will be available at: `https://assetflow-api.azurewebsites.net`

## Step 4: Deploy Frontend to Azure Static Web Apps

### 4.1 Update Frontend Configuration

Create `.env.production` file in the project root:

```env
VITE_API_URL=https://assetflow-api.azurewebsites.net/api
```

### 4.2 Build Frontend

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

### 4.3 Deploy to Azure Static Web Apps

```bash
# Create static web app
az staticwebapp create \
  --name assetflow-frontend \
  --resource-group assetflow-rg \
  --location eastus2

# Get deployment token
az staticwebapp secrets list \
  --name assetflow-frontend \
  --resource-group assetflow-rg \
  --query "properties.apiKey" -o tsv

# Install Azure Static Web Apps CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./dist \
  --deployment-token "your-deployment-token"
```

Alternative: Use GitHub Actions for automatic deployment:

1. Push your code to GitHub
2. In Azure Portal, create a Static Web App
3. Connect to your GitHub repository
4. Azure will automatically set up GitHub Actions workflow
5. Configure build settings:
   - App location: `/`
   - API location: (leave empty)
   - Output location: `dist`

Your frontend will be available at: `https://assetflow-frontend.azurestaticapps.net`

## Step 5: Update CORS Settings

Update the backend's ALLOWED_ORIGINS with your frontend URL:

```bash
az webapp config appsettings set \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --settings \
    ALLOWED_ORIGINS="https://assetflow-frontend.azurestaticapps.net,http://localhost:5173"
```

## Step 6: Test Your Deployment

1. Open your frontend URL: `https://assetflow-frontend.azurestaticapps.net`
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin123`
3. Test creating buildings, assets, and uploading files

## Step 7: Configure Custom Domain (Optional)

### For Backend API:
```bash
az webapp config hostname add \
  --resource-group assetflow-rg \
  --webapp-name assetflow-api \
  --hostname api.yourdomain.com
```

### For Frontend:
```bash
az staticwebapp hostname set \
  --name assetflow-frontend \
  --resource-group assetflow-rg \
  --hostname www.yourdomain.com
```

## Monitoring and Logs

### View Backend Logs:
```bash
az webapp log tail \
  --resource-group assetflow-rg \
  --name assetflow-api
```

### Enable Application Insights:
```bash
az monitor app-insights component create \
  --app assetflow-insights \
  --location eastus \
  --resource-group assetflow-rg

# Connect to web app
az webapp config appsettings set \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --settings \
    APPLICATIONINSIGHTS_CONNECTION_STRING="your-insights-connection-string"
```

## Scaling

### Scale Backend:
```bash
# Scale up (increase instance size)
az appservice plan update \
  --name assetflow-backend-plan \
  --resource-group assetflow-rg \
  --sku P1V2

# Scale out (increase instance count)
az appservice plan update \
  --name assetflow-backend-plan \
  --resource-group assetflow-rg \
  --number-of-workers 3
```

### Scale Database:
```bash
az postgres flexible-server update \
  --resource-group assetflow-rg \
  --name assetflow-db-server \
  --sku-name Standard_D2s_v3
```

## Cost Optimization

- Use **B1 Basic** tier for development/testing
- Use **P1V2 Premium** tier for production
- Enable auto-scaling based on CPU/memory metrics
- Set up budget alerts in Azure Cost Management

## Security Best Practices

1. **Change default admin password** immediately after first login
2. **Rotate SECRET_KEY** regularly
3. **Enable Azure AD authentication** for additional security
4. **Set up Azure Key Vault** to store secrets
5. **Enable HTTPS only** for all services
6. **Configure Network Security Groups** to restrict access
7. **Enable Azure DDoS Protection**

## Backup and Disaster Recovery

### Database Backups:
```bash
# Enable automated backups (default: 7 days)
az postgres flexible-server parameter set \
  --resource-group assetflow-rg \
  --server-name assetflow-db-server \
  --name backup_retention_days \
  --value 30
```

### Storage Backups:
- Enable soft delete for Blob Storage
- Set up geo-redundant storage (GRS) for critical data

## Troubleshooting

### Backend Issues:
1. Check logs: `az webapp log tail`
2. Verify environment variables are set correctly
3. Test database connection
4. Check Application Insights for errors

### Frontend Issues:
1. Check browser console for errors
2. Verify API_URL is correct
3. Check CORS settings on backend
4. Test API endpoints directly using curl or Postman

### Database Issues:
1. Verify firewall rules allow Azure services
2. Check connection string format
3. Verify SSL mode is set to 'require'
4. Check user permissions

## Support

For issues or questions:
- Check Azure service status: https://status.azure.com
- Azure documentation: https://docs.microsoft.com/azure
- Create an issue in the project repository

## Cost Estimate (Monthly)

- App Service (B1): ~$13
- PostgreSQL (B2s): ~$28
- Storage Account: ~$5
- Static Web App: Free tier available
- **Total**: ~$46/month (Basic tier)

Production tier (P1V2 + Standard_B2s): ~$150/month
