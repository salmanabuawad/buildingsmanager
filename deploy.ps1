# AssetFlow Deployment Script (PowerShell)
# This script helps deploy your application to Netlify

$ErrorActionPreference = "Stop"

Write-Host "🚀 AssetFlow Deployment Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if build exists
if (-Not (Test-Path "dist")) {
    Write-Host "❌ No build found. Running production build..." -ForegroundColor Yellow
    npm run build
    Write-Host "✅ Build completed" -ForegroundColor Green
    Write-Host ""
}

# Check if netlify CLI is installed
$netlifyExists = Get-Command netlify -ErrorAction SilentlyContinue
if (-Not $netlifyExists) {
    Write-Host "⚠️  Netlify CLI not found." -ForegroundColor Yellow
    Write-Host "Install it with: npm install -g netlify-cli"
    Write-Host ""
    $install = Read-Host "Install Netlify CLI now? (y/n)"
    if ($install -eq "y" -or $install -eq "Y") {
        npm install -g netlify-cli
        Write-Host "✅ Netlify CLI installed" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Cannot proceed without Netlify CLI. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Choose deployment option:"
Write-Host "1) Deploy to production"
Write-Host "2) Deploy preview (test before production)"
Write-Host "3) Login to Netlify"
Write-Host ""
$choice = Read-Host "Enter choice (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🚀 Deploying to production..." -ForegroundColor Cyan
        netlify deploy --prod
        Write-Host ""
        Write-Host "✅ Deployment complete!" -ForegroundColor Green
        Write-Host "Your site is live at: https://buildingmanager.bolt.host/"
    }
    "2" {
        Write-Host ""
        Write-Host "🔍 Creating preview deployment..." -ForegroundColor Cyan
        netlify deploy
        Write-Host ""
        Write-Host "✅ Preview deployment complete!" -ForegroundColor Green
        Write-Host "Check the URL above to test your changes."
    }
    "3" {
        Write-Host ""
        Write-Host "🔐 Opening Netlify login..." -ForegroundColor Cyan
        netlify login
    }
    default {
        Write-Host "❌ Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "📚 For more deployment options, see: DEPLOYMENT_GUIDE.md"
