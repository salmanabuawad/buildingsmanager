# Buildings Manager

A comprehensive real estate asset management application for tracking buildings, assets, and measurements with validation rules and historical data support.

## 🚀 Features

- 📊 **Asset Management** - Manage buildings and assets with complex hierarchical types
- 📈 **Measurement History** - Track asset measurements over time
- ✅ **Dynamic Validation** - Database-driven validation rules system
- 🌐 **Bilingual Support** - Full English/Hebrew interface with RTL support
- 📄 **PDF/DWG Viewer** - View structure drawings and floor plans
- 📥 **CSV Import/Export** - Bulk import assets and asset types
- 🔍 **Advanced Search** - Search assets by range with comprehensive filters
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- ⚡ **Real-time Updates** - Live data synchronization with database
- 🗄️ **PostgreSQL** - Local database (full stack runs on your machine)

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Stack**: Frontend (Vite) + FastAPI (Python) + PostgreSQL (all local). **The application is not deployed to Nginx by default**; Nginx is optional for production-like serving (see [nginx/README.md](nginx/README.md)).
- **API**: Same origin only — all requests go to **`http://<host>/api/...`**. You **must** proxy `/api` to the backend. See [docs/PROXY_API.md](docs/PROXY_API.md). Deploy script applies Nginx config automatically; run `.\nginx\deploy-frontend.ps1` then `cd C:\nginx; .\nginx.exe -s reload`.
- **Data Grid**: AG Grid React
- **State Management**: React hooks
- **Validation**: Database-driven rules engine

## 📋 Prerequisites

Before running this project, ensure you have:

- **Node.js** v18 or higher
- **npm** v9 or higher
- **PostgreSQL** v12 or higher (for local development)

## ⚡ Quick Start

### Option 1: Local stack (PostgreSQL + FastAPI + frontend)

**Mac/Linux:**
```bash
# Create DB and run migrations (set PGPASSWORD first)
./scripts/setup_local.sh

# Start backend and frontend
./scripts/start-servers.sh
# Or: cd backend && uvicorn app.main:app --reload --port 8000 & npm run dev
```

**Windows (PowerShell):**
```powershell
# Create DB and run migrations (set $env:PGPASSWORD first)
.\scripts\setup_local.ps1

# Start backend and frontend
.\scripts\start-servers.ps1
# Or run separately: backend with uvicorn, then npm run dev
```

**Legacy / manual:**
```cmd
REM Run automated setup
.\scripts\setup_local.ps1

REM Install dependencies and start
npm install
npm run dev
```

**See [QUICKSTART_LOCAL.md](QUICKSTART_LOCAL.md) for detailed instructions**

**After backend or api client changes:** Restart backend and rebuild/restart frontend so the app picks up changes. Run `.\scripts\restart-servers.ps1` (Windows) or `./scripts/restart-servers.sh` (Linux) to restart both servers. See [docs/RESTART_SERVERS.md](docs/RESTART_SERVERS.md).

### Serving the built app with `http://localhost/api/...`

The app uses same-origin API only (`http://localhost/api/...`). To run the **built** app so `/api` works without Nginx:

