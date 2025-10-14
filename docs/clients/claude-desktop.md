# Installing NCP on Claude Desktop

Claude Desktop offers **two ways** to install NCP. Choose the method that works best for you.

---

## 📦 Method 1: Extension Installation (.dxt) - **Recommended**

**Best for:** Most users who want one-click installation with automatic MCP detection.

### ✨ What You Get:
- ✅ **One-click installation** - Just drag and drop
- ✅ **Auto-import** - Automatically detects and imports ALL your existing Claude Desktop MCPs
- ✅ **Auto-sync** - Continuously syncs new MCPs on every startup
- ✅ **Zero configuration** - Works out of the box

### 📥 Installation Steps:

1. **Download the NCP Extension**
   - Get the latest `.dxt` file: [ncp.dxt](https://github.com/portel-dev/ncp/releases/latest/download/ncp.dxt)
   - File size: ~72MB (includes all dependencies)

2. **Install in Claude Desktop**
   - **Option A:** Drag and drop `ncp.dxt` onto Claude Desktop window
   - **Option B:** Double-click `ncp.dxt` file
   - **Option C:** Open with Claude Desktop

3. **Verify Installation**
   - Open Claude Desktop → **Settings** → **Extensions**
   - You should see "**NCP - Natural Context Provider**" by **Portel**
   - Status should show as **Enabled**

4. **Check Auto-Import**
   ```bash
   # NCP automatically created profiles with your MCPs
   cat ~/.ncp/profiles/all.json
   ```

   You should see all your Claude Desktop MCPs imported with `_source: "json"` and `_client: "claude-desktop"`.

5. **Test NCP**
   - Start a new chat in Claude Desktop
   - Ask Claude: "List all available MCP tools using NCP"
   - Claude should use NCP's `find` tool to discover your MCPs

### 🔄 How Auto-Import Works:

NCP automatically detects and imports MCPs from:
- ✅ **Claude Desktop config** (`claude_desktop_config.json`)
- ✅ **Claude Desktop extensions** (`.dxt` bundles in `Claude Extensions/` folder)

**When does auto-import run?**
- On first installation (imports all existing MCPs)
- On every startup (syncs any new MCPs)
- Runs in the background without interrupting your workflow

**What gets imported?**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"],
      "_source": "json",
      "_client": "claude-desktop"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "_source": ".dxt",
      "_client": "claude-desktop"
    }
  }
}
```

### ⚙️ Extension Settings:

Configure NCP behavior in Claude Desktop → Settings → Extensions → NCP:

- **Profile Name** (default: `all`) - Which NCP profile to use
- **Configuration Path** (default: `~/.ncp`) - Where to store NCP configs
- **Auto-import Client MCPs** (default: `true`) - Automatically sync MCPs on startup
- **Enable Debug Logging** (default: `false`) - Show detailed logs for troubleshooting

### 🐛 Troubleshooting Extension Installation:

**Extension doesn't appear after installation:**
1. Restart Claude Desktop completely
2. Check Settings → Extensions to verify installation
3. Check logs: `~/Library/Logs/Claude/mcp-server-NCP - Natural Context Provider.log`

**NCP shows "Server disconnected" error:**
1. Check that NCP has permissions to create `~/.ncp/` directory
2. Verify Node.js is available (Claude Desktop includes built-in Node.js)
3. Check logs for specific error messages

**Auto-import didn't detect my MCPs:**
1. Verify MCPs exist in `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Check `~/.ncp/profiles/all.json` to see what was imported
3. Enable debug logging in extension settings to see import process

---

## 🔧 Method 2: JSON Configuration - Manual Setup

**Best for:** Users who prefer traditional MCP configuration or need custom setup.

### When to Use This Method:
- ❌ You don't want the extension approach
- ✅ You prefer manual control over configuration
- ✅ You're using custom profile setups
- ✅ You're testing or developing NCP

### 📥 Installation Steps:

