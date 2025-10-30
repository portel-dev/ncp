# NCP Setup for Cursor IDE

Set up NCP in Cursor to manage your MCP tools with just-in-time loading, semantic search, and intelligent routing.

---

## 📋 Prerequisites

- **Node.js 18+** ([Download here](https://nodejs.org/))
- **Cursor IDE** ([Download here](https://cursor.com/))
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

### Step 2: Configure NCP in Cursor

**Option A: UI Configuration (Recommended)**

1. Open Cursor Settings: `Cmd/Ctrl + ,`
2. Go to **Features** → **Model Context Protocol (MCP)**
3. Click **+ Add New MCP Server**
4. Fill in the details:
   - **Name**: `ncp`
   - **Type**: `stdio`
   - **Command**: `ncp` (or full path: `/usr/local/bin/ncp` on Mac/Linux, `C:\Users\<username>\AppData\Roaming\npm\ncp.cmd` on Windows)
   - **Args**: Leave empty (optional: add `--profile your-profile-name` to use a specific profile)

5. Click **Save**

**Option B: Manual Configuration**

Create or edit the MCP configuration file:

**Global (all projects):**
```bash
# macOS/Linux
~/.cursor/mcp.json

# Windows
%USERPROFILE%\.cursor\mcp.json
```

**Project-specific:**
```bash
# Any OS
<project-root>/.cursor/mcp.json
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

### Step 3: Verify Setup

1. Open Cursor Composer (Agent Mode): `Cmd/Ctrl + I`
2. Type: `@ncp find github`
3. You should see NCP discover GitHub-related tools from your installed MCPs

---

## 🎯 Using NCP in Cursor

### Semantic Tool Discovery

NCP provides two main tools that Cursor's Composer Agent can use:

1. **`ncp:find`** - Discover tools using natural language
   ```
   Example: "@ncp find tools for reading files"
   Example: "@ncp find database operations"
   ```

2. **`ncp:run`** - Execute discovered tools
   ```
   Example: "@ncp run github:list_issues owner=anthropic repo=mcp"
   ```

### How It Works

1. **Composer asks NCP for tools**: Instead of loading all 200+ tools from 37 MCPs into context, Cursor asks NCP to find relevant tools on demand
2. **Semantic search**: NCP uses vector similarity to find the most relevant tools based on your natural language query
3. **Just-in-time loading**: Only the tools you actually need get loaded into the conversation
4. **Token savings**: Reduces context by 90%+, enabling longer conversations

---

## ⚙️ Configuration Options

### Using Profiles

If you have multiple NCP profiles (e.g., `work`, `personal`), specify which one Cursor should use:

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

### Custom NCP Installation Path

If NCP is installed in a non-standard location:

```json
{
  "mcpServers": {
    "ncp": {
      "command": "/custom/path/to/ncp",
      "args": []
    }
  }
}
```

---

## 🛟 Troubleshooting

### NCP Not Showing Up in Composer

1. **Check MCP Settings**: Go to Cursor Settings → Features → MCP and verify NCP appears in the list
2. **Restart Cursor**: Sometimes a restart is needed after adding a new MCP server
3. **Check NCP installation**: Run `which ncp` (Mac/Linux) or `where ncp` (Windows) to find the path
4. **Check logs**: Look in Cursor's output panel for MCP connection errors

### "Command not found" Error

If Cursor can't find the `ncp` command:

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

# Windows
where ncp
```

### NCP Tools Not Being Used

- **Remember**: MCP tools in Cursor only work in **Composer (Agent Mode)**
- Use `Cmd/Ctrl + I` to open Composer
- Explicitly reference NCP: `@ncp find ...`

---

## 🔗 Related Documentation

- [Back to Main README](../../README.md)
- [Advanced Usage & Environment Variables](../ADVANCED_USAGE_GUIDE.md)
- [Cursor MCP Documentation](https://docs.cursor.com/context/model-context-protocol)

---

## 💡 Tips

1. **Start specific**: Instead of asking for "all tools", use semantic queries like "tools for reading GitHub issues"
2. **Use profiles**: Separate work and personal MCPs for better organization
3. **Check available tools**: In Cursor Settings → MCP, you can see all tools NCP has discovered
4. **Leverage semantic search**: NCP understands natural language - "database operations", "file system access", "API calls" all work

---

**Need help?** Check out the [Troubleshooting Guide](../../README.md#-troubleshooting) or [open an issue](https://github.com/portel-dev/ncp/issues).
