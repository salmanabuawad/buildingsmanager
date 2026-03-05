# Print the URL to open the app on a mobile device (same WiFi).
# Run from repo root. Start backend and frontend first (e.g. .\scripts\restart-servers.ps1).
$port = 80
try {
  $addrs = [System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -notmatch '^127\.' }
  $ip = ($addrs | Select-Object -First 1).ToString()
} catch {
  $ip = 'localhost'
}
if (-not $ip) { $ip = 'localhost' }
$url = "http://${ip}:${port}"
Write-Host ""
Write-Host "  Open on mobile (same WiFi): " -NoNewline
Write-Host $url -ForegroundColor Cyan
Write-Host "  User: inspector / inspector123 (פקח)" -ForegroundColor Gray
Write-Host "  Ensure backend and frontend are running." -ForegroundColor Gray
Write-Host ""
