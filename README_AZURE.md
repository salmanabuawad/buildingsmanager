# AssetFlow - Azure Deployment Edition

AssetFlow is now ready to deploy on Azure with a FastAPI backend, Azure PostgreSQL database, and Azure Blob Storage!

## 🚀 Quick Start

### Fastest Way to Deploy

```bash
# On Mac/Linux
chmod +x deploy-to-azure.sh
./deploy-to-azure.sh

# On Windows
powershell -ExecutionPolicy Bypass -File deploy-to-azure.ps1
```

This automated script will:
- Create all Azure resources **in Israel Central region** 🇮🇱
- Set up PostgreSQL database with schema
- Configure Blob Storage
- Deploy FastAPI backend
- Deploy React frontend
- **Time**: ~15-20 minutes

> **Note**: The deployment is configured for Azure's **Israel Central** region (Tel Aviv) for optimal performance and data residency in Israel. See [AZURE_ISRAEL_DEPLOYMENT.md](./AZURE_ISRAEL_DEPLOYMENT.md) for details.

## 📚 Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [AZURE_ISRAEL_DEPLOYMENT.md](./AZURE_ISRAEL_DEPLOYMENT.md) | 🇮🇱 Israel region deployment | **START HERE** for Israel deployment |
| [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md) | Fast deployment guide | When you want to deploy quickly |
| [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md) | Detailed deployment steps | When you need complete control |
| [AZURE_MIGRATION_SUMMARY.md](./AZURE_MIGRATION_SUMMARY.md) | What was created | To understand the architecture |
| [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md) | Supabase to Azure migration | When migrating from Supabase |
| [backend/README.md](./backend/README.md) | Backend documentation | For backend development |

## 🏗️ Architecture

### Current Setup (Supabase)
```
React Frontend → Supabase Client → Supabase
                                   ├── Auth
                                   ├── Database (PostgreSQL)
                                   └── Storage
```

### New Setup (Azure)
```
React Frontend → FastAPI Backend → Azure PostgreSQL
                                 → Azure Blob Storage
                                 → JWT Authentication
```

## 📁 Project Structure

```
assetflow/
├── backend/                    # NEW: FastAPI backend
│   ├── app/
│   │   ├── main.py            # FastAPI app
│   │   ├── config.py          # Configuration
│   │   ├── database.py        # Database connection
│   │   ├── auth.py            # JWT authentication
│   │   ├── models.py          # Database models
│   │   ├── schemas.py         # API schemas
│   │   └── routers/           # API endpoints
│   │       ├── auth.py        # Authentication
│   │       ├── buildings.py   # Buildings CRUD
│   │       ├── assets.py      # Assets CRUD
│   │       ├── asset_types.py # Asset types
│   │       ├── files.py       # File uploads
│   │       └── audit.py       # Audit logs
│   ├── requirements.txt
│   ├── startup.sh
│   └── .env.example
├── src/
│   ├── lib/
│   │   ├── apiClient.ts       # NEW: FastAPI client
│   │   └── supabase.ts        # OLD: Can be replaced
│   └── components/
├── azure_postgres_schema.sql  # NEW: Database schema
├── deploy-to-azure.sh         # NEW: Deployment script (Mac/Linux)
├── deploy-to-azure.ps1        # NEW: Deployment script (Windows)
├── AZURE_DEPLOYMENT_GUIDE.md
├── AZURE_QUICKSTART.md
└── MIGRATION_TO_AZURE.md
```

## ✨ What's New

### Backend API (FastAPI)
- ✅ RESTful API with automatic documentation
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ File upload/download
- ✅ Comprehensive error handling
- ✅ CORS configuration
- ✅ Production-ready

### Database (Azure PostgreSQL)
- ✅ Compatible schema with Supabase
- ✅ Connection pooling
- ✅ SSL/TLS security
- ✅ Automated backups
- ✅ Scalable

### Storage (Azure Blob Storage)
- ✅ Secure file uploads
- ✅ SAS token generation
- ✅ Organized file structure
- ✅ Support for all file types

