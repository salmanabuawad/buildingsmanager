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
- 🗄️ **PostgreSQL** - Self-hosted PostgreSQL with FastAPI backend

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI + PostgreSQL (self-hosted)
- **Data Grid**: AG Grid React
- **State Management**: React hooks
- **Validation**: Database-driven rules engine

## 📋 Prerequisites

Before running this project, ensure you have:

- **Node.js** v18 or higher
- **npm** v9 or higher
- **PostgreSQL** v12 or higher (for local development)

## ⚡ Quick Start

### Option 1: Local PostgreSQL (5 minutes)

**Mac/Linux:**
```bash
# Run automated setup
./scripts/setup-db.sh

# Install dependencies and start
npm install
npm run dev
```

**Windows:**
```cmd
REM Run automated setup
.\scripts\setup-db.bat

REM Install dependencies and start
npm install
npm run dev
```

**See [QUICKSTART_LOCAL.md](QUICKSTART_LOCAL.md) for detailed instructions**

The application will be available at `http://localhost:5173`

## 🚀 Deploy to production (profile.wavelync.com)

Build and deploy the frontend to the server (nginx serves from `/var/www/buildingsmanager`):

```powershell
npm run deploy:server
```

You’ll see the deploy target; type `y` to confirm. To skip the prompt: `$env:DEPLOY_SKIP_CONFIRM = "1"; npm run deploy:server`

**Full details:** [DEPLOY_SERVER.md](DEPLOY_SERVER.md) — target, SSH, overrides, and how to confirm you’re deploying to the right place.

## 📖 Documentation

- **[DEPLOY_SERVER.md](DEPLOY_SERVER.md)** - How to deploy to profile.wavelync.com (build, SCP, nginx path)
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
│   │   ├── validation.ts    # Validation engine
│   │   └── sanitize.ts      # Input sanitization
│   ├── i18n/
│   │   ├── i18n.ts          # i18next configuration
│   │   └── translations.ts  # Translation strings
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── scripts/
│   ├── setup-db.sh          # Mac/Linux setup script
│   └── setup-db.bat         # Windows setup script
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
\copy asset_types FROM 'scripts/data/assettypes.csv' DELIMITER ',' CSV HEADER;
```

## 🔧 Configuration

### Application URL

The application is deployed at: **https://buildingmanager.bolt.host/**

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_API_URL=https://your-server/api
```

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
### Backend
- **FastAPI** - Python REST API framework
- **PostgreSQL** - Relational database

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
- Or run setup script: `./scripts/setup-db.sh`

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

## 🚀 Production Deployment

1. Set up PostgreSQL on your server and run `install_fresh_database.sql` to create the schema
2. Deploy the FastAPI backend (`backend/`)
3. Configure environment variables with production credentials
4. Build and deploy the frontend: `npm run build`

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
- FastAPI backend with PostgreSQL
- AG Grid for data grid functionality
- Tailwind CSS for styling
