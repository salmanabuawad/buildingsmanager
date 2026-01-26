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
- 🗄️ **PostgreSQL/Supabase** - Supports both local and cloud databases

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Database**: PostgreSQL (local) or Supabase (cloud)
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

### Option 2: Supabase Cloud

1. Create a `.env` file:
```env
VITE_USE_LOCAL_DB=false
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

2. Install and run:
```bash
npm install
npm run dev
```

The application will be available at `http://localhost:5173`

## 📖 Documentation

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
│   │   ├── supabase.ts      # Supabase configuration
│   │   ├── validation.ts    # Validation engine
│   │   └── sanitize.ts      # Input sanitization
│   ├── i18n/
│   │   ├── i18n.ts          # i18next configuration
│   │   └── translations.ts  # Translation strings
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── supabase/
│   ├── migrations/          # Database migrations (150+ files)
│   └── data/                # Sample CSV data
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
\copy asset_types FROM 'supabase/data/assettypes.csv' DELIMITER ',' CSV HEADER;
```

## 🔧 Configuration

### Application URL

The application is deployed at: **https://buildingmanager.bolt.host/**

### Environment Variables

Create a `.env` file in the project root:

**Supabase (Production):**
```env
VITE_USE_LOCAL_DB=false
VITE_SUPABASE_URL=https://cdsxuioesfqvzuvwlhrc.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Local PostgreSQL (Development):**
```env
VITE_USE_LOCAL_DB=true
VITE_LOCAL_DB_URL=postgresql://postgres:password@localhost:5432/buildings_manager
```

### PostgREST (Optional)

For full Supabase client compatibility with local PostgreSQL:

1. Install PostgREST:
   - Mac: `brew install postgrest`
   - Linux: Download from [PostgREST releases](https://github.com/PostgREST/postgrest/releases)

2. Run: `postgrest postgrest.conf`

3. Update `.env`: `VITE_LOCAL_DB_URL=http://localhost:3000`

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
- **@supabase/supabase-js** - Database client

### Database
- **PostgreSQL** - Relational database
- **Supabase** - Backend-as-a-Service (optional)
- **PostgREST** - REST API layer (optional)

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

### Using Supabase (Recommended)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Apply migrations from `supabase/migrations/` folder
3. Configure environment variables:
   ```env
   VITE_USE_LOCAL_DB=false
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Build and deploy:
   ```bash
   npm run build
   # Deploy dist/ folder to Netlify, Vercel, or any static host
   ```

### Using Self-Hosted PostgreSQL

1. Set up PostgreSQL on your server
2. Run `install_fresh_database.sql` to create schema (or use `./scripts/setup-db.sh`)
3. Configure environment variables with production credentials
4. Use PostgREST for REST API layer
5. Deploy with proper CORS and security settings

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
- Uses Supabase for cloud database
- AG Grid for data grid functionality
- Tailwind CSS for styling
