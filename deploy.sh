#!/bin/bash

# AssetFlow Deployment Script
# This script helps deploy your application to Netlify

set -e

echo "🚀 AssetFlow Deployment Script"
echo "================================"
echo ""

# Check if build exists
if [ ! -d "dist" ]; then
  echo "❌ No build found. Running production build..."
  npm run build
  echo "✅ Build completed"
  echo ""
fi

# Check if netlify CLI is installed
if ! command -v netlify &> /dev/null; then
  echo "⚠️  Netlify CLI not found."
  echo "Install it with: npm install -g netlify-cli"
  echo ""
  read -p "Install Netlify CLI now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install -g netlify-cli
    echo "✅ Netlify CLI installed"
  else
    echo "❌ Cannot proceed without Netlify CLI. Exiting."
    exit 1
  fi
fi

echo ""
echo "Choose deployment option:"
echo "1) Deploy to production"
echo "2) Deploy preview (test before production)"
echo "3) Login to Netlify"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
  1)
    echo ""
    echo "🚀 Deploying to production..."
    netlify deploy --prod
    echo ""
    echo "✅ Deployment complete!"
    echo "Your site is live at: https://buildingmanager.bolt.host/"
    ;;
  2)
    echo ""
    echo "🔍 Creating preview deployment..."
    netlify deploy
    echo ""
    echo "✅ Preview deployment complete!"
    echo "Check the URL above to test your changes."
    ;;
  3)
    echo ""
    echo "🔐 Opening Netlify login..."
    netlify login
    ;;
  *)
    echo "❌ Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "📚 For more deployment options, see: DEPLOYMENT_GUIDE.md"
