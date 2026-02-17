# Deploy AssetFlow to Azure VM (nginx + gunicorn)
# Usage: .\deploy\deploy-to-vm.ps1 -VmHost "user@1.2.3.4"
# Prereq: VM created (create-vm.ps1), SSH key auth working
# Set: $env:VM_HOST = "azureuser@<VM_IP>"

param(
    [string]$VmHost = $env:VM_HOST
)

if (-not $VmHost) {
    Write-Host "Set VM_HOST or pass -VmHost: .\deploy-to-vm.ps1 -VmHost azureuser@1.2.3.4" -ForegroundColor Red
    exit 1
}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== Build Frontend (VITE_API_URL=/api) ===" -ForegroundColor Cyan
$env:VITE_API_URL = "/api"
Push-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

Write-Host "=== Prepare deployment ===" -ForegroundColor Cyan
$staging = Join-Path $env:TEMP "assetflow-deploy-$(Get-Random)"
New-Item -ItemType Directory -Path (Join-Path $staging "backend") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "deploy\nginx") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "deploy\vm") -Force | Out-Null
Get-ChildItem (Join-Path $root "backend") -Exclude venv,__pycache__,static | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $staging "backend") -Recurse -Force
}
Copy-Item -Path (Join-Path $root "dist\*") -Destination (Join-Path $staging "static") -Recurse -Force
Copy-Item -Path (Join-Path $root "deploy\nginx\assetflow.conf") -Destination (Join-Path $staging "deploy\nginx\") -Force
Copy-Item -Path (Join-Path $root "deploy\vm\*") -Destination (Join-Path $staging "deploy\vm") -Recurse -Force
# Exclude venv/__pycache__ from backend
Get-ChildItem (Join-Path $staging "backend") -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $staging "backend") -Recurse -Directory -Filter "venv" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "=== Upload to VM ===" -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 $VmHost "rm -rf /tmp/assetflow-deploy && mkdir -p /tmp/assetflow-deploy"
scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -r "$staging\backend" "$staging\static" "$staging\deploy" "${VmHost}:/tmp/assetflow-deploy/"

Write-Host "=== Install on VM (run these on the VM) ===" -ForegroundColor Yellow
Write-Host @"
ssh $VmHost
sudo mkdir -p /var/www/assetflow
sudo cp -r /tmp/assetflow-deploy/backend /var/www/assetflow/
sudo cp -r /tmp/assetflow-deploy/static /var/www/assetflow/
sudo cp -r /tmp/assetflow-deploy/deploy /var/www/assetflow/
sudo cp /var/www/assetflow/deploy/nginx/assetflow.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/assetflow.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo cp /var/www/assetflow/deploy/vm/gunicorn.service /etc/systemd/system/
# Create .env: sudo nano /var/www/assetflow/.env (PGHOST, PGUSER, PGPASSWORD, SECRET_KEY, ENVIRONMENT=production)
sudo python3 -m venv /var/www/assetflow/venv
sudo /var/www/assetflow/venv/bin/pip install -r /var/www/assetflow/backend/requirements.txt
sudo chown -R www-data:www-data /var/www/assetflow
sudo systemctl daemon-reload && sudo systemctl enable gunicorn && sudo systemctl start gunicorn
sudo nginx -t && sudo systemctl reload nginx
"@ -ForegroundColor Gray

Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`nDone. Follow the commands above on the VM." -ForegroundColor Green
