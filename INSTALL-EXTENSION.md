# Installing NCP Extension

## Files Created

- ✅ `ncp.dxt` - NCP Desktop Extension (168KB)
- ✅ `ncp-1.5.0.dxt` - Versioned copy

## Installation Steps

### **Method 1: Double-Click (Recommended)**

1. **Locate the file**:
   ```
   /Users/arul/Projects/ncp-production-clean/ncp-1.5.0.dxt
   ```

2. **Double-click** `ncp-1.5.0.dxt`

3. **Claude Desktop will open** and show configuration dialog:
   ```
   ┌─────────────────────────────────────────┐
   │   Configure NCP Extension              │
   ├─────────────────────────────────────────┤
   │ Profile Name:        [all           ▼] │
   │ Configuration Path:  [~/.ncp          ] │
   │ ☐ Enable Global CLI Access             │
   │ ☑ Auto-import Claude Desktop MCPs      │
   │ ☐ Enable Debug Logging                 │
   │                                         │
   │           [Cancel]  [Install]          │
   └─────────────────────────────────────────┘
   ```

4. **Configure options**:
   - **Profile Name**: Leave as "all" (or choose custom)
   - **Configuration Path**: Leave as "~/.ncp" (global) or change to ".ncp" (local)
   - **Enable Global CLI**: Check if you want `ncp` command in terminal
   - **Auto-import**: Keep checked to import all existing Claude Desktop MCPs
   - **Debug Logging**: Check only for troubleshooting

5. **Click Install**

6. **Extension activates immediately** (no restart needed!)

### **Method 2: CLI Installation**

```bash
# From the extension directory
open ncp-1.5.0.dxt

# Or install to Claude Desktop extensions manually
cp ncp-1.5.0.dxt ~/Library/Application\ Support/Claude/Claude\ Extensions/
```

---

## What Happens on Install

### **1. Extension Configuration**

Claude Desktop injects these environment variables:

```bash
NCP_PROFILE="all"                      # Your chosen profile
NCP_CONFIG_PATH="~/.ncp"               # Your chosen config path
NCP_ENABLE_GLOBAL_CLI="false"          # Your CLI preference
NCP_AUTO_IMPORT="true"                 # Auto-import enabled
NCP_DEBUG="false"                      # Debug logging
NCP_MODE="extension"                   # Marks as extension
```

### **2. Initialization Sequence**

When extension starts:

```
extension-init.ts runs:
  ✓ Creates ~/.ncp/profiles/ directory
  ✓ Reads Claude Desktop config
  ✓ Imports all MCPs into 'all' profile
  ✓ Sets up global CLI (if enabled)
  ✓ Logs completion

index-mcp.ts starts:
  ✓ Loads profile with imported MCPs
  ✓ Indexes all tools
  ✓ Starts MCP server

✅ Ready to use!
```

### **3. Auto-Import Results**

Check what was imported:

```bash
cat ~/.ncp/profiles/all.json
```

You should see all your Claude Desktop MCPs:

```json
{
  "name": "all",
  "description": "Auto-imported from Claude Desktop",
  "mcpServers": {
    "whatsapp": {...},
    "zero-mcp": {...},
    "portel-dev": {...},
    "tavily": {...},
    "desktop-commander": {...},
    "stripe": {...},
    "context7-mcp": {...},
    "sequential-thinking": {...},
    "Shell": {...},
    "portel": {...}
    // ... 16 total MCPs
  }
}
```

---

## Verification

### **Test 1: Check Extension is Running**

In Claude Desktop, try:

```
User: "List all available tools"

AI should respond with tools from NCP (find, run)
```

### **Test 2: Test Auto-Import**

```
User: "Find GitHub tools"

AI: [Should list tools from auto-imported MCPs]
    - github:create_issue
    - github:list_repos
    - ...
```

### **Test 3: Run a Tool**

```
User: "Use sequential thinking to solve..."

AI: [Calls ncp:run sequential-thinking:think with parameters]
    [Works with auto-imported MCP!]
```

### **Test 4: Check Global CLI (if enabled)**

Open terminal:

```bash
# Should work if you enabled global CLI
ncp find "create issue"

# Should show:
# Found 3 tools:
# 1. github:create_issue - Create new GitHub issue
# ...
```

---

