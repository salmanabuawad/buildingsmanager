# Override API base URL for the frontend (default is same origin: /api on current host).
# Run before serving the app when the API is on a different origin (e.g. Docker, multi-host).
# Usage: .\scripts\set-backend-url.ps1 -BackendUrl "https://api.example.com"

param(
  [string] $BackendUrl = $env:BACKEND_URL,
  [string] $ConfigFile = "public/config.js"
)

if (-not $BackendUrl) {
  Write-Host "Usage: .\set-backend-url.ps1 -BackendUrl 'https://api.example.com'"
  Write-Host "   or: `$env:BACKEND_URL='https://...'; .\set-backend-url.ps1"
  exit 1
}

$BackendUrl = $BackendUrl.TrimEnd('/')
$dir = Split-Path $ConfigFile
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
Set-Content -Path $ConfigFile -Value "window.__APP_CONFIG__ = { apiBaseUrl: `"$BackendUrl`" };"
Write-Host "Wrote $ConfigFile with apiBaseUrl=$BackendUrl"
