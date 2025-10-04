# One-Click Installation with .mcpb Files

## 🚀 Slim & Fast MCP-Only Bundle

**The .mcpb installation is now optimized as a slim, MCP-only runtime:**

✅ **What it includes:**
- NCP MCP server (126KB compressed, 462KB unpacked)
- All orchestration, discovery, and RAG capabilities
- Optimized for fast startup and low memory usage

❌ **What it excludes:**
- CLI tools (`ncp add`, `ncp find`, `ncp list`, etc.)
- CLI dependencies (Commander.js, Inquirer.js, etc.)
- 13% smaller than full package, 16% less unpacked size

**Configuration methods:**
1. **Manual JSON editing** (recommended for power users)
2. **Optional:** Install npm package separately for CLI tools

**Why this design?**
- .mcpb bundles use Claude Desktop's sandboxed Node.js runtime
- This runtime is only available when Claude Desktop runs MCP servers
- It's NOT in your system PATH, so CLI commands can't work
- By excluding CLI code, we get faster startup and smaller bundle

**Choose your workflow:**

### Option A: Manual Configuration (Slim bundle only)
1. Install .mcpb (fast, lightweight)
2. Edit `~/.ncp/profiles/all.json` manually
3. Perfect for automation, power users, production deployments

### Option B: CLI + .mcpb (Both installed)
1. Install .mcpb (Claude Desktop integration)
2. Install npm: `npm install -g @portel/ncp` (CLI tools)
3. Use CLI to configure, benefit from slim .mcpb runtime

## What is a .mcpb file?

.mcpb (MCP Bundle) files are zip-based packages that bundle an entire MCP server with all its dependencies into a single installable file. Think of them like:
- Chrome extensions (.crx)
- VS Code extensions (.vsix)
- But for MCP servers!

## Why .mcpb for NCP?

Installing NCP traditionally requires:
1. Node.js installation
2. npm commands
3. Manual configuration editing
4. Understanding of file paths and environment variables

**With .mcpb:** Download → Double-click → Done! ✨

**But remember:** You still need npm for CLI tools (see limitation above).

## Installation Steps

### For Claude Desktop Users (Auto-Import + Manual Configuration)

1. **Download the bundle:**
   - Go to [NCP Releases](https://github.com/portel-dev/ncp/releases/latest)
   - Download `ncp.mcpb` from the latest release

2. **Install:**
   - **macOS/Windows:** Double-click the downloaded `ncp.mcpb` file
   - Claude Desktop will show an installation dialog
   - Click "Install"

3. **Continuous auto-sync:**
   - **On every startup**, NCP automatically detects and imports NEW MCPs:
     - ✅ Scans `claude_desktop_config.json` for traditional MCPs
     - ✅ Scans Claude Extensions directory for .mcpb extensions
     - ✅ Compares with NCP profile to find missing MCPs
     - ✅ Auto-imports only the new ones using internal `add` command
   - You'll see: `✨ Auto-synced X new MCPs from Claude Desktop`
   - **Cache coherence maintained**: Using internal `add` ensures vector cache, discovery index, and all other caches stay in sync
   - No manual configuration needed!

4. **Add more MCPs later (manual configuration):**

If you want to add additional MCPs after the initial import:

```bash
# Create/edit the profile configuration
mkdir -p ~/.ncp/profiles
nano ~/.ncp/profiles/all.json
```

Add your MCP servers (example configuration):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/dbname"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your_brave_api_key"
      }
    }
  }
}
```

**Tips for manual configuration:**
- Use the same format as Claude Desktop's `claude_desktop_config.json`
- Environment variables go in `env` object
- Paths should be absolute, not relative
- Use `npx -y` to auto-install MCP packages on first use

4. **Restart Claude Desktop:**
   - Quit Claude Desktop completely
   - Reopen it
   - NCP will load and index your configured MCPs

5. **Verify:**
   - Ask Claude: "What MCP tools do you have?"
   - You should see NCP's `find` and `run` tools
   - Ask: "Find tools for searching files"
   - NCP will show tools from your configured MCPs

### For Other MCP Clients (Cursor, Cline, Continue)

The .mcpb format is currently supported only by Claude Desktop. For other clients, use the manual installation method:

```bash
# Install NCP via npm
npm install -g @portel/ncp

