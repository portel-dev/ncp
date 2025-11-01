# NCP Setup for Windsurf

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

### Step 2: Configure MCP Server

**Config file location:**
```bash
# macOS/Linux
~/.codeium/windsurf/mcp_config.json

# Windows
%USERPROFILE%\.codeium\windsurf\mcp_config.json
```

**Or use Windsurf UI:** Settings (`Cmd/Ctrl + ,`) → Advanced Settings → Cascade → Manage MCP Servers → View raw config

**Configuration:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

### Step 3: Restart Windsurf

Close and reopen Windsurf IDE.

---

## 📖 Official Documentation

For complete Windsurf MCP setup, Cascade features, and troubleshooting:

**📚 [Official Windsurf MCP Guide](https://docs.windsurf.com/windsurf/cascade/mcp)**

**📚 [Windsurf Configuration Tutorial](https://windsurf.com/university/tutorials/configuring-first-mcp-server)**

---

## ⚙️ NCP-Specific Configuration

### Using Profiles

Separate work and personal MCPs:

```json
{
  "mcpServers": {
    "ncp-work": {
      "command": "ncp",
      "env": {
        "NCP_PROFILE": "work"
      }
    },
    "ncp-personal": {
      "command": "ncp",
      "env": {
        "NCP_PROFILE": "personal"
      }
    }
  }
}
```

### Debug Logs

Enable logging to `~/.ncp/logs/`:

```json
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

### Custom Working Directory

```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "env": {
        "NCP_WORKING_DIR": "/path/to/workspace"
      }
    }
  }
}
```

---

## 💡 What NCP Provides

- **`ncp_find`** - Semantic search across all your MCPs
- **`ncp_run`** - Execute any tool with proper parameter handling

**Result:** 90%+ token savings, longer conversations, just-in-time tool loading.

---

**Need help?** [Troubleshooting Guide](../../README.md#-troubleshooting) | [Open an issue](https://github.com/portel-dev/ncp/issues)
