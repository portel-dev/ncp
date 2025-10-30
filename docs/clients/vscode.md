# NCP Setup for VS Code with GitHub Copilot

Set up NCP in Visual Studio Code with GitHub Copilot to manage your MCP tools with just-in-time loading, semantic search, and intelligent routing.

---

## 📋 Prerequisites

- **Node.js 18+** ([Download here](https://nodejs.org/))
- **VS Code 1.99 or later** ([Download here](https://code.visualstudio.com/))
- **GitHub Copilot subscription** ([Get Copilot](https://github.com/features/copilot))
- **Command line access** (Terminal on Mac/Linux, Command Prompt/PowerShell on Windows)

---

## 🚀 Quick Setup

### Step 1: Install NCP

```bash
npm install -g @portel/ncp
```

**Verify installation:**
```bash
ncp --version
# Should show: 1.x.x (current installed version)
```

### Step 2: Enable MCP Support in VS Code

MCP support is enabled by default in VS Code 1.99+, but verify it's active:

1. Open VS Code Settings: `Cmd/Ctrl + ,`
2. Search for: `chat.mcp.enabled`
3. Ensure it's **checked** ✅

### Step 3: Enable Agent Mode

MCP tools require Agent Mode to function:

1. Open VS Code Settings: `Cmd/Ctrl + ,`
2. Search for: `chat.agent.enabled`
3. Ensure it's **checked** ✅

### Step 4: Configure NCP as an MCP Server

**Option A: Command Palette (Easiest)**

1. Open Command Palette: `Cmd/Ctrl + Shift + P`
2. Type and select: `MCP: Add Server`
3. Follow the prompts to add NCP

**Option B: Manual Configuration (Recommended)**

Create an MCP configuration file in your workspace:

```bash
# Create the file in your project root
.vscode/mcp.json
```

**Configuration content:**
```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp",
      "args": []
    }
  }
}
```

**For Windows users**, you may need the full path:
```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "C:\\Users\\<username>\\AppData\\Roaming\\npm\\ncp.cmd",
      "args": []
    }
  }
}
```

### Step 5: Reload VS Code

1. Open Command Palette: `Cmd/Ctrl + Shift + P`
2. Type and select: `Developer: Reload Window`

### Step 6: Verify Setup

1. Open Copilot Chat: `Cmd/Ctrl + I` or click chat icon
2. Type: `#ncp:find github`
3. Approve the tool invocation when prompted
4. You should see NCP discover GitHub-related tools from your installed MCPs

---

## 🎯 Using NCP in VS Code

### Accessing MCP Tools

NCP provides two main tools that GitHub Copilot can use in Agent Mode:

1. **`ncp:find`** - Discover tools using natural language
   ```
   Example: "#ncp:find tools for reading files"
   Example: "#ncp:find database operations"
   ```

2. **`ncp:run`** - Execute discovered tools
   ```
   Example: "#ncp:run github:list_issues owner=anthropic repo=mcp"
   ```

### How It Works

1. **Copilot asks NCP for tools**: Instead of loading all 200+ tools from 37 MCPs into context, Copilot asks NCP to find relevant tools on demand
2. **Semantic search**: NCP uses vector similarity to find the most relevant tools based on your natural language query
3. **Just-in-time loading**: Only the tools you actually need get loaded into the conversation
4. **Token savings**: Reduces context by 90%+, enabling longer conversations

### Tool Invocation Approval

VS Code will prompt you to approve MCP tool invocations for security:

- Click **Allow** to execute the tool
- Click **Deny** to cancel
- Check **Always allow for this workspace** to skip future prompts

---

## ⚙️ Configuration Options

### Using Profiles

If you have multiple NCP profiles (e.g., `work`, `personal`), specify which one VS Code should use:

```json
{
  "servers": {
    "ncp-work": {
      "type": "stdio",
      "command": "ncp",
      "args": ["--profile", "work"]
    },
    "ncp-personal": {
      "type": "stdio",
      "command": "ncp",
      "args": ["--profile", "personal"]
    }
  }
}
```

### Global vs Workspace Configuration

**Workspace-specific** (`.vscode/mcp.json` in project root):
- Shared with your team via Git
- Only active in that project
- Recommended for project-specific MCPs

**Global** (import Claude Desktop config):

If you already use NCP with Claude Desktop, reuse that configuration:

1. Open VS Code `settings.json`: `Cmd/Ctrl + Shift + P` → `Preferences: Open User Settings (JSON)`
2. Add:
```json
{
  "chat.mcp.configFile": "~/.config/claude/claude_desktop_config.json"
}
```

**macOS path:**
```json
{
  "chat.mcp.configFile": "~/Library/Application Support/Claude/claude_desktop_config.json"
}
```

**Windows path:**
```json
{
  "chat.mcp.configFile": "%APPDATA%\\Claude\\claude_desktop_config.json"
}
```

### Environment Variables

Pass environment variables to NCP:

```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp",
      "args": [],
      "env": {
        "NCP_DEBUG": "true"
      }
    }
  }
}
```

Or use an `.env` file:

```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "ncp",
      "args": [],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

---

## 🛟 Troubleshooting

### NCP Not Showing Up in Copilot Chat

1. **Check MCP is enabled**: Settings → `chat.mcp.enabled` should be **checked**
2. **Check Agent Mode**: Settings → `chat.agent.enabled` should be **checked**
3. **Reload window**: `Cmd/Ctrl + Shift + P` → `Developer: Reload Window`
4. **Check VS Code version**: You need VS Code 1.99 or later (`Help` → `About`)

### "Command not found" Error

Find your NCP installation path:

```bash
# Mac/Linux
which ncp

# Windows (Command Prompt)
where ncp

# Windows (PowerShell)
Get-Command ncp
```

Then use the full path in `mcp.json`:

**Mac/Linux:**
```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "/usr/local/bin/ncp",
      "args": []
    }
  }
}
```

**Windows:**
```json
{
  "servers": {
    "ncp": {
      "type": "stdio",
      "command": "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\ncp.cmd",
      "args": []
    }
  }
}
```

### MCP Tools Not Being Invoked

- **Explicitly reference tools**: Type `#` in Copilot Chat to see available MCP tools
- **Use Agent Mode**: MCP tools only work when Agent Mode is enabled
- **Approve invocations**: Don't click "Deny" when prompted - click "Allow"

### Organization Policy Blocking MCP

If you're in a GitHub organization:

1. **Check policy**: Your org admin must enable the "MCP servers in Copilot" policy
2. **Default**: This policy is **disabled** by default
3. **Contact admin**: Ask your GitHub org administrator to enable MCP support

### Check MCP Server Status

View MCP server connection status in Output panel:

1. Open Output panel: `View` → `Output` or `Cmd/Ctrl + Shift + U`
2. Select `Model Context Protocol` from dropdown
3. Look for connection errors or NCP startup issues

---

## 🔗 Related Documentation

- [Back to Main README](../../README.md)
- [Advanced Usage & Environment Variables](../ADVANCED_USAGE_GUIDE.md)
- [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [GitHub Copilot MCP Guide](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol)

---

## 💡 Tips

1. **Start specific**: Instead of asking for "all tools", use semantic queries like "tools for reading GitHub issues"
2. **Use profiles**: Separate work and personal MCPs for better organization
3. **Share configs**: Commit `.vscode/mcp.json` to Git so your team gets the same setup
4. **Leverage semantic search**: NCP understands natural language - "database operations", "file system access", "API calls" all work
5. **Check the `#` menu**: Type `#` in Copilot Chat to see all available MCP tools

---

**Need help?** Check out the [Troubleshooting Guide](../../README.md#-troubleshooting) or [open an issue](https://github.com/portel-dev/ncp/issues).