## Troubleshooting

### **Extension Not Showing in Claude Desktop**

Check Extensions panel:
```
Claude Desktop → Settings → Extensions → All extensions
```

You should see: `NCP - Natural Context Provider`

### **No MCPs Auto-Imported**

Enable debug logging:
1. Uninstall extension
2. Reinstall with "Enable Debug Logging" checked
3. Check logs:
   ```bash
   # Extension logs show in Claude Desktop console
   # Or check NCP logs:
   ls -la ~/.ncp/logs/
   ```

### **Global CLI Not Working**

If symlink creation failed:

```bash
# Check if symlink exists
ls -la /usr/local/bin/ncp

# Create manually (requires sudo)
sudo ln -sf /Applications/Claude.app/Contents/Resources/app.asar.unpacked/node_modules/.../ncp/dist/index.js /usr/local/bin/ncp

# Or find actual path:
find ~/Library -name "ncp" -type d 2>/dev/null | grep "Claude Extensions"
```

### **MCPs Not Working**

1. **Check profile exists**:
   ```bash
   ls ~/.ncp/profiles/all.json
   ```

2. **Verify MCPs imported**:
   ```bash
   cat ~/.ncp/profiles/all.json | jq '.mcpServers | keys'
   ```

3. **Check runtime detection**:
   Enable debug logging and look for:
   ```
   [Runtime Detection]
     Type: bundled | system
     Node: /path/to/node
     Python: /path/to/python
   ```

---

## Uninstalling

### **From Claude Desktop**

```
Settings → Extensions → NCP → Uninstall
```

### **Manual Cleanup** (optional)

```bash
# Remove configs (if desired)
rm -rf ~/.ncp/

# Remove global CLI symlink (if created)
sudo rm /usr/local/bin/ncp

# Remove extension cache
rm -rf ~/Library/Application\ Support/Claude/Claude\ Extensions/ncp*
```

---

## Next Steps

### **After Successful Installation**

1. **Disable other MCPs in Claude Desktop** (optional):
   - Go to Settings → Extensions
   - Disable individual MCPs
   - NCP will continue to run them (via auto-import!)
   - Result: Clean UI with just NCP

2. **Create custom profiles** (optional):
   ```bash
   # Copy all profile to development
   cp ~/.ncp/profiles/all.json ~/.ncp/profiles/development.json

   # Edit to keep only dev MCPs
   # Then install another NCP instance with profile="development"
   ```

3. **Explore discovery**:
   ```
   User: "What tools can help me with GitHub?"
   AI: [Uses ncp:find semantic search]
   ```

4. **Use internal management tools**:
   ```
   User: "List all configured MCPs"
   AI: [Calls ncp:run ncp:list]
   ```

---

## Configuration Options Explained

### **Profile Name**

- **"all"** (default) - Single profile with all MCPs
- **"development"** - Separate dev environment
- **"minimal"** - Lightweight subset
- **Custom** - Your own profile name

Profile determines which `~/.ncp/profiles/{name}.json` is used.

### **Configuration Path**

- **~/.ncp** (default) - Global, shared across projects
- **.ncp** - Local to current project directory
- **Custom** - Any path you specify

Determines where profiles are stored.

### **Enable Global CLI Access**

- **Unchecked** (default) - Extension mode only
- **Checked** - Creates `/usr/local/bin/ncp` symlink
  - Requires sudo permissions
  - Allows terminal usage: `ncp find`, `ncp list`, etc.

### **Auto-import Claude Desktop MCPs**

- **Checked** (default) - Imports all MCPs on startup
- **Unchecked** - Start with empty profile
  - Use for fresh installation
  - Or if you want to manually configure

### **Enable Debug Logging**

- **Unchecked** (default) - Normal logging
- **Checked** - Detailed logs for troubleshooting
  - Shows runtime detection
  - Shows MCP loading
  - Shows auto-import process

---

## Success Indicators

After installation, you should see:

✅ NCP extension in Claude Desktop Extensions panel
✅ `~/.ncp/profiles/all.json` exists with imported MCPs
✅ Can use `find` and `run` tools in Claude Desktop
✅ All your existing Claude Desktop MCPs work via NCP
✅ (Optional) `ncp` command works in terminal

**Installation complete! Enjoy the unified MCP experience! 🎉**
