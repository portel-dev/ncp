# Installing NCP on Cline (VS Code Extension)

**Method:** JSON configuration only

---

## 📋 Overview

Cline (formerly Claude Dev) is a VS Code extension that supports MCP servers. Configure NCP to unify all your MCP tools under one intelligent interface.

---

## 🔧 Installation Steps

### 1. Install NCP

```bash
npm install -g @portel/ncp
```

### 2. Import Your Existing MCPs (Optional)

```bash
# If you have MCPs configured elsewhere, copy config to clipboard
# Then run:
ncp config import
```

### 3. Add MCPs to NCP

```bash
# Add your MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github
ncp add sequential-thinking npx @modelcontextprotocol/server-sequential-thinking

# Verify
ncp list
```

### 4. Configure Cline

**Config file location:**
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows:** `%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Linux:** `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Edit the file:**
```bash
# macOS
nano ~/Library/Application\ Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**Replace contents with:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

### 5. Restart VS Code

1. Close all VS Code windows
2. Reopen VS Code
3. Open Cline extension
4. Start using NCP

---

## 🎯 Using NCP in Cline

In Cline chat, ask:
- "List all available MCP tools using NCP"
- "Find tools for file operations"
- "Use NCP to search for GitHub-related tools"

---

## 🐛 Troubleshooting

**NCP command not found:**
```bash
npm install -g @portel/ncp
ncp --version
```

**Cline doesn't see NCP:**
1. Verify config file exists and path is correct
2. Check JSON syntax is valid
3. Restart VS Code completely (close all windows)
4. Check VS Code's Developer Tools console for errors

**NCP shows no MCPs:**
```bash
ncp list
# If empty, add MCPs:
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
```

---

## 📚 More Resources

- **[Claude Desktop Guide](./claude-desktop.md)** - For Claude Desktop users
- **[Main README](../../README.md)** - Full documentation
- **[Cline Extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)** - VS Code Marketplace

---

## 🤝 Need Help?

- **GitHub Issues:** [Report bugs](https://github.com/portel-dev/ncp/issues)
- **GitHub Discussions:** [Ask questions](https://github.com/portel-dev/ncp/discussions)
