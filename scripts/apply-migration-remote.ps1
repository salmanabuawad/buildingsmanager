# Apply a single migration on the remote server.
# Uses DATABASE_URL from remote backend/.env - no password prompt.
#
# Usage: .\scripts\apply-migration-remote.ps1 [migration-filename]
# Default: 20260311000000_add_inspection_tasks_manager_field_config.sql

$ErrorActionPreference = "Stop"
$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH } else { "~/buildingsmanager" }
$Remote = "${RemoteUser}@${RemoteHost}"
$SshOpts = "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes"

$MigrationFile = if ($args[0]) { $args[0] } else { "20260311000000_add_inspection_tasks_manager_field_config.sql" }

Write-Host "Applying migration on remote: $MigrationFile" -ForegroundColor Cyan
Write-Host "Remote: $Remote" -ForegroundColor Gray
Write-Host ""

# Load DATABASE_URL from remote .env and run migration (single line for SSH)
# Load DATABASE_URL from backend/.env and apply migration
# PowerShell: `$ sends literal $ to ssh; remote bash expands $DATABASE_URL
$Cmd = "cd $RemotePath && export DATABASE_URL=`$(grep -E '^DATABASE_URL=' backend/.env 2>/dev/null | cut -d= -f2- | tr -d '\r' | head -1) && psql `"`$DATABASE_URL`" -f migrations/$MigrationFile"

ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $Remote $Cmd
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Migration failed. Check SSH access and that backend/.env exists on remote." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "Migration applied." -ForegroundColor Green
