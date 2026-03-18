# Deploy buildingsmanager backend to profile.wavelync.com server
# Default: root@185.229.226.37, app path /home/profilegroup/app (code synced to .../backend/)
# Override: DEPLOY_HOST, DEPLOY_USER, BACKEND_REMOTE_PATH (see DEPLOY_SERVER.md)
# Skip confirmation: $env:DEPLOY_SKIP_CONFIRM = "1"

$ErrorActionPreference = "Stop"
$SERVER = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "185.229.226.37" }
$USER = if ($env:DEPLOY_USER) { $env:DEPLOY_USER } else { "root" }
$REMOTE_APP = if ($env:BACKEND_REMOTE_PATH) { $env:BACKEND_REMOTE_PATH.TrimEnd("/") } else { "/home/profilegroup/app" }
$REMOTE_TEMP = "/tmp/backend_buildingsmanager_deploy"

Write-Host ""
Write-Host "========== BACKEND DEPLOY TARGET ==========" -ForegroundColor Yellow
Write-Host "  Server:     $USER@$SERVER"
Write-Host "  App path:   $REMOTE_APP"
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""

if (-not $env:DEPLOY_SKIP_CONFIRM) {
    $confirm = Read-Host "Deploy backend to the above target? [y/N]"
    if ($confirm -notmatch '^[yY]') {
        Write-Host "Deploy cancelled." -ForegroundColor Yellow
        exit 0
    }
}

$backendPath = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path $backendPath)) {
    Write-Host "Error: backend folder not found at $backendPath" -ForegroundColor Red
    exit 1
}

Write-Host "Uploading backend to ${USER}@${SERVER}:${REMOTE_TEMP} ..." -ForegroundColor Cyan
# Upload backend folder (server gets REMOTE_TEMP/backend/...); we sync from REMOTE_TEMP/backend/ so app lands at REMOTE_APP/app/
& scp -r "$backendPath" "${USER}@${SERVER}:${REMOTE_TEMP}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP failed. Ensure SSH access: ssh $USER@$SERVER" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Syncing to $REMOTE_APP and restarting service..." -ForegroundColor Cyan
# Sync from REMOTE_TEMP/backend/ only (never fallback to REMOTE_TEMP root to avoid syncing wrong paths)
# SCP creates REMOTE_TEMP/backend/ when we upload the backend folder; some setups put contents in REMOTE_TEMP directly
$remoteCmd = 'set -e; sudo mkdir -p ' + $REMOTE_APP + '/backend; SRC=' + $REMOTE_TEMP + '/backend; if [ ! -d "$SRC" ]; then SRC=' + $REMOTE_TEMP + '; fi; if [ ! -f "$SRC/requirements.txt" ]; then echo "Error: upload dir missing - no requirements.txt in source."; exit 1; fi; rsync -av --exclude=.env --exclude=venv --exclude=__pycache__ --exclude=*.pyc "$SRC/" ' + $REMOTE_APP + '/backend/; rm -rf ' + $REMOTE_TEMP + '; cd ' + $REMOTE_APP + '/backend && sudo -u profilegroup pip install -q -r requirements.txt 2>/dev/null || true; sudo systemctl restart buildingsmanager 2>/dev/null || sudo systemctl restart buildingsmanager.service 2>/dev/null || true; echo Backend deploy done.'
& ssh "${USER}@${SERVER}" $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH command failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Backend deploy complete. Service restarted." -ForegroundColor Green
