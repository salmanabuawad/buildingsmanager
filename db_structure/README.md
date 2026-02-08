# Database Structure Extraction

## Extracted Data

This directory contains the extracted database structure and seed data from the Supabase instance.

### Files Generated

1. **complete_structure.json** - Complete JSON structure with table metadata and all data
2. **seed_data.json** - Just the seed data in JSON format
3. **seed_data.sql** - SQL INSERT statements for all data

### Tables Extracted

The following tables were discovered and their data extracted:

- **assets** (79 rows)
- **buildings** (6 rows)
- **asset_types** (163 rows)
- **address_list** (1000 rows)
- **validation_rules** (65 rows)
- **users** (4 rows)
- **asset_files** (12 rows)

## Getting Complete Schema (Tables, Triggers, Constraints, Functions)

To get the complete database schema including:
- Table structures with column definitions
- Primary keys, foreign keys, unique constraints
- Indexes
- Functions/Procedures
- Triggers
- Sequences
- Views
- Row Level Security policies

**Run the SQL file `extract_full_schema.sql` in Supabase SQL Editor:**

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `extract_full_schema.sql`
4. Run each query section to get the complete schema

The SQL file contains 11 separate queries that will extract:
1. Tables and Columns
2. Primary Keys
3. Foreign Keys
4. Unique Constraints
5. Check Constraints
6. Indexes
7. Functions
8. Triggers
9. Sequences
10. Views
11. Row Level Security Policies

## Notes

- The data extraction was done using the REST API (anon key), which has read access to tables
- Some tables may not be accessible if RLS policies restrict access
- To get complete schema information, use the SQL queries in `extract_full_schema.sql` with appropriate database access
