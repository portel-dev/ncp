# NCP Setup for VS Code

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

### Step 2: Configure MCP Server

Create `.vscode/mcp.json` in your workspace root:

```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp-mcp"
    }
  }
}
```

### Step 3: Reload VS Code

Open Command Palette (`Cmd/Ctrl + Shift + P`) → `Developer: Reload Window`

---

## 📖 Official Documentation

For complete VS Code MCP setup, troubleshooting, and requirements:

**📚 [Official VS Code MCP Guide](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)**

**📚 [GitHub Copilot MCP Documentation](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol)**

**Requirements:**
- VS Code 1.99 or later
- GitHub Copilot subscription
- MCP and Agent Mode enabled in settings

---

## ⚙️ NCP-Specific Configuration

### Using Profiles

Separate work and personal MCPs:

```json
{
  "servers": {
    "ncp-work": {
      "type": "stdio",
      "command": "ncp-mcp",
      "args": ["--profile", "work"]
    },
    "ncp-personal": {
      "type": "stdio",
      "command": "ncp-mcp",
      "args": ["--profile", "personal"]
    }
  }
}
```

### Debug Logs

Enable logging to `~/.ncp/logs/`:

```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp-mcp",
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
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp-mcp",
      "args": ["--working-dir", "${workspaceFolder}"]
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
