# One-time SSH setup for passwordless deploy.
# Run this in your terminal (not from Cursor) - you'll enter your SSH password once.
#
# Usage: .\setup-deploy-ssh.ps1
#
# After setup, deploy scripts will work without prompts (including from Cursor).
# Env vars: REMOTE_HOST, REMOTE_USER

$ErrorActionPreference = "Stop"

$RemoteHost = if ($env:REMOTE_HOST) { $env:REMOTE_HOST } else { "185.229.226.37" }
$RemoteUser = if ($env:REMOTE_USER) { $env:REMOTE_USER } else { "asset_flow" }
$Remote = "${RemoteUser}@${RemoteHost}"
$SshDir = "$env:USERPROFILE\.ssh"
$KeyPath = "$SshDir\id_ed25519"
$KeyPathPub = "$SshDir\id_ed25519.pub"

Write-Host "SSH setup for deploy to $Remote" -ForegroundColor Cyan
Write-Host ""

# 1. Check for existing key
if (Test-Path $KeyPath) {
    Write-Host "SSH key found: $KeyPath" -ForegroundColor Green
} elseif (Test-Path "$SshDir\id_rsa") {
    Write-Host "SSH key found: $SshDir\id_rsa" -ForegroundColor Green
    $KeyPath = "$SshDir\id_rsa"
    $KeyPathPub = "$SshDir\id_rsa.pub"
} else {
    Write-Host "No SSH key found. Creating one..." -ForegroundColor Yellow
    if (-not (Test-Path $SshDir)) {
        New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
    }
    ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "buildingsmanager-deploy"
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "Created: $KeyPath" -ForegroundColor Green
}
Write-Host ""

# 2. Copy public key to server (will prompt for password ONCE)
Write-Host "Copying your public key to the server..." -ForegroundColor Yellow
Write-Host "  (You will be asked for your SSH password - this is the only time)" -ForegroundColor Gray
Write-Host ""

$pubKey = Get-Content $KeyPathPub -Raw
$pubKey | ssh -o StrictHostKeyChecking=accept-new $Remote "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys.tmp && mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Copy failed. You can do it manually:" -ForegroundColor Red
    Write-Host "  1. Copy this key:" -ForegroundColor Gray
    Write-Host "  $pubKey" -ForegroundColor Gray
    Write-Host "  2. SSH to server and add it to ~/.ssh/authorized_keys" -ForegroundColor Gray
    exit 1
}

Write-Host "Key copied successfully." -ForegroundColor Green
Write-Host ""

# 3. Test passwordless connection
Write-Host "Testing connection..." -ForegroundColor Yellow
$testOut = ssh -o BatchMode=yes -o ConnectTimeout=10 $Remote "echo OK" 2>&1
if ($LASTEXITCODE -eq 0 -and $testOut -match "OK") {
    Write-Host "Passwordless SSH works! Deploy scripts will now run without prompts." -ForegroundColor Green
} else {
    Write-Host "Connection test failed: $testOut" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup complete. You can now run:" -ForegroundColor Cyan
Write-Host "  .\deploy-force.ps1" -ForegroundColor Gray
Write-Host "  .\redeploy-frontend-remote.ps1" -ForegroundColor Gray
Write-Host "  .\restart-remote-servers.ps1" -ForegroundColor Gray
