# Build the frontend and deploy to Nginx web root.
# Run from repo root: .\nginx\deploy-frontend.ps1
# Optional: $env:WEB_ROOT = "C:\nginx\html\buildingsmanager"; .\nginx\deploy-frontend.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $env:WEB_ROOT) { $env:WEB_ROOT = "C:\nginx\html\buildingsmanager" }

Write-Host "Building frontend..."
Set-Location $RepoRoot
npm run build

Write-Host "Deploying to $($env:WEB_ROOT)..."
$dest = $env:WEB_ROOT
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path "$RepoRoot\dist\*" -Destination $dest -Recurse -Force

Write-Host "Done. Frontend is at $dest"
Write-Host ""

# Apply Nginx config so /api is proxied to the backend (required for same-origin API)
$NginxDir = "C:\nginx"
if (Test-Path $NginxDir) {
  $ConfDir = "$NginxDir\conf"
  $DestConf = "$ConfDir\nginx.conf"
  $SourceConf = Join-Path $PSScriptRoot "nginx-windows.conf"
  if (Test-Path $SourceConf) {
    New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
    Copy-Item -Path $SourceConf -Destination $DestConf -Force
    Write-Host "Nginx config updated (proxy /api -> backend :8000). Reload: cd C:\nginx; .\nginx.exe -s reload" -ForegroundColor Green
  }
} else {
  Write-Host "To proxy /api to backend: install Nginx, then .\nginx\setup-nginx-config-windows.ps1" -ForegroundColor Yellow
}
Write-Host "Backend must run on port 8000. See docs/PROXY_API.md"
