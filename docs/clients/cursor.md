# NCP Setup for Cursor

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

### Step 2: Configure MCP Server

**Global configuration:**
```bash
~/.cursor/mcp.json
```

**Project-specific:**
```bash
<project-root>/.cursor/mcp.json
```

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

### Step 3: Restart Cursor

Close and reopen Cursor IDE.

---

## 📖 Official Documentation

For complete Cursor MCP setup, troubleshooting, and features:

**📚 [Official Cursor MCP Guide](https://docs.cursor.com/context/model-context-protocol)**

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
