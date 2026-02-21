# Migration Guide: Supabase to Azure with FastAPI

This guide explains how to migrate your AssetFlow application from Supabase to Azure with FastAPI backend.

## Overview of Changes

### What's Changing

1. **Backend**: Direct Supabase calls → FastAPI REST API
2. **Database**: Supabase PostgreSQL → Azure PostgreSQL
3. **Authentication**: Supabase Auth → JWT-based authentication
4. **File Storage**: Supabase Storage → Azure Blob Storage
5. **Hosting**: Netlify → Azure Static Web Apps + Azure App Service

### What Stays the Same

- React frontend application structure
- Database schema (mostly compatible)
- User interface and functionality
- Business logic and validation rules

## Migration Steps

### Phase 1: Backend Setup (Estimated Time: 2-3 hours)

#### 1.1 Azure Resources Setup

Follow the [AZURE_DEPLOYMENT_GUIDE.md](./AZURE_DEPLOYMENT_GUIDE.md) to:

1. Create Azure PostgreSQL database
2. Create Azure Blob Storage account
3. Set up Azure App Service for backend
4. Set up Azure Static Web Apps for frontend

Or use the automated script:

```bash
# On Mac/Linux
chmod +x deploy-to-azure.sh
./deploy-to-azure.sh

# On Windows
powershell -ExecutionPolicy Bypass -File deploy-to-azure.ps1
```

#### 1.2 Data Migration

Export your existing Supabase data:

```bash
# Using Supabase CLI
supabase db dump -f backup.sql

# Or using pg_dump
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

Import to Azure PostgreSQL:

```bash
psql "host=your-server.postgres.database.azure.com port=5432 dbname=assetflow user=admin sslmode=require" < backup.sql
```

**Note**: The Azure schema is compatible with the Supabase schema, but some Supabase-specific features (like RLS policies) won't be migrated. The FastAPI backend handles authorization instead.

### Phase 2: Frontend Migration (Estimated Time: 3-4 hours)

The frontend needs to be updated to use the new FastAPI backend instead of Supabase client.

#### 2.1 Update Dependencies

The current implementation uses `@supabase/supabase-js`. You don't need to remove it immediately, but you'll replace its usage with a new FastAPI client (implement as described below; no in-repo reference implementation).

#### 2.2 Replace Supabase Client Calls

**Before (Supabase):**
```typescript
import { supabase } from './lib/supabase';

// Fetch buildings
const { data, error } = await supabase
  .from('buildings')
  .select('*');

// Create building
const { data, error } = await supabase
  .from('buildings')
  .insert({ building_id: '123', building_name: 'Test' });
```

**After (FastAPI):**
```typescript
// Use your FastAPI client (implement getBuildings, createBuilding, etc.)
const buildings = await apiClient.getBuildings();

// Create building
const building = await apiClient.createBuilding({
  building_id: '123',
  building_name: 'Test'
});
```

#### 2.3 Update Authentication

**Before (Supabase Auth):**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

const { data: { user } } = await supabase.auth.getUser();
```

**After (FastAPI JWT):**
```typescript
const response = await yourApiClient.login('username', 'password');
const user = yourApiClient.getCurrentUser();
```

#### 2.4 Update File Uploads

**Before (Supabase Storage):**
```typescript
const { data, error } = await supabase.storage
  .from('structure-drawings')
  .upload(`${assetId}/${fileName}`, file);
```

**After (Azure Blob Storage via FastAPI):**
```typescript
const fileData = await yourApiClient.uploadFile(assetId, file, measurementDate);
```

#### 2.5 Environment Variables

Update your `.env` files:

**Before:**
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

**After:**
```env
VITE_API_URL=https://assetflow-api.azurewebsites.net/api
```

### Phase 3: Testing (Estimated Time: 2-3 hours)

#### 3.1 Test Checklist

- [ ] User login/logout
- [ ] Buildings CRUD operations
- [ ] Assets CRUD operations
- [ ] Asset types management
- [ ] File upload/download
- [ ] Audit log viewing
- [ ] Excel import/export
- [ ] Search and filtering
- [ ] Permissions and roles

#### 3.2 Test Each Component

1. **Authentication**
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "admin123"}'
   ```

2. **Buildings API**
   ```bash
   curl http://localhost:8000/api/buildings \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Assets API**
   ```bash
   curl http://localhost:8000/api/assets \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### Phase 4: Production Deployment

#### 4.1 Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Data migrated and verified
- [ ] Environment variables configured
- [ ] Default admin password changed
- [ ] CORS settings configured
- [ ] SSL certificates set up
- [ ] Backup strategy in place
- [ ] Monitoring configured

#### 4.2 Deploy

```bash
# Backend deployment
cd backend
zip -r backend.zip . -x "*.pyc" -x "__pycache__/*"
az webapp deployment source config-zip \
  --resource-group assetflow-rg \
  --name assetflow-api \
  --src backend.zip

