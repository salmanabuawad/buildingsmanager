# Fresh Database Installation Guide

This guide explains how to set up a fresh database installation for the Buildings Manager application.

## Quick Start

### Option 1: Automated Setup (Recommended)

**Mac/Linux:**
```bash
./scripts/setup-db.sh
```

**Windows:**
```cmd
.\scripts\setup-db.bat
```

### Option 2: Manual Installation

1. **Create the database:**
   ```bash
   createdb -U postgres buildings_manager
   ```

2. **Run the installation script:**
   ```bash
   psql -U postgres -d buildings_manager -f install_fresh_database.sql
   ```

3. **Configure environment variables:**
   Create a `.env` file:
   ```env
   VITE_USE_LOCAL_DB=true
   VITE_LOCAL_DB_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/buildings_manager
   ```

## What's Included

The `install_fresh_database.sql` script combines:

1. **Consolidated Initial Schema** (`supabase/migrations/20260101000000_consolidated_initial_schema.sql`)
   - All database tables
   - All indexes and constraints
   - All functions and triggers
   - All RLS policies
   - All enums

2. **Subsequent Migrations** (if any)
   - Any migrations that came after the consolidated schema

## Installation Scripts

### `install_fresh_database.sql`
- **Purpose**: Single SQL file for fresh installations
- **Usage**: Run on an empty database
- **Contains**: Consolidated schema + subsequent migrations
- **Use when**: Setting up a new environment

### `setup-local-db.sql` (Legacy)
- **Purpose**: Legacy setup script (outdated)
- **Status**: Deprecated, kept for backward compatibility
- **Use when**: Migrating from old setup (not recommended)

### `all_migrations_combined.sql`
- **Purpose**: Complete migration history (for reference)
- **Usage**: Not for fresh installations
- **Contains**: All individual migrations in chronological order
- **Use when**: Understanding migration history

## File Structure

```
install_fresh_database.sql          ← Use this for fresh installs
supabase/migrations/
  ├── 20260101000000_consolidated_initial_schema.sql  ← Base schema
  └── [other migrations...]                           ← Applied if needed
scripts/
  ├── setup-db.sh                   ← Automated setup (Mac/Linux)
  └── setup-db.bat                  ← Automated setup (Windows)
```

## Verification

After installation, verify that everything is set up correctly:

```sql
-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check functions
SELECT proname 
FROM pg_proc 
WHERE proname IN (
  'save_asset_transactional',
  'save_assets_bulk_transactional',
  'delete_asset_transactional',
  'log_audit_entry'
)
ORDER BY proname;

-- Check that key tables have data structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'assets' 
ORDER BY ordinal_position;
```

## Troubleshooting

### Error: "relation already exists"
- **Cause**: Database is not empty
- **Solution**: Drop and recreate the database, or use individual migration files

### Error: "permission denied"
- **Cause**: User doesn't have CREATE privileges
- **Solution**: Run as postgres superuser or grant necessary privileges

### Error: "syntax error at or near '\i'"
- **Cause**: Using SQL client that doesn't support psql meta-commands
- **Solution**: 
  - Use `psql` command line tool
  - Or manually copy contents of `supabase/migrations/20260101000000_consolidated_initial_schema.sql`

### Script fails partway through
- **Cause**: Migration conflict or database state issue
- **Solution**: 
  1. Check error message for specific issue
  2. Ensure database is completely empty
  3. Try dropping and recreating the database

## Migration Strategy

### For Fresh Installations
✅ Use `install_fresh_database.sql`

### For Existing Databases
✅ Use individual migration files in order:
```bash
# Run migrations in chronological order
for file in supabase/migrations/*.sql; do
  psql -U postgres -d buildings_manager -f "$file"
done
```

### For Production
✅ Use proper migration tracking tool (e.g., Flyway, Liquibase, or Supabase CLI)

## Next Steps

After installation:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the application:**
   ```bash
   npm run dev
   ```

3. **Optional: Seed initial data:**
   - Import addresses from `examples/sample_addresses.csv`
   - Import asset types from `examples/sample_asset_types.csv`

## Additional Resources

- See `LOCAL_SETUP.md` for detailed local development setup
- See `QUICKSTART_LOCAL.md` for quick start guide
- See `README.md` for general application information

