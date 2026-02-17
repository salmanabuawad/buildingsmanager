# 1. Delete ALL non-DB resources (Web Apps, App Service plans, Static Web Apps, Storage).
# 2. Recreate them and deploy backend + frontend using the existing PostgreSQL.
# Usage: .\reset-and-recreate.ps1 [-ResourceGroup "rg-buildingsmanager"]
param(
    [string] $ResourceGroup = "rg-buildingsmanager"
)
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptDir "remove-all-except-db.ps1") -ResourceGroup $ResourceGroup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Waiting 10 seconds for Azure to finish cleanup...' -ForegroundColor Gray
Start-Sleep -Seconds 10

& (Join-Path $scriptDir "recreate-with-existing-db.ps1") -ResourceGroup $ResourceGroup
exit $LASTEXITCODE
