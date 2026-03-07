# Restart remote production servers (backend + nginx).
# Does NOT deploy code – use deploy-force.ps1 for full deploy.
#
# Usage: .\restart-remote-servers.ps1
#
# Env vars: REMOTE_HOST, REMOTE_USER

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$Remote = "${RemoteUser}@${RemoteHost}"

Write-Host "Restarting remote servers on $RemoteHost..." -ForegroundColor Cyan

& ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $Remote "sudo systemctl restart assetflow-backend && sudo systemctl reload nginx && echo OK"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SSH failed. Run once: .\setup-deploy-ssh.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Remote servers restarted." -ForegroundColor Green
Write-Host "  App:   http://${RemoteHost}/" -ForegroundColor Gray
Write-Host "  API:   http://${RemoteHost}/docs" -ForegroundColor Gray