### Deployment
- ✅ Automated deployment scripts
- ✅ Infrastructure as code
- ✅ Environment-based configuration
- ✅ Easy scaling

## 🔑 Key Features

### Authentication
- JWT-based token authentication
- Secure password hashing (bcrypt)
- Role-based permissions (Admin, Editor, Viewer)
- Token expiration and management

### API Endpoints
All Supabase functionality is available via REST API:
- `/api/auth/*` - Authentication
- `/api/buildings/*` - Buildings management
- `/api/assets/*` - Assets management
- `/api/asset-types/*` - Asset types
- `/api/files/*` - File operations
- `/api/audit/*` - Audit logs

### Interactive Documentation
After deployment, access Swagger UI at:
```
https://your-backend.azurewebsites.net/docs
```

## 💻 Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run server
uvicorn app.main:app --reload
```

Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs

### Frontend
```bash
# Configure API URL
echo "VITE_API_URL=http://localhost:8000/api" > .env.local

# Run development server
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

## 🔄 Migration from Supabase

### Option 1: Keep Using Supabase
Continue using your current Supabase setup. No changes needed.

### Option 2: Migrate to Azure
Follow [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md) for step-by-step guide:

1. Deploy Azure infrastructure
2. Migrate database data
3. Update frontend to use new API client
4. Test thoroughly
5. Switch DNS/deployment

## 💰 Cost Comparison

### Supabase
- Free tier: $0
- Pro: $25/month
- **Total**: $0-75/month

### Azure
- Development (Basic): ~$46/month
- Production (Standard): ~$225/month
- **More control and scalability**

## 🛠️ Azure Resources Created

1. **Resource Group** - Container for all resources
2. **Azure PostgreSQL Flexible Server** - Database
3. **Azure Blob Storage** - File storage
4. **Azure App Service** - Backend API hosting
5. **Azure Static Web Apps** - Frontend hosting

## 📊 Monitoring

### View Logs
```bash
az webapp log tail --resource-group assetflow-rg --name your-app
```

### Application Insights
Enable monitoring in Azure Portal for:
- API performance metrics
- Error tracking
- Request analytics
- Custom dashboards

## 🔒 Security

- JWT token authentication
- HTTPS enforcement
- Azure Key Vault integration ready
- Environment-based secrets
- SQL injection prevention (ORM)
- CORS configuration
- Rate limiting ready

## 🚦 Getting Started Checklist

- [ ] Read [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md)
- [ ] Install Azure CLI
- [ ] Run deployment script
- [ ] Access your deployed app
- [ ] Login with default credentials
- [ ] Change admin password
- [ ] Test all functionality
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring
- [ ] Configure backups

## 📞 Support & Resources

- **Quick Start**: [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md)
- **Full Guide**: [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md)
- **Migration**: [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md)
- **Backend Docs**: [backend/README.md](./backend/README.md)
- **Azure Docs**: https://docs.microsoft.com/azure
- **FastAPI Docs**: https://fastapi.tiangolo.com

## 🎯 Next Steps

1. **Deploy**: Use the automated deployment script
2. **Access**: Open your deployed application
3. **Login**: Use default credentials (admin / WaveLync1342#)
4. **Secure**: Change the default password
5. **Test**: Verify all functionality works
6. **Monitor**: Enable Application Insights
7. **Scale**: Configure auto-scaling if needed

## 🤝 Contributing

This is a production-ready setup. Customize as needed:
- Add more API endpoints in `backend/app/routers/`
- Modify database schema in `azure_postgres_schema.sql`
- Update frontend API calls in `src/lib/apiClient.ts`
- Adjust deployment scripts for your needs

## 📄 License

Proprietary - AssetFlow

---

**Ready to deploy?** Start with [AZURE_QUICKSTART.md](./AZURE_QUICKSTART.md)!

**Need help?** Check [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md) for detailed instructions.

**Migrating from Supabase?** See [MIGRATION_TO_AZURE.md](./MIGRATION_TO_AZURE.md).

🚀 **Happy Deploying!**
