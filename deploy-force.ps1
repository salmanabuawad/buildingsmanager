# Force deploy - no host-key prompts, non-interactive where possible.
# Uses SSH options to auto-accept host keys and avoid connection prompts.
#
# Usage: .\deploy-force.ps1
#
# DB password (avoids interactive prompt):
#   Option A: $env:DB_PASSWORD = "your_password"; .\deploy-force.ps1
#   Option B: Create .deploy-db-password (one line = password), add to .gitignore
#
# Frontend-only (skip full deploy, sync dist only - faster, smaller transfer):
#   $env:FRONTEND_ONLY = "1"; .\deploy-force.ps1
#
# Env vars: REMOTE_HOST, REMOTE_USER, REMOTE_PATH, DB_PASSWORD, PGPASSWORD, FRONTEND_ONLY

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH } else { "~/buildingsmanager" }
$Remote = "${RemoteUser}@${RemoteHost}"
$WebRoot = "/var/www/buildingsmanager"

# SSH options: keep-alive prevents "Connection reset" during long transfers
# Use array for ssh/scp (each -o must be separate arg); string for rsync -e
$SshOptsArray = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=60", "-o", "BatchMode=yes", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=10")
$SshOptsStr = ($SshOptsArray -join " ")

Write-Host "Force deploy to remote: $Remote" -ForegroundColor Cyan
Write-Host ""

# Build
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Build OK." -ForegroundColor Green
Write-Host ""

# Frontend-only: sync dist directly (small transfer, no full deploy)
if ($env:FRONTEND_ONLY -eq "1") {
    Write-Host "[2/3] Deploying frontend only (dist to $WebRoot)..." -ForegroundColor Yellow
    & ssh @SshOptsArray $Remote "rm -rf ~/dist-temp 2>/dev/null; mkdir -p ~/dist-temp"
    if ($LASTEXITCODE -eq 0) {
        & scp @SshOptsArray -r dist/* "${Remote}:~/dist-temp/"
    }
    if ($LASTEXITCODE -eq 0) {
        & ssh @SshOptsArray $Remote "sudo cp -r ~/dist-temp/* $WebRoot/ && sudo chown -R www-data:www-data $WebRoot && rm -rf ~/dist-temp && (sudo systemctl reload nginx 2>/dev/null || true)"
    }
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Frontend deployed. App: https://wavelync.com" -ForegroundColor Green
        exit 0
    }
    Write-Host "Frontend-only deploy failed." -ForegroundColor Red
    exit 1
}

# Sync (with retries and keep-alive)
Write-Host "[2/3] Syncing code..." -ForegroundColor Yellow
$Rsync = Get-Command rsync -ErrorAction SilentlyContinue
$Synced = $false
$MaxRetries = 3
$Excludes = @(
    "node_modules", "backend/venv", ".git", "backend/__pycache__", "backend/storage",
    ".deploy-db-password", "dist", ".cursor", "agent-transcripts", "mcps",
    "*.log", "coverage", ".pytest_cache", "htmlcov", ".coverage", "playwright-report", "test-results"
)
$RsyncExclude = ($Excludes | ForEach-Object { "--exclude=$_" }) -join " "
$TarExclude = ($Excludes | ForEach-Object { "--exclude=$_" }) -join " "

for ($attempt = 1; $attempt -le $MaxRetries -and -not $Synced; $attempt++) {
    if ($attempt -gt 1) { Write-Host "  Retry $attempt of $MaxRetries..." -ForegroundColor Gray }
    if ($Rsync) {
        rsync -avz --delete -e "ssh $SshOptsStr" $RsyncExclude.Split() "./" "${Remote}:${RemotePath}/"
        $Synced = ($LASTEXITCODE -eq 0)
    }
}

if (-not $Synced) {
    # Fallback: compressed tar + scp (smaller = faster, less likely to timeout)
    $TarFile = Join-Path $env:TEMP "deploy-buildingsmanager.tar.gz"
    try {
        Write-Host "Using compressed tar + scp fallback..." -ForegroundColor Gray
        tar $TarExclude.Split() -czf $TarFile .
        if ($LASTEXITCODE -eq 0 -and (Test-Path $TarFile)) {
            $sizeMB = [math]::Round((Get-Item $TarFile).Length / 1MB, 2)
            Write-Host "  Archive: $sizeMB MB" -ForegroundColor Gray
            for ($attempt = 1; $attempt -le $MaxRetries -and -not $Synced; $attempt++) {
                if ($attempt -gt 1) { Write-Host "  Retry $attempt of $MaxRetries..." -ForegroundColor Gray }
                scp @SshOptsArray $TarFile "${Remote}:${RemotePath}/deploy.tar.gz"
                if ($LASTEXITCODE -eq 0) {
                    ssh @SshOptsArray $Remote "mkdir -p $RemotePath && cd $RemotePath && tar -xzf deploy.tar.gz && rm deploy.tar.gz"
                    $Synced = ($LASTEXITCODE -eq 0)
                }
            }
        }
    } finally {
        if (Test-Path $TarFile) { Remove-Item $TarFile -Force -ErrorAction SilentlyContinue }
    }
}

if (-not $Synced) {
    Write-Host ""
    Write-Host "SSH sync failed (connection reset / broken pipe). Try:" -ForegroundColor Yellow
    Write-Host "  1. .\setup-deploy-ssh.ps1  (if not done)" -ForegroundColor Cyan
    Write-Host "  2. `$env:FRONTEND_ONLY='1'; .\deploy-force.ps1  (frontend-only, smaller transfer)" -ForegroundColor Cyan
    Write-Host "  3. Retry when network is stable" -ForegroundColor Cyan
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

& ssh @SshOptsArray $Remote $DeployCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Deploy failed. Check SSH (.\setup-deploy-ssh.ps1) and DB password." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "App: https://wavelync.com" -ForegroundColor Cyan