# Configure your client's config file manually
# See README.md for client-specific configuration
```

## What Gets Installed?

The .mcpb bundle includes:
- ✅ NCP compiled code (dist/)
- ✅ All Node.js dependencies
- ✅ Configuration manifest
- ✅ Runtime environment setup

**You don't need:**
- ❌ Node.js pre-installed (Claude Desktop includes it)
- ❌ Manual npm commands
- ❌ Manual configuration file editing

## Troubleshooting

### "Cannot open file" error (macOS)

macOS may block .mcpb files from unknown developers:

**Solution:**
1. Right-click the `ncp.mcpb` file
2. Select "Open With" → "Claude Desktop"
3. If prompted, click "Open" to allow

### "Installation failed" error

**Possible causes:**
1. Claude Desktop not updated to latest version
   - **Solution:** Update Claude Desktop to support .mcpb format

2. Corrupted download
   - **Solution:** Re-download the .mcpb file

3. Conflicting existing NCP installation
   - **Solution:** Remove existing NCP from Claude config first

### NCP not showing in tool list

**Check:**
1. Restart Claude Desktop completely (Quit → Reopen)
2. Check Claude Desktop settings → MCPs → Verify NCP is listed
3. Ask Claude: "List your available tools"

## How We Build the .mcpb File

For developers interested in how NCP creates the .mcpb bundle:

```bash
# Build the bundle locally
npm run build:mcpb

# This runs:
# 1. npm run build (compiles TypeScript)
# 2. npx @anthropic-ai/mcpb pack (creates .mcpb from manifest.json)
```

The `manifest.json` describes:
- NCP's capabilities
- Entry point (dist/index.js)
- Required tools
- Environment variables
- Node.js version requirements

## Updating NCP

When a new version is released:

1. **Download new .mcpb** from latest release
2. **Double-click to install** - it will replace the old version
3. **Restart Claude Desktop**

## Comparison: .mcpb vs npm Installation

| Aspect | .mcpb Installation | npm Installation |
|--------|-------------------|------------------|
| **Ease** | Double-click | Multiple commands |
| **Prerequisites** | None (Claude Desktop has runtime) | Node.js 18+ |
| **Time** | 10 seconds + manual config | 2-3 minutes with CLI |
| **Bundle Size** | **126KB** (slim, MCP-only) | ~2.5MB (full package with CLI) |
| **Startup Time** | ⚡ Faster (no CLI code loading) | Standard (includes CLI) |
| **Memory Usage** | 💚 Lower (minimal footprint) | Standard (full features) |
| **CLI Tools** | ❌ NO - Manual JSON editing only | ✅ YES - `ncp add`, `ncp find`, etc. |
| **MCP Server** | ✅ YES - Works in Claude Desktop | ✅ YES - Works in all MCP clients |
| **Configuration** | 📝 Manual JSON editing | 🔧 CLI commands or JSON |
| **Updates** | Download new .mcpb | `npm update -g @portel/ncp` |
| **Client Support** | Claude Desktop only | All MCP clients |
| **Best for** | ✅ Power users, automation, production | ✅ General users, development |

## How Continuous Auto-Sync Works

**On every startup**, NCP automatically syncs with Claude Desktop to detect new MCPs:

### Sync Process

1. **Scans Claude Desktop configuration:**
   - **JSON config:** Reads `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **.mcpb extensions:** Scans `~/Library/Application Support/Claude/Claude Extensions/`

2. **Extracts MCP configurations:**
   - For JSON MCPs: Extracts command, args, env
   - For .mcpb extensions: Reads `manifest.json`, resolves `${__dirname}` paths

3. **Detects missing MCPs:**
   - Compares Claude Desktop MCPs vs NCP profile
   - Identifies MCPs that exist in Claude Desktop but NOT in NCP

4. **Imports missing MCPs using internal `add` command:**
   - For each missing MCP: `await this.addMCPToProfile('all', name, config)`
   - This ensures **cache coherence**:
     - ✅ Profile JSON gets updated
     - ✅ Cache invalidation triggers on next orchestrator init
     - ✅ Vector embeddings regenerate for new tools
     - ✅ Discovery index includes new MCPs
     - ✅ All caches stay in sync

5. **Skips existing MCPs:**
   - If MCP already exists in NCP → No action
   - Prevents duplicate imports and cache thrashing

### Example Auto-Sync Output

**First startup (multiple MCPs found):**
```
✨ Auto-synced 6 new MCPs from Claude Desktop:
   - 4 from claude_desktop_config.json
   - 2 from .mcpb extensions
   → Added to ~/.ncp/profiles/all.json
```

