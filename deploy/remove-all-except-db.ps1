# Remove all Azure resources in the resource group EXCEPT PostgreSQL (flexible server + DB).
# Run after: az login
# Usage: .\remove-all-except-db.ps1 [-ResourceGroup "rg-buildingsmanager"]
param(
    [string] $ResourceGroup = "rg-buildingsmanager"
)
$ErrorActionPreference = "Stop"

Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Remove all resources except database' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host "Resource group: $ResourceGroup" -ForegroundColor Gray
Write-Host ''

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host 'Run: az login' -ForegroundColor Red
    exit 1
}

# Check RG exists
$rg = az group show --name $ResourceGroup 2>$null | ConvertFrom-Json
if (-not $rg) {
    Write-Host "Resource group '$ResourceGroup' not found." -ForegroundColor Red
    exit 1
}

# 1. Delete Web Apps (must be before App Service Plan)
$webapps = az webapp list --resource-group $ResourceGroup --query "[].name" -o tsv 2>$null
if ($webapps) {
    foreach ($name in $webapps) {
        Write-Host "Deleting Web App: $name" -ForegroundColor Yellow
        az webapp delete --resource-group $ResourceGroup --name $name 2>$null
    }
} else {
    Write-Host 'No Web Apps found.' -ForegroundColor Gray
}

# 2. Delete App Service Plans
$plans = az appservice plan list --resource-group $ResourceGroup --query "[].name" -o tsv 2>$null
if ($plans) {
    foreach ($name in $plans) {
        Write-Host "Deleting App Service Plan: $name" -ForegroundColor Yellow
        az appservice plan delete --resource-group $ResourceGroup --name $name --yes 2>$null
    }
} else {
    Write-Host 'No App Service Plans found.' -ForegroundColor Gray
}

# 3. Delete Static Web Apps
$swas = az staticwebapp list --resource-group $ResourceGroup --query "[].name" -o tsv 2>$null
if ($swas) {
    foreach ($name in $swas) {
        Write-Host "Deleting Static Web App: $name" -ForegroundColor Yellow
        az staticwebapp delete --resource-group $ResourceGroup --name $name --yes 2>$null
    }
} else {
    Write-Host 'No Static Web Apps found.' -ForegroundColor Gray
}

# 4. Delete Storage Accounts
$storageAccounts = az storage account list --resource-group $ResourceGroup --query "[].name" -o tsv 2>$null
if ($storageAccounts) {
    foreach ($name in $storageAccounts) {
        Write-Host "Deleting Storage Account: $name" -ForegroundColor Yellow
        az storage account delete --resource-group $ResourceGroup --name $name --yes 2>$null
    }
} else {
    Write-Host 'No Storage Accounts found.' -ForegroundColor Gray
}

Write-Host ''
Write-Host 'Done. Kept: Resource group and PostgreSQL flexible server(s).' -ForegroundColor Green
Write-Host 'Next: Run .\deploy\recreate-with-existing-db.ps1 to recreate App Service, Static Web App, Storage, and deploy code.' -ForegroundColor Cyan
