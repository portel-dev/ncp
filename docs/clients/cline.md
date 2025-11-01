# NCP Setup for Cline

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

### Step 2: Install Cline Extension

Open VS Code → Extensions → Search for "Cline" → Install

### Step 3: Configure MCP Server

**Config file location:**
```bash
# macOS/Linux
~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json

# Windows
%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**Or use Cline's UI:** Cline sidebar → MCP Servers icon → Add MCP Server

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

### Step 4: Reload VS Code

Open Command Palette (`Cmd/Ctrl + Shift + P`) → `Developer: Reload Window`

---

## 📖 Official Documentation

For complete Cline setup, features, and troubleshooting:

**📚 [Official Cline Documentation](https://docs.cline.bot/)**

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