# Frontend deployment
npm run build
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "YOUR_TOKEN"
```

#### 4.3 Post-Deployment Verification

1. Verify API health: `https://your-api.azurewebsites.net/health`
2. Test login functionality
3. Verify database connectivity
4. Test file uploads
5. Check audit logs
6. Monitor for errors in Application Insights

## Key Differences Between Supabase and FastAPI

### Authentication

| Feature | Supabase | FastAPI |
|---------|----------|---------|
| Auth Method | Email/Password with built-in auth | JWT tokens |
| Session Management | Automatic | Manual (localStorage) |
| User Roles | In auth.users metadata | In users table |
| Password Reset | Built-in | Need to implement |

### Database Access

| Feature | Supabase | FastAPI |
|---------|----------|---------|
| Client Access | Direct from frontend | Via REST API |
| Security | Row Level Security (RLS) | API endpoint authorization |
| Real-time | Supported | Would need WebSockets |
| Queries | PostgREST syntax | SQL via SQLAlchemy |

### File Storage

| Feature | Supabase Storage | Azure Blob Storage |
|---------|------------------|-------------------|
| Access | Direct upload/download | Via API with SAS tokens |
| Organization | Buckets | Containers |
| Access Control | RLS policies | Shared Access Signatures |

## Migration Checklist

### Before Migration

- [ ] Backup all Supabase data
- [ ] Export database schema
- [ ] Download all uploaded files
- [ ] Document current environment variables
- [ ] Test all functionality one last time
- [ ] Notify users of upcoming maintenance

### During Migration

- [ ] Set up Azure resources
- [ ] Import database schema
- [ ] Migrate data
- [ ] Upload files to Azure Blob Storage
- [ ] Deploy backend API
- [ ] Update frontend code
- [ ] Deploy frontend
- [ ] Update DNS records (if using custom domain)

### After Migration

- [ ] Verify all functionality works
- [ ] Test with real users
- [ ] Monitor for errors
- [ ] Keep Supabase backup for rollback
- [ ] Update documentation
- [ ] Train users on any changes

## Rollback Plan

If issues occur during migration:

1. **Immediate Rollback**
   - Revert DNS to point back to Supabase
   - Keep Supabase project active during first week

2. **Data Sync**
   - If users created data in Azure, export and import back to Supabase
   - Use database dumps for data recovery

3. **Communication**
   - Notify users of rollback
   - Explain timeline for resolution

## Cost Comparison

### Supabase (Estimated Monthly)
- Free tier: $0
- Pro tier: $25/month
- Additional: ~$10-50 depending on usage
- **Total**: $25-75/month

### Azure (Estimated Monthly)
- App Service (B1): $13
- PostgreSQL (B2s): $28
- Storage: $5
- Static Web App: Free
- **Total**: $46/month (Basic tier)

For production workloads, Azure might be more expensive but offers better scalability and enterprise features.

## Benefits of Migration

1. **Ownership**: Full control over infrastructure
2. **Customization**: Customize API logic as needed
3. **Scalability**: Azure's enterprise-grade scaling
4. **Integration**: Better integration with other Azure services
5. **Compliance**: Easier to meet enterprise compliance requirements
6. **No vendor lock-in**: Standard PostgreSQL and Python

## Potential Challenges

1. **No Real-time Updates**: Supabase provides real-time subscriptions; you'd need to implement WebSockets or polling
2. **More Code to Maintain**: Backend API code requires maintenance
3. **Authentication**: Need to implement password reset and email verification
4. **Learning Curve**: Team needs to learn FastAPI and Azure

## Getting Help

- **Azure Documentation**: https://docs.microsoft.com/azure
- **FastAPI Documentation**: https://fastapi.tiangolo.com
- **Project Issues**: Create an issue in the repository
- **Azure Support**: Available with paid plans

## Timeline Estimate

- **Small Project** (< 100 users): 1-2 days
- **Medium Project** (100-1000 users): 3-5 days
- **Large Project** (1000+ users): 1-2 weeks

Include testing and validation time.

## Conclusion

Migrating from Supabase to Azure with FastAPI provides more control and flexibility, but requires more setup and maintenance. The migration is straightforward for most features, but some Supabase-specific features (like real-time subscriptions) need alternative implementations.

Follow this guide step by step, test thoroughly, and maintain a rollback plan for a successful migration.
