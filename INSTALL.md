# TaskNotes Browser Extension - Installation Guide

## Prerequisites

1. **TaskNotes Plugin** installed in Obsidian
2. **HTTP API enabled** in TaskNotes settings (Desktop only)
3. **Chrome or Chromium-based browser** (Chrome, Edge, Brave, etc.)

## Step-by-Step Installation

### 1. Enable TaskNotes API First

1. Open **Obsidian** with TaskNotes plugin installed
2. Go to **Settings** → **TaskNotes** → **HTTP API** tab
3. **Enable** "Enable HTTP API"
4. Note the **port number** (default: 8080)
5. Optionally set an **authentication token**
6. **Restart Obsidian**
7. **Test**: Open browser and go to `http://localhost:8080/api/health`
   - You should see: `{"success":true,"data":{"status":"ok",...}}`

### 2. Install Browser Extension

#### Option A: Load Unpacked (Recommended for now)

1. **Download** this entire folder (`tasknotes-browser-extension/`)
2. **Open Chrome** and go to `chrome://extensions/`
3. **Enable** "Developer mode" (toggle in top-right corner)
4. **Click** "Load unpacked"
5. **Select** the `tasknotes-browser-extension` folder
6. **Extension should appear** in your extensions list

#### Option B: Create Icons (Optional but Recommended)

1. **Open** `icons/create-icons.html` in your browser
2. **Right-click** the canvas and "Save image as..." → `icon-128.png`
3. **Use online tool** to create 16x16, 32x32, 48x48 versions
4. **Reload extension** in Chrome extensions page

### 3. Configure Extension

1. **Click** the TaskNotes extension icon in Chrome toolbar
2. **Enter your settings**:
   - **API Port**: 8080 (or whatever you set in TaskNotes)
   - **Auth Token**: Leave empty unless you set one in TaskNotes
   - **Default Tags**: web, browser (or whatever you prefer)
3. **Click** "Test Connection"
   - Should show "Connected" status
4. **Click** "Save Settings"

## Test Installation

### Test 1: Extension Popup
1. **Click** extension icon
2. **Enter** a task title like "Test task"
3. **Click** "Create Task"
4. **Check** TaskNotes in Obsidian - task should appear

### Test 2: Gmail Integration
1. **Go to Gmail** (https://mail.google.com)
2. **Open any email**
3. **Look for** "TaskNotes" button in toolbar
4. **Click the button** - task should be created with email info

### Test 3: Right-Click Menu
1. **Go to any webpage**
2. **Right-click** anywhere
3. **Select** "Add to TaskNotes" from context menu
4. **Task created** with page title and URL

### Test 4: Keyboard Shortcut
1. **Go to any webpage**
2. **Press** Ctrl+Shift+T (Cmd+Shift+T on Mac)
3. **Task created** automatically

## Troubleshooting

### "Connection failed" Error

**Check TaskNotes API:**
```bash
# Test in terminal/command prompt:
curl http://localhost:8080/api/health

# Should return:
{"success":true,"data":{"status":"ok","timestamp":"..."}}
```

**Common fixes:**
- Ensure Obsidian is running
- Verify API is enabled in TaskNotes settings
- Check port number matches (extension vs TaskNotes)
- Try different port if 8080 is in use
- Restart Obsidian after enabling API

### Gmail Button Not Appearing

1. **Refresh** Gmail page completely
2. **Wait** 5-10 seconds for Gmail to fully load
3. **Check** you're on `mail.google.com` (not other Gmail domains)
4. **Open browser console** (F12) and look for errors

### Extension Not Loading

1. **Check** `chrome://extensions/` for error messages
2. **Ensure** all files are in correct folders:
   ```
   tasknotes-browser-extension/
   ├── manifest.json
   ├── src/background.js
   ├── src/api-client.js
   ├── popup/popup.html
   └── content-scripts/gmail.js
   ```
3. **Reload** extension after making changes

### Permission Issues

If browser blocks the extension:
1. **Check** manifest.json permissions
2. **Ensure** host permissions include Gmail URLs
3. **Try** different browser (Chrome vs Edge vs Brave)

## Usage Tips

### Best Practices
- **Set authentication token** for security
- **Use descriptive default tags** to organize tasks
- **Test connection** regularly to ensure API is working
- **Keep Obsidian running** when using extension

### Gmail Workflow
1. **Process emails** in batches
2. **Click TaskNotes** button on important emails
3. **Add context** in task notes field
4. **Set priority** for urgent emails
5. **Use contexts** to track sender info

### Web Browsing Workflow
- **Right-click** interesting articles → "Add to TaskNotes"  
- **Use keyboard shortcut** for quick bookmarking
- **Add custom notes** via extension popup for context

## Advanced Configuration

### Custom Ports
If port 8080 is in use:
1. **Change port** in TaskNotes settings (e.g., 8081)
2. **Update** extension settings to match
3. **Restart** Obsidian
4. **Test connection**

### Authentication Tokens
For additional security:
1. **Generate** random token (20+ characters)
2. **Set in** TaskNotes HTTP API settings
3. **Set same token** in extension settings
4. **Save** both settings

## Getting Help

- **TaskNotes Issues**: https://github.com/callumalpass/tasknotes/issues
- **Extension Issues**: https://github.com/callumalpass/tasknotes-browser-extension/issues
- **API Documentation**: See `docs/HTTP_API.md` in main plugin