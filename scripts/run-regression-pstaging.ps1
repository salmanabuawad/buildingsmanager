#Requires -Version 5
# Run the full Playwright regression against pstaging.wavelync.com
# from any Windows machine with Node 20+ installed.
#
# Usage:
#   bash/PS> pwsh scripts\run-regression-pstaging.ps1
#   # or headed:
#   pwsh scripts\run-regression-pstaging.ps1 -Headed
#   # or just a subset:
#   pwsh scripts\run-regression-pstaging.ps1 -Grep "24\."
#
# Creds default to the regression_tester account on pstaging. Override
# via -User / -Password or environment.

param(
  [string]$BaseUrl  = "https://pstaging.wavelync.com/",
  [string]$User     = "regression_tester",
  [string]$Password = "RegressionTester2026!",
  [string]$Grep     = $null,
  [switch]$Headed,
  # When -Headed, use the system-installed browser instead of the bundled
  # playwright chromium. Works around SxS failures on Windows laptops.
  [string]$Channel  = "chrome",
  # Per-action delay (ms) in headed mode so a human can follow along.
  # Default 3000ms. Set to 0 to disable.
  [int]$SlowMo      = 3000,
  # Workers. Default 1 in headed (readable), 2 in headless (fast).
  [int]$Workers     = 0
)

Set-Location (Split-Path -Parent $PSScriptRoot)

# First-run bootstrap — cheap if already installed
if (-not (Test-Path 'node_modules/@playwright')) {
  Write-Host '[1/2] Installing dependencies (npm ci)...'
  npm ci --no-audit --no-fund | Out-Null
}
if (-not (Test-Path "$env:USERPROFILE\AppData\Local\ms-playwright")) {
  Write-Host '[2/2] Installing Playwright chromium (one-time, ~140 MB)...'
  npx playwright install chromium
}

$env:TEST_BASE_URL  = $BaseUrl
$env:TEST_USER_NAME = $User
$env:TEST_PASSWORD  = $Password
$env:HEADLESS       = if ($Headed) { 'false' } else { 'true' }
$env:CI             = '1'

if ($Headed) {
  # System Chrome/Edge side-steps the Windows SxS failure some laptops
  # hit when launching the bundled playwright chromium.exe.
  $env:PW_CHANNEL    = $Channel
  $env:PW_SLOWMO_MS  = "$SlowMo"
}

# Default: 1 worker in headed (one window to watch), 2 in headless.
if ($Workers -le 0) {
  $Workers = if ($Headed) { 1 } else { 2 }
}

$argv = @('playwright', 'test', '--project=pstaging', '--reporter=list', "--workers=$Workers")
# Retries at CI level (2) are painful under headed+slowMo; drop them.
if ($Headed) { $argv += @('--retries=0') }
if ($Grep)   { $argv += @('--grep', $Grep) }

Write-Host ("`nRunning regression against {0}" -f $BaseUrl)
Write-Host ("User: {0}`n" -f $User)
npx @argv
$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "Regression passed. Open HTML report with: npx playwright show-report"
} else {
  Write-Host "Regression failed. Open the HTML report for traces/screenshots: npx playwright show-report" -ForegroundColor Yellow
}
exit $exitCode
