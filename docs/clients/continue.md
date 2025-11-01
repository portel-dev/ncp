# NCP Setup for Continue

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

### Step 2: Install Continue Extension

Open VS Code → Extensions → Search for "Continue" → Install

### Step 3: Configure MCP Server

Create configuration in `.continue/mcpServers/` directory:

```bash
# In your workspace root
mkdir -p .continue/mcpServers
```

**Create `.continue/mcpServers/ncp.yaml`:**
```yaml
name: ncp
command: ncp
```

**Or use JSON** (`.continue/mcpServers/ncp.json`):
```json
{
  "name": "ncp",
  "command": "ncp"
}
```

### Step 4: Reload VS Code

Open Command Palette (`Cmd/Ctrl + Shift + P`) → `Developer: Reload Window`

---

## 📖 Official Documentation

For complete Continue setup, Agent Mode configuration, and features:

**📚 [Official Continue MCP Guide](https://docs.continue.dev/customize/deep-dives/mcp)**

**Requirements:**
- Agent Mode must be enabled for MCP tools to work

---

## ⚙️ NCP-Specific Configuration

### Using Profiles

Separate work and personal MCPs:

**.continue/mcpServers/ncp-work.yaml:**
```yaml
name: ncp-work
command: ncp
env:
  NCP_PROFILE: work
```

**.continue/mcpServers/ncp-personal.yaml:**
```yaml
name: ncp-personal
command: ncp
env:
  NCP_PROFILE: personal
```

### Debug Logs

Enable logging to `~/.ncp/logs/`:

```yaml
name: ncp
command: ncp
env:
  NCP_DEBUG: "true"
```

### Custom Working Directory

```yaml
name: ncp
command: ncp
env:
  NCP_WORKING_DIR: /path/to/workspace
```

---

## 💡 What NCP Provides

- **`ncp_find`** - Semantic search across all your MCPs
- **`ncp_run`** - Execute any tool with proper parameter handling

**Result:** 90%+ token savings, longer conversations, just-in-time tool loading.

---

**Need help?** [Troubleshooting Guide](../../README.md#-troubleshooting) | [Open an issue](https://github.com/portel-dev/ncp/issues)
