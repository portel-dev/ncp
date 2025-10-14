# Installing NCP on Perplexity

**Status:** JSON configuration only (`.dxt` extension support coming soon)

---

## 📋 Overview

Perplexity Mac app supports MCP servers via JSON configuration. While `.dxt` drag-and-drop installation is not yet supported, you can manually configure NCP to work with Perplexity.

### What You Get:
- ✅ Access to all your MCP tools through NCP's unified interface
- ✅ Semantic search for tool discovery
- ✅ Token optimization (97% reduction in context usage)
- ⚠️ Manual configuration required (no auto-import from Perplexity yet)

---

## 🔧 Installation Steps

### 1. Install NCP via npm

```bash
npm install -g @portel/ncp
```

### 2. Add Your MCPs to NCP

Since Perplexity doesn't support auto-import yet, manually add your MCPs to NCP:

```bash
# Add popular MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github
ncp add brave-search npx @modelcontextprotocol/server-brave-search

# Verify they were added
ncp list
```

### 3. Configure Perplexity

Perplexity stores its MCP configuration in:
```
~/Library/Containers/ai.perplexity.mac/Data/Documents/mcp_servers
```

This file uses a **different JSON format** than Claude Desktop (array-based, not object-based).

**Edit the file:**
```bash
# Open Perplexity's MCP config
nano ~/Library/Containers/ai.perplexity.mac/Data/Documents/mcp_servers
```

**Replace entire contents with:**
```json
{
  "servers": [
    {
      "name": "NCP",
      "enabled": true,
      "connetionInfo": {
        "command": "ncp",
        "args": [],
        "env": {}
      }
    }
  ]
}
```

> **Note:** Yes, it's spelled "connetionInfo" (not "connectionInfo") in Perplexity's format. This is how Perplexity expects it.

### 4. Restart Perplexity

1. Quit Perplexity completely
2. Reopen Perplexity
3. Start a new chat

### 5. Verify Installation

In a Perplexity chat, ask:
```
"List all available MCP tools using NCP"
```

Perplexity should use NCP's `find` tool to discover your MCPs.

---

## 🎯 Managing MCPs

### Adding More MCPs

```bash
# Add MCPs using NCP CLI
ncp add sequential-thinking npx @modelcontextprotocol/server-sequential-thinking
ncp add memory npx @modelcontextprotocol/server-memory

# Verify additions
ncp list
```

### Removing MCPs

```bash
# Remove an MCP
ncp remove filesystem

# Verify removal
ncp list
```

### Testing MCPs

```bash
# Test tool discovery
ncp find "read a file"

# Test tool execution (dry run)
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}' --dry-run
```

---

## 🆚 NCP vs Direct MCP Configuration

| Feature | With NCP | Without NCP |
|---------|----------|-------------|
| **Context Usage** | 2 tools (2.5k tokens) | 50+ tools (100k+ tokens) |
| **Tool Discovery** | Semantic search | Manual inspection |
| **Configuration** | One NCP entry | Individual entries per MCP |
| **Tool Updates** | Update NCP profile | Edit Perplexity config |

---

## 📍 Configuration File Locations

**Perplexity MCP Config:**
```
~/Library/Containers/ai.perplexity.mac/Data/Documents/mcp_servers
```

**Perplexity Extensions (dxt):**
```
~/Library/Containers/ai.perplexity.mac/Data/Documents/connectors/dxt/installed/
```

**NCP Profiles:**
```
~/.ncp/profiles/all.json
```

---

## 🐛 Troubleshooting

### NCP command not found

```bash
# Reinstall globally
npm install -g @portel/ncp

# Verify installation
ncp --version
```

### Perplexity doesn't see NCP

1. **Check config file format** - Perplexity uses array format with "connetionInfo" (note the typo)
2. **Verify NCP is in PATH** - Run `which ncp` to verify
3. **Restart Perplexity completely** - Quit, don't just close window
4. **Check Perplexity logs** - Look for MCP-related errors in Console.app

### NCP shows no MCPs

```bash
# Check NCP configuration
ncp list

# If empty, add MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents

# Verify profile
cat ~/.ncp/profiles/all.json
```

### Can't edit Perplexity config (sandboxed)

Perplexity uses macOS sandboxing. If you can't edit the config file:

```bash
# Open parent directory in Finder
open ~/Library/Containers/ai.perplexity.mac/Data/Documents/

# Edit file with TextEdit or VS Code
# Make sure to save changes
```

---

## 🔮 Future: Extension Support

**Coming Soon:** `.dxt` extension support for Perplexity

When Perplexity adds `.dxt` support, you'll be able to:
- ✅ Drag and drop `ncp.dxt` for one-click installation
- ✅ Auto-import existing Perplexity MCPs
- ✅ Auto-sync on every startup

Track progress: [Perplexity MCP Documentation](https://docs.perplexity.ai/guides/mcp-server)

---

## 📝 Perplexity JSON Format Reference

### Standard Format (Claude Desktop, Cursor, etc.)
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {}
    }
  }
}
```

### Perplexity Format
```json
{
  "servers": [
    {
      "name": "server-name",
      "enabled": true,
      "connetionInfo": {
        "command": "npx",
        "args": ["-y", "package-name"],
        "env": {}
      }
    }
  ]
}
```

**Key differences:**
1. Uses `servers` array instead of `mcpServers` object
2. Each server has `name`, `enabled`, and `connetionInfo` fields
3. Uses "connetionInfo" (typo, not "connectionInfo")
4. Boolean `enabled` flag for each server

---

## 🚀 Next Steps

After installation, learn how to use NCP:
- **[NCP Usage Guide](../guides/how-it-works.md)** - Understanding NCP's architecture
- **[Testing Guide](../guides/testing.md)** - Verify everything works
- **[Main README](../../README.md)** - Full documentation

---

## 🤝 Need Help?

- **GitHub Issues:** [Report bugs or request features](https://github.com/portel-dev/ncp/issues)
- **GitHub Discussions:** [Ask questions and share tips](https://github.com/portel-dev/ncp/discussions)
- **Perplexity Docs:** [Official MCP Server Guide](https://docs.perplexity.ai/guides/mcp-server)