1. Start the backend: `cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
2. Build and serve: `npm run build && npm run preview`

Preview runs on port 80 and proxies `/api` to the backend. Open **http://localhost/**.

For production, use Nginx with the `/api` proxy (see [nginx/README.md](nginx/README.md)); run `.\nginx\setup-nginx-config-windows.ps1` then reload Nginx.

## 📖 Documentation

- **[docs/PROXY_API.md](docs/PROXY_API.md)** — Proxy `/api` to the backend (required when serving the app)
- **[docs/RESTART_SERVERS.md](docs/RESTART_SERVERS.md)** — Restart backend and frontend after code changes
- **[QUICKSTART_LOCAL.md](QUICKSTART_LOCAL.md)** - 5-minute local setup guide
- **[LOCAL_SETUP.md](LOCAL_SETUP.md)** - Detailed local PostgreSQL setup with troubleshooting
- **[VALIDATION_IMPLEMENTATION.md](VALIDATION_IMPLEMENTATION.md)** - Validation system documentation

## 🗂️ Project Structure

```
buildings-manager/
├── src/
│   ├── components/           # React components
│   │   ├── AssetDataEntry.tsx        # Asset creation/editing
│   │   ├── AssetDetails.tsx          # Asset details view
│   │   ├── AssetsList.tsx            # Main asset grid
│   │   ├── AssetSearch.tsx           # Asset search
│   │   ├── AssetSearchByRange.tsx    # Range search
│   │   ├── AssetsCSVImport.tsx       # Bulk CSV import
│   │   ├── AssetTypes.tsx            # Asset types management
│   │   ├── BuildingsList.tsx         # Buildings management
│   │   ├── MeasurementHistory.tsx    # Historical measurements
│   │   ├── PDFViewer.tsx             # PDF/drawing viewer
│   │   ├── ValidationRulesManager.tsx # Validation rules admin
│   │   ├── LanguageSwitcher.tsx      # Language toggle
│   │   └── Toast.tsx                 # Notifications
│   ├── lib/
│   │   ├── api.ts           # API client
│   │   ├── db.ts            # Database client wrapper
│   │   ├── apiClient.ts     # FastAPI REST client
│   │   ├── validation.ts    # Validation engine
│   │   └── sanitize.ts      # Input sanitization
│   ├── i18n/
│   │   ├── i18n.ts          # i18next configuration
│   │   └── translations.ts  # Translation strings
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── migrations/
│   ├── migrations/          # Database migrations (150+ files)
│   └── data/                # Sample CSV data
├── scripts/
│   ├── setup_local.sh       # Mac/Linux DB setup
│   └── setup_local.ps1      # Windows DB setup
├── install_fresh_database.sql  # Fresh database installation (RECOMMENDED)
├── setup-local-db.sql          # Legacy database setup (deprecated)
├── postgrest.conf           # PostgREST configuration
└── package.json             # Dependencies
```

## 🗄️ Database Schema

### Core Tables

**`buildings`** - Building information
- `building_number` (BIGINT, unique) - Building identifier
- `tax_region` (TEXT) - Tax region codes (comma-separated)
- `has_elevator` (BOOLEAN) - Elevator presence
- `elevator`, `single_double_family`, `condo`, `basement`, `townhouses` (TEXT) - Building attributes
- `total_units`, `total_building_area`, `area_for_control` - Calculated fields

**`assets`** - Asset records
- `building_number`, `asset_id`, `measurement_date` (Composite PK)
- `payer_id` (TEXT) - Payer identifier
- `main_asset_type` (TEXT) - Primary asset type
- `asset_size` (NUMERIC) - Main asset area
- `sub_asset_X_type`, `sub_asset_X_size` (X=1-6) - Sub-asset hierarchy
- `structure_drawing` (TEXT) - Drawing file path

**`asset_types`** - Asset type definitions
- `asset_type` (TEXT, unique) - Type code
- `name` (TEXT) - Type name
- `tax_region` (INTEGER) - Applicable tax region
- `min_size`, `max_size` (NUMERIC) - Size constraints
- Attribute requirements: `elevator`, `condo`, `basement`, etc.

**`validation_rules`** - Dynamic validation rules
- `rule_key` (TEXT, unique) - Rule identifier
- `entity_type`, `field_name` - Target field
- `rule_type` - Validation type (required, numeric, pattern, etc.)
- `value_numeric`, `value_text` - Rule parameters
- `error_message` - User-facing error message

**`asset_measurements`** - Historical measurements
- Links to assets for tracking changes over time

## 🛠️ Available Scripts

### Development
- `npm run dev` - Start development server (port 5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking

### Database
- `npm run db:setup` - Show database setup instructions
- `npm run db:backup` - Show backup commands
- `npm run db:restore` - Show restore commands

### Manual Database Operations
```bash
# Backup
pg_dump -U postgres buildings_manager > backup.sql

