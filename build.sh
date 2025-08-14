#!/bin/bash

# Simple build script for TaskNotes Browser Extension
# Creates a zip file for distribution

echo "Building TaskNotes Browser Extension..."

# Clean up old builds
rm -f tasknotes-extension.zip

# Create zip with required files
zip -r tasknotes-extension.zip \
  manifest.json \
  src/ \
  popup/ \
  icons/ \
  content-scripts/ \
  styles/ \
  -x "*.DS_Store" \
  -x "*/.git/*" \
  -x "*/node_modules/*"

echo "Build complete: tasknotes-extension.zip"
echo "You can now load this extension in Chrome by:"
echo "1. Opening chrome://extensions/"
echo "2. Enabling Developer mode"
echo "3. Clicking 'Load unpacked' and selecting this directory"