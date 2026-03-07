# Deploy Buildings Manager to remote Ubuntu server.
# Syncs code via scp, then runs the production deploy script on the server.
#
# Usage:
#   .\deploy-to-remote.ps1
#
# Env vars (optional):
#   REMOTE_HOST  - default: 185.229.226.37
#   REMOTE_USER  - default: asset_flow
#   REMOTE_PATH - default: ~/buildingsmanager

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH } else { "~/buildingsmanager" }
$Remote = "${RemoteUser}@${RemoteHost}"

Write-Host "Deploy to remote: $Remote" -ForegroundColor Cyan
Write-Host "Remote path: $RemotePath" -ForegroundColor Gray
Write-Host ""

# Build frontend locally first (validates build before upload)
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Build OK." -ForegroundColor Green
Write-Host ""

# Sync code to remote (exclude large/unnecessary dirs)
Write-Host "[2/3] Syncing code to $Remote..." -ForegroundColor Yellow
$RepoRoot = (Get-Location).Path
# Use rsync (WSL/Git Bash), or tar+ssh (Windows 10+ has tar)
$Rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($Rsync) {
    rsync -avz --delete `
        --exclude=node_modules --exclude=backend/venv --exclude=.git --exclude=backend/__pycache__ --exclude=backend/storage `
        "./" "${Remote}:${RemotePath}/"
} else {
    # tar + ssh: exclude dirs, stream to remote
    $Exclude = "node_modules", "backend/venv", ".git"
    tar --exclude=node_modules --exclude=backend/venv --exclude=.git -cf - . 2>$null | ssh $Remote "mkdir -p $RemotePath && cd $RemotePath && tar -xf -"
}
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Sync OK." -ForegroundColor Green
Write-Host ""

# Run deploy script on remote
Write-Host "[3/3] Running deploy on server..." -ForegroundColor Yellow
ssh $Remote "cd $RemotePath && chmod +x scripts/deploy-production-ubuntu.sh && ./scripts/deploy-production-ubuntu.sh"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "App: http://${RemoteHost}/" -ForegroundColor Cyan
