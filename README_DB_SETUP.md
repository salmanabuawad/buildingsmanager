# Database Setup Guide

This directory contains the complete database structure for the Buildings Manager application.

## Structure

```
.
├── init_db.sql              # Initial database schema (tables, constraints, indexes, triggers, functions)
├── migrations/              # Migration files (incremental changes)
│   └── 00000000000000_initial_schema.sql
├── seed/                    # Seed data
│   └── seed.sql            # All table data as INSERT statements
└── README_DB_SETUP.md      # This file
```

## Setup Instructions

### 1. Initial Setup (Fresh Database)

For a completely new database, run:

```sql
-- Step 1: Create schema
\i init_db.sql

-- Step 2: Load seed data (optional)
\i seed/seed.sql
```

### 2. Migration-Based Setup (Existing Database)

If you're working with an existing database that uses migrations:

```sql
-- Run migrations in order
\i migrations/00000000000000_initial_schema.sql
-- ... other migrations ...
```

### 3. Using Supabase

1. **Via Supabase Dashboard:**
   - Go to SQL Editor
   - Copy and paste `init_db.sql` content
   - Execute
   - (Optional) Copy and paste `seed/seed.sql` content
   - Execute

2. **Via Supabase CLI:**
   ```bash
   supabase db reset
   supabase migration up
   ```

## Files Description

### `init_db.sql`
- Complete consolidated database schema
- Includes all tables, indexes, constraints, triggers, and functions
- Based on `supabase/migrations/20260101000000_consolidated_initial_schema.sql`
- Safe to run on a fresh database

### `seed/seed.sql`
- Contains INSERT statements for all tables
- Generated from live Supabase database
- Includes:
  - `assets` (79 rows)
  - `buildings` (6 rows)
  - `asset_types` (163 rows)
  - `address_list` (1000 rows)
  - `validation_rules` (65 rows)
  - `users` (4 rows)
  - `asset_files` (12 rows)

### `migrations/`
- Directory for incremental migration files
- Follow naming convention: `YYYYMMDDHHMMSS_description.sql`
- Use for tracking schema changes over time

## Important Notes

⚠️ **WARNING:**
- `seed/seed.sql` will INSERT data. If tables already have data, you may get constraint violations.
- Consider using `TRUNCATE` or `DELETE` before inserting if needed.
- The seed data includes primary keys - conflicts will occur if data already exists.

## Schema Details

The database includes:

1. **Core Tables:**
   - `address_list` - Street addresses
   - `asset_types` - Asset type definitions
   - `validation_rules` - Dynamic validation rules
   - `buildings` - Building information
   - `assets` - Asset records
   - `assets_history` - Historical asset measurements
   - `field_configurations` - Field display configurations
   - `users` - Application users
   - `audit` - Audit trail

2. **Functions:**
   - `update_updated_at_column()` - Auto-update timestamps
   - `get_or_create_user_from_auth()` - User management
   - `update_building_total_area()` - Calculate building totals
   - `auto_set_distribution_flags_on_change()` - Distribution flag management
   - And more...

3. **Triggers:**
   - Auto-update timestamps
   - Auto-update building total area
   - Auto-set distribution flags

## Getting Complete Schema

To get the complete schema including all functions, triggers, and constraints from your Supabase instance:

1. Run `extract_full_schema.sql` in Supabase SQL Editor
2. Review the output
3. Update `init_db.sql` with any missing elements

## Next Steps

After setting up the database:

1. Verify all tables exist: `\dt` (in psql)
2. Check row counts: `SELECT 'assets' as table, COUNT(*) FROM assets UNION ALL ...`
3. Test functions: `SELECT get_or_create_user_from_auth();`
4. Review RLS policies: `\dp` (in psql)
