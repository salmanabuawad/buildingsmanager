// Azure deployment (no Docker): App Service for backend, placeholder for Static Web App
// PostgreSQL is assumed existing - configure PGHOST/PGUSER/PGPASSWORD in App Service settings
targetScope = 'resourceGroup'

@description('Base name for resources (e.g. buildingsmanager)')
param baseName string = 'buildingsmanager'

@description('Azure region (e.g. Israel Central)')
param location string = resourceGroup().location

@description('Python version for App Service')
param pythonVersion string = '3.11'

@description('Database host (existing Azure PostgreSQL)')
param dbHost string

@description('Database user')
param dbUser string

@description('Database name')
param dbName string = 'postgres'

@description('Database password (secure)')
@secure()
param dbPassword string

@description('JWT secret key (secure)')
@secure()
param secretKey string

@description('Allowed CORS origins for API (comma-separated). Include your Static Web App URL, e.g. https://<app>.azurestaticapps.net')
param allowedOrigins string = 'https://azurestaticapps.net'

@description('SSL mode for Azure PostgreSQL (use require for Azure)')
param pgSslMode string = 'require'

@description('Optional: Azure Storage connection string for file uploads (leave empty to skip blob storage)')
param azureStorageConnectionString string = ''

@description('Azure Blob container name when using storage')
param azureStorageContainerName string = 'assetflow-files'

var appName = '${baseName}-api'
var planName = '${baseName}-plan'

resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      appCommandLine: 'gunicorn --chdir /home/site/wwwroot app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000'
      alwaysOn: true
      appSettings: [
        { name: 'PGHOST'; value: dbHost }
        { name: 'PGUSER'; value: dbUser }
        { name: 'PGPORT'; value: '5432' }
        { name: 'PGDATABASE'; value: dbName }
        { name: 'PGPASSWORD'; value: dbPassword }
        { name: 'PGSSLMODE'; value: pgSslMode }
        { name: 'SECRET_KEY'; value: secretKey }
        { name: 'ALLOWED_ORIGINS'; value: allowedOrigins }
        { name: 'ENVIRONMENT'; value: 'production' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING'; value: azureStorageConnectionString }
        { name: 'AZURE_STORAGE_CONTAINER_NAME'; value: azureStorageContainerName }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'; value: 'true' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE'; value: '0' }
      ]
    }
    httpsOnly: true
  }
}

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output apiBaseUrl string = 'https://${webApp.properties.defaultHostName}/api'
