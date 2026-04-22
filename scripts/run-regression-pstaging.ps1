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
  [switch]$Headed
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

$argv = @('playwright', 'test', '--project=pstaging', '--reporter=list', '--workers=2')
if ($Grep) { $argv += @('--grep', $Grep) }

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
