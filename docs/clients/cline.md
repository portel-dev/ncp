# NCP Setup for Cline (VS Code Extension)

Set up NCP in Cline to manage your MCP tools with just-in-time loading, semantic search, and intelligent routing.

---

## 📋 Prerequisites

- **Node.js 18+** ([Download here](https://nodejs.org/))
- **VS Code** ([Download here](https://code.visualstudio.com/))
- **Cline extension** ([Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev))
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

### Step 2: Install Cline Extension

1. Open VS Code
2. Go to Extensions: `Cmd/Ctrl + Shift + X`
3. Search for: `Cline`
4. Click **Install**

### Step 3: Configure NCP in Cline

**Option A: Using Cline's UI (Recommended)**

1. Open Cline sidebar (click Cline icon in VS Code activity bar)
2. Click the **MCP Servers** icon in Cline's top navigation bar
3. Click **+ Add MCP Server**
4. Fill in the configuration:
   - **Name**: `ncp`
   - **Command**: `ncp` (or full path if needed)
   - **Arguments**: Leave empty (or add `--profile your-profile-name` for specific profile)
5. Click **Save**

**Option B: Manual Configuration**

Edit Cline's MCP settings file directly:

**Config file location:**
```bash
# macOS/Linux
~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json

# Windows
%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**Configuration content:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "args": []
    }
  }
}
```

### Step 4: Verify Setup

1. Open Cline in VS Code (sidebar icon or `Cmd/Ctrl + Shift + P` → `Cline: Open`)
2. In Cline's chat, type: `/tools` or ask: "What tools are available?"
3. You should see NCP's `find` and `run` tools listed
4. Test it: Ask Cline to "find GitHub tools using NCP"

---

## 🎯 Using NCP in Cline

### Semantic Tool Discovery

NCP provides two main tools that Cline can use:

1. **`ncp_find`** - Discover tools using natural language
   - Cline can automatically invoke this when you ask for specific capabilities
   - Example: "Find tools for database operations"

2. **`ncp_run`** - Execute discovered tools
   - After finding tools, Cline can run them
   - Example: "Run the GitHub list issues tool for anthropic/mcp"

### How It Works

1. **Cline asks NCP for tools**: Instead of loading all 200+ tools from 37 MCPs into context, Cline asks NCP to find relevant tools on demand
2. **Semantic search**: NCP uses vector similarity to find the most relevant tools based on your natural language query
3. **Just-in-time loading**: Only the tools you actually need get loaded into the conversation
4. **Token savings**: Reduces context by 90%+, enabling longer conversations with Cline

### MCP Server Management

Cline provides built-in MCP management:

- **View servers**: Click MCP Servers icon → **Installed** tab
- **Enable/Disable**: Toggle servers on/off without removing them
- **Advanced settings**: Click **Advanced MCP Settings** for global behavior options

---

## ⚙️ Configuration Options

### Using Profiles

If you have multiple NCP profiles (e.g., `work`, `personal`), configure each as a separate server:

```json
{
  "mcpServers": {
    "ncp-work": {
      "command": "ncp",
      "args": ["--profile", "work"]
    },
    "ncp-personal": {
      "command": "ncp",
      "args": ["--profile", "personal"]
    }
  }
}
```

Then enable/disable each profile as needed in Cline's MCP settings UI.

### Custom NCP Installation Path

If NCP is installed in a non-standard location, use the full path:

**Mac/Linux:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "/usr/local/bin/ncp",
      "args": []
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "C:\\Users\\<username>\\AppData\\Roaming\\npm\\ncp.cmd",
      "args": []
    }
  }
}
```

Find the exact path:
```bash
# Mac/Linux
which ncp

# Windows (Command Prompt)
where ncp

# Windows (PowerShell)
Get-Command ncp
```

### Environment Variables

Pass environment variables to NCP:

```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "args": [],
      "env": {
        "NCP_DEBUG": "true"
      }
    }
  }
}
```

---

## 🛟 Troubleshooting

### NCP Not Showing Up in Cline

1. **Check MCP Servers tab**: Click MCP icon in Cline → **Installed** tab
2. **Verify NCP is enabled**: Make sure the toggle next to NCP is ON
3. **Reload Cline**: Close and reopen Cline sidebar
4. **Reload VS Code**: `Cmd/Ctrl + Shift + P` → `Developer: Reload Window`

### "Command not found" or `spawn npx ENOENT` Error

This usually means Cline can't find the `ncp` command. Solutions:

1. **Use full path**: Edit the config to use absolute path to NCP (see above)
2. **Check PATH**: Make sure npm's global bin directory is in your system PATH
3. **Verify installation**: Run `ncp --version` in your terminal to confirm NCP works

**Common fix for Windows:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\ncp.cmd",
      "args": []
    }
  }
}
```

### NCP Tools Not Being Used

1. **Check server status**: MCP Servers tab should show NCP as **Connected** (green dot)
2. **Enable server**: Make sure the toggle is ON
3. **Ask explicitly**: Try: "Use NCP to find GitHub tools"
4. **Check logs**: Click the log icon next to NCP in MCP Servers tab to see connection errors

### MCP Mode Settings

Cline has global MCP behavior settings:

1. Go to: **MCP Servers** → **Installed** → **Advanced MCP Settings**
2. Find: `Cline > Mcp:Mode`
3. Options:
   - **Enable all** - Use all MCP servers
   - **Disable all** - Don't use any MCP servers
   - **Ask every time** - Prompt before using MCP tools (recommended for testing)

Make sure this isn't set to "Disable all".

---

## 💡 Tips

1. **Works with any LLM**: Cline can use NCP with OpenAI GPT-4, Claude, or any other model provider
2. **Tool approval**: Cline will ask for approval before running MCP tools - click "Allow" to proceed
3. **View tools**: Use `/tools` command in Cline to see all available MCP tools
4. **Natural language**: Ask Cline to "find tools for X" instead of manually invoking NCP
5. **Profile switching**: Enable different NCP profiles for different projects or contexts

---

## 🔗 Related Documentation

- [Back to Main README](../../README.md)
- [Advanced Usage & Environment Variables](../ADVANCED_USAGE_GUIDE.md)
- [Cline Documentation](https://docs.cline.bot/)

---

## 🎥 Example Workflow

Here's a typical workflow using NCP with Cline:

1. **You**: "I need to work with GitHub issues for the anthropic/mcp repository"
2. **Cline**: Uses NCP to find GitHub-related tools
3. **Cline**: Shows available tools: `github:list_issues`, `github:create_issue`, etc.
4. **You**: "List all open issues"
5. **Cline**: Uses NCP to run `github:list_issues` with appropriate parameters
6. **Result**: Issues displayed in chat

All without manually loading 200+ tools into context!

---

**Need help?** Check out the [Troubleshooting Guide](../../README.md#-troubleshooting) or [open an issue](https://github.com/portel-dev/ncp/issues).
