# NCP Setup for Continue (VS Code Extension)

Set up NCP in Continue to manage your MCP tools with just-in-time loading, semantic search, and intelligent routing.

---

## 📋 Prerequisites

- **Node.js 18+** ([Download here](https://nodejs.org/))
- **VS Code** ([Download here](https://code.visualstudio.com/))
- **Continue extension** ([Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=Continue.continue))
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

### Step 2: Install Continue Extension

1. Open VS Code
2. Go to Extensions: `Cmd/Ctrl + Shift + X`
3. Search for: `Continue`
4. Click **Install**

### Step 3: Configure NCP in Continue

Continue uses a dedicated folder for MCP server configurations.

**Create the MCP servers folder in your workspace:**

```bash
# In your project root
mkdir -p .continue/mcpServers
```

**Create NCP configuration file:**

```bash
# Create YAML or JSON file
.continue/mcpServers/ncp.yaml
# or
.continue/mcpServers/ncp.json
```

**Option A: YAML Configuration (Recommended)**

`.continue/mcpServers/ncp.yaml`:
```yaml
name: ncp
command: ncp
args: []
```

**Option B: JSON Configuration**

`.continue/mcpServers/ncp.json`:
```json
{
  "name": "ncp",
  "command": "ncp",
  "args": []
}
```

### Step 4: Reload VS Code

1. Open Command Palette: `Cmd/Ctrl + Shift + P`
2. Type and select: `Developer: Reload Window`

### Step 5: Verify Setup

1. Open Continue chat in VS Code (sidebar icon or `Cmd/Ctrl + L`)
2. **Enable Agent Mode**: Continue's MCP tools only work in Agent Mode
   - Click the settings icon in Continue sidebar
   - Enable "Agent Mode"
3. Ask Continue: "What NCP tools are available?"
4. You should see NCP's `find` and `run` tools

---

## 🎯 Using NCP in Continue

### Important: Agent Mode Required

**MCP tools only work in Continue's Agent Mode.**

To enable Agent Mode:
1. Open Continue settings (gear icon in Continue sidebar)
2. Toggle **Agent Mode** ON
3. Or use the `/agent` command in chat

### Semantic Tool Discovery

NCP provides two main tools that Continue can use in Agent Mode:

1. **`ncp_find`** - Discover tools using natural language
   - Example: "Find tools for reading GitHub issues"
   - Example: "Find database operations tools"

2. **`ncp_run`** - Execute discovered tools
   - Example: "Run the GitHub list issues tool for anthropic/mcp"

### How It Works

1. **Continue asks NCP for tools**: Instead of loading all 200+ tools from 37 MCPs into context, Continue asks NCP to find relevant tools on demand
2. **Semantic search**: NCP uses vector similarity to find the most relevant tools based on your natural language query
3. **Just-in-time loading**: Only the tools you actually need get loaded into the conversation
4. **Token savings**: Reduces context by 90%+, enabling longer conversations

---

## ⚙️ Configuration Options

### Using Profiles

If you have multiple NCP profiles (e.g., `work`, `personal`), create separate configuration files:

`.continue/mcpServers/ncp-work.yaml`:
```yaml
name: ncp-work
command: ncp
args:
  - --profile
  - work
```

`.continue/mcpServers/ncp-personal.yaml`:
```yaml
name: ncp-personal
command: ncp
args:
  - --profile
  - personal
```

### Custom NCP Installation Path

If NCP is installed in a non-standard location:

**Mac/Linux:**
```yaml
name: ncp
command: /usr/local/bin/ncp
args: []
```

**Windows:**
```yaml
name: ncp
command: C:\Users\<username>\AppData\Roaming\npm\ncp.cmd
args: []
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

**YAML:**
```yaml
name: ncp
command: ncp
args: []
env:
  NCP_DEBUG: "true"
```

**JSON:**
```json
{
  "name": "ncp",
  "command": "ncp",
  "args": [],
  "env": {
    "NCP_DEBUG": "true"
  }
}
```

### Importing from Other MCP Clients

**If you're already using NCP with Claude Desktop, Cursor, or Cline**, you can copy those JSON configurations directly:

```bash
# Copy Claude Desktop config
cp ~/.config/claude/claude_desktop_config.json .continue/mcpServers/

# Or manually copy the NCP section from your existing config
```

Continue automatically reads both JSON and YAML formats from the `mcpServers/` directory.

---

## 🛟 Troubleshooting

### NCP Not Showing Up in Continue

1. **Check Agent Mode**: MCP only works with Agent Mode enabled
2. **Verify config location**: File must be in `.continue/mcpServers/` (note: plural "Servers")
3. **Check file naming**: Files should end in `.yaml` or `.json`
4. **Reload VS Code**: `Cmd/Ctrl + Shift + P` → `Developer: Reload Window`
5. **Check Continue logs**: Look for MCP connection errors in VS Code Output panel → Continue

### "Command not found" Error

This means Continue can't find the `ncp` command. Use the full path:

**Mac/Linux:**
```yaml
name: ncp
command: /usr/local/bin/ncp
args: []
```

**Windows:**
```yaml
name: ncp
command: C:\Users\YourUsername\AppData\Roaming\npm\ncp.cmd
args: []
```

### Agent Mode Not Available

If you don't see Agent Mode option:
1. Update Continue to the latest version
2. Restart VS Code
3. Check Continue documentation for your version

### MCP Tools Not Being Invoked

1. **Enable Agent Mode**: Click the toggle in Continue settings
2. **Ask explicitly**: Try: "Use NCP to find GitHub tools"
3. **Use `/agent` command**: Type `/agent` to enter Agent Mode
4. **Check MCP support**: Ensure your Continue version supports MCP (recent versions)

### Configuration Not Loading

1. **Check folder name**: Must be `.continue/mcpServers` (plural)
2. **Check file format**: Valid YAML or JSON syntax
3. **Workspace vs global**: Config must be in workspace root
4. **Reload window**: Always reload VS Code after config changes

---

## 💡 Tips

1. **YAML vs JSON**: YAML is more concise and easier to edit; JSON works if you're copying from other tools
2. **Agent Mode**: Remember to enable Agent Mode - regular chat mode won't use MCP tools
3. **Multiple models**: Continue works with many LLM providers (OpenAI, Anthropic, local models) - NCP works with all
4. **Team sharing**: Commit `.continue/` folder to Git so your team gets the same MCP setup
5. **Remote servers**: Continue supports both local (stdio) and remote (HTTP/SSE) MCP servers

---

## 🔗 Related Documentation

- [Back to Main README](../../README.md)
- [Advanced Usage & Environment Variables](../ADVANCED_USAGE_GUIDE.md)
- [Continue MCP Documentation](https://docs.continue.dev/customize/deep-dives/mcp)
- [Continue Blog: Model Context Protocol](https://blog.continue.dev/model-context-protocol/)

---

## 🎥 Example Workflow

Here's a typical workflow using NCP with Continue:

1. **Enable Agent Mode** in Continue settings
2. **You**: "I need tools for working with GitHub repositories"
3. **Continue**: Uses NCP's `find` tool to search for GitHub-related capabilities
4. **Continue**: Shows available tools: `github:list_issues`, `github:search_repos`, etc.
5. **You**: "List open issues in anthropic/mcp"
6. **Continue**: Uses NCP's `run` tool to execute `github:list_issues` with parameters
7. **Result**: Issues displayed in chat

All without manually loading 200+ tools into context!

---

## 📁 Example Configuration Structure

```
your-project/
├── .continue/
│   ├── mcpServers/          # Note: plural "Servers"
│   │   ├── ncp.yaml         # Main NCP config
│   │   ├── ncp-work.yaml    # Work profile (optional)
│   │   └── ncp-personal.yaml # Personal profile (optional)
│   └── config.json          # Continue's main config (auto-generated)
├── .vscode/
└── src/
```

---

**Need help?** Check out the [Troubleshooting Guide](../../README.md#-troubleshooting) or [open an issue](https://github.com/portel-dev/ncp/issues).
