# Create Azure Linux VM in Israel Central (nginx + FastAPI)
# Usage: .\deploy\create-vm.ps1
# 1. Edit deploy/bicep/vm-parameters.json - set sshPublicKey
# 2. Or: $env:VM_SSH_PUBLIC_KEY = "ssh-rsa AAAA..."
# Prereq: az login, resource group rg-buildingsmanager exists

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$rg = if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-buildingsmanager" }
$paramsFile = Join-Path $root "deploy\bicep\vm-parameters.json"
$templateFile = Join-Path $root "deploy\bicep\vm.bicep"

Write-Host "Creating VM in Israel Central (resource group: $rg)" -ForegroundColor Cyan
$params = @()
if ($env:VM_SSH_PUBLIC_KEY) {
    $params = @("--parameters", "sshPublicKey=$env:VM_SSH_PUBLIC_KEY")
}

az deployment group create --resource-group $rg --name assetflow-vm --template-file $templateFile --parameters $paramsFile @params

$out = az deployment group show -g $rg -n assetflow-vm --query "properties.outputs" -o json
if (-not $out) { $out = az deployment group list -g $rg --query "[0].properties.outputs" -o json }
$parsed = $out | ConvertFrom-Json
Write-Host "`nVM created in Israel Central. Connect:" -ForegroundColor Green
Write-Host "  ssh $($parsed.adminUsername.value)@$($parsed.vmPublicIp.value)" -ForegroundColor Yellow
