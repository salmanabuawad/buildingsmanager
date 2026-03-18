# Data migration: extract from source server and replace data on new server

This folder contains scripts to export **assets, buildings, asset files (metadata), assets_history, and audit** (and related tables) from the current server and import them on a new server, replacing existing data.

## Tables included

- **buildings** – building records  
- **assets** – asset records (current state)  
- **assets_history** – measurement history  
- **audit** – audit log (distribution/transfer history, etc.)  
- **asset_files** – file metadata (paths; actual files must be copied separately if stored on disk)  
- **asset_types** – asset type definitions  
- **address_list** – addresses  
- **validation_rules** – validation rules  
- **field_configurations** – grid field config  
- **system_configuration** – UI/config (e.g. ui_config)  
- **users** / **user_roles** – if you want to migrate users (optional)

## Prerequisites

- SSH access to **source** server (e.g. profile.wavelync.com / 185.229.226.37)
- SSH (or direct) access to **new** server and its Postgres
- Source and target Postgres: same major version recommended
- On both: `pg_dump` and `psql` available (or run from a machine that can connect to both DBs)

## 1. Get DB connection details

On the **source** server, the backend usually gets DB URL from env, e.g.:

```bash
# On source server
sudo -u profilegroup cat /home/profilegroup/app/.env 2>/dev/null | grep -i database
# or
sudo cat /etc/systemd/system/buildingsmanager.service.d/*.conf 2>/dev/null
```

You need: `DB_HOST`, `DB_NAME`, `DB_USER`. Password from env or `.pgpass`.

Set these for the scripts (see below).

## 2. Export from source server

Run the export script **on the source server** (or from your machine via SSH so it runs there). It will create a single SQL dump file with data only.

**Option A – run via SSH from Windows (PowerShell):**

```powershell
# Upload the export script, then run it on the server (replace DB_NAME/DB_USER if needed)
scp scripts/migrate-data/export-tables.sh root@185.229.226.37:/tmp/
ssh root@185.229.226.37 "DB_NAME=your_db_name DB_USER=your_db_user /bin/bash /tmp/export-tables.sh"
# Then download the dump
scp root@185.229.226.37:/tmp/buildingsmanager_data_export.sql ./scripts/migrate-data/
```

**Option B – run directly on the source server:**

```bash
cd /path/to/buildingsmanager
export DB_NAME=your_db_name
export DB_USER=your_db_user
# export PGPASSWORD=... if needed
bash scripts/migrate-data/export-tables.sh
# Copy buildingsmanager_data_export.sql to the new server or your machine
```

Output file: `buildingsmanager_data_export.sql` (data-only INSERTs for the tables above).

## 3. Asset files (binary files on disk)

If asset files are stored on the **filesystem** (not only in DB):

- On source: note the storage root (e.g. `/home/profilegroup/app/uploads` or path from backend config).
- Copy to new server, e.g.:
  ```bash
  rsync -avz --progress root@185.229.226.37:/path/to/asset-files/ root@NEW_SERVER:/path/to/asset-files/
  ```
- Configure the new backend to use the same path (or the new path and update `asset_files.file_path` if needed).

If files are in **Azure Blob** (or other cloud), copy via Azure CLI/SDK or the provider’s tool; the `asset_files` table only stores metadata.

## 4. Import on new server (replace existing data)

1. Copy `buildingsmanager_data_export.sql` to the new server.
2. On the **new** server, set DB connection and run the import script:

```bash
export DB_NAME=your_new_db_name
export DB_USER=your_new_db_user
bash scripts/migrate-data/import-replace-data.sh
```

The import script will:

- Truncate (or delete) the relevant tables in an order that respects FKs.
- Load the data from the dump.
- Optionally reset sequences.

**Warning:** This **replaces** data in those tables on the new server. Back up the new server DB first if it already has data you care about.

## 5. After import

- Restart the backend on the new server.
- If file paths changed, update `asset_files.file_path` or backend config so the app can resolve files.
- Run any backend-specific migrations if the new server schema is newer.

## MCP (Supabase) → new server

To copy **assets, buildings, assets_history, and audit** from the Supabase database (the one your MCP **user-supabase** is connected to) to the new server DB:

1. **Get the Supabase Postgres URL** (source):  
   Supabase Dashboard → Project Settings → Database → Connection string (URI).  
   Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

2. **Set env and run the copy script** (from repo root):

   ```powershell
   $env:SOURCE_DATABASE_URL = "postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
   $env:TARGET_DATABASE_URL = "postgresql://user:pass@new-server-host:5432/default"
   python scripts/migrate-data/copy_mcp_to_new_server.py --replace
   ```

   Options:
   - `--replace` – Truncate target tables (assets_history, assets, buildings, audit) then copy. Use for a full replace.
   - `--with-users` – Also copy the `users` table so `audit.user_id` and other FKs resolve. Use if the new server does not already have the same users.

3. **Schema**: The new server must have the same tables and columns as Supabase (apply the same migrations first). You can use the backend’s `DATABASE_URL` as `TARGET_DATABASE_URL`. The script copies in FK order: `users` (if used) → `audit` → `buildings` → `assets` → `assets_history` → `asset_files`. The JSON import script (`import_from_json.py`) also supports `asset_files`; use `--only asset_files` to load just that table after exporting it from MCP.

## Copy asset file binaries from Supabase storage to new server

After migrating **asset_files** metadata (via `copy_mcp_to_new_server.py` or `import_from_json.py`), the rows still point to Supabase storage URLs. To put the actual files on the new server’s local disk (so the backend can serve them from `ASSET_FILES_STORAGE_PATH`):

1. **On the new server**, ensure the storage directory exists and the app user can write to it:
   ```bash
   sudo mkdir -p /home/profilegroup/app/asset_files_storage
   sudo chown profilegroup:profilegroup /home/profilegroup/app/asset_files_storage
   ```

2. Install dependencies and run the copy script (use the same `TARGET_DATABASE_URL` as your backend, or the one you used for import):
   ```bash
   pip install psycopg2-binary requests
   export TARGET_DATABASE_URL="postgresql://user:pass@localhost:5432/default"
   export ASSET_FILES_STORAGE_PATH="/home/profilegroup/app/asset_files_storage"
   python3 scripts/migrate-data/copy_asset_files_from_supabase.py
   ```

3. **Options**
   - `--dry-run` – Only list which files would be downloaded; no writes.
   - `--update-db` – After copying each file, set `asset_files.file_path` to the relative path (e.g. `123/file.pdf`) so the backend uses the local path.

The script reads `asset_files` from the target DB. For each row whose `file_url` or `file_path` is a Supabase URL (e.g. `.../structure-drawings/123/filename.pdf`), it downloads the file and writes it to `ASSET_FILES_STORAGE_PATH/123/filename.pdf`. The backend already resolves such paths for download/view, so once files are in place they are served locally.