1. **Install NCP via npm**
   ```bash
   npm install -g @portel/ncp
   ```

2. **Import Your Existing MCPs** (Optional)
   ```bash
   # Copy your claude_desktop_config.json content to clipboard
   # Then run:
   ncp config import
   ```

   NCP will auto-detect and import all MCPs from clipboard.

3. **Configure Claude Desktop**

   Open `~/Library/Application Support/Claude/claude_desktop_config.json` and replace entire contents with:

   ```json
   {
     "mcpServers": {
       "ncp": {
         "command": "ncp"
       }
     }
   }
   ```

4. **Restart Claude Desktop**
   - Quit Claude Desktop completely
   - Reopen Claude Desktop
   - Start a new chat

5. **Verify Installation**
   ```bash
   # Check NCP is working
   ncp list

   # Test tool discovery
   ncp find "file operations"
   ```

### 🎯 Adding MCPs Manually:

After installation, add MCPs to NCP using the CLI:

```bash
# Add popular MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github
ncp add brave-search npx @modelcontextprotocol/server-brave-search

# Verify they were added
ncp list
```

### 🔄 Managing MCPs:

```bash
# List all MCPs
ncp list

# Find specific tools
ncp find "read a file"

# Remove an MCP
ncp remove filesystem

# Test an MCP tool
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}' --dry-run
```

### 🐛 Troubleshooting JSON Configuration:

**NCP command not found:**
```bash
# Reinstall globally
npm install -g @portel/ncp

# Verify installation
ncp --version
```

**Claude Desktop doesn't see NCP:**
1. Verify `claude_desktop_config.json` contains only the NCP entry
2. Restart Claude Desktop completely (Quit, not just close window)
3. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp-server-ncp.log`

**NCP shows no MCPs:**
```bash
# Check configuration
ncp list

# Verify profile exists
cat ~/.ncp/profiles/all.json

# Add MCPs if empty
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
```

---

## 🆚 Comparison: Extension vs JSON

| Feature | Extension (.dxt) | JSON Config |
|---------|-----------------|-------------|
| **Installation** | Drag & drop | npm install + config edit |
| **Auto-import** | ✅ Automatic | ❌ Manual import |
| **Auto-sync** | ✅ On every startup | ❌ Manual updates |
| **CLI access** | ❌ Extension only | ✅ Full CLI available |
| **Configuration** | Settings UI | Terminal commands |
| **Best for** | Most users | Power users, developers |

---

## 🚀 Next Steps

After installation, learn how to use NCP:
- **[NCP Usage Guide](../guides/how-it-works.md)** - Understanding NCP's architecture
- **[Testing Guide](../guides/testing.md)** - Verify everything works
- **[Troubleshooting](../../README.md#-troubleshooting)** - Common issues and solutions

---

## 📍 Configuration File Locations

**macOS:**
- Claude Desktop config: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop extensions: `~/Library/Application Support/Claude/Claude Extensions/`
- NCP profiles: `~/.ncp/profiles/`
- NCP logs: `~/Library/Logs/Claude/mcp-server-NCP - Natural Context Provider.log`

**Windows:**
- Claude Desktop config: `%APPDATA%\Claude\claude_desktop_config.json`
- Claude Desktop extensions: `%APPDATA%\Claude\Claude Extensions\`
- NCP profiles: `~/.ncp/profiles/`

**Linux:**
- Claude Desktop config: `~/.config/Claude/claude_desktop_config.json`
- Claude Desktop extensions: `~/.config/Claude/Claude Extensions/`
- NCP profiles: `~/.ncp/profiles/`

---

## 🤝 Need Help?

- **GitHub Issues:** [Report bugs or request features](https://github.com/portel-dev/ncp/issues)
- **GitHub Discussions:** [Ask questions and share tips](https://github.com/portel-dev/ncp/discussions)
- **Documentation:** [Main README](../../README.md)
