# Azure Deployment - Quick Start Guide

Get AssetFlow running on Azure in minutes!

## Prerequisites

- Azure account with active subscription
- Azure CLI installed: `az --version`
- Python 3.11+ and Node.js 18+
- PostgreSQL client (psql)

## Option 1: Automated Deployment (Recommended)

### Mac/Linux

```bash
# Make script executable
chmod +x deploy-to-azure.sh

# Run deployment
./deploy-to-azure.sh
```

### Windows

```powershell
# Run in PowerShell
powershell -ExecutionPolicy Bypass -File deploy-to-azure.ps1
```

The script will:
1. Create all Azure resources
2. Set up PostgreSQL database
3. Configure Blob Storage
4. Deploy backend API
5. Deploy frontend app
6. Print access URLs and credentials

**Deployment time**: 15-20 minutes

## Option 2: Manual Deployment

### Step 1: Login to Azure

```bash
az login
```

### Step 2: Create Resources

```bash
# Set variables
RESOURCE_GROUP="assetflow-rg"
LOCATION="israelcentral"
DB_SERVER="assetflow-db-$(date +%s)"
STORAGE="assetflowstorage$(date +%s)"
BACKEND_APP="assetflow-api-$(date +%s)"
FRONTEND_APP="assetflow-frontend-$(date +%s)"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create PostgreSQL
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --location $LOCATION \
  --admin-user assetflowadmin \
  --admin-password "ChangeMe123!" \
  --sku-name Standard_B2s \
  --version 14 \
  --yes

# Create database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER \
  --database-name assetflow

# Allow Azure services
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --rule-name AllowAzure \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Import schema
PGPASSWORD="ChangeMe123!" psql \
  "host=$DB_SERVER.postgres.database.azure.com port=5432 dbname=assetflow user=assetflowadmin sslmode=require" \
  -f azure_postgres_schema.sql
```

### Step 3: Create Storage

```bash
# Create storage account
az storage account create \
  --name $STORAGE \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS

# Create container
az storage container create \
  --name assetflow-files \
  --account-name $STORAGE
```

### Step 4: Deploy Backend

```bash
# Create App Service
az appservice plan create \
  --name assetflow-plan \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan assetflow-plan \
  --name $BACKEND_APP \
  --runtime "PYTHON:3.11"

# Set environment variables
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP \
  --settings \
    DATABASE_URL="postgresql://assetflowadmin:ChangeMe123!@$DB_SERVER.postgres.database.azure.com:5432/assetflow?sslmode=require" \
    SECRET_KEY="$(openssl rand -hex 32)" \
    AZURE_STORAGE_CONNECTION_STRING="$(az storage account show-connection-string --name $STORAGE --resource-group $RESOURCE_GROUP -o tsv)" \
    ALLOWED_ORIGINS="http://localhost:5173"

# Deploy code
cd backend
zip -r backend.zip .
az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP \
  --src backend.zip
cd ..
```

### Step 5: Deploy Frontend

```bash
# Create Static Web App
az staticwebapp create \
  --name $FRONTEND_APP \
  --resource-group $RESOURCE_GROUP \
  --location israelcentral2

# Build frontend
echo "VITE_API_URL=https://$BACKEND_APP.azurewebsites.net/api" > .env.production
npm install
npm run build

# Deploy
DEPLOY_TOKEN=$(az staticwebapp secrets list \
  --name $FRONTEND_APP \
  --resource-group $RESOURCE_GROUP \
  --query "properties.apiKey" -o tsv)

npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$DEPLOY_TOKEN"
```

### Step 6: Update CORS

```bash
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP \
  --settings \
    ALLOWED_ORIGINS="https://$FRONTEND_APP.azurestaticapps.net,http://localhost:5173"
```

## Access Your Application

After deployment:

1. **Frontend**: `https://YOUR-FRONTEND-APP.azurestaticapps.net`
2. **Backend API**: `https://YOUR-BACKEND-APP.azurewebsites.net`
3. **API Docs**: `https://YOUR-BACKEND-APP.azurewebsites.net/docs`

## Default Login

- **Username**: `admin`
- **Password**: `admin123`

**Important**: Change this password immediately!

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://user:pass@localhost:5432/assetflow
SECRET_KEY=$(openssl rand -hex 32)
AZURE_STORAGE_CONNECTION_STRING=your-connection-string
ALLOWED_ORIGINS=http://localhost:5173
EOF

# Run server
uvicorn app.main:app --reload
```

### Frontend

```bash
# Create .env.local file
echo "VITE_API_URL=http://localhost:8000/api" > .env.local

# Run development server
npm install
npm run dev
```

## Verification Checklist

After deployment, verify:

- [ ] Can access frontend URL
- [ ] Can access backend API docs at `/docs`
- [ ] Can login with default credentials
- [ ] Can create a building
- [ ] Can create an asset
- [ ] Can upload a file
- [ ] Can view audit logs

## Common Issues

### Backend not starting
```bash
# Check logs
az webapp log tail --resource-group assetflow-rg --name YOUR-BACKEND-APP
```

### Database connection failed
- Verify firewall rules allow Azure services
- Check connection string format
- Ensure SSL mode is set to 'require'

### CORS errors
- Verify ALLOWED_ORIGINS includes your frontend URL
- Check that CORS is configured in backend

### File upload fails
- Verify Azure Storage connection string
- Check that container 'assetflow-files' exists
- Ensure storage account allows blob access

## Next Steps

1. **Change default password**
2. **Set up custom domain**
3. **Configure SSL certificates**
4. **Enable Application Insights monitoring**
5. **Set up automated backups**
6. **Configure auto-scaling**
7. **Review security settings**

## Useful Commands

```bash
# View backend logs
az webapp log tail --resource-group assetflow-rg --name YOUR-APP

# Restart backend
az webapp restart --resource-group assetflow-rg --name YOUR-APP

# Scale backend
az appservice plan update --name assetflow-plan --resource-group assetflow-rg --number-of-workers 2

# View all resources
az resource list --resource-group assetflow-rg -o table

# Delete everything
az group delete --name assetflow-rg --yes
```

## Cost Management

Monitor costs:
```bash
az consumption usage list --start-date 2024-01-01 --end-date 2024-01-31
```

Set up budget alerts in Azure Portal → Cost Management.

## Support

- **Documentation**: See [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md)
- **Migration Guide**: See [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md)
- **Backend README**: See [backend/README.md](./backend/README.md)

## Cleanup

To delete all Azure resources:

```bash
az group delete --name assetflow-rg --yes --no-wait
```

This removes everything and stops all charges.

---

**Deployment Complete!** Your AssetFlow application is now running on Azure with FastAPI backend.
