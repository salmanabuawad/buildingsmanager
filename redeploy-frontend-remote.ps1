# Redeploy frontend only to remote Ubuntu server.
# Builds locally, copies dist to remote web root.
#
# Usage: .\redeploy-frontend-remote.ps1
#
# Env vars (optional): REMOTE_HOST, REMOTE_USER (default: 185.229.226.37, asset_flow)

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$Remote = "${RemoteUser}@${RemoteHost}"
$WebRoot = "/var/www/buildingsmanager"

Write-Host "Redeploy frontend to $Remote" -ForegroundColor Cyan
Write-Host ""

# 1. Build
Write-Host "[1/2] Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Build OK." -ForegroundColor Green
Write-Host ""

# 2. Copy to remote and deploy to web root
Write-Host "[2/2] Deploying dist to $WebRoot..." -ForegroundColor Yellow
$SshOpts = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=30", "-o", "BatchMode=yes")
& ssh @SshOpts $Remote "rm -rf ~/dist-temp && mkdir -p ~/dist-temp"
& scp @SshOpts -r dist/* "${Remote}:~/dist-temp/"
& ssh @SshOpts $Remote "sudo cp -r ~/dist-temp/* $WebRoot/ && sudo chown -R www-data:www-data $WebRoot && rm -rf ~/dist-temp && (sudo systemctl reload nginx 2>/dev/null || true)"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SSH failed (often: password required). Run this ONCE in your terminal:" -ForegroundColor Yellow
    Write-Host "  .\setup-deploy-ssh.ps1" -ForegroundColor Cyan
    Write-Host "Then deploy will work without prompts." -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Frontend redeployed. App: http://${RemoteHost}/" -ForegroundColor Green
