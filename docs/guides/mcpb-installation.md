# One-Click Installation with .mcpb Files

## ⚠️ CRITICAL LIMITATION

**The .mcpb installation ONLY installs NCP as an MCP server in Claude Desktop. It does NOT install the `ncp` CLI tool.**

You will still need to run `npm install -g @portel/ncp` to get:
- `ncp add <mcp-name>` - Add MCPs to your configuration
- `ncp find <query>` - Search for tools from the command line
- `ncp list` - List configured MCPs
- `ncp remove <mcp-name>` - Remove MCPs
- All other CLI functionality

**Why this limitation exists:**
- .mcpb bundles use Claude Desktop's sandboxed Node.js runtime
- This runtime is only available when Claude Desktop runs MCP servers
- It's NOT in your system PATH, so CLI commands won't work
- The `ncp` command requires global npm installation

**Recommended approach:**
1. Install via npm: `npm install -g @portel/ncp` (get CLI + MCP server)
2. Configure your MCPs: `ncp add filesystem`, etc.
3. Works with ALL MCP clients (Claude Desktop, Cursor, Cline, Continue)

**Or for Claude Desktop users who prefer .mcpb:**
1. Install .mcpb (Claude Desktop integration only)
2. **ALSO** install via npm: `npm install -g @portel/ncp` (for CLI tools)
3. Configure using CLI, use with Claude Desktop

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

### For Claude Desktop Users (Easiest)

1. **Download the bundle:**
   - Go to [NCP Releases](https://github.com/portel-dev/ncp/releases/latest)
   - Download `ncp.mcpb` from the latest release

2. **Install:**
   - **macOS/Windows:** Double-click the downloaded `ncp.mcpb` file
   - Claude Desktop will show an installation dialog
   - Click "Install"

3. **Verify:**
   - Restart Claude Desktop
   - Ask Claude: "What MCP tools do you have?"
   - You should see NCP's `find` and `run` tools

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
| **Time** | 10 seconds | 2-3 minutes |
| **CLI Tools** | ❌ **NO** - Cannot run `ncp add`, `ncp find`, etc. | ✅ YES - Full CLI available |
| **MCP Server** | ✅ YES - Works in Claude Desktop | ✅ YES - Works in all MCP clients |
| **Configuration** | ❌ **Requires npm CLI anyway** | ✅ Complete solution |
| **Updates** | Download new .mcpb | `npm update -g @portel/ncp` |
| **Client Support** | Claude Desktop only | All MCP clients |
| **Best for** | ❌ **Not recommended** - still need npm | ✅ **Recommended** - Complete installation |

## FAQ

### Q: Can I use `ncp add` after .mcpb installation?
**A:** ❌ **NO!** The .mcpb installation does NOT include CLI tools. You MUST install via npm to get `ncp add`, `ncp find`, `ncp list`, etc.

**Solution:** Run `npm install -g @portel/ncp` to get the CLI tools.

### Q: So do I need both .mcpb AND npm installation?
**A:** If you want to use .mcpb for Claude Desktop integration, **YES** - you still need npm for the CLI tools to configure NCP.

**Better solution:** Just use `npm install -g @portel/ncp` - it gives you BOTH CLI tools AND MCP server for all clients.

### Q: Why can't .mcpb include the CLI tools?
**A:** The .mcpb bundle uses Claude Desktop's sandboxed Node.js runtime, which is only available when running MCP servers. It's not in your system PATH, so terminal commands like `ncp add` won't work. Global npm installation is required for CLI functionality.

### Q: What's the point of .mcpb if I still need npm?
**A:** Good question! For NCP specifically, **we recommend npm installation** as the primary method. The .mcpb is provided for completeness but has significant limitations for NCP's use case.

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
