# Write DB (and optional app) credentials to a file for the backend.
# Run from a startup script or deploy pipeline; then start the app with CREDENTIALS_FILE set.
#
# Usage:
#   $env:DATABASE_URL = "postgresql://user:pass@host:5432/db"
#   $env:SECRET_KEY = "your-secret-key"
#   .\scripts\set-credentials.ps1
#
# Or with a destination file:
#   $env:CREDENTIALS_FILE = "C:\run\app\credentials.env"; .\scripts\set-credentials.ps1

$CredentialsFile = if ($env:CREDENTIALS_FILE) { $env:CREDENTIALS_FILE } else { ".env.credentials" }

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL is not set. Set it before running this script."
  Write-Host "Example: `$env:DATABASE_URL = 'postgresql://user:pass@host:5432/dbname'"
  exit 1
}

$dir = Split-Path $CredentialsFile
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$lines = @("DATABASE_URL=$($env:DATABASE_URL)")
if ($env:SECRET_KEY) { $lines += "SECRET_KEY=$($env:SECRET_KEY)" }
if ($env:ALLOWED_ORIGINS) { $lines += "ALLOWED_ORIGINS=$($env:ALLOWED_ORIGINS)" }
if ($env:ENVIRONMENT) { $lines += "ENVIRONMENT=$($env:ENVIRONMENT)" }

Set-Content -Path $CredentialsFile -Value $lines
Write-Host "Wrote credentials to $CredentialsFile"
Write-Host "Start the app with: `$env:CREDENTIALS_FILE='$CredentialsFile'; uvicorn app.main:app --host 0.0.0.0 --port 8000"