# Restore
psql -U postgres buildings_manager < backup.sql

# Import CSV
psql -U postgres -d buildings_manager
\copy asset_types FROM 'data/assettypes.csv' DELIMITER ',' CSV HEADER;
```

## 🔧 Configuration

### Application URL

### Environment Variables

- **Backend** (`backend/.env`): `DATABASE_URL`, `SECRET_KEY`, etc. (see `backend/.env.local.example`).
- **Frontend**: API is same origin only: requests go to `http://<host>/api/...`. When serving the built app, use Nginx (or a proxy) so `/api` is proxied to the backend. Do not set `VITE_API_BASE_URL` unless the API is on another origin.

## 💻 Technologies Used

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **AG Grid React** - High-performance data grid
- **i18next** - Internationalization
- **react-pdf** - PDF viewing
- **Lucide React** - Icon library
### Backend & database
- **FastAPI (Python)** - REST API
- **PostgreSQL** - Database
- **Nginx** - Serves frontend and proxies `/api` to FastAPI (optional; dev uses Vite proxy)

## 🔍 Key Features Explained

### Asset Hierarchy
- **Simple Assets**: Basic asset with one type and size
- **Complex Assets (199/299)**: Multi-component assets with 2-6 sub-assets
- Sub-asset sizes must sum to main asset size

### Validation System
- Database-driven rules loaded at runtime
- Field-level validation (required, numeric, pattern, range)
- Cross-table validation (foreign key checks)
- Custom business logic validation
- Real-time feedback in UI

### Measurement History
- Track asset measurements over time
- Compare historical data
- Date-based versioning using composite keys

### CSV Import
- Bulk import assets and asset types
- Column mapping and validation
- Error reporting and rollback

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# List databases
psql -U postgres -l

# Connect to database
psql -U postgres -d buildings_manager
```

### Common Errors

**"password authentication failed"**
- Check PostgreSQL password in `.env`
- Verify user has access: `ALTER USER postgres WITH PASSWORD 'your_password';`

**"database does not exist"**
- Create database: `createdb -U postgres buildings_manager`
- Or run setup script: `./scripts/setup_local.sh`

**"Cannot find module 'vite'"**
- Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`

**Build fails**
- Check Node.js version: `node --version` (should be 18+)
- Clear cache: `rm -rf .vite dist`
- Run typecheck: `npm run typecheck`

### Getting Help
1. Check the browser console for errors
2. Review PostgreSQL logs: `sudo tail -f /var/log/postgresql/*.log`
3. Verify `.env` configuration
4. See [LOCAL_SETUP.md](LOCAL_SETUP.md) for detailed troubleshooting

## 🚀 Production deployment (local)

Default run is **Vite dev server + FastAPI** (no Nginx). For production-like serving with Nginx (optional):

1. Set up PostgreSQL and run migrations: `.\scripts\setup_local.ps1` (Windows) or `./scripts/setup_local.sh` (Linux).
2. Configure `backend/.env` and run FastAPI on port 8000.
3. *(Optional)* Build and deploy frontend to Nginx: `npm run build` then `.\nginx\deploy-frontend.ps1` (Windows) or `./nginx/deploy-frontend.sh` (Linux). See [nginx/README.md](nginx/README.md).
4. See [docs/LOCAL_INSTALL.md](docs/LOCAL_INSTALL.md).

## 📝 Data Model Notes

- **Building numbers** are unique identifiers (BIGINT)
- **Asset IDs** are unique within a building
- **Measurement dates** use DD/MM/YYYY format as TEXT
- **Tax regions** can be single (10, 20, 30, 40) or combined (10,40, 20,40, 30,40)
- **Asset types 199 and 299** are complex types requiring sub-assets
- All areas are stored as NUMERIC for precision

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with React and TypeScript
- Local stack: Postgres + FastAPI (+ optional Nginx)
- AG Grid for data grid functionality
- Tailwind CSS for styling
