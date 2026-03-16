# Deploy buildingsmanager frontend to 185.229.226.37
# Usage:
#   .\deploy-to-server.ps1
#   $env:DEPLOY_USER="ubuntu"; $env:DEPLOY_PATH="/var/www/html"; .\deploy-to-server.ps1

$ErrorActionPreference = "Stop"
$SERVER = "185.229.226.37"
$USER = if ($env:DEPLOY_USER) { $env:DEPLOY_USER } else { "root" }
$REMOTE_PATH = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH.TrimEnd("/") } else { "/var/www/html" }

Write-Host "Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying to ${USER}@${SERVER}:${REMOTE_PATH}" -ForegroundColor Cyan
# Create remote dir if needed, then sync dist contents
$distPath = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $distPath)) {
    Write-Host "Error: dist folder not found. Run npm run build first." -ForegroundColor Red
    exit 1
}

# Copy dist folder to server temp, then move contents to REMOTE_PATH
$remoteTemp = "/tmp/buildingsmanager_deploy"
$scpTarget = "${USER}@${SERVER}:${remoteTemp}"
Write-Host "Uploading dist to $scpTarget ..."
& scp -r $distPath $scpTarget
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP failed. Ensure you have SSH key access: ssh $USER@$SERVER" -ForegroundColor Red
    exit $LASTEXITCODE
}

$remoteCmd = "mkdir -p $REMOTE_PATH && rm -rf ${REMOTE_PATH}/* && mv ${remoteTemp}/dist/* $REMOTE_PATH/ && rm -rf $remoteTemp"
Write-Host "Moving files into place on server..."
& ssh "${USER}@${SERVER}" $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH command failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Deploy complete. App should be at http://${SERVER}/" -ForegroundColor Green
