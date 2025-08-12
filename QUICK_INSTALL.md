# Quick Install - TaskNotes Browser Extension

## Current Status
✅ Extension is ready to load with SVG icons  
⚠️  For production use, convert SVG to PNG files

## Install Now

1. **Open Chrome** → Go to `chrome://extensions/`
2. **Enable** "Developer mode" (toggle in top-right)
3. **Click** "Load unpacked"
4. **Select** the `tasknotes-browser-extension` folder
5. **Extension should load** successfully!

## If Chrome Still Shows Icon Errors

**Option A: Quick PNG Creation**
```bash
# Install ImageMagick or use online converter
convert icons/icon-16.svg icons/icon-16.png
convert icons/icon-32.svg icons/icon-32.png
convert icons/icon-48.svg icons/icon-48.png
convert icons/icon-128.svg icons/icon-128.png

# Then update manifest.json back to .png extensions
```

**Option B: Online Converter**
1. Go to https://convertio.co/svg-png/
2. Upload each SVG file from `icons/` folder
3. Download as PNG with same names
4. Replace SVG files with PNG files
5. Update manifest.json to use .png extensions

## Test Extension

1. **Enable TaskNotes API** in Obsidian first (Settings → TaskNotes → HTTP API)
2. **Click extension icon** → Enter task → "Create Task"
3. **Go to Gmail** → Look for TaskNotes button
4. **Right-click any page** → "Add to TaskNotes"

The extension should work with SVG icons, but PNG is recommended for production.