# AssetFlow FastAPI Backend

FastAPI backend for AssetFlow - Building and Asset Management System

## Features

- RESTful API with FastAPI
- JWT-based authentication
- PostgreSQL database integration
- Local filesystem storage for file uploads
- Comprehensive audit logging
- Role-based access control (Admin, User, Inspector)

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
psql assetflow < ../schema.sql
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
│       ├── audit.py         # Audit log endpoints
│       ├── data.py          # Generic table query endpoint
│       ├── users.py         # User management endpoints
│       ├── operators_managers.py  # Operators & managers
│       └── inspection_tasks.py   # Inspection tasks & reports
├── requirements.txt
├── startup.sh              # Production startup script
└── .env.example
```

## API Endpoints

### Authentication
- `POST /api/auth/session` - Login with username/password
- `POST /api/auth/heartbeat` - Refresh token
- `GET /api/auth/me` - Get current user info

### Users
- `POST /api/users/internal` - Create user with hashed password
- `POST /api/users/set-password` - Change user password

### Buildings
- `GET /api/buildings` - List all buildings
- `GET /api/buildings/{building_id}` - Get building details
- `POST /api/buildings` - Create building
- `PUT /api/buildings/{building_id}` - Update building
- `DELETE /api/buildings/by-number/{building_number}` - Delete building and related data

### Assets
- `GET /api/assets` - List all assets
- `POST /api/assets` - Create asset
- `PUT /api/assets/{asset_id}` - Update asset
- `DELETE /api/assets/{asset_id}` - Delete asset
- `POST /api/assets/bulk` - Bulk create/update assets

### Asset Types
- `GET /api/asset-types` - List all asset types
- `POST /api/asset-types` - Create asset type
- `PUT /api/asset-types/{id}` - Update asset type
- `DELETE /api/asset-types/{id}` - Delete asset type

### Files
- `POST /api/files/upload/{asset_id}` - Upload file for asset
- `GET /api/files/asset/{asset_id}` - List asset files
- `GET /api/files/download` - Download file by path
- `DELETE /api/files/{file_id}` - Delete file

### Generic Data
- `GET /api/data/{table}` - Query any allowed table
- `POST /api/data/{table}` - Insert rows
- `POST /api/data/{table}/upsert` - Upsert rows
- `DELETE /api/data/{table}` - Delete rows by filter

### Inspection Tasks
- `GET /api/inspection-tasks` - List tasks
- `POST /api/inspection-tasks` - Create task
- `PATCH /api/inspection-tasks/{id}` - Update task
- `POST /api/inspection-tasks/{id}/take` - Take task
- `POST /api/inspection-tasks/{id}/submit` - Submit task
- `POST /api/inspection-tasks/{id}/approve` - Approve task

### Audit
- `GET /api/audit` - List audit logs

## Authentication

The API uses JWT bearer tokens. After logging in, include the token in all requests:

```bash
curl -H "Authorization: Bearer <your_token>" http://localhost:8000/api/buildings
```

## User Roles

- **admin**: Full access to all resources
- **user**: Standard access
- **inspector**: Mobile inspection access

## Deployment

The app is deployed to `profile.wavelync.com` using `deploy.sh` from the project root:

```bash
# From project root
bash deploy.sh
```

This script:
1. Builds the frontend (`npm run build`)
2. Copies `dist/` to `/var/www/buildingsmanager` on the server
3. Copies backend Python files to `/home/profilegroup/app/backend/`
4. Sends `SIGHUP` to the running uvicorn process to reload

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | Required |
| SECRET_KEY | JWT secret key | Required |
| ALGORITHM | JWT algorithm | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiration time | 30 |
| FILES_BASE_PATH | Local base path for file uploads | `/home/profilegroup/app/uploads` |
| ASSET_FILES_STORAGE_PATH | Local path for asset files storage | `/home/profilegroup/app/asset_files_storage` |
| ALLOWED_ORIGINS | CORS allowed origins (comma-separated) | http://localhost:5173 |
| ENVIRONMENT | Environment name | development |

## Troubleshooting

### Database Connection Issues

Check your DATABASE_URL format:
```
postgresql://username:password@host:port/database
```

### CORS Issues

Make sure your frontend URL is in the `ALLOWED_ORIGINS` environment variable.

### File Upload Issues

Verify that `FILES_BASE_PATH` and `ASSET_FILES_STORAGE_PATH` directories exist and are writable by the app user.

## Security Best Practices

1. Use a strong `SECRET_KEY` (generate with: `openssl rand -hex 32`)
2. Enable HTTPS in production (nginx with Let's Encrypt)
3. Use environment variables for all secrets
4. Set up rate limiting for API endpoints
5. Keep dependencies up to date

## License

Proprietary - AssetFlow
