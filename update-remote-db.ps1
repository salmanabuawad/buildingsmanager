# Update remote database only – sync migrations and run them on the production server.
# Does NOT rebuild frontend or restart services.
#
# Usage:
#   .\update-remote-db.ps1
#
# Env vars (optional):
#   REMOTE_HOST  - default: 185.229.226.37
#   REMOTE_USER  - default: asset_flow
#   REMOTE_PATH  - default: ~/buildingsmanager

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH } else { "~/buildingsmanager" }
$Remote = "${RemoteUser}@${RemoteHost}"

Write-Host "Remote DB update: $Remote" -ForegroundColor Cyan
Write-Host ""

# Sync migrations and standalone scripts to remote
Write-Host "[1/2] Syncing migrations to $Remote..." -ForegroundColor Yellow
$Rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($Rsync) {
    rsync -avz migrations/ "${Remote}:${RemotePath}/migrations/"
    if ($LASTEXITCODE -eq 0) { rsync -avz standalone/ "${Remote}:${RemotePath}/standalone/" }
}
if (-not $Rsync -or $LASTEXITCODE -ne 0) {
    tar -cf - migrations standalone 2>$null | ssh $Remote "mkdir -p $RemotePath && cd $RemotePath && tar -xf -"
}
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Sync OK." -ForegroundColor Green
Write-Host ""

# Run migrations on remote
Write-Host "[2/2] Running migrations on server..." -ForegroundColor Yellow
$MigrateCmd = @"
cd $RemotePath
if [ -f backend/.env ]; then set -a; source backend/.env; set +a; fi
if [ -z "`$DATABASE_URL" ]; then echo "Error: DATABASE_URL not set."; exit 1; fi
export PGHOST=localhost
chmod +x standalone/apply_migrations.sh 2>/dev/null || true
./standalone/apply_migrations.sh && psql "`$DATABASE_URL" -f standalone/post_migration_standalone.sql
"@
$MigrateCmd | ssh $Remote "bash -s"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "Remote DB update complete." -ForegroundColor Green
