# Azure Israel Region Deployment Guide

This guide provides specific instructions for deploying AssetFlow to Azure's Israel Central region.

## About Azure Israel Central Region

Azure's Israel Central region is located in Tel Aviv and provides:
- Low latency for Israeli users
- Data residency within Israel
- Full Azure services availability
- Compliance with local regulations
- Hebrew language support

**Region Code**: `israelcentral`

## Quick Deploy to Israel Region

The deployment scripts are already configured to use the Israel Central region by default.

### Automated Deployment

```bash
# Mac/Linux
chmod +x deploy-to-azure.sh
./deploy-to-azure.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File deploy-to-azure.ps1
```

The script will automatically:
1. Create resources in `israelcentral` region
2. Deploy PostgreSQL database in Israel
3. Deploy storage in Israel
4. Deploy App Service in Israel
5. Deploy Static Web App in West Europe (closest with SWA support)

## Resources Deployed

### In Israel Central Region
- **Resource Group**: assetflow-rg
- **PostgreSQL Flexible Server**: Full managed PostgreSQL 14
- **Storage Account**: Azure Blob Storage for files
- **App Service**: FastAPI backend

### In West Europe Region
- **Static Web App**: React frontend (uses CDN, so globally distributed)

**Note**: Static Web Apps use Azure's global CDN, so your frontend will be fast for Israeli users even though the management endpoint is in West Europe.

## Manual Deployment Commands

If you prefer manual deployment:

```bash
# Login to Azure
az login

# Create resource group in Israel
az group create \
  --name assetflow-rg \
  --location israelcentral

# Create PostgreSQL in Israel
az postgres flexible-server create \
  --resource-group assetflow-rg \
  --name assetflow-db \
  --location israelcentral \
  --admin-user assetflowadmin \
  --admin-password "YourPassword123!" \
  --sku-name Standard_B2s \
  --version 14

# Create storage in Israel
az storage account create \
  --name assetflowstorage \
  --resource-group assetflow-rg \
  --location israelcentral \
  --sku Standard_LRS

# Create App Service in Israel
az appservice plan create \
  --name assetflow-plan \
  --resource-group assetflow-rg \
  --location israelcentral \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group assetflow-rg \
  --plan assetflow-plan \
  --name assetflow-api \
  --runtime "PYTHON:3.11"

# Create Static Web App (West Europe - closest region with SWA)
az staticwebapp create \
  --name assetflow-frontend \
  --resource-group assetflow-rg \
  --location westeurope
```

## Network Latency

Expected latency from Israel:
- Israel Central resources: ~1-5ms
- West Europe Static Web App: ~50-80ms (first request, then cached)
- CDN-delivered static content: ~10-30ms

## Data Residency

Your data stays in Israel:
- ✅ Database: Stored in Israel Central
- ✅ Uploaded files: Stored in Israel Central
- ✅ User data: Stored in Israel Central
- ℹ️ Static frontend code: Distributed via CDN (read-only)

## Pricing (in ILS)

Approximate monthly costs in Israeli Shekels:

### Development/Testing
- App Service B1: ~₪48
- PostgreSQL B2s: ~₪103
- Storage: ~₪18
- Static Web App: Free
- **Total**: ~₪169/month

### Production
- App Service P1V2: ~₪295
- PostgreSQL Standard_D2s_v3: ~₪442
- Storage: ~₪37
- Application Insights: ~₪55
- **Total**: ~₪829/month

*Prices are approximate and subject to change. Check Azure pricing calculator for exact costs.*

## Compliance

Deploying in Israel Central helps with:
- GDPR compliance (EU regulations)
- Israeli data protection laws
- Data sovereignty requirements
- Industry-specific regulations

## Hebrew Language Support

The application already supports Hebrew:
- RTL (Right-to-Left) layout
- Hebrew UI translations (via i18next)
- Hebrew data entry
- Hebrew PDF generation

## Special Considerations

### 1. Time Zone
The application uses UTC by default. To use Israel Time Zone:

```python
# In backend/app/config.py
import pytz

TIMEZONE = pytz.timezone('Asia/Jerusalem')
```

### 2. Currency
If you need to display costs in ILS:

```typescript
// In frontend
const formatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS'
});
```

### 3. Date Format
Hebrew date format (dd/mm/yyyy) is already supported.

### 4. Backup Location
Your backups will also be in Israel Central by default.

## Monitoring

View your resources in Azure Portal:
1. Go to https://portal.azure.com
2. Switch to Hebrew: Settings → Language → עברית
3. Navigate to Resource Group: assetflow-rg
4. View all resources in Israel Central region

## Support

### Azure Support in Israel
- Phone: 1-809-344-179
- Email: azure@microsoft.com
- Portal: https://portal.azure.com

### Documentation
- Azure Israel: https://azure.microsoft.com/he-il/
- Compliance: https://azure.microsoft.com/he-il/explore/trusted-cloud/compliance/

## Performance Optimization

For optimal performance in Israel:

1. **Enable CDN** (optional, for additional performance)
```bash
az cdn profile create \
  --resource-group assetflow-rg \
  --name assetflow-cdn \
  --sku Standard_Microsoft
```

2. **Use Availability Zones** (for high availability)
```bash
az postgres flexible-server update \
  --resource-group assetflow-rg \
  --name assetflow-db \
  --high-availability ZoneRedundant
```

3. **Enable Redis Cache** (for better performance)
```bash
az redis create \
  --name assetflow-cache \
  --resource-group assetflow-rg \
  --location israelcentral \
  --sku Basic \
  --vm-size c0
```

## Troubleshooting

### Check Region of Resources
```bash
az resource list \
  --resource-group assetflow-rg \
  --query "[].{Name:name, Type:type, Location:location}" \
  --output table
```

### Test Latency
```bash
# Test database latency
ping assetflow-db.postgres.database.azure.com

# Test API latency
curl -w "@-" https://assetflow-api.azurewebsites.net/health << 'EOF'
time_total: %{time_total}s\n
EOF
```

## Next Steps

1. Run deployment script
2. Verify all resources in Israel Central
3. Test application performance
4. Configure Hebrew language settings
5. Set up monitoring and alerts
6. Configure backups
7. Train your team

## Resources

- [Azure Israel Website](https://azure.microsoft.com/he-il/)
- [Israel Central Region Info](https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/#geographies)
- [Azure Compliance](https://azure.microsoft.com/en-us/explore/trusted-cloud/compliance/)
- [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)

---

**Ready to deploy?** Run the deployment script and your application will be hosted in Azure's Israel Central region!

```bash
./deploy-to-azure.sh
```

🇮🇱 **עבודה מצוינת! Your application will be deployed to Azure Israel!**
