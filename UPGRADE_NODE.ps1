# PowerShell script to help upgrade Node.js
# Run this script in PowerShell (Run as Administrator for best results)

Write-Host "Node.js Version Upgrade Helper" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check current Node.js version
$currentVersion = node --version 2>$null
if ($currentVersion) {
    Write-Host "Current Node.js version: $currentVersion" -ForegroundColor Yellow
    $versionNumber = [int]($currentVersion -replace 'v(\d+)\..*', '$1')
    
    if ($versionNumber -lt 18) {
        Write-Host "⚠️  Node.js version is too old (requires 18+)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please upgrade Node.js using one of these methods:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Option 1: Download from https://nodejs.org/ (Recommended)" -ForegroundColor Green
        Write-Host "  - Visit: https://nodejs.org/" -ForegroundColor White
        Write-Host "  - Download Windows Installer (.msi) for LTS version" -ForegroundColor White
        Write-Host "  - Run installer (it will replace current version)" -ForegroundColor White
        Write-Host ""
        Write-Host "Option 2: Install NVM for Windows" -ForegroundColor Green
        Write-Host "  - Download from: https://github.com/coreybutler/nvm-windows/releases" -ForegroundColor White
        Write-Host "  - After installing, run:" -ForegroundColor White
        Write-Host "    nvm install 20.11.0" -ForegroundColor Cyan
        Write-Host "    nvm use 20.11.0" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "After upgrading, run this script again to verify." -ForegroundColor Yellow
    } else {
        Write-Host "✅ Node.js version is compatible!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Checking if dependencies are installed..." -ForegroundColor Cyan
        
        if (Test-Path "node_modules") {
            Write-Host "✅ Dependencies are installed" -ForegroundColor Green
        } else {
            Write-Host "Installing dependencies..." -ForegroundColor Yellow
            npm install
        }
    }
} else {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

