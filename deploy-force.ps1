# Force deploy - no host-key prompts, non-interactive where possible.
# Uses SSH options to auto-accept host keys and avoid connection prompts.
#
# Usage: .\deploy-force.ps1
#
# DB password (avoids interactive prompt):
#   Option A: $env:DB_PASSWORD = "your_password"; .\deploy-force.ps1
#   Option B: Create .deploy-db-password (one line = password), add to .gitignore
#
# Env vars: REMOTE_HOST, REMOTE_USER, REMOTE_PATH, DB_PASSWORD, PGPASSWORD

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH } else { "~/buildingsmanager" }
$Remote = "${RemoteUser}@${RemoteHost}"
$SshOpts = "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes"

Write-Host "Force deploy to remote: $Remote" -ForegroundColor Cyan
Write-Host ""

# Build
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Build OK." -ForegroundColor Green
Write-Host ""

# Sync (with force SSH options)
Write-Host "[2/3] Syncing code..." -ForegroundColor Yellow
$Rsync = Get-Command rsync -ErrorAction SilentlyContinue
$Synced = $false
if ($Rsync) {
    rsync -avz --delete -e "ssh $SshOpts" `
        --exclude=node_modules --exclude=backend/venv --exclude=.git --exclude=backend/__pycache__ --exclude=backend/storage --exclude=.deploy-db-password `
        "./" "${Remote}:${RemotePath}/"
    $Synced = ($LASTEXITCODE -eq 0)
}
if (-not $Synced) {
    # Fallback: tar to file + scp (avoids Windows pipe issues with tar|ssh)
    $TarFile = Join-Path $env:TEMP "deploy-buildingsmanager.tar"
    try {
        Write-Host "Using tar file + scp fallback..." -ForegroundColor Gray
        tar --exclude=node_modules --exclude=backend/venv --exclude=.git --exclude=backend/__pycache__ --exclude=backend/storage --exclude=.deploy-db-password -cf $TarFile .
        if ($LASTEXITCODE -eq 0 -and (Test-Path $TarFile)) {
            scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $TarFile "${Remote}:${RemotePath}/deploy.tar"
            if ($LASTEXITCODE -eq 0) {
                ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $Remote "mkdir -p $RemotePath && cd $RemotePath && tar -xf deploy.tar && rm deploy.tar"
                $Synced = ($LASTEXITCODE -eq 0)
            }
        }
    } finally {
        if (Test-Path $TarFile) { Remove-Item $TarFile -Force -ErrorAction SilentlyContinue }
    }
}
if (-not $Synced) {
    # Last resort: tar pipe (can fail on Windows)
    tar --exclude=node_modules --exclude=backend/venv --exclude=.git --exclude=.deploy-db-password -cf - . 2>$null | ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $Remote "mkdir -p $RemotePath && cd $RemotePath && tar -xf -"
    $Synced = ($LASTEXITCODE -eq 0)
}
if (-not $Synced) {
    Write-Host ""
    Write-Host "SSH failed (often: password required). Run this ONCE in your terminal:" -ForegroundColor Yellow
    Write-Host "  .\setup-deploy-ssh.ps1" -ForegroundColor Cyan
    Write-Host "Then deploy will work without prompts." -ForegroundColor Gray
    exit 1
}
Write-Host "Sync OK." -ForegroundColor Green
Write-Host ""

# Deploy on server
Write-Host "[3/3] Running deploy on server..." -ForegroundColor Yellow

# Get DB password: env var or .deploy-db-password file (avoids interactive prompt)
$DbPassword = $env:DB_PASSWORD
if (-not $DbPassword) { $DbPassword = $env:PGPASSWORD }
if (-not $DbPassword -and (Test-Path ".deploy-db-password")) {
    $DbPassword = (Get-Content ".deploy-db-password" -Raw).Trim()
}
if (-not $DbPassword) {
    Write-Host ""
    Write-Host "DB password not set. Deploy will prompt on server. To avoid:" -ForegroundColor Yellow
    Write-Host "  Option A: `$env:DB_PASSWORD = 'your_password'; .\deploy-force.ps1" -ForegroundColor Cyan
    Write-Host "  Option B: Create .deploy-db-password with password on first line" -ForegroundColor Cyan
    Write-Host ""
}

# Pass DB_PASSWORD via base64 to avoid shell escaping; remote decodes and exports
$BaseCmd = "cd $RemotePath && chmod +x scripts/deploy-production-ubuntu.sh && ./scripts/deploy-production-ubuntu.sh"
if ($DbPassword) {
    $B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($DbPassword))
    $DeployCmd = "export DB_PASSWORD=`$(echo '$B64' | base64 -d 2>/dev/null || echo '$B64' | base64 -D 2>/dev/null) && export PGPASSWORD=`$DB_PASSWORD && $BaseCmd"
} else {
    $DeployCmd = $BaseCmd
}

& ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes $Remote $DeployCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Deploy failed. Check SSH (.\setup-deploy-ssh.ps1) and DB password." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "App: http://${RemoteHost}/" -ForegroundColor Cyan
