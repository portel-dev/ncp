# Claude Desktop + NCP: Complete Guide

The easiest way to supercharge Claude Desktop with NCP's powerful MCP orchestration.

---

## 📦 **What is the .dxt Extension?**

`.dxt` (Desktop Extension) is NCP's one-click installation format specifically designed for Claude Desktop:

**What makes it special:**
- ✅ **30-second install** - Download → Double-click → Done
- ✅ **Auto-sync** - Continuously imports MCPs from Claude Desktop config
- ✅ **Zero configuration** - No JSON editing, no terminal commands
- ✅ **Dynamic runtime** - Adapts to Claude Desktop's Node.js/Python versions automatically
- ✅ **Tiny size** - 126KB (MCP-only, no CLI code)
- ✅ **Native feel** - Integrates seamlessly with Claude Desktop UI

**vs npm installation:**
- No terminal required
- No global packages
- Automatic MCP detection
- Optimized for Claude Desktop only

---

## 🚀 **Installation: Step-by-Step**

### **Step 1: Download**

Go to [NCP Releases](https://github.com/portel-dev/ncp/releases/latest) and download:

```
ncp.dxt
```

![Download .dxt file](../images/claude/01-download.png)
*Screenshot: GitHub releases page showing ncp.dxt download button*

**File location after download:**
- **macOS:** `~/Downloads/ncp.dxt`
- **Windows:** `%USERPROFILE%\Downloads\ncp.dxt`

---

### **Step 2: Double-Click to Install**

Navigate to your Downloads folder and **double-click** `ncp.dxt`:

![Double-click ncp.dxt](../images/claude/02-double-click.png)
*Screenshot: Finder/Explorer with ncp.dxt file highlighted*

**What happens:**
- Claude Desktop recognizes the `.dxt` extension
- Launches installation prompt automatically
- No manual terminal commands needed

---

### **Step 3: Confirm Installation**

Claude Desktop shows an installation confirmation dialog:

![Installation confirmation dialog](../images/claude/03-install-prompt.png)
*Screenshot: Claude Desktop modal with install prompt*

**Dialog contents:**
```
Install Desktop Extension?

Name: NCP - Natural Context Provider
Version: 1.5.3
Publisher: portel-dev
Size: 126 KB

This extension will:
• Access your MCP configurations
• Run as an MCP server
• Auto-sync with Claude Desktop settings

[Cancel]  [Install]
```

Click **[Install]** to proceed.

---

### **Step 4: Installation Complete**

Success screen confirms NCP is installed:

![Installation success](../images/claude/04-success.png)
*Screenshot: Success message with green checkmark*

```
✅ NCP Installed Successfully

NCP will now:
• Auto-sync MCPs from Claude Desktop on every startup
• Provide 2 unified tools instead of 50+ individual tools
• Save 97% on token usage

Restart Claude Desktop to activate NCP.

[Restart Now]  [Later]
```

Click **[Restart Now]** for immediate activation.

---

## 🔄 **Auto-Sync: How It Works**

NCP continuously syncs with Claude Desktop - no manual configuration needed!

### **What Gets Synced**

On every Claude Desktop startup, NCP automatically detects:

1. **MCPs from config file**
   - Reads `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Imports all `mcpServers` entries
   - Preserves environment variables and credentials

2. **.mcpb/.dxt extensions**
   - Detects other installed extensions
   - Imports their tool definitions
   - Ensures compatibility

3. **New/removed MCPs**
   - Adds newly installed MCPs automatically
   - Removes uninstalled MCPs from cache
   - Keeps everything in sync

### **Sync Indicator**

In Claude Desktop's status bar:

![Sync indicator](../images/claude/05-sync-indicator.png)
*Screenshot: Claude Desktop status bar showing NCP sync status*

```
🔄 NCP: Syncing MCPs...     → During sync
✅ NCP: 15 MCPs synced       → After sync complete
⚠️  NCP: 2 MCPs failed      → If some failed
```

### **Manual Sync**

You can trigger sync manually from settings:

```bash
# Via CLI (if installed)
ncp config import

# Or edit config directly
nano ~/.ncp/profiles/all.json
```

---

## ⚙️ **Configuration UI**

### **Accessing Settings**

Open NCP settings from Claude Desktop menu:

**Menu path:**
```
Claude Desktop → Extensions → NCP → Settings
```

![NCP Settings menu](../images/claude/06-settings-menu.png)
*Screenshot: Claude Desktop menu with NCP settings highlighted*

---

### **Settings Panel**

The NCP settings panel provides easy configuration:

![NCP Settings panel](../images/claude/07-settings-panel.png)
*Screenshot: Full NCP settings interface*

#### **General Settings**

```
┌─ General ──────────────────────────────────────┐
│                                                 │
│ ✅ Enable NCP orchestration                    │
│    Use NCP to manage all MCP tools             │
│                                                 │
│ ✅ Auto-sync on startup                        │
│    Import MCPs from Claude Desktop config      │
│                                                 │
│ ⚙️  Profile: all                               │
│    [Change Profile ▼]                          │
│                                                 │
│ 📊 Currently managing: 15 MCPs, 67 tools      │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### **Safety Settings**

```
┌─ Safety ───────────────────────────────────────┐
│                                                 │
│ ✅ Confirm modifications before executing      │
│    Protect against unwanted writes/deletes     │
│                                                 │
│    Tools requiring confirmation:               │
│    • filesystem:write_file                     │
│    • docker:run_command                        │
│    • kubernetes:kubectl_generic                │
│    • 2 more...                                 │
│                                                 │
│    Approved tools: 0                           │
│    [Manage Whitelist →]                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### **Advanced Settings**

```
┌─ Advanced ─────────────────────────────────────┐
│                                                 │
│ 🔍 Discovery Engine                            │
│    • Semantic search: ✅ Enabled               │
│    • Cache embeddings: ✅ Enabled              │
│    • Search confidence: 0.30 threshold         │
│                                                 │
│ 📦 MCP Management                              │
│    • Health checks: ✅ Enabled                 │
│    • Auto-restart failed MCPs: ✅ Enabled      │
│    • Startup delay: 500ms                      │
│                                                 │
│ 🐛 Debug                                        │
│    • Verbose logging: ☐ Disabled               │
│    • Export logs: [Export →]                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🎛️ **Whitelist Management UI**

Manage approved tools that bypass confirmation:

![Whitelist management](../images/claude/08-whitelist.png)
*Screenshot: Whitelist management interface*

```
┌─ Approved Tools ───────────────────────────────┐
│                                                 │
│ Tools that never require confirmation:         │
│                                                 │
│ ┌─────────────────────────────────────────┐  │
│ │ filesystem:read_file              [X]   │  │
│ │ github:get_file_contents          [X]   │  │
│ │ brave-search:search               [X]   │  │
│ └─────────────────────────────────────────┘  │
│                                                 │
│ [Clear All]                    [Add Tool...]   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**How to add:**
1. When prompted for confirmation, click **"Approve Always"**
2. Or manually add via settings panel
3. Tool appears in approved list immediately

**How to remove:**
- Click **[X]** next to tool name
- Or click **[Clear All]** to reset

---

## 📊 **Dashboard View**

NCP provides a live dashboard of your MCP ecosystem:

![NCP Dashboard](../images/claude/09-dashboard.png)
*Screenshot: NCP dashboard showing MCP status*

```
┌─ NCP Dashboard ────────────────────────────────┐
│                                                 │
│ 📊 MCP Ecosystem Status                        │
│                                                 │
│ ✅ filesystem        8 tools    Health: Good   │
│ ✅ github           20 tools    Health: Good   │
│ ✅ brave-search      2 tools    Health: Good   │
│ ✅ memory            5 tools    Health: Good   │
│ ⚠️  docker           8 tools    Health: Warn   │
│    ↳ Connection slow (2.5s response)           │
│ ❌ aws              15 tools    Health: Failed │
│    ↳ Credentials missing                       │
│                                                 │
│ Total: 13 MCPs, 67 tools (11 healthy)         │
│                                                 │
│ [Refresh]  [Fix Issues]  [Export Report]      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Status indicators:**
- ✅ **Green** - MCP healthy and responding
- ⚠️ **Yellow** - MCP slow or warnings
- ❌ **Red** - MCP failed (excluded from discovery)

---

## 🔔 **Notifications**

NCP shows helpful notifications in Claude Desktop:

### **Sync Complete**

![Sync notification](../images/claude/10-sync-notification.png)
*Screenshot: Toast notification for successful sync*

```
┌────────────────────────────────────────┐
│ ✅ NCP Sync Complete                   │
│                                         │
│ Synced 15 MCPs with 67 tools          │
│ • 13 healthy                           │
│ • 2 warnings (docker, aws)             │
│                                         │
│ [View Details]            [Dismiss]    │
└────────────────────────────────────────┘
```

### **New MCP Detected**

```
┌────────────────────────────────────────┐
│ 🆕 New MCP Detected                    │
│                                         │
│ PostgreSQL MCP added to Claude         │
│ NCP auto-imported 8 database tools     │
│                                         │
│ [Use Now]                  [Dismiss]    │
└────────────────────────────────────────┘
```

### **Confirmation Prompt**

```
┌────────────────────────────────────────┐
│ ⚠️  Confirm Modification                │
│                                         │
│ filesystem:write_file                  │
│ "Create or overwrite file"             │
│                                         │
│ Confidence: 46.4%                      │
│                                         │
│ [Run Once]  [Approve Always]  [Cancel] │
└────────────────────────────────────────┘
```

---

## 🎨 **Tool Picker UI**

When AI discovers tools, you see results in-context:

![Tool picker](../images/claude/11-tool-picker.png)
*Screenshot: Tool discovery results inline in chat*

```
Claude: I found these tools for "file operations":

┌─────────────────────────────────────────────┐
│ 🔍 Discovery Results                        │
│                                             │
│ 1. filesystem:read_file           95% ●●●● │
│    Read contents of a file                 │
│                                             │
│ 2. filesystem:write_file          92% ●●●● │
│    Create or overwrite a file              │
│                                             │
│ 3. filesystem:list_directory      87% ●●●  │
│    List files in a directory               │
│                                             │
│ 4. filesystem:search_files        82% ●●●  │
│    Search for files by pattern             │
│                                             │
│ [Show More...]                             │
└─────────────────────────────────────────────┘

I'll use filesystem:read_file to read your document...
```

**Confidence indicators:**
- 90-100%: ●●●● (Very High)
- 70-89%: ●●● (High)
- 50-69%: ●● (Medium)
- 30-49%: ● (Low)

---

## 🗂️ **Files and Locations**

### **Configuration Files**

**Main config:**
```
~/.ncp/profiles/all.json
```
Contains all synced MCPs from Claude Desktop.

**Settings:**
```
~/.ncp/settings.json
```
NCP preferences (modifications toggle, whitelist, etc.)

**Cache:**
```
~/.ncp/cache/
├── embeddings.json     # Tool embeddings for search
├── all-tools.csv       # Complete tool index
└── health.json         # MCP health status
```

### **Logs**

**Location:**
```
~/Library/Logs/Claude/extensions/ncp.log    # macOS
%APPDATA%\Claude\extensions\ncp.log         # Windows
~/.config/Claude/extensions/ncp.log         # Linux
```

**What's logged:**
- Startup and sync events
- Tool discovery queries
- MCP health checks
- Confirmation prompts
- Errors and warnings

**View logs in UI:**
Settings → Advanced → Debug → [Export Logs]

---

## 🛠️ **Manual Configuration**

For power users who want direct control:

### **Edit Profile Directly**

```bash
# Open in editor
nano ~/.ncp/profiles/all.json
```

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/Documents"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    },
    "custom-mcp": {
      "command": "node",
      "args": ["/path/to/your-mcp/index.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

**Restart Claude Desktop** after editing to apply changes.

### **Bypass Auto-Sync**

If you want to manage MCPs manually without auto-sync:

```bash
# Disable auto-sync in settings
Settings → General → ☐ Auto-sync on startup
```

Then edit `~/.ncp/profiles/all.json` directly and restart Claude Desktop.

---

## 🔧 **Troubleshooting**

### **Issue: NCP Not Appearing in Claude Desktop**

**Symptoms:**
- .dxt installed but no NCP tools visible
- Claude shows original 50+ tools

**Solutions:**

1. **Restart Claude Desktop completely**
   ```
   Cmd+Q (macOS) / Alt+F4 (Windows) to quit
   Relaunch Claude Desktop
   ```

2. **Verify installation**
   ```bash
   ls ~/.ncp/
   # Should show: profiles/, cache/, settings.json
   ```

3. **Check config**
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   # Should contain "ncp" entry
   ```

4. **Reinstall if needed**
   - Delete `~/.ncp/` folder
   - Double-click ncp.dxt again
   - Restart Claude Desktop

---

### **Issue: Auto-Sync Not Working**

**Symptoms:**
- New MCPs added to Claude Desktop don't appear in NCP
- Old MCPs remain after removal

**Solutions:**

1. **Trigger manual sync**
   ```bash
   # If CLI is installed
   ncp config import
   ```

2. **Check sync status**
   - Look at status bar indicator
   - Should show "✅ NCP: X MCPs synced"

3. **Verify config location**
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Windows
   type %APPDATA%\Claude\claude_desktop_config.json
   ```

4. **Force re-sync**
   ```bash
   # Clear cache
   rm -rf ~/.ncp/cache

   # Restart Claude Desktop
   ```

---

### **Issue: Confirmation Prompts Too Frequent**

**Symptoms:**
- Getting prompted for every operation
- Slows down workflow

**Solutions:**

1. **Use "Approve Always"**
   - Click this option in prompt
   - Tool added to whitelist permanently

2. **Disable confirmations entirely**
   ```bash
   # Via CLI
   ncp settings modifications off

   # Via UI
   Settings → Safety → ☐ Confirm modifications
   ```

3. **Adjust threshold (advanced)**
   ```bash
   # Edit settings
   nano ~/.ncp/settings.json

   # Change vectorThreshold (0.40 → 0.50)
   # Higher = less sensitive = fewer prompts
   ```

---

### **Issue: Slow Performance**

**Symptoms:**
- Tool discovery takes >2 seconds
- Claude feels sluggish

**Solutions:**

1. **Check MCP health**
   - Dashboard → Look for ⚠️ or ❌ MCPs
   - Slow/failed MCPs drag down performance

2. **Rebuild cache**
   ```bash
   rm -rf ~/.ncp/cache
   # Restart Claude Desktop
   ```

3. **Reduce number of MCPs**
   - Remove unused MCPs from Claude Desktop config
   - NCP performs best with <20 MCPs

4. **Enable debug logging**
   ```bash
   # Settings → Advanced → ✅ Verbose logging
   # Check logs for bottlenecks
   ```

---

### **Issue: Can't Find Specific Tool**

**Symptoms:**
- Tool exists but NCP can't discover it
- Search returns wrong results

**Solutions:**

1. **Try different search phrases**
   ```
   Instead of: "read file"
   Try: "I want to read the contents of a file on disk"
   ```

2. **List all tools**
   ```bash
   ncp list --depth 2
   # Shows complete tool inventory
   ```

3. **Check if MCP is healthy**
   ```bash
   ncp list --depth 1
   # Unhealthy MCPs excluded from discovery
   ```

4. **Rebuild embeddings cache**
   ```bash
   rm ~/.ncp/cache/embeddings.json
   # Restart Claude Desktop
   ```

---

## 📈 **Performance Metrics**

### **With vs Without NCP (in Claude Desktop)**

| Metric | Without NCP | With NCP | Improvement |
|--------|-------------|----------|-------------|
| **Initial tool load** | 50+ tools | 2 tools | **96% reduction** |
| **Token overhead** | 103,000 tokens | 2,500 tokens | **97.6% saved** |
| **Tool selection time** | 5-8 seconds | <0.5 seconds | **10x faster** |
| **Wrong tool selected** | ~30% of time | <3% of time | **10x accuracy** |
| **Conversation length** | 50 messages | 600+ messages | **12x longer** |
| **Memory usage** | ~2GB | ~80MB | **96% saved** |

---

## 🎓 **Best Practices**

### **For Optimal Performance**

1. **Keep MCPs healthy**
   - Check dashboard weekly
   - Fix warnings promptly
   - Remove unused MCPs

2. **Use whitelist wisely**
   - Approve commonly used safe tools
   - Don't approve destructive operations
   - Review whitelist monthly

3. **Let auto-sync work**
   - Don't manually edit configs unless needed
   - Auto-sync ensures consistency
   - Manual edits can break sync

4. **Monitor token usage**
   - Check Claude Desktop usage stats
   - Compare before/after NCP
   - Should see 90%+ reduction

### **For Teams**

1. **Share approved tool lists**
   ```bash
   # Export whitelist
   cat ~/.ncp/settings.json | jq .confirmBeforeRun.approvedTools
   ```

2. **Standardize MCP configs**
   - Use same MCPs across team
   - Share `.ncp/profiles/` folder
   - Sync via git repository

3. **Document custom MCPs**
   - If using non-standard MCPs
   - Include setup instructions
   - Share credentials securely (not in git!)

---

## 🚀 **What's Next?**

Now that NCP is installed in Claude Desktop:

1. **Try discovery**
   - Ask: "Find tools for file operations"
   - Notice how fast and accurate it is

2. **Experience token savings**
   - Have long conversations
   - Notice you don't hit limits anymore

3. **Explore other features**
   - [Project-level configs](../README.md#project-level-configuration)
   - [Registry search](../README.md#registry-discovery)
   - [CLI testing](../README.md#test-drive)

---

## 📚 **Related Documentation**

- **[Main README](../README.md)** - Full NCP documentation
- **[Confirm Before Run](confirm-before-run.md)** - Safety feature details
- **[How It Works](../HOW-IT-WORKS.md)** - Technical deep dive
- **[Troubleshooting](../README.md#troubleshooting)** - General issues

---

## 💬 **Get Help**

Having issues with Claude Desktop + NCP?

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/portel-dev/ncp/issues)
- 💡 **Questions:** [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
- 📖 **Docs:** [Full documentation](../README.md)

**When reporting issues, include:**
- Claude Desktop version
- NCP version (`ncp --version` if CLI installed)
- Operating system
- Relevant log excerpts from `~/Library/Logs/Claude/extensions/ncp.log`

---

**🎉 Enjoy NCP in Claude Desktop!** You now have the most powerful MCP orchestration available, with zero configuration hassle.
