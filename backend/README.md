# AssetFlow FastAPI Backend

FastAPI backend for AssetFlow - Building and Asset Management System

## Features

- RESTful API with FastAPI
- JWT-based authentication
- PostgreSQL database integration
- Local filesystem storage for file uploads
- Comprehensive audit logging
- Role-based access control (Admin, Editor, Viewer)

## Requirements

- Python 3.11+
- PostgreSQL 14+
- Local writable filesystem path for uploads (see `FILES_BASE_PATH`)

## Local Development Setup

### 1. Install Python Dependencies

```bash
cd backend
python -m venv venv

# On Windows
venv\Scripts\activate

# On Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/assetflow
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
# Local filesystem storage roots
FILES_BASE_PATH=/home/profilegroup/app/uploads
ASSET_FILES_STORAGE_PATH=/home/profilegroup/app/asset_files_storage
ALLOWED_ORIGINS=http://localhost:5173
ENVIRONMENT=development
```

### 3. Set Up Database

```bash
# Create database
createdb assetflow

# Import schema
psql assetflow < ../azure_postgres_schema.sql
```

### 4. Run Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000

API documentation (Swagger): http://localhost:8000/docs

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration settings
│   ├── database.py          # Database connection
│   ├── auth.py              # Authentication logic
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   └── routers/
│       ├── __init__.py
│       ├── auth.py          # Authentication endpoints
│       ├── buildings.py     # Buildings CRUD
│       ├── assets.py        # Assets CRUD
│       ├── asset_types.py   # Asset types CRUD
│       ├── files.py         # File upload/download
│       └── audit.py         # Audit log endpoints
├── requirements.txt
├── startup.sh              # Production startup script
└── .env.example
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/me` - Get current user info

### Buildings
- `GET /api/buildings` - List all buildings
- `GET /api/buildings/{building_id}` - Get building details
- `POST /api/buildings` - Create building
- `PUT /api/buildings/{building_id}` - Update building
- `DELETE /api/buildings/{building_id}` - Delete building

### Assets
- `GET /api/assets` - List all assets
- `GET /api/assets/{asset_id}` - Get asset details
- `POST /api/assets` - Create asset
- `PUT /api/assets/{asset_id}` - Update asset
- `DELETE /api/assets/{asset_id}` - Delete asset
- `POST /api/assets/bulk` - Bulk create/update assets

### Asset Types
- `GET /api/asset-types` - List all asset types
- `GET /api/asset-types/{id}` - Get asset type details
- `POST /api/asset-types` - Create asset type

### Files
- `POST /api/files/upload/{asset_id}` - Upload file
- `GET /api/files/asset/{asset_id}` - List asset files
- `GET /api/files/download/{file_id}` - Get download URL
- `DELETE /api/files/{file_id}` - Delete file

### Audit
- `GET /api/audit` - List audit logs
- `GET /api/audit/{audit_id}` - Get audit log details

## Authentication

The API uses JWT bearer tokens for authentication. After logging in, include the token in all requests:

```bash
curl -H "Authorization: Bearer <your_token>" http://localhost:8000/api/buildings
```

## User Roles

- **Admin**: Full access to all resources
- **Editor**: Can create, read, and update resources
- **Viewer**: Read-only access

## Default Credentials

After setting up the database, you can login with:

- **Username**: admin
- **Password**: admin123

**Important**: Change the default password immediately after first login!

## Testing

### Manual Testing with curl

```bash
# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Get buildings (replace TOKEN with your actual token)
curl http://localhost:8000/api/buildings \
  -H "Authorization: Bearer TOKEN"
```

### Using Swagger UI

Navigate to http://localhost:8000/docs for interactive API documentation.

## Deployment

See [AZURE_DEPLOYMENT_GUIDE.md](../AZURE_DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

### Deploy

```bash
# From project root
chmod +x deploy-to-azure.sh
./deploy-to-azure.sh
```

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | Required |
| SECRET_KEY | JWT secret key | Required |
| ALGORITHM | JWT algorithm | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiration time | 30 |
| FILES_BASE_PATH | Local base path for file uploads | `/home/profilegroup/app/uploads` |
| ASSET_FILES_STORAGE_PATH | Local path for structure-drawings / asset files | `/home/profilegroup/app/asset_files_storage` |
| ALLOWED_ORIGINS | CORS allowed origins (comma-separated) | http://localhost:5173 |
| ENVIRONMENT | Environment name | development |

## Troubleshooting

### Database Connection Issues

Check your DATABASE_URL format:
```
postgresql://username:password@host:port/database?sslmode=require
```

If your PostgreSQL requires SSL, set `sslmode=require` in `DATABASE_URL`.

### CORS Issues

Make sure your frontend URL is in the ALLOWED_ORIGINS environment variable.

### File Upload Issues

Verify that:
1. `FILES_BASE_PATH` / `ASSET_FILES_STORAGE_PATH` directories exist and are writable by the app user

## Security Best Practices

1. Use strong SECRET_KEY (generate with: `openssl rand -hex 32`)
2. Enable HTTPS in production
3. Rotate JWT tokens regularly
4. Use environment variables for all secrets
5. Use a secrets manager for production secrets (e.g. Key Vault / environment variables)
6. Set up rate limiting for API endpoints
7. Regular security updates for dependencies

## Performance Tips

1. Use connection pooling (already configured in database.py)
2. Add database indexes for frequently queried fields
3. Enable Redis for caching (optional)
4. Use async endpoints for I/O-bound operations
5. Monitor with Application Insights

## License

Proprietary - AssetFlow
