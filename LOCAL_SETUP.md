# Local PostgreSQL Setup Guide

This guide will help you set up the Buildings Manager application to work with a local PostgreSQL database.

## Prerequisites

1. **PostgreSQL** - Install PostgreSQL 12 or higher
   - **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
   - **Mac**: `brew install postgresql@15`
   - **Linux**: `sudo apt-get install postgresql postgresql-contrib`

2. **Node.js** - Version 18 or higher
3. **npm** - Comes with Node.js

## Step 1: Install and Start PostgreSQL

### Windows
1. Download and install PostgreSQL from the official website
2. During installation, remember your postgres user password
3. PostgreSQL service should start automatically

### Mac (using Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Linux
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## Step 2: Create Database

Open a terminal and run:

```bash
# Access PostgreSQL as postgres user
# Windows: Use SQL Shell (psql) from Start Menu
# Mac/Linux:
sudo -u postgres psql

# In psql, run:
CREATE DATABASE buildings_manager;

# Exit psql
\q
```

## Step 3: Set Up Database Schema

Run the setup script to create all tables:

```bash
# From the project root directory
psql -U postgres -d buildings_manager -f setup-local-db.sql
```

You'll be prompted for your PostgreSQL password.

**Alternative method using psql:**
```bash
sudo -u postgres psql buildings_manager < setup-local-db.sql
```

## Step 4: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.local.example .env
```

2. Edit `.env` file with your database settings:
```env
# Enable local database
VITE_USE_LOCAL_DB=true

# Update with your PostgreSQL credentials
VITE_LOCAL_DB_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/buildings_manager

# Keep Supabase settings empty or for production fallback
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**Important**: Replace `YOUR_PASSWORD` with your PostgreSQL password.

## Step 5: Install Dependencies

```bash
npm install
```

## Step 6: Run the Application

```bash
npm run dev
```

The application should now be running at `http://localhost:5173`

## Using PostgREST (Recommended for Full Compatibility)

The application uses Supabase client which expects a REST API. For full compatibility with local PostgreSQL, install PostgREST:

### Install PostgREST

**Mac:**
```bash
brew install postgrest
```

**Linux:**
```bash
# Download from https://github.com/PostgREST/postgrest/releases
wget https://github.com/PostgREST/postgrest/releases/download/v11.2.2/postgrest-v11.2.2-linux-static-x64.tar.xz
tar -xf postgrest-v11.2.2-linux-static-x64.tar.xz
sudo mv postgrest /usr/local/bin/
```

**Windows:**
Download from [PostgREST releases](https://github.com/PostgREST/postgrest/releases)

### Configure PostgREST

1. Create a `postgrest.conf` file in the project root:

```conf
db-uri = "postgres://postgres:YOUR_PASSWORD@localhost:5432/buildings_manager"
db-schema = "public"
db-anon-role = "postgres"
server-port = 3000
```

2. Start PostgREST:
```bash
postgrest postgrest.conf
```

3. Update your `.env` to use PostgREST:
```env
VITE_USE_LOCAL_DB=true
VITE_LOCAL_DB_URL=http://localhost:3000
```

## Troubleshooting

### Connection Issues

**Error: "password authentication failed"**
- Check your PostgreSQL password in `.env`
- Verify PostgreSQL is running: `sudo systemctl status postgresql`

**Error: "database does not exist"**
- Create the database: `createdb -U postgres buildings_manager`

**Error: "port 5432 is in use"**
- Another PostgreSQL instance is running
- Find and stop it, or use a different port

### Permission Issues

**Error: "permission denied"**
- Make sure the postgres user has access:
```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE buildings_manager TO postgres;
```

### Data Loading

To import CSV data:

```bash
# From psql
\copy asset_types FROM '/path/to/data/assettypes.csv' DELIMITER ',' CSV HEADER;
\copy assets FROM '/path/to/data/asset.csv' DELIMITER ',' CSV HEADER;
```

## Switching Between Local and Supabase

To switch back to Supabase:
1. Edit `.env`:
```env
VITE_USE_LOCAL_DB=false
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

2. Restart the dev server

## Backup and Restore

### Backup
```bash
pg_dump -U postgres buildings_manager > backup.sql
```

### Restore
```bash
psql -U postgres buildings_manager < backup.sql
```

## Database Management Tools

- **pgAdmin** - GUI tool for PostgreSQL management
- **DBeaver** - Universal database tool
- **TablePlus** - Modern database GUI (Mac/Windows)
- **psql** - Command-line tool (comes with PostgreSQL)

## Next Steps

1. Import your CSV data using the application's import feature
2. Set up validation rules through the ValidationRulesManager component
3. Start managing your buildings and assets

## Support

For issues:
1. Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-15-main.log`
2. Verify database connection: `psql -U postgres -d buildings_manager`
3. Check application console for errors

## Production Deployment

For production, continue using Supabase as it provides:
- Automatic backups
- Real-time subscriptions
- Row Level Security
- Automatic API generation
- File storage
- Authentication

This local setup is for development and testing purposes.
