# Start Nginx for Buildings Manager (Windows).
# Run from repo root or nginx folder. Uses C:\nginx and C:\nginx\conf\nginx.conf.
# Port 80 must be free (stop other Nginx/IIS or run this script as Administrator).

$nginxDir = "C:\nginx"
if (-not (Test-Path "$nginxDir\nginx.exe")) {
  Write-Host "Nginx not found at $nginxDir\nginx.exe. Run deploy first or extract nginx to C:\nginx."
  exit 1
}

# Ensure required dirs exist
@("$nginxDir\logs", "$nginxDir\temp\client_body_temp", "$nginxDir\temp\proxy_temp") | ForEach-Object {
  if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

Set-Location $nginxDir
Start-Process -FilePath ".\nginx.exe" -WindowStyle Hidden
Write-Host "Nginx started. Open http://localhost/"
Write-Host "To reload config: cd C:\nginx; .\nginx.exe -s reload"
Write-Host "To stop: .\nginx.exe -s stop"