**Subsequent startup (1 new MCP detected):**
```
✨ Auto-synced 1 new MCPs from Claude Desktop:
   - 1 from .mcpb extensions
   → Added to ~/.ncp/profiles/all.json
```

**Subsequent startup (no new MCPs):**
```
(No output - all Claude Desktop MCPs already in sync)
```

### What Gets Imported

**From `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/name"]
    }
  }
}
```

**From `.mcpb` extensions:**
- Installed via double-click in Claude Desktop
- Stored in `Claude Extensions/` directory
- Automatically detected and imported with correct paths

**Result in NCP:**
```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/name"],
    "_source": "json"
  },
  "apple-mcp": {
    "command": "node",
    "args": ["/Users/.../Claude Extensions/local.dxt.../dist/index.js"],
    "_source": ".mcpb",
    "_extensionId": "local.dxt.dhravya-shah.apple-mcp",
    "_version": "1.0.0"
  }
}
```

## FAQ

### Q: Does NCP automatically sync with Claude Desktop?
**A:** ✅ **YES!** On **every startup**, NCP automatically detects and imports NEW MCPs:
- Scans `claude_desktop_config.json` for traditional MCPs
- Scans Claude Extensions for .mcpb-installed extensions
- Compares with NCP profile to find missing MCPs
- Auto-imports only the new ones

**Workflow example:**
1. Day 1: Install NCP → Auto-syncs 5 existing MCPs
2. Day 2: Install new .mcpb extension in Claude Desktop
3. Day 3: Restart Claude Desktop → NCP auto-syncs the new MCP
4. **Zero manual configuration** - NCP stays in sync automatically!

### Q: Can I use `ncp add` after .mcpb installation?
**A:** ❌ **NO.** The .mcpb is a slim MCP-only bundle that excludes CLI code. You configure MCPs by editing `~/.ncp/profiles/all.json` manually.

**If you want CLI tools:** Run `npm install -g @portel/ncp` separately.

### Q: How do I add MCPs without the CLI?
**A:** Edit `~/.ncp/profiles/all.json` directly:

```bash
nano ~/.ncp/profiles/all.json
```

Add your MCPs using the same format as Claude Desktop's config:

```json
{
  "mcpServers": {
    "your-mcp-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "env": {}
    }
  }
}
```

Restart Claude Desktop for changes to take effect.

### Q: Why is .mcpb smaller than npm?
**A:** The .mcpb bundle (126KB) excludes all CLI code and dependencies:
- ❌ No Commander.js, Inquirer.js, or other CLI libraries
- ❌ No `dist/cli/` directory
- ✅ Only MCP server, orchestrator, and discovery code

This makes it 13% smaller and faster to load.

### Q: When should I use .mcpb vs npm?
**A:**

**Use .mcpb if:**
- You're comfortable editing JSON configs manually
- You want the smallest, fastest MCP runtime
- You're deploying in production/automation
- You only use Claude Desktop

**Use npm if:**
- You want CLI tools (`ncp add`, `ncp find`, etc.)
- You use multiple MCP clients (Cursor, Cline, Continue)
- You prefer commands over manual JSON editing
- You want a complete solution

**Both:** Install .mcpb for slim runtime + npm for CLI tools

### Q: Do I need Node.js installed for .mcpb?
**A:** No, Claude Desktop includes Node.js runtime for .mcpb bundles. However, if you need the CLI tools (which you do for NCP), you'll need Node.js + npm anyway.

### Q: Can I use .mcpb with Cursor/Cline/Continue?
**A:** Not yet. The .mcpb format is currently Claude Desktop-only. Use npm installation for other clients.

### Q: How do I uninstall?
**A:** In Claude Desktop settings → MCPs → Find NCP → Click "Remove"

### Q: Can I customize NCP settings via .mcpb?
**A:** Basic environment variables can be configured through Claude Desktop settings after installation. For advanced configuration, use npm installation instead.

### Q: Is .mcpb secure?
**A:** .mcpb files are reviewed by Claude Desktop before installation. Always download from official NCP releases on GitHub.

## Future Plans

- Support for other MCP clients (Cursor, Cline, Continue)
- Auto-update mechanism
- Configuration wizard within .mcpb
- Multiple profile support

## More Information

- [MCP Bundle Specification](https://github.com/anthropics/mcpb)
- [Claude Desktop Extensions Documentation](https://www.anthropic.com/engineering/desktop-extensions)
- [NCP GitHub Repository](https://github.com/portel-dev/ncp)
