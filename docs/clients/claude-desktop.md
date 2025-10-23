# NCP for Claude Desktop

Complete installation and configuration guide for Claude Desktop users.

## Table of Contents
- [Installation Methods](#installation-methods)
  - [Method 1: .dxt Extension (Recommended)](#method-1-dxt-extension-recommended)
  - [Method 2: npm Package](#method-2-npm-package)
- [Configuration](#configuration)
- [Features](#features)
- [Troubleshooting](#troubleshooting)

---

## 📦 Installation Methods

### Method 1: .dxt Extension (Recommended) ⚡

**One-click installation with automatic MCP synchronization.**

#### Step 1: Download & Install

1. **Download:** [ncp.dxt](https://github.com/portel-dev/ncp/releases/latest/download/ncp.dxt) (72MB)
2. **Double-click** the downloaded file
3. **Click "Install"** in Claude Desktop's installation dialog

> 📸 **Screenshot needed:** `dxt-install-dialog.png` - Claude Desktop's .dxt installation prompt

**✅ Installation complete!** NCP is now active in Claude Desktop.

#### Step 2: Verify Installation

Open a new conversation in Claude Desktop and ask:
```
What tools do you have access to?
```

You should see only 2 tools:
- `find` - Semantic tool discovery
- `run` - Execute any discovered tool

> 📸 **Screenshot needed:** `tool-list-after-install.png` - Claude showing only 2 NCP tools

#### Step 3: Configure Extension Settings (Optional)

Access NCP settings in Claude Desktop:
1. Click **Settings** → **Extensions**
2. Find **NCP - Natural Context Provider**
3. Click **Configure**

> 📸 **Screenshot needed:** `extension-settings-panel.png` - Claude Desktop extension settings UI

**Available Settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| **Profile Name** | `all` | Which NCP profile to use |
| **Configuration Path** | `~/.ncp` | Where to store NCP data (`~/.ncp` for global, `.ncp` for project-local) |
| **Enable Global CLI Access** | `false` | Create global `ncp` command for terminal |
| **Auto-import Client MCPs** | `true` | Automatically sync MCPs from Claude Desktop config |
| **Enable Scheduler** | `true` | Built-in task scheduler (5 CRUD tools) |
| **Enable MCP Management** | `true` | Dynamic MCP installation tools |
| **Confirm Before Run** | `true` | Ask confirmation before modifications |
| **Enable Debug Logging** | `false` | Show detailed troubleshooting logs |

> 💡 **Tip:** Leave "Auto-import Client MCPs" enabled for zero-config MCP management!

#### Step 4: Auto-Sync Magic 🔄

**NCP automatically synchronizes MCPs from Claude Desktop on every startup.**

**How it works:**
1. Add any MCP to Claude Desktop (via config file or .dxt install)
2. Restart Claude Desktop
3. NCP auto-detects and imports it
4. **Zero manual configuration required!**

**What gets synchronized:**
- ✅ MCPs from `claude_desktop_config.json`
- ✅ Other .dxt-installed extensions
- ✅ Command arguments and paths
- ✅ Environment variables
- ✅ Authentication tokens (stored securely)

**Example:**

1. Install another MCP (e.g., filesystem):
```json
// In claude_desktop_config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"]
    }
  }
}
```

2. Restart Claude Desktop
3. NCP automatically imports it - verify with:
```bash
ncp list  # Shows filesystem MCP
```

> 📸 **Screenshot needed:** `auto-sync-demo.png` - Terminal showing `ncp list` output after auto-sync

---

### Method 2: npm Package 🔧

**For advanced users who want CLI access and manual control.**

#### Step 1: Install NCP Globally

```bash
npm install -g @portel/ncp
```

**Verify installation:**
```bash
ncp --version
# Should show: 1.6.0
```

#### Step 2: Import Existing MCPs

If you already have MCPs configured in Claude Desktop:

```bash
# NCP auto-detects claude_desktop_config.json location
ncp config import

# Or specify manually:
ncp config import "~/Library/Application Support/Claude/claude_desktop_config.json"
```

> 📸 **Screenshot needed:** `import-success.png` - Terminal showing successful import

**Verify import:**
```bash
ncp list
# Shows all imported MCPs
```

#### Step 3: Configure Claude Desktop

Edit your Claude Desktop config file:

**Config file locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Replace entire contents with:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

> ⚠️ **Important:** This removes direct MCP connections from Claude. All MCPs are now managed through NCP instead.

#### Step 4: Restart Claude Desktop

Close and reopen Claude Desktop for changes to take effect.

#### Step 5: Verify Setup

Ask Claude:
```
What tools do you have?
```

Expected response:
```
I have access to 2 tools:
- find: Discover tools semantically
- run: Execute discovered tools
```

---

## ⚙️ Configuration

### Environment Variables

Control NCP behavior via environment variables in your Claude Desktop config:

```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "env": {
        "NCP_DEBUG": "true",
        "NCP_PROFILE": "development",
        "NCP_ENABLE_SCHEDULE_MCP": "false",
        "NCP_CONFIRM_BEFORE_RUN": "false"
      }
    }
  }
}
```

**Available environment variables:**

| Variable | Values | Description |
|----------|--------|-------------|
| `NCP_DEBUG` | `true`/`false` | Enable debug logging |
| `NCP_PROFILE` | profile name | Which profile to use (default: `all`) |
| `NCP_CONFIG_PATH` | path | Custom config directory |
| `NCP_ENABLE_SCHEDULE_MCP` | `true`/`false` | Enable scheduler internal MCP |
| `NCP_ENABLE_MCP_MANAGEMENT` | `true`/`false` | Enable MCP management tools |
| `NCP_CONFIRM_BEFORE_RUN` | `true`/`false` | Require confirmation for modifications |
| `NCP_AUTO_IMPORT` | `true`/`false` | Auto-import from Claude Desktop |

### Profile Management

**Use different MCP sets for different purposes:**

```bash
# Create development profile
ncp add --profile dev filesystem npx @modelcontextprotocol/server-filesystem ~/dev
ncp add --profile dev github npx @modelcontextprotocol/server-github

# Create production profile
ncp add --profile prod database npx production-db-server
```

**Configure Claude Desktop to use a specific profile:**

```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "args": ["--profile", "dev"]
    }
  }
}
```

### Project-Local Configuration

**Configure MCPs per project** (perfect for teams):

```bash
# In your project directory
mkdir .ncp
cd .ncp

# Add project-specific MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ./
ncp add github npx @modelcontextprotocol/server-github
```

**How it works:**
- 📁 **`.ncp` directory exists** → Uses project configuration
- 🏠 **No `.ncp` directory** → Falls back to global `~/.ncp`
- 🎯 **Zero profile switching needed** → Automatic detection

> 💡 **Tip:** Ship `.ncp` folder with your repo for team consistency!

---

## ✨ Features

### 1. Semantic Tool Discovery

Ask Claude to find tools naturally:

```
"I need to read a file"
"Help me send an email"
"Search for code on GitHub"
```

Claude uses `find` tool to discover the right MCP instantly.

> 📸 **Screenshot needed:** `semantic-search.png` - Claude using find tool with natural language

### 2. Automatic Health Monitoring

NCP continuously monitors MCP health and routes around broken tools.

```bash
# Check MCP health status
ncp list --depth 1
```

Unhealthy MCPs are automatically excluded from discovery.

> 📸 **Screenshot needed:** `health-status.png` - `ncp list` showing health indicators

### 3. Built-in Scheduler

Schedule any MCP tool to run automatically:

```bash
# Ask Claude to schedule a task
"Schedule a daily backup check at 2am"
```

Claude uses `schedule:create` to set it up automatically.

**Manual scheduling:**
```bash
ncp run schedule:create --params '{
  "name": "Daily Backup Check",
  "schedule": "every day at 2am",
  "tool": "filesystem:list_directory",
  "parameters": {"path": "/backups"}
}'
```

See [Scheduler User Guide](../SCHEDULER_USER_GUIDE.md) for details.

### 4. Dynamic MCP Installation

Claude can install MCPs for you:

```
"I need to work with PostgreSQL database"
```

Claude discovers and installs the PostgreSQL MCP automatically using `mcp:search` and `mcp:install`.

---

## 🛟 Troubleshooting

### MCPs Not Auto-Syncing

**Check what was imported:**
```bash
ncp list
```

**Manually trigger import:**
```bash
ncp config import
```

**Enable debug logs:**
```bash
NCP_DEBUG=true ncp config import
```

**Verify Claude Desktop config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Extension Not Showing in Claude

1. **Verify download:** .dxt file should be ~72MB
2. **Re-install:** Download fresh copy and re-install
3. **Check Claude version:** Requires Claude Desktop v0.7+
4. **Restart Claude:** Close completely and reopen

### Claude Not Using NCP Tools

**Verify NCP is configured:**
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
# Should show "ncp" in mcpServers
```

**Test NCP directly:**
```bash
ncp find "test"
# Should return results
```

**Check logs:**
```bash
# Enable debug mode in Claude Desktop config
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "env": {
        "NCP_DEBUG": "true"
      }
    }
  }
}
```

Then check logs in: `~/Library/Logs/Claude/`

### Tools Not Being Found

**Validate configuration:**
```bash
ncp config validate
```

**Check MCP health:**
```bash
ncp list --depth 1
# Look for ❌ unhealthy MCPs
```

**Clear cache:**
```bash
rm -rf ~/.ncp/cache
```

**Re-import MCPs:**
```bash
ncp config import --force
```

### Performance Issues

**Check for unhealthy MCPs:**
```bash
ncp list --depth 1
```

Unhealthy MCPs slow down startup. Remove or fix them.

**Monitor with debug logs:**
```bash
NCP_DEBUG=true ncp find "test"
```

**Reduce tool count:**
Only enable MCPs you actively use. Fewer MCPs = faster performance.

---

## 🔗 Related Documentation

- [Configuration Options](../guides/configuration.md)
- [Environment Variables](../guides/environment-variables.md)
- [Scheduler User Guide](../SCHEDULER_USER_GUIDE.md)
- [Troubleshooting Guide](../guides/troubleshooting.md)
- [Back to Main README](../../README.md)

---

## 📸 Screenshots Needed

**For contributors:** We need the following screenshots:

1. **`dxt-install-dialog.png`** - Claude Desktop's .dxt installation prompt
2. **`tool-list-after-install.png`** - Claude showing only find/run tools
3. **`extension-settings-panel.png`** - NCP settings in Claude Desktop
4. **`auto-sync-demo.png`** - Terminal showing `ncp list` after auto-sync
5. **`import-success.png`** - Terminal showing successful config import
6. **`semantic-search.png`** - Claude using find tool naturally
7. **`health-status.png`** - `ncp list --depth 1` showing health indicators

Place in: `docs/images/clients/claude-desktop/`
