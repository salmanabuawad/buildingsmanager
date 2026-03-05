# Copy the Buildings Manager Nginx config so port 80 serves the app and proxies /api to the backend.
# Run from repo root: .\nginx\setup-nginx-config-windows.ps1
# Requires Nginx at C:\nginx. After this, run: cd C:\nginx; .\nginx.exe -s reload

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$NginxDir = "C:\nginx"
$ConfDir = "$NginxDir\conf"
$DestConf = "$ConfDir\nginx.conf"
$SourceConf = Join-Path $PSScriptRoot "nginx-windows.conf"

if (-not (Test-Path $SourceConf)) {
  Write-Host "Source config not found: $SourceConf" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $NginxDir)) {
  Write-Host "Nginx dir not found: $NginxDir. Install Nginx first (e.g. extract to C:\nginx)." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
Copy-Item -Path $SourceConf -Destination $DestConf -Force
Write-Host "Copied nginx-windows.conf to $DestConf" -ForegroundColor Green
Write-Host "Reload Nginx: cd C:\nginx; .\nginx.exe -s reload"
Write-Host "Backend must be running on port 8000 for /api to work."
