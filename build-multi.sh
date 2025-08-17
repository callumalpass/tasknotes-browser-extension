#!/bin/bash

# TaskNotes Browser Extension Multi-Browser Build Script
# Builds packages for Chrome, Firefox, and Safari using webpack

set -e

echo "🚀 Building TaskNotes Browser Extension for multiple browsers..."

# Get version from package.json (since manifest files are now browser-specific)
VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
echo "📝 Version: $VERSION"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf packages/
mkdir -p packages/

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build for each browser
BROWSERS=("chrome" "firefox" "safari")

for browser in "${BROWSERS[@]}"; do
    echo ""
    echo "🏗️  Building for $browser..."
    
    # Build with webpack
    npm run build:$browser
    
    # Verify build succeeded
    if [ ! -d "dist/$browser" ]; then
        echo "❌ ERROR: Build failed for $browser"
        exit 1
    fi
    
    # Create package
    echo "📦 Creating $browser package..."
    cd "dist/$browser"
    
    PACKAGE_NAME="tasknotes-browser-extension-$browser-v$VERSION"
    zip -r "../../packages/$PACKAGE_NAME.zip" . -x "*.map" "*.log"
    
    cd ../..
    
    echo "✅ $browser package created: packages/$PACKAGE_NAME.zip"
done

echo ""
echo "🎉 Multi-browser build complete!"
echo ""
echo "📦 Packages created:"
ls -la packages/
echo ""
echo "🚀 Next steps:"
echo "  1. Test each browser package by loading as unpacked extension"
echo "  2. Upload Chrome package to Chrome Web Store"
echo "  3. Upload Firefox package to Firefox Add-ons"
echo "  4. Use Safari package for Safari App Extension conversion"
echo ""