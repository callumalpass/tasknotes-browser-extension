#!/bin/bash

# TaskNotes Browser Extension Build Script
# Builds a clean package ready for web store submission

set -e

echo "🚀 Building TaskNotes Browser Extension (Chrome) v$(grep '"version"' package.json | cut -d'"' -f4)..."

# Create build directory
BUILD_DIR="build"
VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
PACKAGE_NAME="tasknotes-browser-extension-chrome-v$VERSION"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build with webpack for Chrome
echo "🏗️  Building with webpack..."
npm run build:chrome

# Check if webpack build succeeded
if [ ! -d "dist/chrome" ]; then
    echo "❌ ERROR: Webpack build failed"
    exit 1
fi

# Clean previous legacy builds
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR"
rm -f "${PACKAGE_NAME}.zip"

# Copy webpack output to build directory
echo "📦 Copying built files..."
cp -r "dist/chrome" "$BUILD_DIR"

# Copy documentation (if they exist)
if [ -f "README.md" ]; then
    cp README.md "$BUILD_DIR/"
fi
if [ -f "INSTALL.md" ]; then
    cp INSTALL.md "$BUILD_DIR/"
fi
if [ -f "QUICK_INSTALL.md" ]; then
    cp QUICK_INSTALL.md "$BUILD_DIR/"
fi

echo "🔍 Validating build..."

# Check manifest exists
if [ ! -f "$BUILD_DIR/manifest.json" ]; then
    echo "❌ ERROR: manifest.json not found in build"
    exit 1
fi

# Check required directories exist
for dir in src popup content-scripts styles icons; do
    if [ ! -d "$BUILD_DIR/$dir" ]; then
        echo "❌ ERROR: Required directory $dir not found in build"
        exit 1
    fi
done

# Check required files exist (webpack builds)
required_files=(
    "background.js"
    "task-creation-modal.js"
    "popup/popup.html"
    "popup/popup.js"
    "popup/popup.css"
    "content-scripts/gmail.js"
    "content-scripts/outlook.js"
    "content-scripts/github.js"
    "styles/gmail.css"
    "styles/outlook.css"
    "styles/github.css"
    "icons/tasknotes-icon-16.png"
    "icons/tasknotes-icon-32.png"
    "icons/tasknotes-icon-48.png"
    "icons/tasknotes-icon-128.png"
    "lib/browser-polyfill.min.js"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$BUILD_DIR/$file" ]; then
        echo "❌ ERROR: Required file $file not found in build"
        exit 1
    fi
done

echo "✅ Build validation passed"

echo "📝 Generating file list..."
find "$BUILD_DIR" -type f | sort > "$BUILD_DIR/FILES.txt"

echo "🗜️  Creating distribution package..."
cd "$BUILD_DIR"
zip -r "../${PACKAGE_NAME}.zip" . -x "FILES.txt"
cd ..

echo "📊 Package information:"
echo "   📁 Package: ${PACKAGE_NAME}.zip"
echo "   📏 Size: $(du -h "${PACKAGE_NAME}.zip" | cut -f1)"
echo "   📄 Files: $(find "$BUILD_DIR" -type f | wc -l)"

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Ready for web store submission:"
echo "   📁 Build directory: $BUILD_DIR/"
echo "   📁 Distribution package: ${PACKAGE_NAME}.zip"
echo ""
echo "🚀 Next steps:"
echo "   1. Test the extension by loading $BUILD_DIR/ in Chrome developer mode"
echo "   2. Upload ${PACKAGE_NAME}.zip to Chrome Web Store"
echo "   3. Upload ${PACKAGE_NAME}.zip to Firefox Add-ons"
echo "   4. Upload ${PACKAGE_NAME}.zip to Edge Add-ons"
echo ""