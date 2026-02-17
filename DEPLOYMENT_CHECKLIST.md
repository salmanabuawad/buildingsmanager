# Azure Deployment Checklist

Use this checklist to track your deployment progress.

> **🇮🇱 Israel Region Deployment**: This deployment is configured for Azure's Israel Central region (Tel Aviv). See [AZURE_ISRAEL_DEPLOYMENT.md](./AZURE_ISRAEL_DEPLOYMENT.md) for region-specific information.

## Pre-Deployment

- [ ] Azure account created and verified
- [ ] Azure CLI installed and updated
- [ ] Python 3.11+ installed
- [ ] Node.js 18+ installed
- [ ] PostgreSQL client (psql) installed
- [ ] Logged into Azure CLI (`az login`)
- [ ] Read [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md)

## Azure Resources Setup

- [ ] Resource group created
- [ ] PostgreSQL server created
- [ ] Database created (`assetflow`)
- [ ] Firewall rules configured
- [ ] Database schema imported
- [ ] Storage account created
- [ ] Blob container created (`assetflow-files`)
- [ ] App Service plan created
- [ ] Backend web app created
- [ ] Static Web App created

## Configuration

- [ ] Backend environment variables set
  - [ ] DATABASE_URL
  - [ ] SECRET_KEY
  - [ ] AZURE_STORAGE_CONNECTION_STRING
  - [ ] ALLOWED_ORIGINS
- [ ] Frontend environment configured
  - [ ] VITE_API_URL
- [ ] CORS settings updated

## Deployment

- [ ] Backend code deployed
- [ ] Backend is running (check `/health`)
- [ ] Frontend built successfully
- [ ] Frontend deployed
- [ ] DNS/URLs configured

## Testing

- [ ] Can access frontend URL
- [ ] Can access backend API docs (`/docs`)
- [ ] Health check passes (`/health`)
- [ ] Can login with default credentials
- [ ] Authentication works correctly
- [ ] Can view buildings list
- [ ] Can create a new building
- [ ] Can view assets list
- [ ] Can create a new asset
- [ ] Can upload a file
- [ ] File download works
- [ ] Can view audit logs
- [ ] Search functionality works
- [ ] Excel import works
- [ ] Excel export works
- [ ] All user roles work correctly

## Security

- [ ] Default admin password changed
- [ ] SECRET_KEY is strong and unique
- [ ] HTTPS enabled (automatic in Azure)
- [ ] CORS configured properly
- [ ] Firewall rules reviewed
- [ ] Storage account access reviewed
- [ ] Database backups enabled
- [ ] Secrets stored securely (not in code)

## Monitoring & Maintenance

- [ ] Application Insights enabled
- [ ] Log streaming configured
- [ ] Budget alerts set up
- [ ] Backup strategy defined
- [ ] Disaster recovery plan created
- [ ] Documentation updated for team
- [ ] Users notified of new URLs

## Optional Enhancements

- [ ] Custom domain configured
- [ ] SSL certificate installed
- [ ] Auto-scaling enabled
- [ ] Azure Key Vault configured
- [ ] CDN configured for frontend
- [ ] Redis cache added (if needed)
- [ ] Rate limiting implemented
- [ ] Email notifications configured
- [ ] Multi-region deployment (if needed)

## Post-Deployment

- [ ] All team members have access
- [ ] Training provided (if needed)
- [ ] Old Supabase project backed up
- [ ] Migration complete
- [ ] Performance tested
- [ ] Load testing completed (if needed)
- [ ] Monitoring dashboard created
- [ ] Incident response plan documented

## Troubleshooting Done

- [ ] Verified backend logs are accessible
- [ ] Tested database connection
- [ ] Confirmed file uploads work
- [ ] Checked CORS settings
- [ ] Verified authentication flow
- [ ] Reviewed error logs

## Documentation

- [ ] Team documentation updated
- [ ] API documentation shared
- [ ] Deployment process documented
- [ ] Environment variables documented
- [ ] Backup procedures documented
- [ ] Support contacts listed

## Cost Management

- [ ] Reviewed resource pricing
- [ ] Budget set up
- [ ] Cost alerts configured
- [ ] Resource usage monitored
- [ ] Unused resources removed

## Final Verification

- [ ] All functionality tested end-to-end
- [ ] Performance is acceptable
- [ ] No errors in logs
- [ ] Monitoring is working
- [ ] Team is trained
- [ ] Documentation is complete
- [ ] Stakeholders notified

---

## Quick Commands Reference

### View Backend Logs
```bash
az webapp log tail --resource-group assetflow-rg --name YOUR-BACKEND-APP
```

### Restart Backend
```bash
az webapp restart --resource-group assetflow-rg --name YOUR-BACKEND-APP
```

### View All Resources
```bash
az resource list --resource-group assetflow-rg -o table
```

### Test API Health
```bash
curl https://YOUR-BACKEND-APP.azurewebsites.net/health
```

### Test Login
```bash
curl -X POST https://YOUR-BACKEND-APP.azurewebsites.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "WaveLync1342#"}'
```

---

## Deployment Complete?

Once all items are checked:

✅ **Congratulations!** Your AssetFlow application is successfully deployed on Azure!

📝 **Don't forget to:**
1. Change the default admin password
2. Save all connection strings securely
3. Set up regular backups
4. Monitor costs and performance
5. Keep documentation updated

🚀 **Your application is live at:**
- Frontend: `https://YOUR-FRONTEND-APP.azurestaticapps.net`
- Backend API: `https://YOUR-BACKEND-APP.azurewebsites.net`
- API Docs: `https://YOUR-BACKEND-APP.azurewebsites.net/docs`

---

Need help? Check the documentation:
- [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md)
- [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md)
- [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md)
