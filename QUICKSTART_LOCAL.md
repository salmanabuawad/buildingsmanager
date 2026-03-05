# Quick Start - Local PostgreSQL Setup

Get up and running with a local PostgreSQL database in 5 minutes!

## 🚀 Quick Setup (Automated)

### Mac/Linux
```bash
# 1. Run the setup script
./scripts/setup-db.sh

# 2. Install dependencies
npm install

# 3. Start the app
npm run dev
```

### Windows
```cmd
REM 1. Run the setup script
.\scripts\setup-db.bat

REM 2. Install dependencies
npm install

REM 3. Start the app
npm run dev
```

That's it! Your app should now be running at `http://localhost:5173`

## 📋 Prerequisites

Before running the setup script, make sure you have:

1. **PostgreSQL installed** (version 12+)
   - Mac: `brew install postgresql@15`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`
   - Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)

2. **PostgreSQL running**
   - Mac: `brew services start postgresql@15`
   - Linux: `sudo systemctl start postgresql`
   - Windows: Service should start automatically after install

3. **Node.js and npm** (version 18+)

## ⚙️ What the Setup Script Does

1. ✅ Checks PostgreSQL installation
2. ✅ Starts PostgreSQL if not running
3. ✅ Creates `buildings_manager` database
4. ✅ Sets up all tables and schema
5. ✅ Creates `.env` file with your settings
6. ✅ Adds sample validation rules

## 🔧 Manual Setup (If Script Fails)

### Step 1: Create Database
```bash
createdb -U postgres buildings_manager
```

### Step 2: Run SQL Setup
```bash
psql -U postgres -d buildings_manager -f setup-local-db.sql
```

### Step 3: Create .env File
```bash
cp .env.local.example .env
```

Edit `.env` and update with your PostgreSQL password:
```env
VITE_USE_LOCAL_DB=true
VITE_LOCAL_DB_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/buildings_manager
```

### Step 4: Install and Run
```bash
npm install
npm run dev
```

## 🎯 Using PostgREST (Optional but Recommended)

For full compatibility with the Supabase client, install PostgREST:

### Mac
```bash
brew install postgrest
postgrest postgrest.conf
```

### Linux
```bash
# Download and install
wget https://github.com/PostgREST/postgrest/releases/download/v11.2.2/postgrest-v11.2.2-linux-static-x64.tar.xz
tar -xf postgrest-v11.2.2-linux-static-x64.tar.xz
sudo mv postgrest /usr/local/bin/

# Run
postgrest postgrest.conf
```

Then update `.env`:
```env
VITE_LOCAL_DB_URL=http://localhost:3000
```

## 📊 Importing Data

### Using CSV Import (Recommended)
1. Start the app
2. Navigate to Assets or Asset Types
3. Click "Import CSV"
4. Select your CSV file

### Using psql
```bash
psql -U postgres -d buildings_manager

\copy asset_types FROM 'data/assettypes.csv' DELIMITER ',' CSV HEADER;
\copy assets FROM 'data/asset.csv' DELIMITER ',' CSV HEADER;
```

## 🔄 Switching Between Local and Supabase

### Use Local Database
Edit `.env`:
```env
VITE_USE_LOCAL_DB=true
```

### Use Supabase
Edit `.env`:
```env
VITE_USE_LOCAL_DB=false
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Restart the dev server after changing.

## 🛠️ Troubleshooting

### "PostgreSQL is not installed"
- Install PostgreSQL first (see Prerequisites)
- Make sure `psql` is in your PATH

### "Cannot connect to PostgreSQL"
- Check if PostgreSQL is running: `pg_isready`
- Verify your password
- Check PostgreSQL logs

### "Database already exists"
- The script will ask if you want to drop and recreate
- Or manually: `dropdb -U postgres buildings_manager`

### "Port 5432 already in use"
- Another PostgreSQL instance is running
- Stop it or use a different port in `.env`

## 📚 Additional Resources

- **Full Setup Guide**: See `LOCAL_SETUP.md` for detailed instructions
- **Database Schema**: See `setup-local-db.sql` for table definitions
- **PostgREST Config**: See `postgrest.conf` for API settings

## 💾 Backup Your Data

### Create Backup
```bash
pg_dump -U postgres buildings_manager > backup.sql
```

### Restore Backup
```bash
psql -U postgres buildings_manager < backup.sql
```

## 🎉 You're Ready!

Your local development environment is set up. Start building!

```bash
npm run dev
```

Visit: `http://localhost:5173`

---

**Need Help?**
- Check `LOCAL_SETUP.md` for detailed troubleshooting
- Review PostgreSQL logs for connection issues
- Verify `.env` settings match your PostgreSQL configuration
